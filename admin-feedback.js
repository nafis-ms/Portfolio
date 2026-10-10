/* Feedback admin: add, edit, delete, show/hide and reorder the feedback that slides
 * across the site. Runs entirely in the browser (data layer: store.js, PF.feedback),
 * like projects and skills. Sign-in is handled by admin.js. */
(function () {
  "use strict";
  var MAX = 50;
  var $ = function (s) { return document.querySelector(s); };
  var editingId = null;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function newId() { return Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }
  function stars(n) { n = Math.max(0, Math.min(5, Number(n) || 0)); return n ? "★".repeat(n) + "☆".repeat(5 - n) : "No rating"; }

  function persist(next, msgEl, okText) {
    try { PF.feedback.save(next); }
    catch (err) { say(msgEl, "Browser storage is full. Delete something first.", "error"); return false; }
    render();
    if (okText) say(msgEl, okText, "ok");
    return true;
  }

  /* ---------- list ---------- */
  function render() {
    var items = PF.feedback.all(), list = $("#fbaList");
    list.textContent = "";
    $("#fbaCount").textContent = items.length ? "(" + items.length + ")" : "";
    $("#fbaEmpty").hidden = items.length > 0;

    items.forEach(function (f, i) {
      var li = document.createElement("li");
      li.className = "item" + (f.visible === false ? " is-hidden" : "");

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = f.name + (f.role ? " · " + f.role : "");
      var sub = document.createElement("span");
      sub.className = "site";
      sub.textContent = stars(f.rating) + " · " + (f.visible === false ? "Hidden" : "Visible") + " · " + f.message;
      meta.append(name, sub);

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
      actions.append(
        btn("↑", "", function () { move(i, -1); }, "Move " + f.name + " earlier", i === 0),
        btn("↓", "", function () { move(i, 1); }, "Move " + f.name + " later", i === items.length - 1),
        btn(f.visible === false ? "Show" : "Hide", "", function () { toggle(f); }),
        btn("Edit", "", function () { startEdit(f); }),
        btn("Delete", "danger", function () { remove(f); })
      );
      li.append(meta, actions);
      list.append(li);
    });
  }

  function move(i, dir) {
    var list = PF.feedback.all(), j = i + dir;
    if (j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    persist(list, $("#fbaMsg"));
  }
  function toggle(f) {
    persist(PF.feedback.all().map(function (x) {
      if (x.id !== f.id) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      c.visible = x.visible === false;
      return c;
    }), $("#fbaMsg"), f.visible === false ? "Now in the slider (after Apply Changes)." : "Removed from the slider (after Apply Changes).");
  }
  function remove(f) {
    if (!confirm('Delete the feedback from "' + f.name + '"?')) return;
    if (persist(PF.feedback.all().filter(function (x) { return x.id !== f.id; }), $("#fbaMsg"), "Deleted.")) {
      if (editingId === f.id) resetForm();
    }
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
    $("#fbaName").value = f.name;
    $("#fbaRole").value = f.role || "";
    $("#fbaRating").value = String(f.rating || 0);
    $("#fbaMessage").value = f.message;
    $("#fbaVisible").checked = f.visible !== false;
    $("#fbaFormTitle").textContent = "Edit feedback";
    $("#fbaSave").textContent = "Save changes";
    $("#fbaCancel").hidden = false;
    say($("#fbaMsg"), "");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#fbaName").focus();
  }
  $("#fbaCancel").addEventListener("click", function () { resetForm(); say($("#fbaMsg"), ""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#fbaMsg");
    say(msg, "");
    var name = $("#fbaName").value.trim();
    var message = $("#fbaMessage").value.trim();
    if (!name) return say(msg, "Enter a name.", "error");
    if (!message) return say(msg, "Enter the feedback text.", "error");
    if (message.length > 300) return say(msg, "Keep the feedback to 300 characters or fewer.", "error");

    var entry = {
      id: editingId || newId(),
      name: name.slice(0, 60),
      role: $("#fbaRole").value.trim().slice(0, 60),
      rating: Number($("#fbaRating").value) || 0,
      message: message,
      visible: $("#fbaVisible").checked
    };
    var list = PF.feedback.all(), next;
    if (editingId) next = list.map(function (x) { return x.id === editingId ? entry : x; });
    else {
      if (list.length >= MAX) return say(msg, "Limit of " + MAX + " entries reached.", "error");
      next = list.concat(entry);
    }
    var wasEdit = !!editingId;
    if (persist(next, msg)) {
      resetForm();
      say(msg, wasEdit ? "Saved. Click Apply Changes to publish." : "Added. Click Apply Changes to publish.", "ok");
    }
  });

  resetForm();
  render();
})();