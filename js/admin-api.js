/* Admin API client, shared by every admin-*.js file.
 * The admin password (ADMIN_PASSWORD in Vercel) is sent as the x-admin-key header with each call and kept
 * in sessionStorage only, so it is forgotten when the tab closes. All data is saved by api/index.js.
 *
 *   ADMIN.api("admin/projects", "POST", {...})  -> Promise of the JSON reply (rejects with Error + .status)
 *   ADMIN.data                                    the latest site content {profile, projects, skills, cv}
 *   ADMIN.set(content) / ADMIN.load()             update / re-fetch it; both tell every ADMIN.on() listener  */
(function () {
  "use strict";
  var STORE = "portfolio-admin-key";
  var key = "", listeners = [];
  try { key = sessionStorage.getItem(STORE) || ""; } catch (e) { /* blocked */ }

  var A = window.ADMIN = {
    data: null,
    onAuthLost: null,
    hasKey: function () { return !!key; },
    setKey: function (k) {
      key = k || "";
      try { if (key) sessionStorage.setItem(STORE, key); else sessionStorage.removeItem(STORE); } catch (e) { /* blocked */ }
    },
    api: function (path, method, body) {
      return fetch("/api/index?p=" + path, {
        method: method || "GET",
        headers: { "x-admin-key": key, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (r.ok && j !== null) return j;
          var msg = (j && j.error) ||
            (r.status === 404 || r.status === 405 || j === null
              ? "The server isn't answering. Deploy the site to Vercel (or run `vercel dev`) so api/index.js can run."
              : "Something went wrong (" + r.status + ").");
          var err = new Error(msg); err.status = r.status;
          if (r.status === 401 && A.onAuthLost) A.onAuthLost(msg);
          throw err;
        });
      }, function () {
        throw new Error("Couldn't reach the server. Check your connection.");
      });
    },
    set: function (c) {
      A.data = c;
      listeners.forEach(function (fn) { try { fn(c); } catch (e) { console.error(e); } });
      return c;
    },
    load: function () { return A.api("admin/content").then(A.set); },
    on: function (fn) { listeners.push(fn); if (A.data) fn(A.data); }
  };
})();
