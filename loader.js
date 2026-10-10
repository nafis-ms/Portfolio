(function () {
  "use strict";

  var CONFIG = {
    bounces: 1.8,               // how many times each tile hops
    bounceTime: 1,          // seconds per hop (lower = faster)
    maxTime: 8000,            // ms after which it leaves even if something is still loading
    oncePerSession: false,    // true = only the first visit in a browser tab session
    background: document.documentElement.getAttribute("data-theme") === "light" ? "#f5f6fa" : "#0c0c0c",
    tiles: [
      { color: "#c4205c", tilt: -16, lift: 2.3 },   // crimson
      { color: "#5548e6", tilt: 13, lift: 1.7 },    // indigo
      { color: "#0b8a60", tilt: -9, lift: 1.1 }     // green
    ]
  };

  var SEEN_KEY = "portfolio-loader-seen";
  var root = document.documentElement;
  if (document.getElementById("ld")) return;

  if (CONFIG.oncePerSession) {
    try { if (sessionStorage.getItem(SEEN_KEY)) return; } catch (e) { /* storage blocked: just show it */ }
  }

  // Visit the site once with ?motion=on to play the full animations even when the device
  // is set to "reduce motion" (battery saver, Windows "show animations" off, iOS Reduce Motion).
  // ?motion=auto goes back to following the device. Stored in this browser only.
  try {
    var qm = new URLSearchParams(location.search).get("motion");
    if (qm === "on") localStorage.setItem("portfolio-motion", "on");
    else if (qm === "auto") localStorage.removeItem("portfolio-motion");
  } catch (e) { /* storage blocked */ }
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var START = 0.4, STAGGER = 0.12;   // seconds: when the first hop starts, and the gap between tiles
  var lastTile = START + (CONFIG.tiles.length - 1) * STAGGER;
  // stay at least until the last tile has finished its final bounce
  var minTime = reduce ? 600 : Math.ceil((lastTile + CONFIG.bounces * CONFIG.bounceTime + 0.15) * 1000);

  /* ---------- styles ---------- */
  var css = [
    "html.ld-lock{overflow:hidden}",
    ".ld{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;",
    "  background:var(--ld-bg);--u:clamp(34px,7vmin,58px);",
    "  transition:opacity .55s ease}",
    ".ld.is-out{opacity:0;pointer-events:none}",
    ".ld-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".ld-row{display:flex;align-items:flex-end;gap:calc(var(--u)*.7);height:var(--u)}",

    /* wrapper: pops in, and carries the exit so it never fights the hop */
    ".ld-tile{position:relative;width:var(--u);height:var(--u);transform-origin:50% 100%;",
    "  animation:ld-in .45s cubic-bezier(.2,.9,.3,1.2) backwards;animation-delay:calc(var(--i)*.1s)}",

    ".ld-body{position:absolute;inset:0;display:grid;place-items:center;",
    "  border-radius:calc(var(--u)*.2);background:var(--c);transform-origin:50% 100%;will-change:transform;",
    "  box-shadow:0 calc(var(--u)*.25) calc(var(--u)*.6) -.2em var(--c);",
    "  animation:ld-hop var(--d) cubic-bezier(.4,0,.2,1) var(--n) both;animation-delay:var(--delay)}",

    ".ld-star{width:46%;height:46%;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;",
    "  animation:ld-spin var(--d) ease-in-out var(--n) both;animation-delay:var(--delay)}",

    "@keyframes ld-in{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}",

    "@keyframes ld-hop{",
    "  0%,100%{transform:translateY(0) rotate(0) scale(1,1)}",
    "  14%{transform:translateY(0) rotate(0) scale(1.22,.78)}",
    "  32%{transform:translateY(calc(var(--u)*var(--lift)*-.55)) rotate(calc(var(--r)*.6)) scale(.72,1.6)}",
    "  50%{transform:translateY(calc(var(--u)*var(--lift)*-1)) rotate(var(--r)) scale(.9,1.12)}",
    "  70%{transform:translateY(calc(var(--u)*var(--lift)*-.3)) rotate(calc(var(--r)*.3)) scale(.78,1.5)}",
    "  82%{transform:translateY(0) rotate(0) scale(1.28,.72)}",
    "  91%{transform:translateY(0) rotate(0) scale(.95,1.06)}",
    "}",

    /* a 6-armed asterisk looks identical every 60 degrees, so the loop is seamless */
    "@keyframes ld-spin{0%,14%{transform:rotate(0)}70%,100%{transform:rotate(60deg)}}",

    /* exit: tiles squash, then shoot up and stretch away; the overlay fades after */
    ".ld.is-leaving .ld-tile{animation:ld-exit .8s cubic-bezier(.55,0,.85,.35) forwards;",
    "  animation-delay:calc(var(--i)*.07s)}",
    "@keyframes ld-exit{",
    "  0%{transform:translateY(0) scale(1,1);opacity:1}",
    "  22%{transform:translateY(0) scale(1.2,.8);opacity:1}",
    "  100%{transform:translateY(-85vh) scale(.45,2.8);opacity:0}",
    "}",

    "@media (prefers-reduced-motion:reduce){",
    "  .ld-body,.ld-star{animation:none}",
    "  .ld-tile{animation:ld-pulse 1.2s ease-in-out infinite alternate}",
    "  .ld.is-leaving .ld-tile{animation:none}",
    "  @keyframes ld-pulse{from{opacity:.45}to{opacity:1}}",
    "}"
  ].join("\n");

  var style = document.createElement("style");
  style.id = "ld-style";
  style.textContent = css;
  (document.head || root).appendChild(style);

  /* ---------- markup ---------- */
  var ld = document.createElement("div");
  ld.id = "ld";
  ld.className = "ld";
  ld.setAttribute("role", "status");
  ld.style.setProperty("--ld-bg", CONFIG.background);
  ld.style.setProperty("--d", CONFIG.bounceTime + "s");
  ld.style.setProperty("--n", CONFIG.bounces);

  var sr = document.createElement("span");
  sr.className = "ld-sr";
  sr.textContent = "Loading";
  ld.appendChild(sr);

  var row = document.createElement("div");
  row.className = "ld-row";
  row.setAttribute("aria-hidden", "true");

  var STAR = '<svg class="ld-star" viewBox="0 0 24 24" focusable="false">' +
    '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>';

  CONFIG.tiles.forEach(function (t, i) {
    var tile = document.createElement("div");
    tile.className = "ld-tile";
    tile.style.setProperty("--i", i);
    tile.style.setProperty("--c", t.color);
    tile.style.setProperty("--r", t.tilt + "deg");
    tile.style.setProperty("--lift", t.lift);
    tile.style.setProperty("--delay", (START + i * STAGGER) + "s");   // hop starts right after the pop-in
    tile.innerHTML = '<div class="ld-body">' + STAR + "</div>";
    row.appendChild(tile);
  });
  ld.appendChild(row);

  root.classList.add("ld-lock");
  root.appendChild(ld);

  /* ---------- leave when the page is ready ---------- */
  var left = false;

  function remove() {
    root.classList.remove("ld-lock");
    if (ld.parentNode) ld.parentNode.removeChild(ld);
    if (style.parentNode) style.parentNode.removeChild(style);
  }

  function leave() {
    if (left) return;
    left = true;
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* blocked */ }
    if (reduce) {
      ld.classList.add("is-out");
      setTimeout(remove, 600);
      return;
    }
    ld.classList.add("is-leaving");
    setTimeout(function () { ld.classList.add("is-out"); }, 650);   // fade once the tiles are on their way
    setTimeout(remove, 1300);
  }

  var loaded = new Promise(function (resolve) {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", resolve, { once: true });
  });
  var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  var minimum = new Promise(function (resolve) { setTimeout(resolve, minTime); });

  Promise.all([loaded, fonts, minimum]).then(leave);
  setTimeout(leave, CONFIG.maxTime);                                // never trap the visitor

  // Back/forward cache restore: do not show a stale loader
  window.addEventListener("pageshow", function (e) { if (e.persisted) { left = true; remove(); } });
})();
