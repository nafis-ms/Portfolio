/* GitHub dashboard: profile, stats, top languages and a contribution heatmap.
 *
 * Set data-user on <section id="github"> in index.html to your GitHub username.
 * While it is still the placeholder, the section and its nav link stay hidden.
 *
 * Data (all public, no token needed, fetched in the visitor's browser):
 *   profile + repos:  api.github.com
 *   heatmap:          github-contributions-api.jogruber.de (GitHub has no public
 *                     REST endpoint for the contribution calendar). If it is down,
 *                     the heatmap falls back to your recent public events.
 * Results are cached for 30 minutes so the 60 requests/hour unauthenticated
 * GitHub limit is never an issue. */
(function () {
  "use strict";

  var section = document.getElementById("github");
  if (!section) return;
  var user = (section.dataset.user || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(user)) return;   // placeholder: stay hidden

  var API = "https://api.github.com";
  var CONTRIB_API = "https://github-contributions-api.jogruber.de/v4/";
  var CACHE_KEY = "portfolio-github-" + user.toLowerCase();
  var TTL = 30 * 60 * 1000;
  var WEEKS = 53;

  var $ = function (id) { return document.getElementById(id); };
  var card = $("ghCard");
  var navItem = (document.querySelector('.gnav-links a[href="#github"]') || {}).parentElement || null;

  section.hidden = false;
  if (navItem) navItem.hidden = false;
  $("ghLink").href = "https://github.com/" + user;

  /* ---------- helpers ---------- */
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) { /* storage full or blocked */ }
  }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function utc(y, m, d) { return Date.UTC(y, m, d); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- data ---------- */
  var LANG_COLORS = {
    JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", "C++": "#f34b7d", C: "#9aa0a6",
    HTML: "#e34c26", CSS: "#a78bfa", Java: "#b07219", "C#": "#178600", Go: "#00ADD8", Rust: "#dea584",
    PHP: "#7a86b8", Shell: "#89e051", Dart: "#00B4AB", Kotlin: "#A97BFF", Swift: "#F05138",
    "Jupyter Notebook": "#DA5B0B", GLSL: "#5686a5", Vue: "#41b883", Ruby: "#c0392b", SCSS: "#c6538c"
  };

  function summarizeRepos(repos) {
    var own = (Array.isArray(repos) ? repos : []).filter(function (r) { return r && !r.fork; });
    var stars = 0, counts = {};
    own.forEach(function (r) {
      stars += r.stargazers_count || 0;
      if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
    });
    var total = 0, list = Object.keys(counts).map(function (k) { total += counts[k]; return [k, counts[k]]; });
    list.sort(function (a, b) { return b[1] - a[1]; });
    return {
      stars: stars,
      langs: list.slice(0, 5).map(function (p) { return { name: p[0], pct: Math.round(p[1] / total * 1000) / 10 }; })
    };
  }

  // Every day from the Sunday 52 weeks ago up to today, with counts (0 where nothing happened)
  function fillDays(counts) {
    var now = new Date();
    var end = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var start = end - ((WEEKS - 1) * 7 + now.getUTCDay()) * 864e5;
    var days = [];
    for (var t = start; t <= end; t += 864e5) days.push([iso(t), counts[iso(t)] || 0]);
    return days;
  }

  function fromContribApi(json) {
    var counts = {}, total = 0;
    ((json && json.contributions) || []).forEach(function (d) {
      counts[d.date] = d.count || 0;
    });
    Object.keys(counts).forEach(function (k) { total += counts[k]; });
    if (json && json.total && typeof json.total.lastYear === "number") total = json.total.lastYear;
    return { days: fillDays(counts), total: total, label: "contributions in the last year" };
  }

  function fromEvents(events) {
    var counts = {}, total = 0;
    (Array.isArray(events) ? events : []).forEach(function (e) {
      var d = String(e.created_at || "").slice(0, 10);
      if (!d) return;
      var n = e.type === "PushEvent" && e.payload && e.payload.size ? e.payload.size : 1;
      counts[d] = (counts[d] || 0) + n;
      total += n;
    });
    return { days: fillDays(counts), total: total, label: "recent public contributions" };
  }

  function loadFresh() {
    return Promise.all([
      getJSON(API + "/users/" + encodeURIComponent(user)),
      getJSON(API + "/users/" + encodeURIComponent(user) + "/repos?per_page=100&type=owner&sort=pushed").catch(function () { return null; }),
      getJSON(CONTRIB_API + encodeURIComponent(user) + "?y=last").then(fromContribApi).catch(function () {
        return getJSON(API + "/users/" + encodeURIComponent(user) + "/events/public?per_page=100").then(fromEvents).catch(function () { return null; });
      })
    ]).then(function (r) {
      var p = r[0], sum = summarizeRepos(r[1]);
      return {
        login: String(p.login || user),
        name: String(p.name || p.login || user),
        bio: String(p.bio || ""),
        avatar: String(p.avatar_url || ""),
        url: String(p.html_url || ""),
        repos: p.public_repos || 0,
        followers: p.followers || 0,
        following: p.following || 0,
        stars: r[1] ? sum.stars : null,
        langs: r[1] ? sum.langs : [],
        activity: r[2]
      };
    });
  }

  /* ---------- rendering ---------- */
  function renderHeatmap(act) {
    var box = $("ghActivity");
    if (!act || !act.days.length) { box.hidden = true; return; }
    box.hidden = false;
    $("ghTotal").textContent = fmt(act.total) + " " + act.label;

    // Quartile levels from the non-zero days, like GitHub does
    var nz = act.days.map(function (d) { return d[1]; }).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
    function q(p) { return nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 1; }
    var t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
    function level(n) { return n <= 0 ? 0 : n <= t1 ? 1 : n <= t2 ? 2 : n <= t3 ? 3 : 4; }

    var pad = new Date(act.days[0][0] + "T00:00:00Z").getUTCDay();   // blank cells before the first day
    var weeks = Math.ceil((pad + act.days.length) / 7);
    var grid = $("ghGrid"), months = $("ghMonths");
    grid.textContent = "";
    months.textContent = "";
    $("ghCal").style.setProperty("--weeks", weeks);
    $("ghCal").setAttribute("aria-label", "Contribution calendar: " + fmt(act.total) + " " + act.label);

    var frag = document.createDocumentFragment(), i;
    for (i = 0; i < pad; i++) frag.append(el("i", "gh-pad"));
    act.days.forEach(function (d) {
      var c = el("i");
      c.dataset.l = level(d[1]);
      var when = new Date(d[0] + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      c.title = (d[1] === 0 ? "No contributions" : fmt(d[1]) + (d[1] === 1 ? " contribution" : " contributions")) + " on " + when;
      frag.append(c);
    });
    grid.append(frag);

    // Month labels above the column where each month starts
    var marks = [], prev = -1;
    for (var w = 0; w < weeks; w++) {
      var idx = Math.max(0, w * 7 - pad);
      var m = new Date(act.days[Math.min(idx, act.days.length - 1)][0] + "T00:00:00Z").getUTCMonth();
      if (m !== prev) { marks.push({ w: w, m: m }); prev = m; }
    }
    if (marks.length > 1 && marks[1].w < 3) marks.shift();   // no cramped label for a sliver of a month
    var names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    marks.forEach(function (k) {
      var s = el("span", null, names[k.m]);
      s.style.gridColumn = String(k.w + 1);
      months.append(s);
    });

    // Newest weeks are on the right: start scrolled there on narrow screens
    var sc = $("ghScroll");
    sc.scrollLeft = sc.scrollWidth;
  }

  function renderLangs(langs) {
    var box = $("ghLangs");
    if (!langs || !langs.length) { box.hidden = true; return; }
    box.hidden = false;
    var bar = $("ghLangBar"), list = $("ghLangList");
    bar.textContent = "";
    list.textContent = "";
    bar.setAttribute("aria-label", "Top languages: " + langs.map(function (l) { return l.name + " " + l.pct + "%"; }).join(", "));
    var fallback = ["#8b5cf6", "#b600a8", "#be4c00", "#38bdf8", "#34d399"];
    langs.forEach(function (l, i) {
      var color = LANG_COLORS[l.name] || fallback[i % fallback.length];
      var seg = el("span");
      seg.style.flexGrow = l.pct;
      seg.style.background = color;
      seg.title = l.name + " " + l.pct + "%";
      bar.append(seg);
      var li = el("li");
      var dot = el("i");
      dot.style.background = color;
      li.append(dot, el("span", null, l.name), el("em", null, l.pct + "%"));
      list.append(li);
    });
  }

  function render(d) {
    $("ghName").textContent = d.name;
    $("ghHandle").textContent = "@" + d.login;
    $("ghBio").textContent = d.bio;
    $("ghBio").hidden = !d.bio;
    if (/^https:\/\/github\.com\//.test(d.url)) $("ghLink").href = d.url;

    var av = $("ghAvatar");
    if (/^https:\/\/avatars\.githubusercontent\.com\//.test(d.avatar)) {
      av.src = d.avatar + (d.avatar.indexOf("?") === -1 ? "?s=128" : "&s=128");
      av.alt = d.name;
      av.hidden = false;
    } else av.hidden = true;

    $("ghRepos").textContent = fmt(d.repos);
    $("ghStars").textContent = d.stars == null ? "-" : fmt(d.stars);
    $("ghFollowers").textContent = fmt(d.followers);
    $("ghFollowing").textContent = fmt(d.following);
    renderLangs(d.langs);
    renderHeatmap(d.activity);
    card.setAttribute("aria-busy", "false");
  }

  function fail(hasStale) {
    card.setAttribute("aria-busy", "false");
    $("ghMsg").textContent = hasStale
      ? "Showing saved numbers: GitHub could not be reached just now."
      : "Could not load GitHub data right now. Open the profile to see it live.";
    if (!hasStale) $("ghName").textContent = user;
  }

  function load() {
    var cached = readCache(), hasStale = !!(cached && cached.data);
    if (hasStale) render(cached.data);
    if (hasStale && Date.now() - cached.t < TTL) return;
    loadFresh().then(function (d) {
      $("ghMsg").textContent = "";
      writeCache(d);
      render(d);
    }).catch(function () { fail(hasStale); });
  }

  // Fetch only when the section is about to scroll into view
  var started = false;
  function go() { if (!started) { started = true; load(); } }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); go(); }
    }, { rootMargin: "600px" });
    io.observe(section);
  } else go();
})();
