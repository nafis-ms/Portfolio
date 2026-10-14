/* Cinematic extras: scroll progress bar, scroll parallax on the About decorations,
 * and 3D tilt + cursor spotlight on cards, and the custom cursor. Skipped for "reduce motion". */
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
    body.append(top, bot);
    var heroEl = document.querySelector(".hero");
    if (heroEl) heroEl.prepend(flare); else body.appendChild(flare);   // inside the hero: it passes BEHIND the text

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
    var DARK_COLS = ["196,205,255"], LIGHT_COLS = ["14,165,233", "139,92,246", "16,185,129"];   // sky, lavender, mint
    function makeSprite() {
      var cols = isLight() ? LIGHT_COLS : DARK_COLS;
      sprite = cols.map(function (col) {
        var s = document.createElement("canvas"), c = s.getContext("2d");
        s.width = s.height = 48;
        var gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
        gr.addColorStop(0, "rgba(" + col + ",1)");
        gr.addColorStop(0.35, "rgba(" + col + ",0.35)");
        gr.addColorStop(1, "rgba(" + col + ",0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, 48, 48);
        return s;
      });
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
      if (now - last < 30) return;                       // ~30 fps is plenty for slow dust and halves the work
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
        g.drawImage(sprite[k % sprite.length], xx - s / 2, yy - s / 2, s, s);
      }
      g.globalAlpha = 1;
    })(last);
  })();

  /* ---------- Light Mode only: soft aurora (the Light Mode partner of the dark "dust") ----------
   * Large, blurred pastel clouds (sky blue, lavender, mint) that drift on slow, never-repeating paths,
   * breathe, drift with the scroll and lean a little toward the pointer. Drawn BEHIND the page.
   * Cinematic touches: the clouds bloom in from the centre when Light Mode is switched on, a faint
   * light sheen glides across them now and then, and the scroll is eased so the colour "mood"
   * shifts gently from section to section instead of snapping. */
  (function lightAurora() {
    var cvs = make("canvas", "cine-aurora"), g = cvs.getContext && cvs.getContext("2d");
    if (!g) return;
    body.insertBefore(cvs, body.firstChild);

    var TAU = 6.2832;
    var W = 0, H = 0, K = 1, base = 1, fade = 0, enter = 0, last = performance.now(), t = 0;
    var sp = 0, spTarget = 0, mx = 0, my = 0, tx = 0, ty = 0, drawn = false, i;

    /* sky, lavender, mint: x/y = home position (0-1 of the screen), r = size (of the longer side),
     * ax/ay = how far it wanders, px/py = seconds per lap, a = strength, d = depth (parallax),
     * sx/rot = stretch + tilt (the long "curtain" ribbons), cy = how strongly scroll changes its mood */
    var BL = [
      { c: 0, x: 0.12, y: 0.18, r: 0.48, ax: 0.14, ay: 0.12, px: 53, py: 71, a: 0.80, d: 1.0, sx: 1.00, rot: 0.0, cy: 1 },
      { c: 1, x: 0.86, y: 0.14, r: 0.52, ax: 0.12, ay: 0.14, px: 67, py: 49, a: 0.78, d: 0.7, sx: 1.00, rot: 0.0, cy: 2 },
      { c: 2, x: 0.74, y: 0.86, r: 0.50, ax: 0.15, ay: 0.10, px: 61, py: 83, a: 0.74, d: 1.2, sx: 1.00, rot: 0.0, cy: 1 },
      { c: 0, x: 0.30, y: 0.88, r: 0.40, ax: 0.12, ay: 0.12, px: 79, py: 57, a: 0.66, d: 0.6, sx: 1.00, rot: 0.0, cy: 2 },
      { c: 1, x: 0.46, y: 0.46, r: 0.34, ax: 0.20, ay: 0.16, px: 91, py: 73, a: 0.46, d: 0.4, sx: 1.00, rot: 0.0, cy: 1 },
      { c: 2, x: 0.05, y: 0.62, r: 0.34, ax: 0.10, ay: 0.14, px: 59, py: 87, a: 0.60, d: 0.9, sx: 1.00, rot: 0.0, cy: 2 },
      { c: 0, x: 0.55, y: 0.26, r: 0.34, ax: 0.22, ay: 0.08, px: 97, py: 63, a: 0.50, d: 0.5, sx: 2.60, rot: -0.42, cy: 1 },
      { c: 1, x: 0.40, y: 0.74, r: 0.32, ax: 0.20, ay: 0.08, px: 89, py: 69, a: 0.46, d: 0.8, sx: 2.40, rot: 0.38, cy: 2 }
    ];
    for (i = 0; i < BL.length; i++) { BL[i].ph = Math.random() * TAU; BL[i].ph2 = Math.random() * TAU; }

    /* one soft sprite per colour: a bell-shaped falloff, so the edges melt away with no visible rim or banding */
    var RGB = ["158,218,252", "202,188,253", "142,236,198"];
    var sprites = RGB.map(function (col) {
      var c = document.createElement("canvas"), x = c.getContext("2d");
      c.width = c.height = 256;
      var gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      for (var s = 0; s <= 12; s++) {
        var u = s / 12;
        gr.addColorStop(u, "rgba(" + col + "," + (Math.exp(-3.4 * u * u) * (1 - u * u * u * u)).toFixed(4) + ")");
      }
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 256);
      return c;
    });

    function size() {
      W = innerWidth; H = innerHeight;
      K = fine ? 0.5 : 0.4;                       // drawn small and stretched up: it is blurry on purpose, and cheap
      cvs.width = Math.max(2, Math.round(W * K));
      cvs.height = Math.max(2, Math.round(H * K));
      drawn = false;
    }
    size();
    addEventListener("resize", size);
    if (fine && !reduce) {
      addEventListener("pointermove", function (e) { tx = e.clientX / W - 0.5; ty = e.clientY / H - 0.5; }, { passive: true });
    }
    function ease(v) { return 1 - Math.pow(1 - v, 4); }

    function paint() {
      var big = Math.max(W, H), k, b, j;
      g.setTransform(K, 0, 0, K, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      var bg = g.createLinearGradient(0, 0, 0, H);             // the page colour (a touch of cool light at the top)
      bg.addColorStop(0, "#f6f8fd"); bg.addColorStop(1, "#f3f5fb");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      if (fade <= 0.002) return;

      var e = ease(enter), scr = sp - 0.5;
      for (k = 0; k < BL.length; k++) {
        b = BL[k];
        var wx = b.x + b.ax * Math.sin(t * TAU / b.px + b.ph) + 0.05 * Math.cos(t * TAU / (b.px * 0.61) + b.ph2);
        var wy = b.y + b.ay * Math.sin(t * TAU / b.py + b.ph2) + 0.04 * Math.cos(t * TAU / (b.py * 0.57) + b.ph);
        wx = 0.5 + (wx - 0.5) * (0.5 + 0.5 * e);               // bloom outward from the centre while entering
        wy = 0.5 + (wy - 0.5) * (0.5 + 0.5 * e);
        var X = wx * W + mx * b.d * 70;
        var Y = wy * H - scr * b.d * H * 0.38 + my * b.d * 50;
        var breathe = 1 + 0.07 * Math.sin(t * TAU / (19 + k * 3.1) + b.ph);
        var R = b.r * big * breathe * (0.72 + 0.28 * e);
        var mood = 0.8 + 0.2 * Math.cos(TAU * (sp * b.cy + b.ph / TAU));   // each cloud swells/softens as you scroll
        g.globalAlpha = Math.min(1, b.a * 0.72 * mood * e * fade);
        g.save();
        g.translate(X, Y);
        g.rotate(b.rot + 0.12 * Math.sin(t * TAU / (43 + k * 5) + b.ph2));
        g.scale(b.sx, 1);
        g.drawImage(sprites[b.c], -R, -R, R * 2, R * 2);
        g.restore();
      }

      /* the light sheen: a pale diagonal band that glides across the clouds every ~26s */
      var cyc = (t % 26) / 26;
      if (cyc < 0.62) {
        var q = cyc / 0.62, along = -0.3 + q * 1.6, bw = 0.22 * big;
        g.globalAlpha = Math.sin(q * Math.PI) * 0.5 * e * fade;
        g.save();
        g.translate(along * W, H / 2);
        g.rotate(-0.38);
        var sh = g.createLinearGradient(-bw, 0, bw, 0);
        sh.addColorStop(0, "rgba(255,255,255,0)");
        sh.addColorStop(0.5, "rgba(255,255,255,0.75)");
        sh.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = sh;
        g.fillRect(-bw, -big, bw * 2, big * 2);
        g.restore();
      }
      g.globalAlpha = 1;
    }

    (function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (document.hidden) return;
      var lightOn = isLight();
      if (!lightOn && fade <= 0.002) { enter = 0; fade = 0; return; }   // Dark Mode: nothing to draw
      if (reduce) {                                                   // reduced motion: one still, soft frame
        fade = lightOn ? 1 : 0; enter = 1;
        if (!drawn || !lightOn) { t = 12; sp = 0.4; paint(); drawn = true; }
        return;
      }
      if (lightOn) { enter = Math.min(1, enter + dt / 2.6); fade = Math.min(1, fade + dt / 0.9); }
      else { fade = Math.max(0, fade - dt / 0.5); enter = 0; }
      t += dt;
      var max = document.documentElement.scrollHeight - innerHeight;
      spTarget = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
      sp += (spTarget - sp) * Math.min(1, dt * 2.2);                  // eased scroll = cinematic inertia
      mx += (tx - mx) * Math.min(1, dt * 1.6);
      my += (ty - my) * Math.min(1, dt * 1.6);
      paint();
    })(last);
  })();

  /* ---------- custom cursor (solid dot -> translucent ring on hover) + magnetic buttons (mouse only) ---------- */
  (function pointerFx() {
    if (!fine) return;
    var HOVER = 'a[href],button,[role="button"],[role="tab"],[role="link"],label,summary,select,[onclick],' +
      '.orbit-card,.fx-seg,.fx-arrow,[data-cursor="hover"],input[type="checkbox"],input[type="radio"],input[type="range"]';
    var TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]';
    var cur = make("div", "cine-cursor");
    cur.setAttribute("aria-hidden", "true");
    cur.innerHTML = '<span class="cc-stretch"><span class="cc-body"></span></span>';
    body.appendChild(cur);
    var stretch = cur.firstChild;
    var ease = reduce ? 1 : 0.2;     // the dot trails the real pointer, which stays visible
    var lx = innerWidth / 2, ly = innerHeight / 2, tx = lx, ty = ly, shown = false, raf = 0;
    // Not the header buttons (Contact / Download CV): they sit right next to the theme toggle
    var mags = Array.prototype.slice.call(document.querySelectorAll(".contact-btn, .fx-send")).map(function (e) {
      return { e: e, x: 0, y: 0, tx: 0, ty: 0 };
    });

    function loop() {
      raf = 0;
      var busy = false;
      var dx = tx - lx, dy = ty - ly;
      lx += dx * ease; ly += dy * ease;
      cur.style.transform = "translate3d(" + lx.toFixed(1) + "px," + ly.toFixed(1) + "px,0)";
      var sp = Math.sqrt(dx * dx + dy * dy);
      if (sp > 0.3) {
        busy = true;
        if (!reduce) {                    // the dot stretches slightly along its direction of travel
          var s = Math.min(sp * 0.012, 0.32);
          stretch.style.setProperty("--rot", Math.atan2(dy, dx).toFixed(3) + "rad");
          stretch.style.setProperty("--sx", (1 + s).toFixed(3));
          stretch.style.setProperty("--sy", (1 - s * 0.45).toFixed(3));
        }
      } else {
        stretch.style.setProperty("--sx", 1); stretch.style.setProperty("--sy", 1);
      }
      mags.forEach(function (m) {
        m.x += (m.tx - m.x) * 0.18; m.y += (m.ty - m.y) * 0.18;
        if (Math.abs(m.tx - m.x) > 0.05 || Math.abs(m.ty - m.y) > 0.05) busy = true;
        else { m.x = m.tx; m.y = m.ty; }
        m.e.style.translate = m.x || m.y ? m.x.toFixed(2) + "px " + m.y.toFixed(2) + "px" : "";
      });
      if (busy) raf = requestAnimationFrame(loop);
    }
    function wake() { if (!raf) raf = requestAnimationFrame(loop); }
    function hide() { cur.classList.remove("on", "down", "hover"); shown = false; }

    function state(t) {
      var el = t && t.closest ? t : null;
      var text = !!(el && el.closest(TEXT));
      var hov = !text && !!(el && el.closest(HOVER)) && !(el.closest(":disabled,[aria-disabled='true']"));
      cur.classList.toggle("text", text);
      cur.classList.toggle("hover", hov);
    }

    addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      if (!shown) {
        shown = true; lx = tx; ly = ty;
        root.classList.add("cine-cursor-on");
        cur.style.transform = "translate3d(" + lx + "px," + ly + "px,0)";
        cur.classList.add("on");
      }
      state(e.target);
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
    addEventListener("pointerdown", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      cur.classList.add("down");
      if (reduce) return;
      var p = document.createElement("span");          // click pulse
      p.className = "cc-pulse";
      p.addEventListener("animationend", function () { p.remove(); });
      cur.appendChild(p);
    }, { passive: true });
    addEventListener("pointerup", function () { cur.classList.remove("down"); }, { passive: true });
    addEventListener("scroll", function () { state(document.elementFromPoint(tx, ty)); }, { passive: true });
    document.addEventListener("mouseleave", function () { hide(); mags.forEach(function (m) { m.tx = m.ty = 0; }); wake(); });
    root.addEventListener("pointerleave", function () {
      hide();
      mags.forEach(function (m) { m.tx = m.ty = 0; });
      wake();
    });
    addEventListener("blur", hide);
  })();
})();

