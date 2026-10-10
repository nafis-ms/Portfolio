
(function () {
  "use strict";

  var SKILLS_URL = "skills.json";
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
  var aspect = 1.6;
  var running = false, visible = false, raf = 0, last = 0;
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
        size: SIZE_SCALE[s.size] ? s.size : "medium"
      });
    });
    return out;
  }

  function load() {
    // 1) skills saved by the admin panel in this browser (store.js)
    if (window.PF && PF.skills.has()) return Promise.resolve(apply(PF.skills.all()));
    // 2) otherwise a published skills.json next to index.html
    return fetch(SKILLS_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(apply, function () {
        console.warn("[portfolio] skills.json not found. Skills are saved only in the browser that used the admin panel; open admin > Publish > Apply Changes.");
        apply([]);                                          // missing/invalid file = no skills
      });
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
    var r = Math.sqrt((COVERAGE * 4 * aspect * EDGE * EDGE) / (Math.max(1, n) * Math.PI));
    return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r));
  }

  function layout() {
    world.resize(aspect * EDGE, EDGE);
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
      if (visible) { onResize(); start(); } else stop();   // no work while off-screen
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

  // Update live when the admin panel saves in another tab
  listen(window, "storage", function (e) {
    if (window.PF && e.key === PF.SKILLS_KEY) load();
  });

  // Release GL resources and listeners when the page goes away
  listen(window, "pageshow", function (e) { if (e.persisted) start(); });   // back/forward cache restore
  listen(window, "pagehide", function (e) {
    stop();
    if (e.persisted) return;               // the page may come back from the cache, so keep everything
    cleanups.forEach(function (fn) { fn(); });
    cleanups = [];
    if (renderer) { renderer.dispose(); renderer = null; }
  });

  window.SkillsScene = { reload: load, world: world };   // handy for debugging in the console
  load();
})();
