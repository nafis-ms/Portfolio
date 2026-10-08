const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
const anim = $("animText");
let chars = [];
if (anim) {
  const text = anim.textContent.replace(/\s+/g, " ").trim();
  const spans = [...text]
    .map((c) =>
      c === " " ? " " : `<span class="ch"><i>${c}</i><b>${c}</b></span>`,
    )
    .join("");
  // Screen readers get the real text; the per-letter spans are hidden from them
  anim.innerHTML = `<span class="sr-only">${text}</span><span aria-hidden="true">${spans}</span>`;
  chars = [...anim.querySelectorAll(".ch b")];

  const setReveal = (p) => {
    const n = chars.length;
    chars.forEach((c, i) => {
      const from = i / n,
        to = (i + 1) / n;
      c.style.opacity = 0.2 + 0.8 * clamp((p - from) / (to - from), 0, 1);
    });
  };

  let revealRAF;
  if (reduce) {
    setReveal(1);
  } else {
    setReveal(0);
    new IntersectionObserver(
      ([e]) => {
        cancelAnimationFrame(revealRAF);
        if (e.isIntersecting) {
          const t0 = performance.now();
          const step = (t) => {
            const p = clamp((t - t0) / 2200, 0, 1); // 2.2s reveal
            setReveal(p);
            if (p < 1) revealRAF = requestAnimationFrame(step);
          };
          revealRAF = requestAnimationFrame(step);
        } else {
          setReveal(0); // replays next time
        }
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
document.documentElement.addEventListener("pointerleave", () => {
  tx = ty = 0;
  setPose("front");
});

// Optional scrubbed video (Chrome/Edge/Firefox). Safari can't show transparent WebM, so it keeps the images.
const vid = $("charVideo");
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(
  navigator.userAgent,
);
if (vid && !isSafari) {
  vid.addEventListener("loadeddata", () => stage.classList.add("use-video"));
  vid.addEventListener("error", () => stage.classList.remove("use-video"));
  vid.load();
} else if (vid) {
  vid.remove();
}

(function loop(t) {
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
    if (Math.abs(vid.currentTime - want) > 0.01) vid.currentTime = want;
  }
  stage.style.transform = reduce
    ? "none"
    : `translate(${charX * 14}px, ${charY * 8}px) rotate(${charX * 2}deg)`;
  requestAnimationFrame(loop);
})(0);

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
// Cards circle around the centre image. Data comes from projects.json
// (later: point PROJECTS_URL at your admin panel's API). Each entry:
//   { "title": "Project name", "image": "uploads/shot.jpg", "url": "https://..." }
// No valid projects = nothing renders and nothing rotates.
(function () {
  const PROJECTS_URL = "projects.json";
  const SPEED = 0.15; // radians per second (about 42s per lap)

  const section = $("projects"),
    orbit = $("orbit"),
    holder = $("orbitItems"),
    centerImg = $("orbitCenter"),
    fallback = $("orbitFallback");
  if (!section || !orbit || !holder) return;

  // If src/work.png is missing, show the text instead
  centerImg.addEventListener("error", () => {
    centerImg.hidden = true;
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
      const url = safeUrl(p && p.url);
      if (!title || !image || !url) return; // skip incomplete entries

      const a = document.createElement("a");
      a.className = "orbit-card";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", `${title} (opens in a new tab)`);

      const im = document.createElement("img");
      im.src = image;
      im.alt = "";
      im.loading = "lazy";
      im.draggable = false;
      im.addEventListener("error", () => a.classList.add("no-img"));

      const cap = document.createElement("span");
      cap.textContent = title; // textContent, so admin input can't inject HTML

      a.append(im, cap);
      holder.append(a);
      items.push(a);
    });
    measure();
  }
  window.setProjects = setProjects; // lets the admin panel push updates live

  async function load() {
    // 1) projects saved by the admin panel in this browser (store.js)
    if (window.PF && PF.projects.has()) return setProjects(PF.projects.all());
    // 2) otherwise a published projects.json next to index.html
    try {
      const r = await fetch(PROJECTS_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      setProjects(await r.json());
    } catch {
      setProjects([]); // missing/invalid file = no projects
    }
  }
  // Update live when the admin panel saves in another tab
  addEventListener("storage", (e) => {
    if (window.PF && e.key === PF.KEY) setProjects(PF.projects.all());
  });

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

  (function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (items.length && visible && !paused && !reduce) {
      angle += SPEED * dt;
      place();
    }
    requestAnimationFrame(frame);
  })(last);

  load();
})();
/* ---------- Contact: copy email address ---------- */
(function () {
  const btn = $("copyMail"),
    link = $("mailLink");
  if (!btn || !link) return;
  const addr = link.textContent.trim();
  btn.addEventListener("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(addr);
      ok = true;
    } catch {
      const t = document.createElement("textarea");
      t.value = addr;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.append(t);
      t.select();
      try { ok = document.execCommand("copy"); } catch {}
      t.remove();
    }
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => (btn.textContent = "Copy"), 1800);
  });
})();
