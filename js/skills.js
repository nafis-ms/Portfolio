/* Skills section: loads the skills saved in the admin panel and shows them as a
 * floating cluster of glossy 3D spheres.
 *
 *   data:         store.js (PF.skills), saved from the admin panel
 *   physics:      skills-physics.js
 *   rendering:    skills-render.js
 *   this file:    data loading, cursor/touch interaction, the animation loop,
 *                 resizing, reduced motion and the no-WebGL fallback
 *
 * Skill shape: { id, name, logo, category, size: "small"|"medium"|"large", percent (optional 0-100), visible }
 * The "All Skills" popup (bottom-right button) shows each skill's percent; without one it uses the
 * default for the sphere size: large 90, medium 70, small 40.
 * Add, edit, hide or delete skills in admin.html; nothing is hardcoded here. */
(function () {
  "use strict";

  var SIZE_SCALE = { small: 0.85, medium: 1, large: 1.2 };
  var COVERAGE = 0.36;           // share of the section the spheres cover (lower = smaller spheres)
  var MIN_RADIUS = 0.06, MAX_RADIUS = 0.21;   // sphere radius limits (world units, half-height = 1)
  var MAX_SKILLS = 60;
  var EDGE = 0.94;               // play area as a share of the view (spheres nearer the camera look bigger)

  var section = document.getElementById("skills");
  var stage = document.getElementById("skillsStage");
  var canvas = document.getElementById("skillsCanvas");
  var listEl = document.getElementById("skillsList");
  var fallbackEl = document.getElementById("skillsFallback");
  if (!section || !stage || !canvas || !window.SkillsPhysics || !window.SkillsRender) return;

  var navItem = (document.querySelector('.gnav-links a[href="#skills"]') || {}).parentElement || null;
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var world = SkillsPhysics.createWorld();
  var renderer = null;
  var items = [];                // visible skills, in display order
  var texKeys = {};              // id -> what the current texture was made from
  var aspect = 1.6;              // aspect of the whole canvas (it spans the full screen width)
  var playAspect = 1.6;          // aspect of the area the spheres live in (the stage, which is narrower on wide screens)
  var running = false, visible = false, raf = 0, last = 0;
  var parked = false, entranceDone = false;   // entrance: spheres wait off-screen, then fall in from the sides
  var ptr = { x: 0, y: 0, vx: 0, vy: 0, on: false, t: 0 };

  /* ---------- data ---------- */
  function safeLogo(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(src)) return src;
    if (/^https?:\/\//i.test(src)) return src;
    if (/^[A-Za-z0-9_\-.\/ ]+$/.test(src)) return src;   // a local file next to index.html
    return "";
  }

  var DEFAULT_LEVEL = { large: 90, medium: 70, small: 40 };   // used when the admin leaves the percent empty
  function cleanPercent(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    var n = Number(String(v).replace(/%$/, ""));
    return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  }
  function levelOf(it) { return it.percent === null ? (DEFAULT_LEVEL[it.size] || 70) : it.percent; }

  function normalize(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (s, i) {
      if (!s || s.visible === false) return;                // hidden skills are not shown
      var name = String(s.name || "").trim();
      if (!name || out.length >= MAX_SKILLS) return;
      out.push({
        id: String(s.id || "skill-" + i + "-" + name),
        name: name.slice(0, 40),
        logo: safeLogo(s.logo),
        category: String(s.category || "").trim().slice(0, 40),
        size: SIZE_SCALE[s.size] ? s.size : "medium",
        percent: cleanPercent(s.percent)
      });
    });
    return out;
  }

  function load() {
    return Promise.resolve(apply(window.PF ? PF.skills.all() : []));
  }

  /* ---------- logo textures ---------- */
  function updateTexture(it) {
    var key = it.logo + "|" + it.name;
    if (texKeys[it.id] === key || !renderer) return;
    texKeys[it.id] = key;
    var token = key;
    function put(img) {
      if (!renderer || texKeys[it.id] !== token) return;     // skill changed or removed meanwhile
      renderer.setTexture(it.id, SkillsRender.makeLogoCanvas(img, it.name));
      if (!running) draw();
    }
    if (!it.logo) return put(null);                          // no logo: the name is printed on the sphere
    var img = new Image();
    if (/^https?:/i.test(it.logo)) img.crossOrigin = "anonymous";
    img.onload = function () { put(img); };
    img.onerror = function () { put(null); };                // broken or blocked image: fall back to the name
    img.src = it.logo;
  }

  /* ---------- layout ---------- */
  function sphereRadius(n) {
    var r = Math.sqrt((COVERAGE * 4 * playAspect * EDGE * EDGE) / (Math.max(1, n) * Math.PI));
    return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r));
  }

  function layout() {
    playAspect = aspect * Math.min(1, (stage.clientWidth || 1) / (canvas.clientWidth || 1));
    world.resize(playAspect * EDGE, EDGE, aspect);
    var base = sphereRadius(items.length);
    world.sync(items.map(function (it) { return { id: it.id, radius: base * SIZE_SCALE[it.size] }; }));
  }

  function apply(list) {
    items = normalize(list);
    section.hidden = items.length === 0;
    if (navItem) navItem.hidden = items.length === 0;

    // Accessible text for screen readers, and the no-WebGL fallback
    listEl.textContent = "";
    fallbackEl.textContent = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      li.textContent = it.name + (it.category ? " (" + it.category + ")" : "");
      listEl.append(li);
      var pill = document.createElement("li");
      pill.textContent = it.name;
      fallbackEl.append(pill);
    });
    canvas.setAttribute("aria-label", items.length
      ? "Interactive 3D spheres, one per skill: " + items.map(function (i) { return i.name; }).join(", ")
      : "Skills");

    // Drop textures of skills that no longer exist
    Object.keys(texKeys).forEach(function (id) {
      if (!items.some(function (i) { return i.id === id; })) {
        delete texKeys[id];
        if (renderer) renderer.removeTexture(id);
      }
    });

    if (!renderer) return;
    if (items.length) onResize();
    layout();
    items.forEach(updateTexture);
    if (reduce) world.settle(8);
    else if (!parked && !entranceDone) { world.enter(); parked = true; entranceDone = true; }   // spheres wait off-screen until the section is seen
    if (!running) draw();
    start();
  }

  /* ---------- pointer / touch ---------- */
  function toWorld(e) {
    var r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width * 2 - 1) * aspect, y: -((e.clientY - r.top) / r.height * 2 - 1) };
  }

  function onPointerMove(e) {
    if (reduce) return;
    var p = toWorld(e), now = performance.now();
    if (ptr.on) {
      // Cursor velocity from the previous and current position (smoothed)
      var dt = Math.max(0.008, (now - ptr.t) / 1000);
      var vx = (p.x - ptr.x) / dt, vy = (p.y - ptr.y) / dt;
      var s = Math.sqrt(vx * vx + vy * vy);
      if (s > 12) { vx *= 12 / s; vy *= 12 / s; }
      ptr.vx += (vx - ptr.vx) * 0.45;
      ptr.vy += (vy - ptr.vy) * 0.45;
    } else {
      ptr.vx = ptr.vy = 0;
    }
    ptr.x = p.x; ptr.y = p.y; ptr.t = now; ptr.on = true;
  }
  function onPointerEnd() { ptr.on = false; ptr.vx = ptr.vy = 0; }

  /* ---------- loop ---------- */
  function draw() { if (renderer && items.length) renderer.draw(world); }

  function frame(t) {
    raf = 0;
    if (!running) return;
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (ptr.on && t - ptr.t > 60) {           // cursor stopped: its push fades out
      var k = Math.exp(-dt * 10);
      ptr.vx *= k; ptr.vy *= k;
    }
    world.setPointer(ptr.x, ptr.y, ptr.vx, ptr.vy, ptr.on);
    world.step(dt);
    renderer.draw(world);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce || !renderer || !items.length || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function isMobile() { return matchMedia("(pointer: coarse)").matches || innerWidth < 700; }

  /* ---------- resize ---------- */
  var resizeRAF = 0;
  function onResize() {
    if (!renderer) return;
    var coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
    aspect = renderer.resize(coarse ? 1.5 : 2);
    if (items.length) layout();
    if (!running) draw();
  }

  /* ---------- setup / teardown ---------- */
  var cleanups = [];
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(function () { target.removeEventListener(type, fn, opts); });
  }

  function isLight() { return document.documentElement.getAttribute("data-theme") === "light"; }
  function applyTheme() {
    if (!renderer) return;
    renderer.setLight(isLight());
    if (!running) draw();
  }

  function initRenderer() {
    try {
      renderer = SkillsRender.create(canvas);
      renderer.setLight(isLight());
      section.classList.remove("no-webgl");
    } catch (err) {
      renderer = null;
      section.classList.add("no-webgl");   // show the plain list of skills instead
    }
  }

  initRenderer();

  // Sphere rim glow follows the Light / Dark theme button
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  if (renderer) {
    listen(canvas, "pointermove", onPointerMove, { passive: true });
    listen(canvas, "pointerleave", onPointerEnd);
    listen(canvas, "pointercancel", onPointerEnd);
    listen(canvas, "pointerup", function (e) { if (e.pointerType !== "mouse") onPointerEnd(); });

    listen(canvas, "webglcontextlost", function (e) {
      e.preventDefault();                  // lets the browser restore the context
      stop();
      renderer.setLost(true);
    });
    listen(canvas, "webglcontextrestored", function () {
      texKeys = {};                        // textures were lost with the context
      initRenderer();
      onResize();
      items.forEach(updateTexture);
      start();
    });

    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) {
        onResize();
        if (parked) { world.release(); parked = false; }     // fly in from the left and right
        start();
      } else {
        stop();                                              // no work while off-screen
        // desktop: ready to fly in again every time the section is reached; phones and tablets play it only once
        if (!reduce && items.length && !isMobile()) { world.enter(); parked = true; }
      }
    }, { rootMargin: "80px" });
    io.observe(section);
    cleanups.push(function () { io.disconnect(); });

    var ro = new ResizeObserver(function () {
      cancelAnimationFrame(resizeRAF);
      resizeRAF = requestAnimationFrame(onResize);
    });
    ro.observe(stage);
    cleanups.push(function () { ro.disconnect(); });

    listen(document, "visibilitychange", function () { if (document.hidden) stop(); else start(); });
  }

  // Release GL resources and listeners when the page goes away
  listen(window, "pageshow", function (e) { if (e.persisted) start(); });   // back/forward cache restore
  listen(window, "pagehide", function (e) {
    stop();
    if (e.persisted) return;               // the page may come back from the cache, so keep everything
    cleanups.forEach(function (fn) { fn(); });
    cleanups = [];
    if (renderer) { renderer.dispose(); renderer = null; }
  });

  /* ---------- "All Skills" popup ---------- */
  (function popup() {
    var modal = document.getElementById("skModal");
    var openBtn = document.getElementById("skOpen");
    if (!modal || !openBtn) return;
    var rowsEl = document.getElementById("skRows");
    var closeBtn = document.getElementById("skClose");
    var footCount = document.getElementById("skFootCount");
    var label = document.getElementById("skLabel");
    var root = document.documentElement;
    var isOpen = false, closeTimer = 0, countRAF = 0, lastFocus = null, counters = [];
    var COUNT_MS = 1600;

    if (reduce) modal.classList.add("sk-calm");     // no movement for "reduce motion" visitors

    function build() {
      rowsEl.textContent = "";
      counters = [];
      items.forEach(function (it, i) {
        var v = levelOf(it);
        var li = document.createElement("li");
        li.className = "sk-row";
        li.style.setProperty("--i", Math.min(i, 14));   // later rows share the last delay so a long list never feels slow
        li.style.setProperty("--v", (v / 100).toFixed(3));

        var ico = document.createElement("span");
        ico.className = "sk-ico";
        function letter() { ico.textContent = ""; var b = document.createElement("b"); b.textContent = it.name.charAt(0).toUpperCase(); ico.append(b); }
        if (it.logo) {
          var img = document.createElement("img");
          img.alt = "";
          img.decoding = "async";
          img.addEventListener("error", letter);
          img.src = it.logo;
          ico.append(img);
        } else letter();

        var line = document.createElement("div");
        line.className = "sk-line";
        var name = document.createElement("span");
        name.className = "sk-name";
        name.textContent = it.name;                        // textContent: admin input can't inject HTML
        if (it.category) { var cat = document.createElement("small"); cat.textContent = it.category; name.append(cat); }
        var pct = document.createElement("span");
        pct.className = "sk-pct";
        var num = document.createElement("b");
        num.textContent = reduce ? String(v) : "0";
        pct.append(num, "%");
        line.append(name, pct);

        var track = document.createElement("div");
        track.className = "sk-track";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", it.name);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(v));
        var fill = document.createElement("i");
        fill.className = "sk-fill";
        track.append(fill);

        li.append(ico, line, track);
        rowsEl.append(li);
        counters.push({ el: num, v: v, i: Math.min(i, 14) });
      });
      footCount.textContent = items.length + (items.length === 1 ? " skill" : " skills");
    }

    // numbers climb in step with the bars filling (same delay, same soft landing)
    function countUp() {
      cancelAnimationFrame(countRAF);
      if (reduce) return;
      var t0 = performance.now();
      (function tick(now) {
        var running = false;
        counters.forEach(function (c) {
          var p = (now - t0 - (500 + c.i * 70)) / COUNT_MS;
          if (p < 1) running = true;
          p = Math.max(0, Math.min(1, p));
          c.el.textContent = Math.round(c.v * (1 - Math.pow(1 - p, 5)));
        });
        if (running && isOpen) countRAF = requestAnimationFrame(tick);
        else counters.forEach(function (c) { c.el.textContent = c.v; });
      })(t0);
    }

    function open() {
      if (isOpen || !items.length) return;
      isOpen = true;
      clearTimeout(closeTimer);
      lastFocus = document.activeElement;
      build();
      modal.hidden = false;
      modal.classList.remove("is-closing");
      var bar = window.innerWidth - root.clientWidth;      // the scrollbar disappears while locked: pad so the page does not jump
      if (bar > 0) root.style.paddingRight = bar + "px";
      root.classList.add("sk-lock");
      rowsEl.scrollTop = 0;
      void modal.offsetWidth;                              // start from the hidden look, then animate in
      modal.classList.add("is-open");
      openBtn.setAttribute("aria-expanded", "true");
      countUp();
      closeBtn.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      cancelAnimationFrame(countRAF);
      modal.classList.add("is-closing");
      modal.classList.remove("is-open");
      openBtn.setAttribute("aria-expanded", "false");
      closeTimer = setTimeout(function () {
        modal.hidden = true;
        modal.classList.remove("is-closing");
        root.classList.remove("sk-lock");
        root.style.paddingRight = "";
      }, reduce ? 180 : 650);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    openBtn.addEventListener("click", open);
    if (label) label.addEventListener("click", open);      // the "All Skills" text opens it too
    modal.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", function (e) {
      if (!isOpen) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab") {                                // keep keyboard focus inside the popup
        var stops = [closeBtn, rowsEl];
        var at = stops.indexOf(document.activeElement);
        e.preventDefault();
        stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus({ preventScroll: true });
      }
    });
    // never leave the page locked if it is closed while the popup is open
    document.addEventListener("pagehide", function () { root.classList.remove("sk-lock"); root.style.paddingRight = ""; });
  })();

  window.SkillsScene = { reload: load, world: world };   // handy for debugging in the console
  load();
})();
