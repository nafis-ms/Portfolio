/* Feedback section (public site). No server: everything uses the browser's localStorage.
 *
 *   SEND:   a visitor's feedback is saved as "pending" in this browser (store.js, PF.feedback).
 *           If the form has data-email, the visitor's mail app opens with the message ready to
 *           send, so it also reaches you. Remove data-email in index.html to skip that step.
 *   SHOW:   the slider shows the feedback you accepted in the admin panel. In the browser that
 *           uses the admin panel it reads localStorage; for every other visitor it reads the
 *           feedback.json that "Apply Changes" publishes next to index.html. */
(function () {
  "use strict";

  var FEEDBACK_URL = "feedback.json";
  var MANAGED_KEY = "portfolio-feedback-managed";   // set by the admin panel once you moderate feedback here
  var RATE_KEY = "portfolio-feedback-sent";
  var MAX_ITEMS = 500, MAX_PENDING = 200;
  var SEND_LIMIT = 5, SEND_WINDOW = 3600 * 1000;    // at most 5 messages per hour from one browser
  var SLIDE_MS = 7000;

  var $ = function (id) { return document.getElementById(id); };
  var form = $("fbForm"), slidesEl = $("fbSlides");
  if (!form || !slidesEl) return;

  var msgEl = $("fbMsg"), countEl = $("fbCount"), statusEl = $("fbStatus");
  var emptyEl = $("fbEmpty"), showEl = $("fbShow"), navEl = $("fbNav"), dotsEl = $("fbDots");
  var prevBtn = $("fbPrev"), nextBtn = $("fbNext");
  var board = slidesEl.closest(".fb-board") || showEl;

  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  }
  function validEmail(e) { return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function newId() { return Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }
  function statusOf(e) { return e.status || (e.visible === false ? "pending" : "accepted"); }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0); }
  function managed() {
    try { return localStorage.getItem(MANAGED_KEY) === "1"; } catch (e) { return false; }
  }
  function say(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "fb-status" + (kind ? " " + kind : "");
  }

  /* ---------- slider ---------- */
  var items = [], index = 0, last = 0, paused = false;
  var slideEls = [], dotEls = [];

  function normalize(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      var message = clean(e && e.message, 1000);
      if (!message) return;
      out.push({
        name: clean(e.name, 60) || "Anonymous",
        role: clean(e.role, 60),
        rating: Math.max(0, Math.min(5, Math.round(Number(e.rating) || 0))),
        message: message
      });
    });
    return out;
  }

  function go(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    slideEls.forEach(function (s, k) {
      s.classList.toggle("on", k === index);
      s.setAttribute("aria-hidden", k === index ? "false" : "true");
    });
    dotEls.forEach(function (d, k) {
      if (k === index) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
    });
    last = Date.now();
  }

  function show(list) {
    items = normalize(list);
    slidesEl.textContent = "";
    dotsEl.textContent = "";
    slideEls = [];
    dotEls = [];
    emptyEl.hidden = items.length > 0;
    showEl.hidden = items.length === 0;
    navEl.hidden = items.length < 2;

    items.forEach(function (it, i) {
      var fig = document.createElement("figure");
      fig.className = "fb-slide";
      if (it.rating) {
        var stars = document.createElement("div");
        stars.className = "fb-slide-stars";
        stars.setAttribute("role", "img");
        stars.setAttribute("aria-label", it.rating + " out of 5 stars");
        stars.textContent = new Array(it.rating + 1).join("★") + new Array(6 - it.rating).join("☆");
        fig.append(stars);
      }
      var q = document.createElement("blockquote");
      q.textContent = it.message;                        // textContent: visitor text can't inject HTML
      var cap = document.createElement("figcaption");
      var who = document.createElement("b");
      who.textContent = it.name;
      cap.append(who);
      if (it.role) {
        var role = document.createElement("span");
        role.textContent = it.role;
        cap.append(role);
      }
      fig.append(q, cap);
      slidesEl.append(fig);
      slideEls.push(fig);

      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Show feedback " + (i + 1) + " of " + items.length);
      dot.addEventListener("click", function () { go(i); });
      dotsEl.append(dot);
      dotEls.push(dot);
    });
    go(Math.min(index, Math.max(0, items.length - 1)));
  }

  function fromLocal() {
    var list = window.PF ? PF.feedback.all() : [];
    return list.filter(function (e) { return e && statusOf(e) === "accepted"; }).sort(byOrder);
  }

  function load() {
    // 1) feedback you moderated in the admin panel in this browser (store.js)
    if (window.PF && managed()) return show(fromLocal());
    // 2) otherwise a published feedback.json next to index.html
    fetch(FEEDBACK_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(show, function () { show([]); });            // missing/invalid file = nothing to show yet
  }

  prevBtn.addEventListener("click", function () { go(index - 1); });
  nextBtn.addEventListener("click", function () { go(index + 1); });
  board.addEventListener("pointerenter", function () { paused = true; });
  board.addEventListener("pointerleave", function () { paused = false; last = Date.now(); });
  board.addEventListener("focusin", function () { paused = true; });
  board.addEventListener("focusout", function () { paused = false; last = Date.now(); });
  if (!reduce) {
    setInterval(function () {
      if (items.length > 1 && !paused && !document.hidden && Date.now() - last >= SLIDE_MS) go(index + 1);
    }, 1000);
  }

  // Update live when the admin panel saves in another tab
  addEventListener("storage", function (e) {
    if (window.PF && (e.key === PF.FEEDBACK_KEY || e.key === MANAGED_KEY)) load();
  });

  /* ---------- form ---------- */
  function updateCount() { countEl.textContent = msgEl.value.length + " / " + (msgEl.maxLength > 0 ? msgEl.maxLength : 1000); }
  msgEl.addEventListener("input", updateCount);
  updateCount();

  function recentSends() {
    var now = Date.now();
    try {
      var a = JSON.parse(localStorage.getItem(RATE_KEY));
      return (Array.isArray(a) ? a : []).filter(function (t) { return now - t < SEND_WINDOW; });
    } catch (e) { return []; }
  }

  function openMail(to, e) {
    var lines = [];
    if (e.rating) lines.push("Rating: " + e.rating + "/5");
    if (e.name) lines.push("Name: " + e.name);
    if (e.email) lines.push("Email: " + e.email);
    lines.push("", e.message);
    window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Portfolio feedback") +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    say("");
    if (form.elements.website && form.elements.website.value) {   // honeypot: bots fill this hidden field
      form.reset();
      updateCount();
      return say("Thank you for your feedback!", "ok");
    }
    var message = clean(msgEl.value, 1000);
    var email = clean($("fbEmail").value, 120);
    if (!message) return say("Please write a few words first.", "error");
    if (email && !validEmail(email)) return say("That email address doesn't look right.", "error");
    if (!window.PF) return say("Saving is not available in this browser.", "error");

    var sends = recentSends();
    if (sends.length >= SEND_LIMIT) return say("Thanks! You have sent a few messages already. Please try again later.", "error");

    var list = PF.feedback.all();
    var pending = list.filter(function (e) { return e && statusOf(e) === "pending"; }).length;
    if (list.length >= MAX_ITEMS || pending >= MAX_PENDING) return say("The feedback inbox is full right now. Please try again later.", "error");

    var checked = form.querySelector('input[name="rating"]:checked');
    var entry = {
      id: newId(),
      name: clean($("fbName").value, 60),
      role: "",
      email: email,
      rating: checked ? Math.max(0, Math.min(5, Math.round(Number(checked.value) || 0))) : 0,
      message: message,
      status: "pending",
      source: "visitor",
      createdAt: Date.now(),
      order: 0
    };
    try {
      PF.feedback.save(list.concat(entry));
    } catch (err) {
      return say("Could not save your feedback: this browser's storage is full.", "error");
    }
    sends.push(Date.now());
    try { localStorage.setItem(RATE_KEY, JSON.stringify(sends)); } catch (err) { /* blocked */ }

    var to = (form.dataset.email || "").trim();
    form.reset();
    updateCount();
    if (to) {
      say("Thank you! Press send in your mail app so your feedback reaches me.", "ok");
      openMail(to, entry);
    } else {
      say("Thank you! Your feedback was saved and will appear once it is approved.", "ok");
    }
    if (window.PF && managed()) load();
  });

  load();
})();
