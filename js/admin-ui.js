/* Admin shell: floating icon rail with a sliding highlight, live clock + calendar + day ring on the
 * Dashboard, pointer spotlight and parallax, dashboard numbers and the connection check.
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
        enterTimer = setTimeout(function () { p.classList.remove("tab-enter"); }, 2600);
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

  /* ---------- sidebar show / hide ---------- */
  function toggleSide() { if (win) win.classList.toggle("side-hidden"); setTimeout(moveHl, 750); }
  var sideToggle = $("#sideToggle");
  if (sideToggle) sideToggle.addEventListener("click", toggleSide);

  /* ---------- live clock, greeting, day ring ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var shown = { h: "", m: "" };
  function roll(el, text, key) {
    if (!el || shown[key] === text) return;
    var first = shown[key] === "";
    shown[key] = text;
    el.textContent = text;
    if (!first && !calm) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); }
  }
  var RING = 364.42;
  function tick() {
    var d = new Date();
    var c = $("#mbClock");
    if (c) c.textContent = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    var h = d.getHours();
    roll($("#clkH"), pad(h % 12 || 12), "h");
    roll($("#clkM"), pad(d.getMinutes()), "m");
    var ap = $("#clkAp"); if (ap) ap.textContent = h < 12 ? "AM" : "PM";
    var dt = $("#clkDate");
    if (dt) dt.textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var bar = $("#clkBar"); if (bar) bar.style.width = ((d.getSeconds() + d.getMilliseconds() / 1000) / 60 * 100).toFixed(1) + "%";

    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var pct = Math.min(1, (d.getTime() - start) / 86400000);
    var pt = $("#ringPct"); if (pt) pt.textContent = Math.floor(pct * 100) + "%";
    var left = Math.max(0, 86400000 - (d.getTime() - start)), lh = Math.floor(left / 3600000), lm = Math.floor(left % 3600000 / 60000);
    var rl = $("#ringLeft"); if (rl) rl.textContent = lh + "h " + lm + "m left today";
    if (ringOn) { var fg = $("#ringFg"); if (fg) fg.style.strokeDashoffset = (RING * (1 - pct)).toFixed(2); }

    var word = $("#dashHelloWord");
    if (word) word.textContent = (h < 5 ? "Working late," : h < 12 ? "Good Morning," : h < 18 ? "Good Afternoon," : "Good Evening,");
    if (d.getDate() !== lastDay) { lastDay = d.getDate(); renderCal(false); }
  }
  var ringOn = false, lastDay = -1, ringTimer = 0;
  function playRing() {                                   // sweep the ring in again whenever the Dashboard opens
    var fg = $("#ringFg"); if (!fg) return;
    ringOn = false; fg.style.strokeDashoffset = RING;
    clearTimeout(ringTimer);
    ringTimer = setTimeout(function () { ringOn = true; tick(); }, calm ? 0 : 700);
  }

  /* ---------- calendar ---------- */
  var calDate = new Date(); calDate.setDate(1);
  var calDays = $("#calDays"), calTitle = $("#calTitle");
  function renderCal(animate) {
    if (!calDays || !calTitle) return;
    function paint() {
      var now = new Date(), y = calDate.getFullYear(), m = calDate.getMonth();
      calTitle.textContent = calDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      var firstDow = new Date(y, m, 1).getDay(), inMonth = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
      var frag = document.createDocumentFragment();
      for (var i = 0; i < 42; i++) {
        var cell = document.createElement("span"), n = i - firstDow + 1;
        if (n < 1) { cell.textContent = prevDays + n; cell.className = "out"; }
        else if (n > inMonth) { cell.textContent = n - inMonth; cell.className = "out"; }
        else {
          cell.textContent = n;
          if (n === now.getDate() && m === now.getMonth() && y === now.getFullYear()) { cell.className = "today"; cell.setAttribute("aria-current", "date"); }
        }
        frag.appendChild(cell);
      }
      calDays.textContent = ""; calDays.appendChild(frag);
    }
    if (animate && !calm) {
      calDays.classList.add("flip");
      setTimeout(function () { paint(); calDays.classList.remove("flip"); }, 180);
    } else paint();
  }
  function shiftMonth(by) { calDate.setMonth(calDate.getMonth() + by); renderCal(true); }
  var cp = $("#calPrev"), cn = $("#calNext");
  if (cp) cp.addEventListener("click", function () { shiftMonth(-1); });
  if (cn) cn.addEventListener("click", function () { shiftMonth(1); });
  if (calTitle) calTitle.addEventListener("click", function () { calDate = new Date(); calDate.setDate(1); renderCal(true); });
  renderCal(false);
  tick(); setInterval(tick, 1000);

  /* ---------- replay the entrance when the panel opens after sign-in ---------- */
  function replay() {
    var p = panels.filter(function (x) { return !x.hidden; })[0];
    if (p && !calm) {
      p.classList.remove("tab-enter"); void p.offsetWidth; p.classList.add("tab-enter");
      clearTimeout(enterTimer);
      enterTimer = setTimeout(function () { p.classList.remove("tab-enter"); }, 2600);
    }
    playRing();
  }
  document.addEventListener("admin:start", replay);
  /* the film opening (admin-cinema.js) holds the UI back; play its entrance once the curtain opens */
  document.addEventListener("cine:ready", function () { var app = $("#app"); if (app && !app.hidden) replay(); });

  /* ---------- pointer spotlight on cards + wallpaper parallax ---------- */
  var raf = 0, px = 0, py = 0, tgt = null;
  document.addEventListener("pointermove", function (e) {
    px = e.clientX; py = e.clientY; tgt = e.target;
    if (raf || calm) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var root = document.documentElement;
      root.style.setProperty("--px", ((px / innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--py", ((py / innerHeight) * 2 - 1).toFixed(3));
      var card = tgt && tgt.closest ? tgt.closest(".panel, .stat") : null;
      if (card) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (px - r.left) + "px");
        card.style.setProperty("--my", (py - r.top) + "px");
      }
    });
  }, { passive: true });

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
