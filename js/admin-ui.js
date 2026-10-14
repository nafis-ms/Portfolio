/* Admin shell (macOS style): sidebar tabs with a sliding highlight, window controls,
 * menu-bar clock, dashboard numbers and the connection check.
 * Pure layout; all the real work is done by the other admin-*.js files. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-panel]"));
  var DEFAULT = "overview";
  var win = $("#win"), hl = $("#sideHl"), nav = $("#sideNav");
  var tbTitle = $("#tbTitle"), mbSection = $("#mbSection"), scroller = $("#contentScroll");
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = null, enterTimer = 0;

  function labelOf(btn) {
    var l = btn && btn.querySelector(".nl");
    return ((l || btn || {}).textContent || "").trim();
  }

  function moveHl() {
    var a = document.querySelector('.navbtn[aria-current="page"]');
    if (!hl || !a || !a.offsetHeight) return;           // hidden (mobile / gate)
    hl.style.height = a.offsetHeight + "px";
    hl.style.transform = "translateY(" + a.offsetTop + "px)";
    hl.classList.add("ready");
  }

  function show(name, push) {
    if (!panels.some(function (p) { return p.dataset.panel === name; })) name = DEFAULT;
    var changed = name !== current;
    current = name;
    panels.forEach(function (p) {
      var on = p.dataset.panel === name;
      p.hidden = !on;
      if (on && changed && !calm) {
        p.classList.remove("tab-enter");
        void p.offsetWidth;                              // restart the entrance animation
        p.classList.add("tab-enter");
        clearTimeout(enterTimer);
        enterTimer = setTimeout(function () { p.classList.remove("tab-enter"); }, 1400);
      }
    });
    tabs.forEach(function (t) {
      if (t.dataset.tab === name) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    var active = document.querySelector('.navbtn[data-tab="' + name + '"]');
    var label = labelOf(active) || "Dashboard";
    if (tbTitle) {
      tbTitle.textContent = label;
      if (changed && !calm) { tbTitle.classList.remove("swap"); void tbTitle.offsetWidth; tbTitle.classList.add("swap"); }
    }
    if (mbSection) mbSection.textContent = label;
    document.title = label + " · Admin";
    moveHl();
    if (push) {
      try { history.replaceState(null, "", "#" + name); } catch (e) { /* file:// */ }
      if (scroller) scroller.scrollTo({ top: 0 });
      scrollTo({ top: 0 });
    }
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "center" });
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () { show(t.dataset.tab, true); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
    b.addEventListener("click", function () { show(b.dataset.go, true); });
  });
  addEventListener("hashchange", function () { show(location.hash.slice(1), false); });
  show(location.hash.slice(1), false);

  addEventListener("resize", moveHl);
  document.addEventListener("admin:start", function () { requestAnimationFrame(moveHl); });
  if (window.ResizeObserver && nav) new ResizeObserver(moveHl).observe(nav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveHl);
  setTimeout(moveHl, 400); setTimeout(moveHl, 1200);    // after the window-open animation

  /* ---------- window controls ---------- */
  function toggleSide() { if (win) win.classList.toggle("side-hidden"); setTimeout(moveHl, 650); }
  var tlMin = $("#tlMin"), tlZoom = $("#tlZoom"), tlClose = $("#tlClose"), sideToggle = $("#sideToggle");
  if (tlMin) tlMin.addEventListener("click", toggleSide);
  if (sideToggle) sideToggle.addEventListener("click", toggleSide);
  if (tlZoom) tlZoom.addEventListener("click", function () { if (win) win.classList.toggle("zoomed"); setTimeout(moveHl, 650); });
  if (tlClose) tlClose.addEventListener("click", function () { var b = $("#logout"); if (b) b.click(); });

  /* ---------- menu-bar clock + greeting ---------- */
  function tick() {
    var d = new Date();
    var c = $("#mbClock");
    if (c) c.textContent = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  tick(); setInterval(tick, 20000);
  var g = $("#dashGreeting");
  if (g) {
    var h = new Date().getHours();
    var hello = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    g.textContent = hello + ". Everything you change here is saved on the server and goes live on your site within a few seconds.";
  }

  /* ---------- numbers ---------- */
  function count(el, n) {
    if (!el) return;
    if (typeof n !== "number" || calm) { el.textContent = n; return; }
    var from = parseInt(el.textContent, 10) || 0, t0 = performance.now(), dur = 900;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = Math.round(from + (n - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function badge(name, n) {
    var el = document.querySelector('[data-badge="' + name + '"]');
    if (el) { el.textContent = n || ""; el.hidden = !n; }
  }
  if (window.ADMIN) ADMIN.on(function (c) {
    var p = (c.projects || []).length, s = (c.skills || []).length;
    count($("#statProjects"), p); count($("#statSkills"), s);
    var cv = $("#statCv"); if (cv) cv.textContent = c.cv ? "Yes" : "No";
    badge("projects", p); badge("skills", s);      // feedback numbers are set by admin-feedback.js
  });

  /* ---------- connection check on the Dashboard ---------- */
  function check() {
    var el = $("#ovMsg");
    if (!el || !window.ADMIN || !ADMIN.hasKey()) return;
    ADMIN.api("admin/ping").then(function (r) {
      el.textContent = r.storage
        ? "Connected. Every change you save here is live on your site within a few seconds."
        : "The password works, but storage isn't connected. Add the Upstash Redis integration to this Vercel project and redeploy.";
      el.className = "msg status " + (r.storage ? "ok" : "error");
    }, function (err) { el.textContent = err.message; el.className = "msg status error"; });
  }
  document.addEventListener("admin:start", check);
})();