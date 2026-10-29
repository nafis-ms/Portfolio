const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const forceMotion = (() => {
  try {
    return localStorage.getItem("portfolio-motion") === "on"; // set by visiting ?motion=on
  } catch {
    return false;
  }
})();
const reduce =
  !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Phones / tablets / narrow screens: use light images instead of the .webm videos
const LITE = matchMedia("(hover: none), (pointer: coarse)").matches;

/* ---------- Navbar ---------- */
(function () {
  const nav = $("gnav");
  if (!nav) return;
  const burger = $("navBurger");

  function setMenu(open) {
    nav.classList.toggle("menu-open", open);
    if (burger) burger.setAttribute("aria-expanded", String(open));
  }
  if (burger)
    burger.addEventListener("click", () =>
      setMenu(!nav.classList.contains("menu-open")),
    );
  nav
    .querySelectorAll(".gnav-links a")
    .forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  // Stronger glass after scrolling + active link highlight
  const links = [...nav.querySelectorAll(".gnav-links a")];
  const targets = links
    .map((a) => {
      const h = a.getAttribute("href");
      return { el: h && h.length > 1 ? document.querySelector(h) : null, a };
    })
    .filter((t) => t.el);

  let navTick = false;
  function onNavScroll() {
    navTick = false;
    nav.classList.toggle("scrolled", scrollY > 20);
    let active = null;
    targets.forEach((t) => {
      if (t.el.hidden) return; // a hidden section (no skills, no GitHub user) has top = 0 and would win
      if (t.el.getBoundingClientRect().top <= innerHeight * 0.4) active = t.a;
    });
    links.forEach((a) => a.classList.toggle("active", a === active));
  }
  // run at most once per frame (scroll events can fire several times per frame)
  addEventListener(
    "scroll",
    () => {
      if (!navTick) {
        navTick = true;
        requestAnimationFrame(onNavScroll);
      }
    },
    { passive: true },
  );
  onNavScroll();
})();

/* ---------- FadeIn (once, margin 50px) ---------- */
const fadeIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        fadeIO.unobserve(e.target);
      }
    });
  },
  { rootMargin: "50px" },
);

document.querySelectorAll(".fade").forEach((el) => {
  const x = el.dataset.x || 0,
    y = el.dataset.y ?? 30;
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.transitionDelay = (el.dataset.d || 0) + "s";
  if (el.dataset.dur) el.style.transitionDuration = el.dataset.dur + "s";
  fadeIO.observe(el);
});

/* ---------- About text: per-letter reveal that plays when the section is in view ---------- */
// Letters are grouped into word spans (.w, nowrap) so lines only ever break between words.
const anim = $("animText");
let chars = [];
let aboutInView = false;
let revealRAF;
const esc = (c) =>
  c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let revealP = null; // progress last painted (null = nothing painted yet)
