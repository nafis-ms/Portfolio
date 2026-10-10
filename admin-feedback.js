/* Feedback moderation. Visitors' feedback arrives as "pending"; you accept it (it shows in the
 * slider on the site), reject it (it stays in Rejected), or add your own. The data lives on the
 * server (api/admin-feedback.js), so it is the same on every device. Sign-in to the panel is
 * handled by admin.js; this file additionally needs the ADMIN_KEY from Vercel. */
(function () {
  "use strict";
  var API = "/api/admin-feedback";
  var KEY_STORE = "portfolio-admin-key";
  var MAX = 300;
  var $ = function (s) { return document.querySelector(s); };
  var key = "", items = [], tab = "pending", editingId = null, connected = false, poll = 0;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function stars(n) { n = Math.max(0, Math.min(5, Number(n) || 0)); return n ? "★".repeat(n) + "☆".repeat(5 - n) : "No rating"; }
  function when(ms) {
    try { return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; }
  }

  /* ---------- key (kept in this browser only) ---------- */
  function savedKey() {
    try { return sessionStorage.getItem(KEY_STORE) || localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  }
  function storeKey(k, remember) {
    try {
      sessionStorage.removeItem(KEY_STORE); localStorage.removeItem(KEY_STORE);
      if (k) (remember ? localStorage : sessionStorage).setItem(KEY_STORE, k);
    } catch (e) { /* storage blocked */ }
  }

  /* ---------- talking to the server ---------- */
  function call(method, body) {
    return fetch(API, {
      method: method,
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: body ? JSON.stringify(body) : undefined
    }).catch(function () {
      throw mkErr(0, "Couldn't reach the server. Check your internet connection.");
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 404) throw mkErr(404, "The feedback API wasn't found. It only exists on your deployed Vercel site (or with \"vercel dev\"), not when admin.html is opened as a file.");
        if (!r.ok) throw mkErr(r.status, j.error || "The server returned an error (" + r.status + ").");
        return j;
      });
    });
  }
  function mkErr(status, message) { var e = new Error(message); e.status = status; return e; }

  function setConnected(on) {
    connected = on;
    $("#fbaDisconnect").hidden = !on;
    $("#fbaConnect").textContent = on ? "Reconnect" : "Connect";
    clearInterval(poll);
    if (on) poll = setInterval(function () { load(true); }, 60000);   // notice new submissions
  }

  function load(quiet) {
    return call("GET").then(function (j) {
      items = j.items || [];
      if (!quiet) say($("#fbaConn"), "Connected.", "ok");
      setConnected(true);
      render();
    }).catch(function (err) {
      if (quiet && err.status !== 401) return;               // a hiccup while polling: stay quiet
      if (err.status === 401) { storeKey("", false); key = ""; setConnected(false); items = []; render(); }
      say($("#fbaConn"), err.message, "error");
    });
  }

  $("#fbaKeyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var k = $("#fbaKey").value.trim();
    if (!k) return say($("#fbaConn"), "Enter your admin key.", "error");
    key = k;
    say($("#fbaConn"), "Connecting...");
    load(false).then(function () {
      if (connected) { storeKey(key, $("#fbaRemember").checked); $("#fbaKey").value = ""; }
    });
  });
  $("#fbaDisconnect").addEventListener("click", function () {
    storeKey("", false); key = ""; items = []; setConnected(false); render();
    say($("#fbaConn"), "Disconnected. The key was removed from this browser.", "ok");
  });
  $("#fbaRefresh").addEventListener("click", function () { say($("#fbaListMsg"), ""); load(false); });

  /* ---------- list ---------- */
  function counts() {
    var c = { pending: 0, accepted: 0, rejected: 0 };
    items.forEach(function (i) { if (c[i.status] != null) c[i.status]++; });
    return c;
  }
  function sortFor(list) {
    return list.slice().sort(tab === "accepted"
      ? function (a, b) { return (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt; }
      : function (a, b) { return b.createdAt - a.createdAt; });
  }

  function render() {
    var c = counts();
    $("#fbaCntPending").textContent = c.pending ? "(" + c.pending + ")" : "";
    $("#fbaCntAccepted").textContent = c.accepted ? "(" + c.accepted + ")" : "";
    $("#fbaCntRejected").textContent = c.rejected ? "(" + c.rejected + ")" : "";
    Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.fbtab === tab ? "true" : "false");
    });
    var badge = document.querySelector('[data-badge="feedback"]');       // sidebar: how many wait for you
    if (badge) { badge.textContent = c.pending || ""; badge.hidden = !c.pending; }
    var stat = $("#statFeedback");
    if (stat) stat.textContent = c.accepted;

    var list = $("#fbaList"), shown = sortFor(items.filter(function (i) { return i.status === tab; }));
    list.textContent = "";
    var empty = $("#fbaEmpty");
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      empty.textContent = !connected ? "Enter your admin key above to load the feedback."
        : tab === "pending" ? "Nothing is waiting for review."
        : tab === "accepted" ? "No feedback is showing in the slider yet. Accept one, or add your own."
        : "Nothing has been rejected.";
    }

    shown.forEach(function (f, idx) {
      var li = document.createElement("li");
      li.className = "item fb-item";

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = (f.name || "Anonymous") + (f.role ? " · " + f.role : "");
      var sub = document.createElement("span");
      sub.className = "site";
      sub.textContent = [stars(f.rating), f.source === "admin" ? "Added by you" : "Visitor", when(f.createdAt), f.email]
        .filter(Boolean).join(" · ");
      var msg = document.createElement("div");
      var long = f.message.length > MAX && f.status !== "accepted";
      msg.className = "fb-msg" + (long ? " too-long" : "");
      msg.textContent = f.message;                    // textContent: feedback can never inject HTML
      meta.append(name, sub, msg);
      if (long) {
        var note = document.createElement("span");
        note.className = "fb-note";
        note.textContent = f.message.length + " characters. The slider shows up to " + MAX + ", so edit it shorter before accepting.";
        meta.append(note);
      }

      var actions = document.createElement("div");
      actions.className = "actions";
      function btn(label, cls, fn, aria, disabled) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn ghost" + (cls ? " " + cls : "");
        b.textContent = label;
        if (aria) b.setAttribute("aria-label", aria);
        b.disabled = !!disabled;
        b.addEventListener("click", fn);
        return b;
      }
      var who = f.name || "this feedback";
      if (tab === "pending") {
        actions.append(btn("Accept", "", function () { act("accept", f, "Accepted. It now shows in the slider."); }),
          btn("Reject", "danger", function () { act("reject", f, "Rejected. It is kept in the Rejected list."); }));
      } else if (tab === "rejected") {
        actions.append(btn("Accept", "", function () { act("accept", f, "Accepted. It now shows in the slider."); }),
          btn("Back to pending", "", function () { act("pending", f, "Moved back to Pending."); }));
      } else {
        actions.append(
          btn("↑", "", function () { act("move", f, "", { dir: -1 }); }, "Move " + who + " earlier", idx === 0),
          btn("↓", "", function () { act("move", f, "", { dir: 1 }); }, "Move " + who + " later", idx === shown.length - 1),
          btn("Unpublish", "", function () { act("pending", f, "Removed from the slider and moved to Pending."); }));
      }
      actions.append(btn("Edit", "", function () { startEdit(f); }),
        btn("Delete", "danger", function () {
          if (confirm('Delete the feedback from "' + (f.name || "Anonymous") + '" for good?')) act("delete", f, "Deleted.");
        }));
      li.append(meta, actions);
      list.append(li);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
    b.addEventListener("click", function () { tab = b.dataset.fbtab; say($("#fbaListMsg"), ""); render(); });
  });

  function act(action, f, okText, extra) {
    var body = { action: action, id: f.id };
    for (var k in (extra || {})) body[k] = extra[k];
    var out = $("#fbaListMsg");
    return call("POST", body).then(function (j) {
      items = j.items || items;
      render();
      say(out, okText || "", "ok");
    }).catch(function (err) {
      if (err.status === 401) return load(false);
      say(out, err.message, "error");
      if (err.status === 404) load(true);
    });
  }

  /* ---------- add / edit ---------- */
  var form = $("#fbaForm");

  function resetForm() {
    editingId = null;
    form.reset();
    $("#fbaFormTitle").textContent = "Add feedback";
    $("#fbaSave").textContent = "Add feedback";
    $("#fbaCancel").hidden = true;
  }
  function startEdit(f) {
    editingId = f.id;
    form.reset();
    $("#fbaName").value = f.name || "";
    $("#fbaRole").value = f.role || "";
    $("#fbaRating").value = String(f.rating || 0);
    $("#fbaMessage").value = f.message;
    $("#fbaFormTitle").textContent = "Edit feedback";
    $("#fbaSave").textContent = "Save changes";
    $("#fbaCancel").hidden = false;
    say($("#fbaMsg"), "");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#fbaMessage").focus();
  }
  $("#fbaCancel").addEventListener("click", function () { resetForm(); say($("#fbaMsg"), ""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#fbaMsg");
    say(msg, "");
    if (!connected) return say(msg, "Connect with your admin key first.", "error");
    var name = $("#fbaName").value.trim(), message = $("#fbaMessage").value.trim();
    if (!editingId && !name) return say(msg, "Enter a name.", "error");
    if (!message) return say(msg, "Enter the feedback text.", "error");
    var f = items.filter(function (i) { return i.id === editingId; })[0];
    if ((!editingId || (f && f.status === "accepted")) && message.length > MAX) {
      return say(msg, "Keep the feedback to " + MAX + " characters or fewer (now " + message.length + ").", "error");
    }
    var body = { action: editingId ? "update" : "add", id: editingId, name: name, role: $("#fbaRole").value.trim(),
      rating: Number($("#fbaRating").value) || 0, message: message };
    var wasEdit = !!editingId;
    $("#fbaSave").disabled = true;
    call("POST", body).then(function (j) {
      items = j.items || items;
      if (!wasEdit) tab = "accepted";
      resetForm();
      render();
      say(msg, wasEdit ? "Saved." : "Added. It now shows in the slider.", "ok");
    }).catch(function (err) {
      say(msg, err.message, "error");
      if (err.status === 401) load(false);
    }).then(function () { $("#fbaSave").disabled = false; });
  });

  /* ---------- start ---------- */
  resetForm();
  render();
  var k = savedKey();
  if (k) { key = k; load(true); }
})();