/* ===== Cinematic layer 3 =====
 * Switches on the extra content effects in cinema.css (scoped to html.cine-fx) and marks each section
 * ".cine-seen" when it is on screen, so its entrance plays when you get there.
 * On desktop the mark is removed again once the section is fully off screen, so the entrance plays
 * EVERY time you arrive. On phones / tablets (same test as the "normal scrolling" rule above) it plays once.
 * Skipped for "reduce motion". Does not touch scrolling or any existing effect. */
(function () {
  "use strict";
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  if (!forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;          // without it nothing is hidden, so nothing can get stuck

  var replay = !matchMedia("(max-width: 820px), (hover: none) and (pointer: coarse)").matches;
  var secs = Array.prototype.slice.call(document.querySelectorAll(".snap-section"));
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("cine-seen");
      if (!replay) io.unobserve(e.target);
    });
  }, { threshold: 0.2 });

  document.documentElement.classList.add("cine-fx");
  secs.forEach(function (s) { io.observe(s); });

  if (replay) {
    /* fully off screen (the 2px inset means a section that only touches the edge counts as gone) */
    var off = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (!e.isIntersecting) e.target.classList.remove("cine-seen"); });
    }, { rootMargin: "-2px 0px -2px 0px" });
    secs.forEach(function (s) { off.observe(s); });
  } else {
    /* fail-safe: whatever has not been marked after 20 s is shown anyway */
    setTimeout(function () { secs.forEach(function (s) { s.classList.add("cine-seen"); }); }, 20000);
  }
})();