const setReveal = (p) => {
  const n = chars.length;
  // Each letter fades during its own 1/n slice of the progress, so while the
  // progress only moves forward just the letters in between need a new value.
  let a = 0,
    b = n - 1;
  if (revealP !== null && p >= revealP) {
    a = Math.max(0, Math.floor(revealP * n) - 1);
    b = Math.min(n - 1, Math.floor(p * n) + 1);
  }
  revealP = p;
  for (let i = a; i <= b; i++) {
    const from = i / n,
      to = (i + 1) / n;
    chars[i].style.opacity = 0.2 + 0.8 * clamp((p - from) / (to - from), 0, 1);
  }
};
function playReveal() {
  cancelAnimationFrame(revealRAF);
  if (reduce) return setReveal(1);
  const t0 = performance.now();
  const step = (t) => {
    const p = clamp((t - t0) / 2200, 0, 1); // 2.2s reveal
    setReveal(p);
    if (p < 1) revealRAF = requestAnimationFrame(step);
  };
  revealRAF = requestAnimationFrame(step);
}
function buildAbout(raw) {
  if (!anim) return;
  // A blank line in the admin's text starts a new paragraph; everything else is one flowing paragraph
  const paras = String(raw)
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!paras.length) return;
  const text = paras.join(" ");
  const html = paras
    .map((para) =>
      para
        .split(" ")
        .map(
          (w) =>
            `<span class="w">${[...w]
              .map((c) => `<span class="ch"><i>${esc(c)}</i><b>${esc(c)}</b></span>`)
              .join("")}</span>`,
        )
        .join(" "),
    )
    .join("<br><br>");
  // Screen readers get the real text; the per-letter spans are hidden from them
  anim.innerHTML = `<span class="sr-only"></span><span aria-hidden="true">${html}</span>`;
  anim.firstChild.textContent = text;
  chars = [...anim.querySelectorAll(".ch b")];
  revealP = null; // new letters: paint all of them on the next call
  if (reduce || aboutInView) {
    setReveal(reduce ? 1 : 0);
    if (aboutInView) playReveal();
  } else setReveal(0);
}
window.setAbout = buildAbout; // profile.js pushes the admin's paragraph here
if (anim) {
  buildAbout(anim.textContent);
  if (!reduce) {
    new IntersectionObserver(
      ([e]) => {
        aboutInView = e.isIntersecting;
        cancelAnimationFrame(revealRAF);
        if (e.isIntersecting) playReveal();
        else setReveal(0); // replays next time
      },
      { threshold: 0.5 },
    ).observe(anim);
  }
}

/* ---------- Cursor-following character ---------- */
// Three poses (front / left / right) cross-fade by cursor X; the whole
// stage also leans slightly toward the cursor, smoothed every frame.
const stage = $("stage");
const poses = {};
stage.querySelectorAll(".pose").forEach((p) => {
  poses[p.dataset.pose] = p;
});
let current = "front",
  tx = 0,
  ty = 0,
  charX = 0,
  charY = 0,
  lastMove = 0;
const DEAD_ZONE = 0.18; // fraction of the screen around the character that keeps the front pose

function setPose(name) {
  if (name === current) return;
  poses[current].classList.remove("on");
  poses[name].classList.add("on");
  current = name;
}

let pendX = 0,
  pendY = 0,
  pending = false;
// Pointer events only store the position; the frame loop does the (layout-reading) maths once per frame.
function wakeLoop() {
  if (!loopRAF && heroOn) loopRAF = requestAnimationFrame(loop);
}
function queueTrack(clientX, clientY) {
  pendX = clientX;
  pendY = clientY;
  pending = true;
  lastMove = performance.now();
  wakeLoop();
}
function track(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const dx = (clientX - (r.left + r.width / 2)) / innerWidth; // roughly -0.5..0.5
  const dy = (clientY - (r.top + r.height * 0.35)) / innerHeight;
  tx = clamp(dx * 2, -1, 1);
  ty = clamp(dy * 2, -1, 1);
  setPose(dx < -DEAD_ZONE ? "left" : dx > DEAD_ZONE ? "right" : "front");
  lastMove = performance.now();
}
addEventListener("pointermove", (e) => queueTrack(e.clientX, e.clientY), {
  passive: true,
});
// Touch screens have no hover: a tap turns him toward the finger
addEventListener("pointerdown", (e) => queueTrack(e.clientX, e.clientY), {
  passive: true,
});
document.documentElement.addEventListener("pointerleave", () => {
  pending = false;
  tx = ty = 0;
  setPose("front");
  wakeLoop(); // ease back to the centre
});

// Optional scrubbed video (Chrome/Edge/Firefox). Safari can't show transparent WebM, so it keeps the images.
const vid = $("charVideo");
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(
  navigator.userAgent,
);
if (vid && !isSafari && !LITE) {
  vid.addEventListener("loadeddata", () => {
    stage.classList.add("use-video");
    wakeLoop(); // the loop may be asleep: it has to seek the freshly loaded video
  });
  vid.addEventListener("error", () => stage.classList.remove("use-video"));
  vid.preload = "auto";
  vid.load();
} else if (vid) {
  // mobile / Safari: never download character.webm, keep front/left/right.webp
  vid.remove();
}

