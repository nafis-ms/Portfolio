/* "All Projects" gallery: a glass capsule button in the Projects section opens a full-screen frosted-glass
 * layer that shows every project as a card. Data comes from store.js (PF.projects, saved in the admin panel).
 * No projects = the button stays hidden. Cards open the project in a new tab. */
(function () {
  "use strict";
  var dock = document.getElementById("pjDock");
  var openBtn = document.getElementById("pjOpen");
  var modal = document.getElementById("pjModal");
  if (!dock || !openBtn || !modal) return;

  var grid = document.getElementById("pjGrid");
  var scroller = document.getElementById("pjScroll");
  var closeBtn = document.getElementById("pjClose");
  var chip = document.getElementById("pjChip");
  var countEl = document.getElementById("pjCount");
  var root = document.documentElement;

  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (reduce) modal.classList.add("pj-calm");

  var STATUS_LABEL = { online: "Online", offline: "Offline", local: "Local Device Only", construction: "Under Construction" };

  /* ---------- data (same checks the orbit uses: a title, a picture and an http(s) link) ---------- */
  function safeUrl(u) {
    try {
      var p = new URL(String(u), location.href);
      return /^https?:$/.test(p.protocol) ? p.href : null;
    } catch (e) { return null; }
  }
  function list() {
    var all = window.PF ? PF.projects.all() : [];
    var out = [];
    (Array.isArray(all) ? all : []).forEach(function (p) {
      var title = String((p && p.title) || "").trim();
      var image = String((p && p.image) || "").trim();
      var url = safeUrl(p && p.url);                          // optional for projects that are not online
      var status = STATUS_LABEL[p && p.status] ? p.status : "online";
      if (title && image && (url || status !== "online")) out.push({ title: title, image: image, url: url, status: status });
    });
    return out;
  }
  var items = list();
  if (!items.length) return;                                  // nothing to show: the button stays hidden

  var label = items.length + (items.length === 1 ? " work" : " works");
  countEl.textContent = label;
  chip.textContent = items.length + (items.length === 1 ? " project" : " projects");
  dock.hidden = false;

  /* ---------- build ---------- */
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  var builtKey = "";
  function build() {
    var key = JSON.stringify(items);
    if (key === builtKey && grid.firstChild) return;          // same projects as last time: keep the cards (no rebuild, no image decoding)
    builtKey = key;
    grid.textContent = "";
    items.forEach(function (p, i) {
      var li = document.createElement("li");
      li.style.setProperty("--i", Math.min(i, 16));           // later cards share the last delay so a long list never drags
      var a = document.createElement("a");
      a.className = "pj-card";
      if (p.url) {
        a.href = p.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", p.title + ", " + STATUS_LABEL[p.status] + " (opens in a new tab)");
      } else {
        a.classList.add("no-link");
        a.setAttribute("aria-label", p.title + ", " + STATUS_LABEL[p.status]);
      }

      var media = document.createElement("span");
      media.className = "pj-media";
      var img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.loading = "lazy";                                   // only the cards that scroll into view load their picture
      img.addEventListener("error", function () { a.classList.add("no-img"); });
      img.src = p.image;
      media.append(img);

      var num = document.createElement("span");
      num.className = "pj-num";
      num.textContent = ("0" + (i + 1)).slice(-2);
      var visit = document.createElement("span");
      visit.className = "pj-visit";
      visit.textContent = "Visit ↗";

      var info = document.createElement("span");
      info.className = "pj-info";
      var t = document.createElement("span");
      t.className = "pj-t";
      t.textContent = p.title;                                // textContent: admin input can't inject HTML
      var h = document.createElement("span");
      h.className = "pj-host";
      h.textContent = p.url ? host(p.url) : "No public link";
      var badge = document.createElement("span");
      badge.className = "pstatus pstatus-" + p.status;
      badge.textContent = STATUS_LABEL[p.status];
      info.append(t, badge, h);

      a.append(media, num);
      if (p.url) a.append(visit);
      a.append(info);
      li.append(a);
      grid.append(li);
    });
  }

  /* ---------- open / close ---------- */
  var isOpen = false, closeTimer = 0, lastFocus = null;

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    items = list();                                           // pick up anything that changed
    build();
    var r = openBtn.getBoundingClientRect();                  // the glass opens outward from the button
    modal.style.setProperty("--ox", (r.left + r.width / 2).toFixed(0) + "px");
    modal.style.setProperty("--oy", (r.top + r.height / 2).toFixed(0) + "px");
    var bar = window.innerWidth - root.clientWidth;           // the scrollbar disappears while locked: pad so the page does not jump
    if (bar > 0) root.style.paddingRight = bar + "px";
    root.classList.add("pj-lock");
    document.dispatchEvent(new Event("gallery:toggle"));      // the page behind pauses its animations
    modal.hidden = false;
    scroller.scrollTop = 0;
    void modal.offsetWidth;                                   // start from the closed iris, then animate
    modal.classList.add("is-open");
    openBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    modal.classList.remove("is-open");
    openBtn.setAttribute("aria-expanded", "false");
    closeTimer = setTimeout(function () {
      modal.hidden = true;
      root.classList.remove("pj-lock");
      root.style.paddingRight = "";
      document.dispatchEvent(new Event("gallery:toggle"));
    }, reduce ? 220 : 950);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  openBtn.addEventListener("click", open);
  modal.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {                                    // keep keyboard focus inside the gallery
      var stops = [closeBtn, scroller].concat([].slice.call(grid.querySelectorAll("a")));
      var at = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus({ preventScroll: true });
    }
  });
  document.addEventListener("pagehide", function () { root.classList.remove("pj-lock"); root.style.paddingRight = ""; });

  /* ---------- pointer effects (mouse only): spotlight on the button, tilt + spotlight on the cards ---------- */
  if (fine && !reduce) {
    var glass = openBtn.querySelector(".pj-glass"), bx = 0, by = 0, bq = false;
    openBtn.addEventListener("pointermove", function (e) {
      bx = e.clientX; by = e.clientY;
      if (bq) return;
      bq = true;
      requestAnimationFrame(function () {
        bq = false;
        var r = openBtn.getBoundingClientRect();
        glass.style.setProperty("--mx", (bx - r.left).toFixed(0) + "px");
        glass.style.setProperty("--my", (by - r.top).toFixed(0) + "px");
      });
    });
    var TILT = 6;
    var tc = null, tx = 0, ty = 0, tq = false;                // pointer events only note the position; the card is updated once per frame
    function paintTilt() {
      tq = false;
      if (!tc) return;
      var r = tc.getBoundingClientRect(), px = (tx - r.left) / r.width, py = (ty - r.top) / r.height;
      tc.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      tc.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      tc.style.setProperty("--ry", ((px - 0.5) * 2 * TILT).toFixed(2) + "deg");
      tc.style.setProperty("--rx", ((0.5 - py) * 2 * TILT).toFixed(2) + "deg");
    }
    grid.addEventListener("pointermove", function (e) {
      var c = e.target.closest(".pj-card");
      if (!c) return;
      tc = c; tx = e.clientX; ty = e.clientY;
      if (!tq) { tq = true; requestAnimationFrame(paintTilt); }
    });
    grid.addEventListener("pointerout", function (e) {
      var c = e.target.closest(".pj-card");
      if (c && !c.contains(e.relatedTarget)) { if (tc === c) tc = null; c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
    });
  }
})();
