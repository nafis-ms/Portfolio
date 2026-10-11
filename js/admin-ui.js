/* Admin layout: sidebar tabs, count badges and the overview numbers.
 * Pure layout; all the real work is done by the other admin-*.js files. */
(function () {
  "use strict";
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-panel]"));
  var DEFAULT = "publish";

  function show(name, push) {
    if (!panels.some(function (p) { return p.dataset.panel === name; })) name = DEFAULT;
    panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    tabs.forEach(function (t) {
      if (t.dataset.tab === name) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    if (push) {
      try { history.replaceState(null, "", "#" + name); } catch (e) { /* file:// */ }
      scrollTo({ top: 0 });
    }
    var active = document.querySelector('[data-tab="' + name + '"]');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "center" });
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () { show(t.dataset.tab, true); });
  });
  addEventListener("hashchange", function () { show(location.hash.slice(1), false); });
  show(location.hash.slice(1), false);

  /* ---------- numbers ---------- */
  function set(sel, text) { var el = document.querySelector(sel); if (el) el.textContent = text; }
  function badge(name, n) {
    var el = document.querySelector('[data-badge="' + name + '"]');
    if (el) { el.textContent = n || ""; el.hidden = !n; }
  }
  function refresh() {
    if (!window.PF) return;
    var p = PF.projects.all().length, s = PF.skills.all().length;
    set("#statProjects", p); set("#statSkills", s);
    set("#statCv", PF.cv.get() ? "Yes" : "No");
    badge("projects", p); badge("skills", s);      // feedback numbers are set by admin-feedback.js
  }
  ["#count", "#skillCount", "#fbaCount", "#cvStatus"].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) new MutationObserver(refresh).observe(el, { childList: true, characterData: true, subtree: true });
  });
  refresh();
})();