let heroOn = true,
  loopRAF = 0,
  lastTransform = "";
const touchOnly = matchMedia("(hover: none)").matches; // fixed for the session: read once, not every frame
function loop(t) {
  loopRAF = 0;
  if (!heroOn) return; // hero is off screen: stop until it comes back (see the observer below)
  if (pending) {
    pending = false;
    track(pendX, pendY);
  }
  // Idle sway when there is no pointer activity (e.g. phones)
  if (
    !reduce &&
    (lastMove === 0 || touchOnly) &&
    t > 3000 &&
    t - lastMove > 3000
  ) {
    tx = Math.sin(t / 1800) * 0.5;
    ty = 0;
    setPose(tx < -0.3 ? "left" : tx > 0.3 ? "right" : "front");
  }
  charX += (tx - charX) * 0.08;
  charY += (ty - charY) * 0.08;
  // settled (less than a thousandth of a pixel away): land exactly so the loop can go quiet
  if (Math.abs(tx - charX) < 0.0001) charX = tx;
  if (Math.abs(ty - charY) < 0.0001) charY = ty;
  if (vid && vid.duration && stage.classList.contains("use-video")) {
    const want = ((charX + 1) / 2) * vid.duration;
    // seek only when it matters and never while the last seek is still running (avoids stutter)
    if (!vid.seeking && Math.abs(vid.currentTime - want) > 0.04) vid.currentTime = want;
  }
  const next = reduce
    ? "none"
    : `translate(${charX * 14}px, ${charY * 8}px) rotate(${charX * 2}deg)`;
  if (next !== lastTransform) {
    stage.style.transform = next; // only touch the style when the value really changed
    lastTransform = next;
  }
  // Keep running while anything can still change; otherwise sleep until the next
  // pointer event, the idle sway or the video needs it (they all restart the loop).
  const idleSway = !reduce && (lastMove === 0 || touchOnly);
  const settled =
    charX === tx &&
    charY === ty &&
    !pending &&
    !idleSway &&
    !(vid && vid.duration && stage.classList.contains("use-video") && (vid.seeking || Math.abs(vid.currentTime - ((charX + 1) / 2) * vid.duration) > 0.04));
  if (!settled) loopRAF = requestAnimationFrame(loop);
}
const homeSec = $("home");
if (homeSec) {
  new IntersectionObserver(([e]) => {
    heroOn = e.isIntersecting;
    if (heroOn && !loopRAF) loopRAF = requestAnimationFrame(loop);
  }).observe(homeSec);
}
loop(0);

