/* Cinematic extras: scroll progress bar, scroll parallax on the About decorations,
 * and 3D tilt + cursor spotlight on cards. Skipped for "reduce motion". */
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
