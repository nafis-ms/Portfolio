/* Admin layout: sidebar tabs, count badges and the overview numbers.
 * Pure layout; all the real work is done by the other admin-*.js files. */
(function () {
  "use strict";
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-panel]"));
  var DEFAULT = "overview";

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
  if (window.ADMIN) ADMIN.on(function (c) {
    var p = (c.projects || []).length, s = (c.skills || []).length;
    set("#statProjects", p); set("#statSkills", s);
    set("#statCv", c.cv ? "Yes" : "No");
    badge("projects", p); badge("skills", s);      // feedback numbers are set by admin-feedback.js
  });

  /* ---------- connection check on the Overview tab ---------- */
  function check() {
    var el = document.querySelector("#ovMsg");
    if (!el || !window.ADMIN || !ADMIN.hasKey()) return;
    ADMIN.api("admin/ping").then(function (r) {
      el.textContent = r.storage
        ? "Connected. Every change you save here is live on your site straight away."
        : "The password works, but storage isn't connected. Add the Upstash Redis integration to this Vercel project and redeploy.";
      el.className = "msg " + (r.storage ? "ok" : "error");
    }, function (err) { el.textContent = err.message; el.className = "msg error"; });
  }
  document.addEventListener("admin:start", check);
})();
