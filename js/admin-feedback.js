/* Feedback admin: review what visitors send, accept it into the slider, reject it, edit it,
 * reorder it, or add your own. Saved on the server (admin-api.js -> api/index.js).
 * Statuses: pending -> accepted (shown on site) | rejected (hidden). */
(function () {
  "use strict";
  var S = window.FBStore;
  var $ = function (s) { return document.querySelector(s); };
  if (!S || !window.ADMIN || !$("#fbaForm")) return;
  var SLIDER_MAX = 300;
  var tab = "pending", editingId = null, cache = [], busy = false, poll = null;

  function say(el, text, kind) { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }
  function stars(n) { return n ? new Array(n + 1).join("★") + new Array(6 - n).join("☆") : ""; }
  function find(id) { return cache.filter(function (x) { return x.id === id; })[0] || null; }
  function tooLong(len) {
    return "This feedback is " + len + " characters, but the slider shows up to " + SLIDER_MAX + ". Edit it shorter first (Edit button), then accept it.";
  }
  function nextOrder() { return cache.reduce(function (m, i) { return i.status === "accepted" ? Math.max(m, i.order) : m; }, 0) + 1; }

  function onError(err, el) { say(el, (err && err.message) || "Something went wrong.", "error"); }   // a 401 is handled by admin-api.js

  /* ---------- server calls ---------- */
  var api = {
    list: function () { return ADMIN.api("admin/feedback").then(function (rows) { return rows.map(S.normalize); }); },
    create: function (e) { return ADMIN.api("admin/feedback", "POST", e); },
    update: function (id, f) { return ADMIN.api("admin/feedback/" + id, "POST", f); },
    remove: function (id) { return ADMIN.api("admin/feedback/" + id, "DELETE"); }
  };
  function stop() { if (poll) { clearInterval(poll); poll = null; } }
  function start() {
    refresh();
    stop();
    poll = setInterval(function () { if (!document.hidden && !busy && ADMIN.hasKey()) refresh(true); }, 30000);
  }

  /* ---------- list ---------- */
  var EMPTY = {
    pending: "No pending feedback. Feedback sent from your site shows up here.",
    accepted: "Nothing in the slider yet. Accept feedback from Pending, or add your own.",
    rejected: "No rejected feedback. Rejected feedback is never shown on your site."
  };

  function refresh(silent) {
    return api.list().then(function (list) { cache = list; render(); if (!silent) say($("#fbaListMsg"), ""); },
      function (err) { onError(err, $("#fbaListMsg")); });
  }

  function btn(label, cls, fn, aria, disabled) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn ghost" + (cls ? " " + cls : ""); b.textContent = label;
    if (aria) b.setAttribute("aria-label", aria);
    b.disabled = !!disabled || busy;
    b.addEventListener("click", fn);
    return b;
  }

  function render() {
    var counts = { pending: 0, accepted: 0, rejected: 0 };
    cache.forEach(function (i) { counts[i.status]++; });
    $("#fbaCntPending").textContent = counts.pending ? "(" + counts.pending + ")" : "";
    $("#fbaCntAccepted").textContent = counts.accepted ? "(" + counts.accepted + ")" : "";
    $("#fbaCntRejected").textContent = counts.rejected ? "(" + counts.rejected + ")" : "";
    Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.fbtab === tab ? "true" : "false");
    });
    var stat = $("#statFeedback"); if (stat) stat.textContent = counts.accepted;
    var badge = document.querySelector('[data-badge="feedback"]');
    if (badge) { badge.textContent = counts.pending || ""; badge.hidden = !counts.pending; }

    var shown = cache.filter(function (i) { return i.status === tab; });
    shown.sort(tab === "accepted" ? S.byOrder : function (a, b) { return b.createdAt - a.createdAt; });
    var list = $("#fbaList");
    list.textContent = "";
    $("#fbaEmpty").hidden = shown.length > 0;
    $("#fbaEmpty").textContent = EMPTY[tab];

    shown.forEach(function (it, i) {
      var li = document.createElement("li");
      li.className = "item fb-item";
      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = (it.anonymous || !it.name ? "Anonymous" : it.name) + (it.role ? " · " + it.role : "");
      var sub = document.createElement("span");
      sub.className = "site";
      sub.textContent = [
        stars(it.rating),
        it.createdAt ? new Date(it.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        it.anonymous ? "Posted anonymously" : "",
        it.source === "admin" ? "Added by you" : ""
      ].filter(Boolean).join(" · ");
      var text = document.createElement("p");
      var long = it.message.length > SLIDER_MAX;
      text.className = "fb-msg" + (long ? " too-long" : "");
      text.textContent = it.message;
      meta.append(name, sub, text);
      if (long) {
        var note = document.createElement("span");
        note.className = "fb-note";
        note.textContent = "Too long for the slider (" + it.message.length + "/" + SLIDER_MAX + "). Edit it shorter before accepting.";
        meta.append(note);
      }
      var actions = document.createElement("div");
      actions.className = "actions";
      if (tab === "pending") {
        actions.append(btn("Accept", "", function () { setStatus(it.id, "accepted"); }),
          btn("Reject", "", function () { setStatus(it.id, "rejected"); }));
      } else if (tab === "accepted") {
        actions.append(
          btn("↑", "", function () { move(it.id, -1); }, "Move earlier", i === 0),
          btn("↓", "", function () { move(it.id, 1); }, "Move later", i === shown.length - 1),
          btn("Unpublish", "", function () { setStatus(it.id, "pending"); }));
      } else {
        actions.append(btn("Accept", "", function () { setStatus(it.id, "accepted"); }),
          btn("Pending", "", function () { setStatus(it.id, "pending"); }));
      }
      actions.append(btn("Edit", "", function () { startEdit(it); }), btn("Delete", "danger", function () { remove(it.id); }));
      li.append(meta, actions);
      list.append(li);
    });
  }

  /* ---------- actions ---------- */
  function run(promise, msgEl, okText) {
    busy = true;
    return promise.then(function () { return api.list(); }).then(function (list) {
      cache = list; busy = false; render();
      if (okText) say(msgEl, okText, "ok");
      return true;
    }, function (err) { busy = false; render(); onError(err, msgEl); return false; });
  }

  function setStatus(id, status) {
    var msg = $("#fbaListMsg"), it = find(id);
    if (!it) return say(msg, "That feedback no longer exists. Refresh the list.", "error");
    if (status === "accepted" && it.message.length > SLIDER_MAX) return say(msg, tooLong(it.message.length), "error");
    if (it.status === status) return;
    run(api.update(id, { status: status, order: status === "accepted" ? nextOrder() : 0 }), msg,
      status === "accepted" ? "Accepted. It is now in the slider on your site." : status === "rejected" ? "Rejected. Visitors will not see it." : "Moved back to Pending.");
  }

  function remove(id) {
    var it = find(id);
    if (!it) return;
    if (!confirm("Delete this feedback" + (it.name ? " from " + it.name : "") + "? This cannot be undone.")) return;
    run(api.remove(id), $("#fbaListMsg"), "Deleted.").then(function () { if (editingId === id) resetForm(); });
  }

  function move(id, dir) {
    var acc = cache.filter(function (i) { return i.status === "accepted"; }).sort(S.byOrder);
    var from = acc.map(function (i) { return i.id; }).indexOf(id), to = from + dir;
    if (from < 0 || to < 0 || to >= acc.length) return;
    acc.splice(to, 0, acc.splice(from, 1)[0]);
    var jobs = [];
    acc.forEach(function (i, k) { if (i.order !== k + 1) jobs.push(api.update(i.id, { order: k + 1 })); });
    run(Promise.all(jobs), $("#fbaListMsg"));
  }

  /* ---------- add / edit ---------- */
  var form = $("#fbaForm");
  function syncAnon() {
    var a = $("#fbaAnon").checked;
    $("#fbaName").disabled = a;
    if (a) $("#fbaName").value = "";
  }
  $("#fbaAnon").addEventListener("change", syncAnon);

  function resetForm() {
    editingId = null; form.reset();
    $("#fbaRating").value = "5"; syncAnon();
    $("#fbaFormTitle").textContent = "Add feedback";
    $("#fbaSave").textContent = "Add feedback";
    $("#fbaCancel").hidden = true;
  }
  function startEdit(it) {
    editingId = it.id; form.reset();
    $("#fbaAnon").checked = !!it.anonymous;
    $("#fbaName").value = it.name; $("#fbaRole").value = it.role;
    $("#fbaRating").value = String(it.rating); $("#fbaMessage").value = it.message;
    syncAnon();
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
    var anon = $("#fbaAnon").checked;
    var name = anon ? "" : S.clean($("#fbaName").value, 60), role = S.clean($("#fbaRole").value, 60);
    var rating = Math.max(0, Math.min(5, Math.round(Number($("#fbaRating").value) || 0)));
    var message = S.clean($("#fbaMessage").value, 1000);
    if (!message) return say(msg, "Enter the feedback text.", "error");
    if (!anon && !name) return say(msg, "Enter a name, or tick Anonymous.", "error");
    if (message.length > SLIDER_MAX) {
      var cur = editingId && find(editingId);
      if (!editingId || (cur && cur.status === "accepted")) return say(msg, tooLong(message.length), "error");
    }
    var wasEdit = !!editingId, job;
    if (wasEdit) {
      if (!find(editingId)) { resetForm(); return say(msg, "That feedback no longer exists. Refresh the list.", "error"); }
      job = api.update(editingId, { name: name, role: role, anonymous: anon, rating: rating, message: message });
    } else {
      job = api.create({ name: name, role: role, anonymous: anon, rating: rating, message: message, status: "accepted", order: nextOrder() });
      tab = "accepted";
    }
    run(job, msg).then(function (ok) {
      if (!ok) return;
      resetForm();
      say(msg, wasEdit ? "Saved." : "Added. It is now in the slider on your site.", "ok");
    });
  });

  /* ---------- tabs / refresh / live ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
    b.addEventListener("click", function () { tab = b.dataset.fbtab; say($("#fbaListMsg"), ""); render(); });
  });
  $("#fbaRefresh").addEventListener("click", function () {
    refresh(true).then(function () { say($("#fbaListMsg"), "List refreshed.", "ok"); });
  });

  resetForm();
  document.addEventListener("admin:start", start);
  if (ADMIN.hasKey() && !$("#app").hidden) start();
})();
