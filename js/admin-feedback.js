/* Feedback admin: review what visitors send, accept it into the slider on the site, reject it,
 * edit it, reorder it, or add your own. Runs entirely in the browser; the data layer is
 * store.js (PF.feedback, localStorage), the same as projects and skills.
 *
 * Entry: { id, name, role, email, rating (0-5), message, status: "pending"|"accepted"|"rejected",
 *          source: "visitor"|"admin", createdAt, order }
 * "Apply Changes" (Publish tab) publishes the accepted ones as feedback.json for all visitors. */
(function () {
  "use strict";
  var SLIDER_MAX = 300;            // longest message the slider can show
  var MAX_ITEMS = 500;
  var MANAGED_KEY = "portfolio-feedback-managed";   // tells the site to read this browser's list
  var STATUSES = ["pending", "accepted", "rejected"];
  var $ = function (s) { return document.querySelector(s); };
  var tab = "pending";
  var editingId = null;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function newId() { return Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }
  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0); }
  function stars(n) { return n ? new Array(n + 1).join("★") + new Array(6 - n).join("☆") : ""; }
  function tooLong(msg) {
    return "This feedback is " + msg.length + " characters, but the slider shows up to " + SLIDER_MAX + ". Edit it shorter first (Edit button), then accept it.";
  }

  /* ---------- data ---------- */
  function norm(e) {
    var c = {};
    for (var k in e) c[k] = e[k];
    var st = e.status || (e.visible === false ? "pending" : "accepted");   // entries saved by older versions
    c.status = STATUSES.indexOf(st) === -1 ? "pending" : st;
    c.order = Number(e.order) || 0;
    c.createdAt = Number(e.createdAt) || 0;
    c.rating = Math.max(0, Math.min(5, Math.round(Number(e.rating) || 0)));
    c.name = String(e.name || "");
    c.role = String(e.role || "");
    c.message = String(e.message || "");
    return c;
  }
  function all() { return PF.feedback.all().filter(Boolean).map(norm); }
  function nextOrder(items) {
    return items.reduce(function (m, i) { return i.status === "accepted" ? Math.max(m, i.order) : m; }, 0) + 1;
  }

  function persist(next, msgEl, okText) {
    try {
      PF.feedback.save(next);
      try { localStorage.setItem(MANAGED_KEY, "1"); } catch (e) { /* blocked */ }
    } catch (err) {
      say(msgEl, "Browser storage is full. Delete some feedback, a project or a skill first.", "error");
      return false;
    }
    render();
    if (okText) say(msgEl, okText, "ok");
    return true;
  }

  /* ---------- actions ---------- */
  function find(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function setStatus(id, status) {
    var msg = $("#fbaListMsg"), items = all(), it = find(items, id);
    if (!it) return say(msg, "That feedback no longer exists. Refresh the list.", "error");
    if (status === "accepted" && it.message.length > SLIDER_MAX) return say(msg, tooLong(it.message), "error");
    if (it.status === status) return;
    it.status = status;
    it.order = status === "accepted" ? nextOrder(items) : 0;
    persist(items, msg, status === "accepted" ? "Accepted. It is now in the slider on your site." : status === "rejected" ? "Rejected." : "Moved back to Pending.");
  }

  function remove(id) {
    var items = all(), it = find(items, id);
    if (!it) return;
    if (!confirm("Delete this feedback" + (it.name ? " from " + it.name : "") + "? This cannot be undone.")) return;
    if (persist(items.filter(function (x) { return x.id !== id; }), $("#fbaListMsg"), "Deleted.")) {
      if (editingId === id) resetForm();
    }
  }

  function move(id, dir) {
    var items = all(), it = find(items, id);
    if (!it) return;
    var acc = items.filter(function (i) { return i.status === "accepted"; }).sort(byOrder);
    var from = acc.indexOf(it), to = from + dir;
    if (from < 0 || to < 0 || to >= acc.length) return;
    acc.splice(to, 0, acc.splice(from, 1)[0]);
    acc.forEach(function (i, k) { i.order = k + 1; });
    persist(items, $("#fbaListMsg"));
  }

  /* ---------- list ---------- */
  var EMPTY = {
    pending: "No pending feedback. Feedback sent from your site shows up here.",
    accepted: "Nothing in the slider yet. Accept feedback from Pending, or add your own.",
    rejected: "No rejected feedback."
  };

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

  function render() {
    var items = all(), counts = { pending: 0, accepted: 0, rejected: 0 };
    items.forEach(function (i) { counts[i.status]++; });
    $("#fbaCntPending").textContent = counts.pending ? "(" + counts.pending + ")" : "";
    $("#fbaCntAccepted").textContent = counts.accepted ? "(" + counts.accepted + ")" : "";
    $("#fbaCntRejected").textContent = counts.rejected ? "(" + counts.rejected + ")" : "";
    Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.fbtab === tab ? "true" : "false");
    });

    var stat = $("#statFeedback");
    if (stat) stat.textContent = counts.accepted;
    var badge = document.querySelector('[data-badge="feedback"]');
    if (badge) { badge.textContent = counts.pending || ""; badge.hidden = !counts.pending; }

    var shown = items.filter(function (i) { return i.status === tab; });
    shown.sort(tab === "accepted" ? byOrder : function (a, b) { return b.createdAt - a.createdAt; });

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
      name.textContent = (it.name || "Anonymous") + (it.role ? " · " + it.role : "");
      var sub = document.createElement("span");
      sub.className = "site";
      sub.textContent = [
        stars(it.rating),
        it.createdAt ? new Date(it.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        it.email,
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
      actions.append(btn("Edit", "", function () { startEdit(it); }),
        btn("Delete", "danger", function () { remove(it.id); }));

      li.append(meta, actions);
      list.append(li);
    });
  }

  /* ---------- add / edit ---------- */
  var form = $("#fbaForm");

  function resetForm() {
    editingId = null;
    form.reset();
    $("#fbaRating").value = "5";
    $("#fbaFormTitle").textContent = "Add feedback";
    $("#fbaSave").textContent = "Add feedback";
    $("#fbaCancel").hidden = true;
  }

  function startEdit(it) {
    editingId = it.id;
    form.reset();
    $("#fbaName").value = it.name;
    $("#fbaRole").value = it.role;
    $("#fbaRating").value = String(it.rating);
    $("#fbaMessage").value = it.message;
    $("#fbaFormTitle").textContent = "Edit feedback";
    $("#fbaSave").textContent = "Save changes";
    $("#fbaCancel").hidden = false;
    say($("#fbaMsg"), "");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#fbaMessage").focus();
  }

  $("#fbaCancel").addEventListener("click", function () {
    resetForm();
    say($("#fbaMsg"), "");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#fbaMsg");
    say(msg, "");
    var name = clean($("#fbaName").value, 60), role = clean($("#fbaRole").value, 60);
    var rating = Math.max(0, Math.min(5, Math.round(Number($("#fbaRating").value) || 0)));
    var message = clean($("#fbaMessage").value, 1000);
    if (!message) return say(msg, "Enter the feedback text.", "error");

    var items = all(), wasEdit = !!editingId;
    if (wasEdit) {
      var it = find(items, editingId);
      if (!it) { resetForm(); return say(msg, "That feedback no longer exists. Refresh the list.", "error"); }
      if (it.status === "accepted" && message.length > SLIDER_MAX) return say(msg, tooLong(message), "error");
      it.name = name; it.role = role; it.rating = rating; it.message = message;
    } else {
      if (!name) return say(msg, "Enter a name.", "error");
      if (message.length > SLIDER_MAX) return say(msg, tooLong(message), "error");
      if (items.length >= MAX_ITEMS) return say(msg, "Limit of " + MAX_ITEMS + " entries reached. Delete some first.", "error");
      items.push({
        id: newId(), name: name, role: role, email: "", rating: rating, message: message,
        status: "accepted", source: "admin", createdAt: Date.now(), order: nextOrder(items)
      });
      tab = "accepted";
    }
    if (persist(items, msg)) {
      resetForm();
      say(msg, wasEdit ? "Saved." : "Added. It is now in the slider on your site.", "ok");
    }
  });

  /* ---------- tabs / refresh / live updates ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-fbtab]"), function (b) {
    b.addEventListener("click", function () {
      tab = b.dataset.fbtab;
      say($("#fbaListMsg"), "");
      render();
    });
  });
  $("#fbaRefresh").addEventListener("click", function () {
    render();
    say($("#fbaListMsg"), "List refreshed.", "ok");
  });
  addEventListener("storage", function (e) {
    if (e.key === PF.FEEDBACK_KEY) render();   // a visitor sent feedback in another tab of this browser
  });

  resetForm();
  render();
})();
