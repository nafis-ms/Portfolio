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

  function onNavScroll() {
    nav.classList.toggle("scrolled", scrollY > 20);
    let active = null;
    targets.forEach((t) => {
      if (t.el.hidden) return; // a hidden section (no skills, no GitHub user) has top = 0 and would win
      if (t.el.getBoundingClientRect().top <= innerHeight * 0.4) active = t.a;
    });
    links.forEach((a) => a.classList.toggle("active", a === active));
  }
  addEventListener("scroll", onNavScroll, { passive: true });
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
const setReveal = (p) => {
  const n = chars.length;
  chars.forEach((c, i) => {
    const from = i / n,
      to = (i + 1) / n;
    c.style.opacity = 0.2 + 0.8 * clamp((p - from) / (to - from), 0, 1);
  });
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

function track(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const dx = (clientX - (r.left + r.width / 2)) / innerWidth; // roughly -0.5..0.5
  const dy = (clientY - (r.top + r.height * 0.35)) / innerHeight;
  tx = clamp(dx * 2, -1, 1);
  ty = clamp(dy * 2, -1, 1);
  setPose(dx < -DEAD_ZONE ? "left" : dx > DEAD_ZONE ? "right" : "front");
  lastMove = performance.now();
}
addEventListener("pointermove", (e) => track(e.clientX, e.clientY), {
  passive: true,
});
// Touch screens have no hover: a tap turns him toward the finger
addEventListener("pointerdown", (e) => track(e.clientX, e.clientY), {
  passive: true,
});
document.documentElement.addEventListener("pointerleave", () => {
  tx = ty = 0;
  setPose("front");
});

// Optional scrubbed video (Chrome/Edge/Firefox). Safari can't show transparent WebM, so it keeps the images.
const vid = $("charVideo");
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(
  navigator.userAgent,
);
if (vid && !isSafari && !LITE) {
  vid.addEventListener("loadeddata", () => stage.classList.add("use-video"));
  vid.addEventListener("error", () => stage.classList.remove("use-video"));
  vid.preload = "auto";
  vid.load();
} else if (vid) {
  // mobile / Safari: never download character.webm, keep front/left/right.webp
  vid.remove();
}

let heroOn = true,
  loopRAF = 0;
function loop(t) {
  loopRAF = 0;
  if (!heroOn) return; // hero is off screen: stop until it comes back (see the observer below)
  // Idle sway when there is no pointer activity (e.g. phones)
  const touchOnly = matchMedia("(hover: none)").matches;
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
  if (vid && vid.duration && stage.classList.contains("use-video")) {
    const want = ((charX + 1) / 2) * vid.duration;
    // seek only when it matters and never while the last seek is still running (avoids stutter)
    if (!vid.seeking && Math.abs(vid.currentTime - want) > 0.04) vid.currentTime = want;
  }
  stage.style.transform = reduce
    ? "none"
    : `translate(${charX * 14}px, ${charY * 8}px) rotate(${charX * 2}deg)`;
  loopRAF = requestAnimationFrame(loop);
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

  // If src/work.webp can't load, show the text instead
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
      el.style.zIndex = d < 0 ? 1 + Math.round(k * 6) : 20 + Math.round(d * 10);
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
      holder.append(a);
      items.push(a);
    });
    measure();
  }
  function load() {
    setProjects(window.PF ? PF.projects.all() : []);
  }

  // Pause while hovering or focusing a card
  holder.addEventListener("pointerover", (e) => {
    if (e.target.closest(".orbit-card")) paused = true;
  });
  holder.addEventListener("pointerout", () => (paused = false));
  holder.addEventListener("focusin", () => (paused = true));
  holder.addEventListener("focusout", () => (paused = false));

  new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
    threshold: 0.1,
  }).observe(section);
  new ResizeObserver(measure).observe(orbit);

  window.OrbitState = () => ({ items: items.length, visible, paused, angle });
  (function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (items.length && visible && !paused) {
      // reduced-motion devices still get a gentler turn (full speed otherwise)
      angle += SPEED * (reduce ? 0.7 : 1) * dt;
      place();
    }
    requestAnimationFrame(frame);
  })(last);

  load();
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
// Types each word from data-words (see index.html), pauses, deletes it, then
// moves on to the next one.
(function () {
  const line = $("typeLine");
  const word = $("typeWord");
  const cursor = $("typeCursor");
  if (!line || !word) return;
  const words = (line.dataset.words || "")
    .split("|")
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return;

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
  sizer.querySelector(".type-word").textContent = words.reduce((a, b) => (b.length > a.length ? b : a));
  line.prepend(sizer);

  // Screen readers get the whole phrase once instead of every typed letter
  const lead = live.querySelector(".hero-lead");
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = (lead ? lead.textContent + " " : "") + words.join(", ");
  line.parentElement.append(sr);

  if (words.length < 2) return;
  let wi = 0,
    count = words[0].length,
    mode = "hold",
    heroVisible = true;
  const busy = (on) => cursor && cursor.classList.toggle("busy", on);

  const hero = $("home");
  if (hero)
    new IntersectionObserver(([e]) => (heroVisible = e.intersectionRatio > 0), {
      threshold: [0, 0.01], // the 0.01 step makes sure we are told when only an edge still touches the screen
    }).observe(hero);

  // Reduced motion: no typing, just swap the word now and then
  if (reduce) {
    setInterval(() => {
      if (document.hidden || !heroVisible) return;
      wi = (wi + 1) % words.length;
      word.textContent = words[wi];
    }, 4000);
    return;
  }

  function step() {
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
  busy(false);
  setTimeout(step, HOLD);
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