/* ---------- Fit the hero title (two lines) to the screen ---------- */
const heroTitle = document.querySelector(".hero-title");
function fitTitle() {
  if (!heroTitle) return;
  heroTitle.style.fontSize = ""; // back to the CSS size
  const cssSize = parseFloat(getComputedStyle(heroTitle).fontSize);
  heroTitle.style.width = "max-content"; // natural width of the widest line
  const natural = heroTitle.offsetWidth;
  heroTitle.style.width = "";
  const avail = heroTitle.parentElement.clientWidth * 0.96;
  const lines = heroTitle.innerHTML.split(/<br\s*\/?>/i).length;
  const byWidth = cssSize * Math.min(1, avail / natural);
  // Height only trims the title a little on short windows; it never shrinks it
  // below 70% of its normal size (a short window or open DevTools used to crush it).
  const byHeight = Math.max((innerHeight * 0.58) / (lines * 0.9), cssSize * 0.7);
  heroTitle.style.fontSize = Math.min(byWidth, byHeight) + "px";
}
let fitRAF;
addEventListener("resize", () => {
  cancelAnimationFrame(fitRAF);
  fitRAF = requestAnimationFrame(fitTitle);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
fitTitle();

/* ---------- Projects orbit ---------- */
// Cards circle around the centre image. Data comes from the admin panel (store.js, window.SITE). Each entry:
//   { "title": "Project name", "image": "/api/index?p=img/...", "url": "https://..." }
// No valid projects = nothing renders and nothing rotates.
(function () {
  const SPEED = 0.15; // radians per second (about 42s per lap)
  const PROJECT_STATUS = {
    online: "Online",
    offline: "Offline",
    local: "Local Device Only",
    construction: "Under Construction",
  };

  const section = $("projects"),
    orbit = $("orbit"),
    holder = $("orbitItems"),
    centerChar = $("orbitChar"),
    centerVideo = $("orbitCenter"),
    fallback = $("orbitFallback");
  if (!section || !orbit || !holder) return;

  // If src/working-hi.webm can't load, show the text instead
  centerVideo.addEventListener("error", () => {
    centerChar.hidden = true;
    fallback.hidden = false;
  });

  let items = [],
    angle = 0,
    rx = 0,
    ry = 0,
    paused = false,
    visible = false,
    last = performance.now();

  const safeUrl = (u) => {
    try {
      const p = new URL(String(u), location.href);
      return /^https?:$/.test(p.protocol) ? p.href : null;
    } catch {
      return null;
    }
  };

  function place() {
    const n = items.length;
    items.forEach((el, i) => {
      const a = angle + (i / n) * Math.PI * 2;
      const d = Math.sin(a); // -1 (back) .. 1 (front)
      const k = (d + 1) / 2;
      el.style.transform = `translate(-50%, -50%) translate(${Math.cos(a) * rx}px, ${d * ry}px) scale(${0.7 + 0.3 * k})`;
      el.style.opacity = 0.45 + 0.55 * k;
      // back half sits behind the centre image (z 5), front half in front of it
      const z = d < 0 ? 1 + Math.round(k * 6) : 20 + Math.round(d * 10);
      if (el._z !== z) {
        el._z = z; // z-index changes re-sort the stacking order: only write it when it changes
        el.style.zIndex = z;
      }
    });
  }

  function measure() {
    const w = orbit.clientWidth,
      h = orbit.clientHeight;
    const cw = clamp(w * 0.2, 110, 200);
    orbit.style.setProperty("--card-w", cw + "px");
    rx = Math.max(0, w / 2 - cw / 2 - 8);
    ry = h * 0.3;
    if (items.length) place();
  }

  function setProjects(list) {
    holder.replaceChildren();
    items = [];
    (Array.isArray(list) ? list : []).forEach((p) => {
      const title = String((p && p.title) || "").trim();
      const image = String((p && p.image) || "").trim();
      const url = safeUrl(p && p.url); // optional for projects that are not online
      if (!title || !image) return; // skip incomplete entries
      const status = PROJECT_STATUS[p && p.status] ? p.status : "online";
      if (!url && status === "online") return; // an online project needs its link

      const a = document.createElement("a");
      a.className = "orbit-card";
      if (url) {
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", `${title}, ${PROJECT_STATUS[status]} (opens in a new tab)`);
      } else {
        a.classList.add("no-link");
        a.setAttribute("aria-label", `${title}, ${PROJECT_STATUS[status]}`);
      }

      const badge = document.createElement("em");
      badge.className = `pstatus pstatus-${status}`;
      badge.textContent = PROJECT_STATUS[status];

      const im = document.createElement("img");
      im.src = image;
      im.alt = "";
      im.loading = "lazy";
      im.draggable = false;
      im.addEventListener("error", () => a.classList.add("no-img"));

      const cap = document.createElement("span");
      cap.textContent = title; // textContent, so admin input can't inject HTML

      a.append(im, badge, cap);
      // hover details (description, language, stars...): see js/project-meta.js + css/project-hover.css
      if (window.PFMeta) {
        let host = "";
        try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch {}
        PFMeta.attach(a, { title, url, status }, { status: PROJECT_STATUS[status], host });
      }
      holder.append(a);
      items.push(a);
    });
    measure();
  }
  function load() {
    setProjects(window.PF ? PF.projects.all() : []);
  }

  // Pause while hovering or focusing a card
  const HOVER_SCALE = 1.5; // keep in sync with css/project-hover.css (.orbit-card:hover { scale })
  function keepInView(c) {
    // the hovered card grows from its centre: nudge it sideways so a card at the edge of the orbit is never cut off
    const b = c.getBoundingClientRect(),
      cs = section.getBoundingClientRect(),
      half = (b.width * HOVER_SCALE) / 2,
      cx = b.left + b.width / 2,
      min = Math.max(0, cs.left) + 10,
      max = Math.min(innerWidth, cs.right) - 10;
    let dx = 0;
    if (cx - half < min) dx = min - (cx - half);
    else if (cx + half > max) dx = max - (cx + half);
    c.style.setProperty("--hx", Math.round(dx) + "px");
  }
  holder.addEventListener("pointerover", (e) => {
    const c = e.target.closest(".orbit-card");
    if (!c) return;
    paused = true;
    if (e.relatedTarget && c.contains(e.relatedTarget)) return; // moving inside the same card: it is already enlarged
    keepInView(c);
  });
  holder.addEventListener("pointerout", () => (paused = false));
  // light that follows the pointer across the hovered card (read by css/project-hover.css)
  holder.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".orbit-card");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
    c.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
  });
  holder.addEventListener("focusin", (e) => {
    paused = true;
    const c = e.target.closest(".orbit-card");
    if (c) keepInView(c);
  });
  holder.addEventListener("focusout", () => (paused = false));

  new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
    threshold: 0.1,
  }).observe(section);
  new ResizeObserver(measure).observe(orbit);

  window.OrbitState = () => ({ items: items.length, visible, paused, angle });
  (function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (items.length && visible && !paused && !document.documentElement.classList.contains("pj-lock")) {
      // reduced-motion devices still get a gentler turn (full speed otherwise)
      angle += SPEED * (reduce ? 0.7 : 1) * dt;
      place();
    }
    requestAnimationFrame(frame);
  })(last);

  load();
})();
/* ---------- Projects: the character says hi ---------- */
// working-hi.webm (24 fps) is made of two parts:
//   frames  0 - 49   IDLE   typing forward, then in reverse. Loops forever.
//   frames 50 - 146  GREET  the original clip: typing, he looks forward, he waves.
// Hover or tap: jump to the same pose in GREET (no visible cut) and carry on, sped up while
// he is still just typing. He waves and holds the wave. When the pointer leaves, the "Hi!"
// bubble and the character fade out together, the video resets to the typing loop, and the
// character fades back in.
(function () {
  const char = $("orbitChar"),
    video = $("orbitCenter"),
    hit = $("charHit"),
    section = $("projects");
  if (!char || !video || !hit || !section) return;

  /* Mobile / touch: no video. Show work.png, and hi.png while hovered / tapped.
   * The images are looked for in src/, then next to index.html, so a wrong folder cannot make
   * the character vanish. If none is found, the poster image (then the text) is shown instead. */
  if (LITE) {
    const DIRS = ["src/", "", "images/", "assets/"];
    const EXTS = ["webp", "png"]; // work.webp / hi.webp are the light versions
    const img = document.createElement("img");
    img.className = "char-img";
    img.alt = "Character working on a laptop";
    img.draggable = false;
    video.replaceWith(img);

    let base = null, // folder + ext that worked, e.g. "src/" + "webp"
      WORK = "",
      HI = "",
      t = 0;
    const poster = video.getAttribute("poster");
    const combos = [];
    DIRS.forEach((d) => EXTS.forEach((x) => combos.push([d, x])));
    (function find(i) {
      if (i >= combos.length) {
        if (poster) {
          img.src = poster; // last resort: the still frame
          img.onerror = () => {
            char.hidden = true;
            const fb = $("orbitFallback");
            if (fb) fb.hidden = false;
          };
        }
        return;
      }
      const [d, x] = combos[i];
      const probe = new Image();
      probe.onload = () => {
        base = d;
        WORK = d + "work." + x;
        HI = d + "hi." + x;
        img.src = WORK;
        new Image().src = HI; // preload so the swap is instant
      };
      probe.onerror = () => find(i + 1);
      probe.src = d + "work." + x;
    })(0);

    const sayHi = () => {
      clearTimeout(t);
      if (base !== null) img.src = HI;
      char.classList.add("is-hi");
    };
    const back = (e) => {
      clearTimeout(t);
      // finger: keep the greeting visible a moment after the tap
      t = setTimeout(
        () => {
          if (base !== null) img.src = WORK;
          char.classList.remove("is-hi");
        },
        e.pointerType === "mouse" ? 250 : 1400,
      );
    };
    hit.addEventListener("pointerenter", sayHi);
    hit.addEventListener("pointerdown", sayHi);
    hit.addEventListener("pointerleave", back);
    hit.addEventListener("pointercancel", back);
    return;
  }

  video.preload = "auto";

  const FPS = 24;
  const f = (n) => n / FPS;
  const HALF = 0.5 / FPS; // aim at the middle of a frame so seeks never land on its neighbour
  const TYPE_END = f(26); // idle: end of the forward half
  const IDLE_LEN = f(50); // idle: forward + reverse. GREET (the original clip) starts here
  const HOLD_AT = f(50 + 95); // the wave is held from here (the last frame is 146)
  const WAVE_AT = IDLE_LEN + 2.4; // the hand goes up: the "Hi!" bubble pops up
  const DONE_AT = IDLE_LEN + 3.3; // touch: let the wave play at least until here
  const LEAD_RATE = 2; // speed while he is still typing, so he looks up sooner
  const FADE_MS = 550; // keep in step with the fade-out time on ".char.is-fading video" in style.css

  let mode = "idle", // "idle" | "greet"
    holding = false, // paused on the wave while hovered
    leaving = false, // the pointer has left: the bubble must not come back
    visible = false,
    endT = 0,
    resetT = 0,
    raf = 0;

  const seek = (t) => (video.currentTime = t + HALF);
  const rate = (r) => {
    if (video.playbackRate !== r) video.playbackRate = r;
  };
  // Where is the current frame in the original clip?
  function originalTime(t) {
    if (t < TYPE_END) return t; // idle, forward half
    if (t < IDLE_LEN) return IDLE_LEN - t; // idle, reverse half
    return t - IDLE_LEN; // greet
  }

  function tick() {
    raf = 0;
    const t = video.currentTime;
    if (mode === "idle") {
      if (t >= IDLE_LEN) seek(0); // the first frame matches the last: seamless loop
    } else {
      if (t >= WAVE_AT && !leaving) char.classList.add("is-hi");
      rate(t - IDLE_LEN < TYPE_END - 0.08 ? LEAD_RATE : 1);
      if (t >= HOLD_AT) {
        holding = true; // hold the wave while the pointer stays
        video.pause();
      }
    }
    if (video.paused || video.ended) return;
    raf = requestAnimationFrame(tick);
  }

  // Play only while the section is on screen (muted, so autoplay is allowed)
  function sync() {
    const want = visible && !document.hidden && !reduce && !document.documentElement.classList.contains("pj-lock");
    if (!want) {
      if (!video.paused) video.pause();
    } else if (video.paused && !holding) {
      video.play().catch(() => {}); // autoplay blocked: the poster stays
    }
    if (want && !raf) raf = requestAnimationFrame(tick);
  }

  function greet() {
    clearTimeout(endT);
    clearTimeout(resetT);
    leaving = false;
    char.classList.remove("is-fading"); // came back before the fade finished
    if (mode === "greet") {
      if (holding) char.classList.add("is-hi"); // (while playing, tick brings the bubble back)
      return;
    }
    mode = "greet";
    if (reduce) return char.classList.add("is-hi"); // reduced motion: just the bubble
    seek(IDLE_LEN + originalTime(video.currentTime)); // same picture, now in the original clip
    sync();
  }

  // Bubble and character fade out together, then he is back at his laptop, fading in
  function fadeOut() {
    if (mode !== "greet") return;
    leaving = true;
    char.classList.remove("is-hi");
    if (reduce) {
      mode = "idle";
      leaving = false;
      return;
    }
    char.classList.add("is-fading");
    resetT = setTimeout(reset, FADE_MS);
  }

  function reset() {
    mode = "idle";
    holding = false;
    leaving = false;
    rate(1);
    seek(0);
    sync();
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      char.classList.remove("is-fading"); // fades back in, already on the typing frame
    };
    video.addEventListener("seeked", show, { once: true });
    setTimeout(show, 350);
  }

  // Touch has no hover: after the finger lifts, let the look-forward and the wave play first
  function touchEnd() {
    if (mode === "greet" && !holding && !video.paused && video.currentTime < DONE_AT) {
      endT = setTimeout(touchEnd, 100);
    } else fadeOut();
  }

  function leave(e) {
    clearTimeout(endT);
    endT = setTimeout(e.pointerType === "mouse" ? fadeOut : touchEnd, 250);
  }

  hit.addEventListener("pointerenter", greet);
  hit.addEventListener("pointerdown", greet);
  hit.addEventListener("pointerleave", leave);
  hit.addEventListener("pointercancel", leave);
  video.addEventListener("playing", () => {
    if (!raf) raf = requestAnimationFrame(tick);
  });
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("gallery:toggle", sync); // the All Projects gallery opened or closed
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      sync();
    },
    { threshold: 0.1 },
  ).observe(section);
})();

