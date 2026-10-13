/* Cinematic extras: scroll progress bar, scroll parallax on the About decorations,
 * and 3D tilt + cursor spotlight on cards. Skipped for "reduce motion". */
(function () {
  "use strict";
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var bar = document.getElementById("cineProgress");
  var decos = Array.prototype.slice.call(document.querySelectorAll(".about .deco"));
  var speeds = [0.12, -0.09, 0.1, -0.12];     // px of travel per px scrolled, per decoration

  var ticking = false;
  function frame() {
    ticking = false;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : 0);
    if (reduce) return;
    decos.forEach(function (el, i) {
      var r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      var off = (r.top + r.height / 2 - innerHeight / 2) * speeds[i % speeds.length];
      el.style.translate = "0 " + off.toFixed(1) + "px";
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  frame();

  /* ---------- tilt + spotlight ---------- */
  if (reduce || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var MAX = 7; // degrees
  function setup(el) {
    if (el.__tilt) return;
    el.__tilt = true;
    // after the reveal finishes, switch to the fast transition used for tilting
    el.addEventListener("transitionend", function onEnd(e) {
      if (e.target !== el || e.propertyName !== "transform" || !el.classList.contains("in")) return;
      el.style.transitionDelay = "0s";
      el.classList.add("settled");
      el.removeEventListener("transitionend", onEnd);
    });
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      el.style.setProperty("--ry", ((px - 0.5) * 2 * MAX).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((0.5 - py) * 2 * MAX).toFixed(2) + "deg");
    });
    el.addEventListener("pointerleave", function () {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  }
  document.querySelectorAll(".tilt").forEach(setup);
})();

/* ===== Cinematic layer 2 =====
 * Film opening (letterbox bars, lens flare, camera push-in on the hero), scroll depth (the hero and
 * the section titles drift at their own speed), a soft light that follows the cursor, magnetic
 * buttons, floating dust, a vignette and a gliding nav underline.
 * Everything except the nav underline is skipped for "reduce motion". Nothing here touches scrolling. */
(function () {
  "use strict";
  var root = document.documentElement, body = document.body;
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  function make(tag, cls) {
    var e = document.createElement(tag);
    e.className = cls;
    e.setAttribute("aria-hidden", "true");
    return e;
  }
  function isLight() { return root.getAttribute("data-theme") === "light"; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------- gliding underline under the active nav link ---------- */
  (function navIndicator() {
    var ul = document.getElementById("navLinks");
    if (!ul) return;
    var ind = document.createElement("li");
    ind.className = "nav-ind";
    ind.setAttribute("aria-hidden", "true");
    ul.appendChild(ind);
    var raf = 0, first = true;

    function place() {
      raf = 0;
      var a = ul.querySelector("a.active");
      if (!a || !a.offsetWidth) { ind.style.opacity = "0"; return; }
      var r = a.getBoundingClientRect(), u = ul.getBoundingClientRect();
      if (first) ind.style.transition = "none";
      var pad = parseFloat(getComputedStyle(a).paddingLeft) || 14;
      ind.style.setProperty("--x", (r.left - u.left + pad).toFixed(1) + "px");
      ind.style.setProperty("--w", Math.max(8, r.width - pad * 2).toFixed(1) + "px");
      ind.style.opacity = "1";
      if (first) {
        first = false;
        void ind.offsetWidth;
        ind.style.transition = "";           // from now on it glides
      }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(place); }

    new MutationObserver(queue).observe(ul, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    addEventListener("resize", queue);
    document.addEventListener("profile:applied", queue);
    if (window.ResizeObserver) new ResizeObserver(queue).observe(ul);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
    queue();
  })();

  /* ---------- vignette (static) ---------- */
  body.appendChild(make("div", "cine-vignette"));

  if (reduce) return;

  /* ---------- film opening: starts when the loading screen leaves ---------- */
  (function intro() {
    var top = make("div", "cine-bar top"), bot = make("div", "cine-bar bot"), flare = make("div", "cine-flare");
    root.classList.add("cine-prep");           // hero content waits (CSS also has a timed fail-safe)
    body.append(top, bot, flare);

    var started = false;
    function go() {
      if (started) return;
      started = true;
      root.classList.add("cine-ready");
      setTimeout(function () { root.classList.remove("cine-prep"); }, 4500);
    }
    top.addEventListener("animationend", function () { top.remove(); bot.remove(); });
    flare.addEventListener("animationend", function () { flare.remove(); });

    var t0 = Date.now();
    (function poll() {
      var ld = document.getElementById("ld");
      if (!ld) return go();                                              // no loader on this visit
      if (ld.classList.contains("is-leaving")) return setTimeout(go, 650); // start as it fades away
      if (Date.now() - t0 > 9500) return go();
      setTimeout(poll, 60);
    })();
  })();

  /* ---------- scroll depth: hero + section titles ---------- */
  (function depth() {
    var heroEls = [".hero-head-wrap", ".portrait", ".hero-bottom"].map(function (s) { return document.querySelector(s); }).filter(Boolean);
    var titles = [["about", ".section-title"], ["feedback", ".fx-title"], ["social", ".section-title"],
                  ["contact", ".section-title"], ["github", ".gh-title"]].map(function (p) {
      var s = document.getElementById(p[0]), t = s && s.querySelector(p[1]);
      return t ? { s: s, t: t } : null;
    }).filter(Boolean);
    var ticking = false, heroDone = false;

    function frame() {
      ticking = false;
      var vh = innerHeight, hp = clamp(scrollY / vh, 0, 1);
      if (hp < 1 || !heroDone) {
        heroEls.forEach(function (e) { e.style.setProperty("--hp", hp.toFixed(3)); });
        heroDone = hp >= 1;
      }
      titles.forEach(function (o) {
        if (o.s.hidden) return;
        var r = o.s.getBoundingClientRect();
        if (r.bottom < -vh || r.top > 2 * vh) return;
        o.t.style.setProperty("--sp", clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1).toFixed(3));
      });
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    frame();
  })();

  /* ---------- floating dust ---------- */
  (function dust() {
    var cvs = make("canvas", "cine-dust"), g = cvs.getContext && cvs.getContext("2d");
    if (!g) return;
    body.appendChild(cvs);
    var N = fine ? 56 : 22, P = [], W = 0, H = 0, dpr = 1, sprite = null, i;
    for (i = 0; i < N; i++) {
      P.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, d: 0.2 + Math.random() * 0.8,
               v: 6 + Math.random() * 14, a: 0.25 + Math.random() * 0.55, f: 0.15 + Math.random() * 0.35,
               ph: Math.random() * 6.283, tw: 0.6 + Math.random() * 1.4 });
    }
    function makeSprite() {
      var s = document.createElement("canvas"), c = s.getContext("2d");
      s.width = s.height = 48;
      var col = isLight() ? "14,165,233" : "196,205,255";
      var gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, "rgba(" + col + ",1)");
      gr.addColorStop(0.35, "rgba(" + col + ",0.35)");
      gr.addColorStop(1, "rgba(" + col + ",0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, 48, 48);
      sprite = s;
    }
    function size() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
    }
    makeSprite(); size();
    addEventListener("resize", size);
    new MutationObserver(makeSprite).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    var last = performance.now(), t = 0, span;
    (function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now; t += dt;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      span = H + 40;
      var sy = scrollY;
      for (var k = 0; k < N; k++) {
        var p = P[k];
        var yy = (((p.y * H - p.v * t - sy * p.d * 0.12) % span) + span) % span - 20;
        var xx = p.x * W + Math.sin(t * p.f + p.ph) * 28 * p.d;
        var tw = 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
        var s = p.r * 7 * (0.6 + p.d * 0.6);
        g.globalAlpha = p.a * tw * 0.55;
        g.drawImage(sprite, xx - s / 2, yy - s / 2, s, s);
      }
      g.globalAlpha = 1;
    })(last);
  })();

  /* ---------- cursor light + magnetic buttons (mouse only) ---------- */
  (function pointerFx() {
    if (!fine) return;
    var light = make("div", "cine-light");
    body.appendChild(light);
    var lx = innerWidth / 2, ly = innerHeight / 2, tx = lx, ty = ly, shown = false, raf = 0;
    // Not the header buttons (Contact / Download CV): they sit right next to the theme toggle
    var mags = Array.prototype.slice.call(document.querySelectorAll(".contact-btn, .fx-send")).map(function (e) {
      return { e: e, x: 0, y: 0, tx: 0, ty: 0 };
    });

    function loop() {
      raf = 0;
      var busy = false;
      lx += (tx - lx) * 0.14; ly += (ty - ly) * 0.14;
      light.style.transform = "translate3d(" + (lx - 300).toFixed(1) + "px," + (ly - 300).toFixed(1) + "px,0)";
      if (Math.abs(tx - lx) > 0.3 || Math.abs(ty - ly) > 0.3) busy = true;
      mags.forEach(function (m) {
        m.x += (m.tx - m.x) * 0.18; m.y += (m.ty - m.y) * 0.18;
        if (Math.abs(m.tx - m.x) > 0.05 || Math.abs(m.ty - m.y) > 0.05) busy = true;
        else { m.x = m.tx; m.y = m.ty; }
        m.e.style.translate = m.x || m.y ? m.x.toFixed(2) + "px " + m.y.toFixed(2) + "px" : "";
      });
      if (busy) raf = requestAnimationFrame(loop);
    }
    function wake() { if (!raf) raf = requestAnimationFrame(loop); }

    addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      if (!shown) { shown = true; lx = tx; ly = ty; light.classList.add("on"); }
      mags.forEach(function (m) {
        var r = m.e.getBoundingClientRect();
        if (!r.width) { m.tx = m.ty = 0; return; }
        var cx = r.left + r.width / 2 - m.x, cy = r.top + r.height / 2 - m.y;   // centre without the current pull
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var near = Math.abs(dx) < r.width / 2 + 50 && Math.abs(dy) < r.height / 2 + 40;
        m.tx = near ? clamp(dx * 0.25, -14, 14) : 0;
        m.ty = near ? clamp(dy * 0.35, -10, 10) : 0;
      });
      wake();
    }, { passive: true });
    root.addEventListener("pointerleave", function () {
      light.classList.remove("on"); shown = false;
      mags.forEach(function (m) { m.tx = m.ty = 0; });
      wake();
    });
  })();
})();