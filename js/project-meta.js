/* Project hover details, shared by the orbit cards (script.js) and the All Projects gallery (projects-all.js).
 *
 * Cards show ONLY the project name. The description and the other details live in a small overlay (.hp) inside each
 * card that is revealed, with a cinematic animation, while the card is hovered or focused (css/project-hover.css).
 *
 *   PFMeta.attach(card, project, { status: "Online", host: "example.com" })
 *       builds the overlay inside the <a> card and fills in the GitHub details as soon as they are known.
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

    get(p).then(function (m) {
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

  window.PFMeta = { get: get, attach: attach };
})();