/* ---------- CV download buttons ---------- */
// The CV uploaded in the admin panel (store.js). If there is none, a cv.pdf next to
// index.html is used when it exists. No CV = buttons stay hidden.
(function () {
  const buttons = [...document.querySelectorAll(".cv-btn")];
  if (!buttons.length) return;

  function show(href, filename) {
    buttons.forEach((b) => {
      b.href = href;
      b.setAttribute("download", filename);
      b.hidden = false;
    });
  }
  function hide() {
    buttons.forEach((b) => {
      b.hidden = true;
      b.href = "#";
    });
  }

  async function load() {
    const saved = window.PF && PF.cv.get();
    if (saved) return show(saved.url, saved.name || "CV.pdf");
    try {
      const r = await fetch("cv.pdf", { method: "HEAD", cache: "no-store" });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !/pdf/i.test(type)) throw new Error("no cv");
      show("cv.pdf", "CV.pdf");
    } catch {
      hide();
    }
  }
  load();
})();

/* ---------- Hero: typewriter roles ---------- */
// Types each word, pauses, deletes it, then moves on to the next one.
// The words start from data-words (see index.html); profile.js replaces them with the
// list saved in the admin panel by calling window.setRoles([...]).
(function () {
  const line = $("typeLine");
  const word = $("typeWord");
  const cursor = $("typeCursor");
  if (!line || !word) return;

  const TYPE = 85, // ms per typed letter
    DELETE = 45, // ms per deleted letter
    HOLD = 1800, // ms a finished word stays
    GAP = 350; // ms of pause between words

  // Invisible copy of the longest word keeps the box a constant size
  const live = line.querySelector(".type-live");
  const sizer = live.cloneNode(true);
  sizer.className = "type-sizer";
  sizer.querySelector(".type-cursor").remove();
  sizer.querySelector(".type-word").removeAttribute("id");
  const sizerWord = sizer.querySelector(".type-word");
  line.prepend(sizer);

  // Screen readers get the whole phrase once instead of every typed letter
  const lead = live.querySelector(".hero-lead");
  const sr = document.createElement("span");
  sr.className = "sr-only";
  line.parentElement.append(sr);

  const busy = (on) => cursor && cursor.classList.toggle("busy", on);
  let heroVisible = true,
    gen = 0; // each start() bumps this, which stops the previous loop

  const hero = $("home");
  if (hero)
    new IntersectionObserver(([e]) => (heroVisible = e.intersectionRatio > 0), {
      threshold: [0, 0.01], // the 0.01 step makes sure we are told when only an edge still touches the screen
    }).observe(hero);

  function start(list) {
    const words = (Array.isArray(list) ? list : [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    if (!words.length) return;
    const my = ++gen;

    sizerWord.textContent = words.reduce((a, b) => (b.length > a.length ? b : a));
    sr.textContent = (lead ? lead.textContent + " " : "") + words.join(", ");
    word.textContent = words[0];
    busy(false);
    if (words.length < 2) return;

    let wi = 0,
      count = words[0].length,
      mode = "hold";

    // Reduced motion: no typing, just swap the word now and then
    if (reduce) {
      (function swap() {
        setTimeout(() => {
          if (my !== gen) return;
          if (!document.hidden && heroVisible) {
            wi = (wi + 1) % words.length;
            word.textContent = words[wi];
          }
          swap();
        }, 4000);
      })();
      return;
    }

    function step() {
      if (my !== gen) return; // a newer list took over
      if (document.hidden || !heroVisible) return setTimeout(step, 400); // do nothing while nobody sees it
      const w = words[wi];
      if (mode === "hold") {
        mode = "delete";
        busy(true);
        return setTimeout(step, DELETE);
      }
      if (mode === "delete") {
        count--;
        word.textContent = w.slice(0, count);
        if (count > 0) return setTimeout(step, DELETE);
        wi = (wi + 1) % words.length;
        mode = "type";
        busy(false);
        return setTimeout(step, GAP);
      }
      // typing
      busy(true);
      count++;
      word.textContent = words[wi].slice(0, count);
      if (count < words[wi].length) return setTimeout(step, TYPE);
      mode = "hold";
      busy(false);
      setTimeout(step, HOLD);
    }
    setTimeout(step, HOLD);
  }

  start((line.dataset.words || "").split("|"));
  window.setRoles = start; // profile.js pushes the admin's list here
})();

/* ---------- Debug panel: open the site with ?debug=1 to see why an effect is off ---------- */
if (/[?&]debug=1/.test(location.search)) {
  const box = document.createElement("pre");
  box.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:2147483600;margin:0;padding:8px 10px;max-width:92vw;" +
    "font:12px/1.35 monospace;color:#0f0;background:rgba(0,0,0,.85);border-radius:8px;white-space:pre-wrap";
  document.body.append(box);
  let prev = null;
  setInterval(() => {
    const w = window.SkillsScene && SkillsScene.world;
    const b = w && w.bodies[0];
    const pos = b ? b.x.toFixed(3) + "," + b.y.toFixed(3) : "-";
    const moved = prev !== null && prev !== pos;
    prev = pos;
    const sec = $("skills");
    box.textContent = [
      "site data (/api/index?p=content): " + (window.SITE ? "loaded" : "NOT LOADED - projects, skills and CV will be empty"),
      "reduced motion (applied): " + reduce,
      "OS reduce-motion setting: " + matchMedia("(prefers-reduced-motion: reduce)").matches,
      "touch mode (images, no video): " + LITE,
      "skills section: " + (sec ? (sec.hidden ? "HIDDEN (no skills data)" : "shown") : "missing"),
      "skill spheres: " + (w ? w.bodies.length : 0) + (sec && sec.classList.contains("no-webgl") ? "  WEBGL FAILED" : ""),
      "sphere moving: " + moved,
      "project cards: " + document.querySelectorAll(".orbit-card").length +
        (window.OrbitState ? "  orbit " + JSON.stringify(OrbitState(), (k, v) => (typeof v === "number" ? +v.toFixed(2) : v)) : ""),
      "project char: " + (($("orbitChar") || {}).hidden ? "HIDDEN" : "shown") +
        ($("orbitChar") && $("orbitChar").querySelector(".char-img")
          ? " img=" + $("orbitChar").querySelector(".char-img").getAttribute("src")
          : " video"),
    ].join("\n");
  }, 1000);
}
