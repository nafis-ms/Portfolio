/* Admin cinematic layer: the same effects as the site (js/cinema.js), adapted for the admin panel.
 * Film opening (letterbox bars + lens flare while the loading screen leaves), scroll progress bar and
 * scroll depth, vignette, floating dust (Dark Mode), soft aurora (Light Mode), custom cursor and
 * magnetic buttons. Everything except the vignette is skipped for "reduce motion".
 * Nothing here touches scrolling, the forms or the data. */
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

  /* ---------- vignette (static) ---------- */
  body.appendChild(make("div", "cine-vignette"));

  if (reduce) {                                   // no film opening: show everything straight away
    root.classList.add("cine-ready");
    document.dispatchEvent(new CustomEvent("cine:ready"));
    return;
  }

  /* ---------- film opening: starts when the loading screen leaves ---------- */
  (function intro() {
    var top = make("div", "cine-bar top"), bot = make("div", "cine-bar bot"), flare = make("div", "cine-flare");
    body.append(top, bot, flare);
    var started = false;
    function go() {
      if (started) return;
      started = true;
      root.classList.add("cine-ready");
      document.dispatchEvent(new CustomEvent("cine:ready"));
    }
    top.addEventListener("animationend", function () { top.remove(); bot.remove(); });
    flare.addEventListener("animationend", function () { flare.remove(); });

    var t0 = Date.now();
    (function poll() {
      var ld = document.getElementById("ld");
      if (!ld) return go();                                                // no loading screen on this visit
      if (ld.classList.contains("is-leaving")) return setTimeout(go, 650);  // start as it fades away
      if (Date.now() - t0 > 9500) return go();
      setTimeout(poll, 60);
    })();
  })();

  /* ---------- scroll progress bar + scroll depth ---------- */
  (function scrollFx() {
    var bar = make("div", "cine-progress");
    body.appendChild(bar);
    var ticking = false;
    function frame() {
      ticking = false;
      var max = root.scrollHeight - innerHeight;
      bar.style.setProperty("--p", max > 0 ? clamp(scrollY / max, 0, 1).toFixed(4) : 0);
      root.style.setProperty("--sp", clamp(scrollY / 420, 0, 1).toFixed(3));
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
      if (now - last < 30) return;                       // ~30 fps is plenty for slow dust
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

  /* ---------- Light Mode only: soft aurora (pastel clouds drifting behind the page) ---------- */
  (function lightAurora() {
    var cvs = make("canvas", "cine-aurora"), g = cvs.getContext && cvs.getContext("2d");
    if (!g) return;
    body.insertBefore(cvs, body.firstChild);

    var TAU = 6.2832;
    var W = 0, H = 0, K = 1, fade = 0, enter = 0, last = performance.now(), t = 0;
    var sp = 0, spTarget = 0, mx = 0, my = 0, tx = 0, ty = 0, i;

    /* sky, lavender, mint: x/y = home position, r = size, ax/ay = wander, px/py = seconds per lap,
     * a = strength, d = depth (parallax), sx/rot = stretch + tilt, cy = how strongly scroll changes its mood */
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
      K = fine ? 0.5 : 0.4;                       // drawn small and stretched up: blurry on purpose, and cheap
      cvs.width = Math.max(2, Math.round(W * K));
      cvs.height = Math.max(2, Math.round(H * K));
    }
    size();
    addEventListener("resize", size);
    if (fine) {
      addEventListener("pointermove", function (e) { tx = e.clientX / W - 0.5; ty = e.clientY / H - 0.5; }, { passive: true });
    }
    function ease(v) { return 1 - Math.pow(1 - v, 4); }

    function paint() {
      var big = Math.max(W, H), k, b;
      g.setTransform(K, 0, 0, K, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      var bg = g.createLinearGradient(0, 0, 0, H);
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
        var mood = 0.8 + 0.2 * Math.cos(TAU * (sp * b.cy + b.ph / TAU));
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
      if (lightOn) { enter = Math.min(1, enter + dt / 2.6); fade = Math.min(1, fade + dt / 0.9); }
      else { fade = Math.max(0, fade - dt / 0.5); enter = 0; }
      t += dt;
      var max = root.scrollHeight - innerHeight;
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
      '.item,.cal-days span:not(.out),[data-cursor="hover"],input[type="checkbox"],input[type="radio"],input[type="range"],input[type="file"]';
    var TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]),textarea,[contenteditable="true"]';
    var cur = make("div", "cine-cursor");
    cur.innerHTML = '<span class="cc-stretch"><span class="cc-body"></span></span>';
    body.appendChild(cur);
    var stretch = cur.firstChild;
    var ease = 0.2;                                   // the dot trails the real pointer, which stays visible
    var lx = innerWidth / 2, ly = innerHeight / 2, tx = lx, ty = ly, shown = false, raf = 0;
    // the big primary buttons lean toward the pointer (not the small list / header buttons)
    var mags = Array.prototype.slice.call(document.querySelectorAll(".btn:not(.sm):not(.ghost)")).map(function (e) {
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
        var s = Math.min(sp * 0.012, 0.32);           // the dot stretches slightly along its direction of travel
        stretch.style.setProperty("--rot", Math.atan2(dy, dx).toFixed(3) + "rad");
        stretch.style.setProperty("--sx", (1 + s).toFixed(3));
        stretch.style.setProperty("--sy", (1 - s * 0.45).toFixed(3));
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
