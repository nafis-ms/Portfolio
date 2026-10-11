/* Theme switcher: Dark Mode (default) and Light Mode.
 * The saved choice is applied before first paint by the small script in <head>;
 * this file wires the header button, saves the choice and keeps tabs in sync. */
(function () {
  "use strict";
  var KEY = "portfolio-theme";
  var root = document.documentElement;
  var btns = document.querySelectorAll(".theme-toggle");
  var meta = document.getElementById("metaTheme");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fadeTimer = 0;

  function current() { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; }

  function paint(theme) {
    root.setAttribute("data-theme", theme);
    if (meta) meta.setAttribute("content", theme === "light" ? "#f5f6fa" : "#0c0c0c");
    var next = theme === "light" ? "dark" : "light";
    var label = "Switch to " + next + " mode";
    btns.forEach(function (b) {
      b.setAttribute("aria-label", label);
      b.setAttribute("title", label);
      b.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  }

  function apply(theme, save) {
    if (!reduce) {                       // short, smooth colour fade
      root.classList.add("theme-switching");
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { root.classList.remove("theme-switching"); }, 450);
    }
    paint(theme);
    if (save) { try { localStorage.setItem(KEY, theme); } catch (e) { /* storage blocked */ } }
  }

  paint(current());
  btns.forEach(function (b) {
    b.addEventListener("click", function () { apply(current() === "light" ? "dark" : "light", true); });
  });

  // Keep other open tabs in step
  addEventListener("storage", function (e) {
    if (e.key === KEY) apply(e.newValue === "light" ? "light" : "dark", false);
  });
})();