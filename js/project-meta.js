/* Project hover details, shared by the orbit cards (script.js) and the All Projects gallery (projects-all.js).
 *
 * Cards show ONLY the project name. The description and the other details live in a small overlay (.hp) inside each
 * card that is revealed, with a cinematic animation, while the card is hovered or focused (css/project-hover.css).
 *
 *   PFMeta.attach(card, project, { status: "Online", host: "example.com" })
 *       builds the overlay inside the <a> card and fills in the GitHub details as soon as they are known.
 *
 * Touch screens have no hover, so there a TAP on a card opens a details sheet that slides up from the bottom (name,
 * picture, status, description, language, stars and a "View project" button). Swipe it down, tap outside or press X to close.
 *
 * A project is matched to one of your GitHub repos by its link (github.com/you/repo, you.github.io/repo, or a repo whose
 * "website" field is that link) and, failing that, by a title that equals the repo name. The repo's description,
 * language and stars then appear in the overlay. No match / GitHub unreachable = the overlay still shows the name,
 * status and link, it just has no description. All text is added with textContent, so nothing can inject HTML. */
(function () {
  "use strict";

  /* ---------- matching a project to a repo ---------- */
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function bare(u) {
    var s = String(u || "").toLowerCase();
    var host = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[\/#?].*$/, "");
    var path = s.replace(/^https?:\/\/[^\/]+/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    return host + path;
  }
  function findRepo(p, repos) {
    var byName = {};
    repos.forEach(function (r) { byName[r.name.toLowerCase()] = r; });
    if (p.url) {
      try {
        var u = new URL(p.url), parts = u.pathname.split("/").filter(Boolean), h = u.hostname.replace(/^www\./, "").toLowerCase();
        if (h === "github.com" && parts[1] && byName[parts[1].toLowerCase()]) return byName[parts[1].toLowerCase()];
        if (/\.github\.io$/.test(h)) {
          var guess = parts[0] ? parts[0].toLowerCase() : h;
          if (byName[guess]) return byName[guess];
        }
      } catch (e) { /* not a valid link */ }
      var mine = bare(p.url);
      for (var i = 0; i < repos.length; i++) if (repos[i].homepage && bare(repos[i].homepage) === mine) return repos[i];
    }
    var t = norm(p.title);
    if (!t) return null;
    for (var j = 0; j < repos.length; j++) if (norm(repos[j].name) === t) return repos[j];
    return null;
  }

  /* ---------- repo list (one shared request; github.js defines window.GHRepos after the page scripts ran) ---------- */
  var repos = null, pending = null;
  function whenReady() {
    if (window.GHRepos || document.readyState !== "loading") return Promise.resolve();
    return new Promise(function (res) { document.addEventListener("DOMContentLoaded", function () { res(); }); });
  }
  function loadRepos() {
    if (repos) return Promise.resolve(repos);
    if (pending) return pending;
    pending = whenReady().then(function () {
      if (!window.GHRepos) return [];
      return GHRepos.get();
    }).then(function (list) {
      pending = null;
      repos = Array.isArray(list) ? list : [];
      return repos;
    }, function () {
      pending = null;                                         // GitHub unreachable: try again on the next card
      return [];
    });
    return pending;
  }
  function get(p) {
    return loadRepos().then(function (list) {
      var r = list.length ? findRepo(p, list) : null;
      return r ? { description: r.description || "", language: r.language || "", stars: r.stargazers_count || 0 } : null;
    });
  }

  /* ---------- overlay ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function attach(card, p, o) {
    o = o || {};
    var pop = el("div", "hp");
    pop.setAttribute("aria-hidden", "true");                  // the card's aria-label already names the project

    var chips = el("div", "hp-m");
    var st = el("i", "hp-chip hp-st hp-st-" + (p.status || "online"), o.status || "");
    chips.append(st);

    pop.append(el("i", "hp-bar"), el("b", "hp-t", p.title), chips);

    var foot = el("div", "hp-f");
    if (p.url) foot.append(el("i", "hp-cta", "View project ↗"), el("i", "hp-host", o.host || ""));
    else foot.append(el("i", "hp-host", "No public link"));
    pop.append(foot);
    card.append(pop);

    var meta = null;
    card.addEventListener("click", function (e) {
      if (!touchMode()) return;                               // mouse users: the card is a normal link, hover shows the details
      e.preventDefault();                                     // touch: first tap shows the details, the button inside opens the link
      openSheet(p, o, function () { return meta; });
    });

    get(p).then(function (m) {
      meta = m;
      if (!m) return;
      if (m.description) {
        var d = el("small", "hp-d", m.description);
        pop.insertBefore(d, chips);
        card.classList.add("has-desc");
        var base = card.getAttribute("aria-label") || p.title;
        card.setAttribute("aria-label", base + ". " + m.description);
      }
      if (m.language) chips.append(el("i", "hp-chip", m.language));
      if (m.stars > 0) chips.append(el("i", "hp-chip", "★ " + m.stars));
    });
    return pop;
  }

  /* ---------- touch: details sheet ---------- */
  function touchMode() { return !!(window.matchMedia && matchMedia("(hover: none), (pointer: coarse)").matches); }

  var sheet = null, parts = null, lastFocus = null, closeTimer = 0, openNow = false;
  function build() {
    sheet = el("div", "pm-sheet");
    sheet.hidden = true;
    var back = el("div", "pm-back");
    var card = el("section", "pm-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "pmTitle");
    card.tabIndex = -1;
    var grab = el("i", "pm-grab");
    var x = el("button", "pm-x");
    x.type = "button";
    x.setAttribute("aria-label", "Close details");
    x.textContent = "×";
    var media = el("div", "pm-media"), img = document.createElement("img");
    img.alt = ""; img.draggable = false; img.decoding = "async";
    media.append(img);
    var body = el("div", "pm-body");
    var bar = el("i", "pm-bar"), t = el("h3", "pm-t");
    t.id = "pmTitle";
    var chips = el("div", "pm-m"), d = el("p", "pm-d"), note = el("p", "pm-note");
    var go = el("a", "pm-go", "View project ↗");
    go.target = "_blank"; go.rel = "noopener noreferrer";
    body.append(bar, t, chips, d, note, go);
    card.append(grab, x, media, body);
    sheet.append(back, card);
    document.body.append(sheet);
    parts = { card: card, img: img, t: t, chips: chips, d: d, note: note, go: go, x: x };

    back.addEventListener("click", closeSheet);
    x.addEventListener("click", closeSheet);
    go.addEventListener("click", function () { setTimeout(closeSheet, 150); });
    document.addEventListener("keydown", function (e) {
      if (openNow && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSheet(); }
    }, true);

    /* swipe down to close */
    var y0 = null, dy = 0;
    card.addEventListener("touchstart", function (e) {
      var scrolled = body.scrollTop > 0 || matchMedia("(min-width: 700px)").matches;   // wide screens: centred card, no swipe
      y0 = scrolled ? null : e.touches[0].clientY; dy = 0;
    }, { passive: true });
    card.addEventListener("touchmove", function (e) {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      card.style.transition = "none";
      card.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    card.addEventListener("touchend", function () {
      if (y0 == null) return;
      card.style.transition = "";
      card.style.transform = "";
      if (dy > 90) closeSheet();
      y0 = null;
    });
  }

  function openSheet(p, o, metaNow) {
    if (!sheet) build();
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    parts.img.src = p.image || "";
    parts.card.classList.toggle("no-img", !p.image);
    parts.t.textContent = p.title;
    parts.chips.textContent = "";
    parts.chips.append(el("i", "hp-chip hp-st hp-st-" + (p.status || "online"), o.status || ""));
    parts.d.textContent = "";
    parts.d.hidden = true;
    parts.note.textContent = p.url ? "" : "This project is not available online.";
    parts.note.hidden = !!p.url;
    if (p.url) { parts.go.href = p.url; parts.go.hidden = false; } else { parts.go.removeAttribute("href"); parts.go.hidden = true; }
    function fill(m) {
      if (!m || !openNow || parts.t.textContent !== p.title) return;
      if (m.description) { parts.d.textContent = m.description; parts.d.hidden = false; }
      if (m.language && !parts.chips.querySelector(".pm-lang")) parts.chips.append(el("i", "hp-chip pm-lang", m.language));
      if (m.stars > 0 && !parts.chips.querySelector(".pm-star")) parts.chips.append(el("i", "hp-chip pm-star", "★ " + m.stars));
    }
    sheet.hidden = false;
    document.documentElement.classList.add("pm-open");
    void sheet.offsetWidth;                                   // start from the closed state, then animate
    sheet.classList.add("is-open");
    openNow = true;
    var m = metaNow();
    if (m) fill(m); else get(p).then(fill);                   // details not loaded yet: fill them in as soon as they arrive
    parts.x.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (!openNow) return;
    openNow = false;
    sheet.classList.remove("is-open");
    closeTimer = setTimeout(function () {
      sheet.hidden = true;
      document.documentElement.classList.remove("pm-open");
    }, 520);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  window.PFMeta = { get: get, attach: attach };
})();
