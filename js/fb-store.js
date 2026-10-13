/* Feedback data layer, shared by the public site and the admin panel.
 *
 *  - ONLINE mode (js/config.js filled in): feedback lives in a Supabase table. Visitors can only
 *    INSERT "pending" rows and READ "accepted" rows; only the signed-in admin can see pending /
 *    rejected rows or change anything (enforced by the database rules, not by this file).
 *  - LOCAL mode (config empty): feedback stays in this browser (localStorage) like before.
 *
 * Entry shape used everywhere: { id, name, role, anonymous, rating 0-5, message,
 *   status: "pending"|"accepted"|"rejected", source: "visitor"|"admin", createdAt (ms), order }  */
(function () {
  "use strict";
  var cfg = window.PF_CONFIG || {};
  var URL_ = String(cfg.supabaseUrl || "").trim().replace(/\/+$/, "");
  var KEY = String(cfg.supabaseKey || "").trim();
  var REMOTE = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(URL_) && KEY.length > 20;
  var AUTH_KEY = "portfolio-fb-auth";
  var MANAGED_KEY = "portfolio-feedback-managed";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var STATUSES = ["pending", "accepted", "rejected"];

  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  }
  function normalize(e) {
    var st = e.status || (e.visible === false ? "pending" : "accepted");
    return {
      id: String(e.id),
      name: clean(e.name, 60), role: clean(e.role, 60),
      anonymous: !!e.anonymous,
      rating: Math.max(0, Math.min(5, Math.round(Number(e.rating) || 0))),
      message: clean(e.message, 1000),
      status: STATUSES.indexOf(st) === -1 ? "pending" : st,
      source: e.source === "admin" ? "admin" : "visitor",
      createdAt: Number(e.createdAt) || 0,
      order: Number(e.order) || 0
    };
  }
  function byOrder(a, b) { return a.order - b.order || a.createdAt - b.createdAt; }

  /* =============== ONLINE (Supabase REST) =============== */
  function fromRow(r) {
    return normalize({ id: r.id, name: r.name, role: r.role, anonymous: r.anonymous, rating: r.rating,
      message: r.message, status: r.status, source: r.source, createdAt: Date.parse(r.created_at) || 0, order: r.sort_order });
  }
  function toRow(f) {
    var m = { name: "name", role: "role", anonymous: "anonymous", rating: "rating", message: "message",
      status: "status", source: "source", order: "sort_order" }, row = {};
    Object.keys(f).forEach(function (k) { if (m[k]) row[m[k]] = f[k]; });
    return row;
  }
  function getAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } }
  function putAuth(a) { try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* blocked */ } }

  function fail(res) {
    var err = new Error(res.status === 401 || res.status === 403 ? "Not allowed. Sign in again." :
      res.status === 429 ? "Too many requests. Try again in a minute." : "The feedback service returned an error (" + res.status + ").");
    err.status = res.status;
    return err;
  }
  function net() { throw new Error("Couldn't reach the feedback service. Check your connection."); }

  function token() {
    var a = getAuth();
    if (!a || !a.access_token) return Promise.resolve(null);
    if (a.expires_at - Date.now() > 60000) return Promise.resolve(a.access_token);
    return fetch(URL_ + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: a.refresh_token })
    }).then(function (r) {
      if (!r.ok) { putAuth(null); return null; }
      return r.json().then(function (j) { putAuth(session(j)); return j.access_token; });
    }, function () { return a.access_token; });
  }
  function session(j) {
    return { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, email: (j.user && j.user.email) || "" };
  }
  function rest(path, opts, asAdmin) {
    opts = opts || {};
    return (asAdmin ? token() : Promise.resolve(null)).then(function (t) {
      if (asAdmin && !t) { var e = new Error("Sign in first."); e.status = 401; throw e; }
      var h = { apikey: KEY, Authorization: "Bearer " + (t || KEY), "Content-Type": "application/json" };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(URL_ + "/rest/v1/feedback" + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
        .catch(net).then(function (res) {
          if (!res.ok) throw fail(res);
          return res.status === 204 ? null : res.text().then(function (t2) { return t2 ? JSON.parse(t2) : null; });
        });
    });
  }
  function needId(id) { if (!UUID.test(String(id))) throw new Error("Invalid id."); return id; }

  var online = {
    remote: true,
    publicList: function () {
      return rest("?status=eq.accepted&select=id,name,role,anonymous,rating,message,status,source,created_at,sort_order&order=sort_order.asc,created_at.asc&limit=100")
        .then(function (rows) { return (rows || []).map(fromRow); });
    },
    submit: function (e) {
      return rest("", { method: "POST", prefer: "return=minimal", body: {
        name: e.anonymous ? "" : clean(e.name, 60), anonymous: !!e.anonymous,
        rating: e.rating, message: clean(e.message, 1000), status: "pending", source: "visitor" } });
    },
    admin: {
      needsLogin: true,
      session: function () { var a = getAuth(); return a && a.access_token ? { email: a.email } : null; },
      signIn: function (email, password) {
        return fetch(URL_ + "/auth/v1/token?grant_type=password", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, password: password })
        }).catch(net).then(function (r) {
          if (!r.ok) throw new Error(r.status === 400 ? "Wrong email or password." : "Sign in failed (" + r.status + ").");
          return r.json().then(function (j) { putAuth(session(j)); });
        });
      },
      signOut: function () { putAuth(null); return Promise.resolve(); },
      list: function () {
        return rest("?select=*&order=created_at.desc&limit=1000", {}, true).then(function (rows) { return (rows || []).map(fromRow); });
      },
      create: function (e) {
        var f = toRow(e); f.source = "admin";
        return rest("", { method: "POST", prefer: "return=minimal", body: f }, true);
      },
      update: function (id, fields) {
        return rest("?id=eq." + needId(id), { method: "PATCH", prefer: "return=minimal", body: toRow(fields) }, true);
      },
      remove: function (id) { return rest("?id=eq." + needId(id), { method: "DELETE" }, true); }
    }
  };

  /* =============== LOCAL (this browser) =============== */
  function localAll() { return (window.PF ? PF.feedback.all() : []).filter(Boolean).map(normalize); }
  function localSave(list) {
    PF.feedback.save(list);
    try { localStorage.setItem(MANAGED_KEY, "1"); } catch (e) { /* blocked */ }
  }
  function managed() { try { return localStorage.getItem(MANAGED_KEY) === "1"; } catch (e) { return false; } }
  function newId() { return Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }

  var local = {
    remote: false,
    publicList: function () {
      if (managed()) return Promise.resolve(localAll().filter(function (e) { return e.status === "accepted"; }).sort(byOrder));
      return fetch("feedback.json", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (l) { return (Array.isArray(l) ? l : []).map(function (e, i) { e.id = e.id || "f" + i; e.status = "accepted"; return normalize(e); }); },
          function () { return []; });
    },
    submit: function (e) {
      var list = localAll();
      list.push(normalize({ id: newId(), name: e.anonymous ? "" : e.name, anonymous: e.anonymous, rating: e.rating,
        message: e.message, status: "pending", source: "visitor", createdAt: Date.now(), order: 0 }));
      try { PF.feedback.save(list); } catch (err) { return Promise.reject(new Error("This browser's storage is full.")); }
      return Promise.resolve();
    },
    admin: {
      needsLogin: false,
      session: function () { return { email: "" }; },
      signIn: function () { return Promise.resolve(); },
      signOut: function () { return Promise.resolve(); },
      list: function () { return Promise.resolve(localAll()); },
      create: function (e) {
        var list = localAll(); e.id = newId(); e.createdAt = Date.now(); e.source = "admin";
        list.push(normalize(e));
        try { localSave(list); } catch (err) { return Promise.reject(new Error("Browser storage is full.")); }
        return Promise.resolve();
      },
      update: function (id, fields) {
        var list = localAll(), it = list.filter(function (x) { return x.id === id; })[0];
        if (!it) return Promise.reject(new Error("That feedback no longer exists."));
        Object.keys(fields).forEach(function (k) { it[k] = fields[k]; });
        try { localSave(list.map(normalize)); } catch (err) { return Promise.reject(new Error("Browser storage is full.")); }
        return Promise.resolve();
      },
      remove: function (id) {
        try { localSave(localAll().filter(function (x) { return x.id !== id; })); } catch (err) { return Promise.reject(err); }
        return Promise.resolve();
      }
    }
  };

  window.FBStore = REMOTE ? online : local;
  window.FBStore.clean = clean;
  window.FBStore.byOrder = byOrder;
})();