/* ===== Cinematic layer 4: replay the reveals every time a section comes back (desktop only) =====
 * script.js reveals each ".fade" element once. Here, when a section has been completely off screen,
 * its elements are put back to their hidden state, and shown again (with the same delays and the
 * same transitions) as they come into view. The hero's opening animations are restarted too.
 * Phones / tablets, "reduce motion" and browsers without IntersectionObserver: reveals stay one-time. */
(function () {
  "use strict";
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  if (!forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (matchMedia("(max-width: 820px), (hover: none) and (pointer: coarse)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  var secs = Array.prototype.slice.call(document.querySelectorAll(".snap-section"));
  var sectionOf = new Map(), fadesOf = new Map();
  secs.forEach(function (s) {
    var list = Array.prototype.slice.call(s.querySelectorAll(".fade"));
    fadesOf.set(s, list);
    list.forEach(function (f) { sectionOf.set(f, s); });
  });

  /* tilt cards switch to a fast transition after their reveal (see the first block); do the same after a replay */
  function settleWhenDone(el) {
    if (!el.classList.contains("tilt")) return;
    function onEnd(e) {
      if (e.target !== el || e.propertyName !== "transform" || !el.classList.contains("in")) return;
      el.style.transitionDelay = "0s";
      el.classList.add("settled");
      el.removeEventListener("transitionend", onEnd);
    }
    el.addEventListener("transitionend", onEnd);
  }

  function hide(el) {
    el.classList.remove("in", "settled");
    el.style.transitionDelay = (el.dataset.d || 0) + "s";      // the original stagger (the tilt block had zeroed it)
  }

  /* reveal: any fade element that comes within 50px of the screen (same margin script.js uses) */
  var reveal = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var el = e.target;
      if (!e.isIntersecting || el.classList.contains("in")) return;
      var s = sectionOf.get(el);
      if (!s || s.__cineGone !== false) return;                // only after a section has been reset and come back; the first reveal is script.js's
      el.classList.add("in");
      settleWhenDone(el);
    });
  }, { rootMargin: "50px" });

  var heroEls = [".hero-head-wrap", ".portrait", ".hero-bottom"]
    .map(function (q) { return document.querySelector(q); }).filter(Boolean);
  function restart(el) {                                        // plays the stylesheet's animation again
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  /* gone: the section is completely off screen */
  var gone = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var s = e.target, list = fadesOf.get(s) || [];
      if (!e.isIntersecting) {
        if (s.__cineGone) return;
        s.__cineGone = true;
        list.forEach(hide);
      } else if (s.__cineGone) {
        s.__cineGone = false;
        list.forEach(function (el) { reveal.unobserve(el); reveal.observe(el); });   // re-check right now
        if (s.classList.contains("hero") && document.documentElement.classList.contains("cine-ready")) {
          heroEls.forEach(restart);
        }
      }
    });
  }, { rootMargin: "-2px 0px -2px 0px" });

  secs.forEach(function (s) {
    s.__cineGone = null;                                       // null = never left yet
    gone.observe(s);
    (fadesOf.get(s) || []).forEach(function (el) { reveal.observe(el); });
  });
})();
