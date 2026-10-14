/* Feedback section (public site): the submit form and the sliding showcase.
 * Data comes from fb-store.js (the server, api/index.js). */
(function () {
  "use strict";
  var SLIDE_MS = 7000;
  var MAX_LEN = 1000;
  var RATE_KEY = "portfolio-feedback-sent";
  var SEND_LIMIT = 5, SEND_WINDOW = 3600 * 1000;      // at most 5 messages per hour from one browser
  var RATE_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

  var $ = function (id) { return document.getElementById(id); };
  var form = $("fbForm"), slidesEl = $("fbSlides");
  if (!form || !slidesEl || !window.FBStore) return;
  var S = FBStore;

  var msgEl = $("fbMsg"), nameEl = $("fbName"), nameField = $("fbNameField"), statusEl = $("fbStatus");
  var sendBtn = $("fbSend"), doneEl = $("fbDone"), rateText = $("fbRateText");
  var board = slidesEl.closest(".fx-board");
  var forceMotion = false;
  try { forceMotion = localStorage.getItem("portfolio-motion") === "on"; } catch (e) { /* blocked */ }
  var reduce = !forceMotion && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function say(text, kind) { statusEl.textContent = text || ""; statusEl.className = "fx-status" + (kind ? " " + kind : ""); }
  function starText(n) { return new Array(n + 1).join("★") + new Array(6 - n).join("☆"); }
  function hue(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }

  /* =============== SLIDER =============== */
  var items = [], index = 0, dir = 1, slideEls = [], dotEls = [], hovering = false;

  function avatar(it) {
    var a = document.createElement("span");
    a.className = "fx-avatar";
    if (it.anonymous || !it.name) {
      a.classList.add("anon");
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    } else {
      var parts = it.name.split(/\s+/);
      a.textContent = ((parts[0] || "")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
      a.style.setProperty("--h", hue(it.name));
    }
    return a;
  }

  function build(list) {
    items = (list || []).filter(function (e) { return e && e.message; });
    slidesEl.textContent = "";
    $("fbDots").textContent = "";
    slideEls = []; dotEls = [];
    var has = items.length > 0;
    $("fbEmpty").hidden = has;
    $("fbShow").hidden = !has;
    $("fbNav").hidden = items.length < 2;
    $("fbSummary").hidden = !has;
    if (!has) return;

    var rated = items.filter(function (i) { return i.rating > 0; });
    if (rated.length) {
      var avg = rated.reduce(function (s, i) { return s + i.rating; }, 0) / rated.length;
      $("fbAvg").textContent = avg.toFixed(1);
      $("fbAvgStars").textContent = starText(Math.round(avg));
    } else { $("fbAvg").textContent = "–"; $("fbAvgStars").textContent = ""; }
    $("fbTotal").textContent = items.length + (items.length === 1 ? " review" : " reviews");

    items.forEach(function (it, i) {
      var fig = document.createElement("figure");
      fig.className = "fx-slide";
      if (it.rating) {
        var st = document.createElement("div");
        st.className = "fx-slide-stars";
        st.setAttribute("role", "img");
        st.setAttribute("aria-label", it.rating + " out of 5 stars");
        for (var k = 0; k < 5; k++) {
          var s = document.createElement("i");
          s.textContent = k < it.rating ? "★" : "☆";
          s.style.setProperty("--k", k);
          if (k >= it.rating) s.className = "off";
          st.append(s);
        }
        fig.append(st);
      }
      var q = document.createElement("blockquote");
      it.message.split(/\s+/).forEach(function (w, n) {
        if (n) q.append(" ");
        var sp = document.createElement("span");
        sp.className = "w";
        sp.textContent = w;                                  // textContent: visitor text can't inject HTML
        sp.style.setProperty("--i", Math.min(n, 60));
        q.append(sp);
      });
      var cap = document.createElement("figcaption");
      var who = document.createElement("span");
      who.className = "fx-who-txt";
      var nm = document.createElement("b");
      nm.textContent = it.anonymous || !it.name ? "Anonymous" : it.name;
      who.append(nm);
      if (it.role && !it.anonymous) { var r = document.createElement("span"); r.textContent = it.role; who.append(r); }
      cap.append(avatar(it), who);
      fig.append(q, cap);
      slidesEl.append(fig);
      slideEls.push(fig);

      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Show feedback " + (i + 1) + " of " + items.length);
      dot.addEventListener("click", function () { go(i, i > index ? 1 : -1); });
      $("fbDots").append(dot);
      dotEls.push(dot);
    });
    index = Math.min(index, items.length - 1);
    go(index, 1, true);
  }

  function restartBar() {
    var bar = $("fbBar");
    bar.style.animation = "none";
    void bar.offsetWidth;                                    // restart the CSS animation
    bar.style.animation = "";
  }

  function go(i, d, first) {
    if (!items.length) return;
    dir = d || 1;
    index = (i + items.length) % items.length;
    slidesEl.dataset.dir = dir > 0 ? "next" : "prev";
    slideEls.forEach(function (s, k) {
      var on = k === index;
      if (!on && s.classList.contains("on")) { s.classList.add("leaving"); setTimeout(function () { s.classList.remove("leaving"); }, 700); }
      s.classList.toggle("on", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
    });
    dotEls.forEach(function (b, k) { if (k === index) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    $("fbCounter").textContent = ("0" + (index + 1)).slice(-2) + " / " + ("0" + items.length).slice(-2);
    if (items.length > 1 && !reduce) restartBar();
  }

  // Autoplay: the progress bar's CSS animation ends -> next slide (pausing the animation pauses the slider)
  $("fbBar").addEventListener("animationend", function () { if (items.length > 1) go(index + 1, 1); });
  $("fbBar").style.setProperty("--ms", SLIDE_MS + "ms");
  $("fbPrev").addEventListener("click", function () { go(index - 1, -1); });
  $("fbNext").addEventListener("click", function () { go(index + 1, 1); });
  function setPaused(p) { board.classList.toggle("paused", p || document.hidden); }
  board.addEventListener("pointerenter", function () { hovering = true; setPaused(true); });
  board.addEventListener("pointerleave", function () { hovering = false; setPaused(false); });
  board.addEventListener("focusin", function () { setPaused(true); });
  board.addEventListener("focusout", function () { if (!hovering) setPaused(false); });
  document.addEventListener("visibilitychange", function () { setPaused(hovering); });
  board.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") go(index - 1, -1);
    else if (e.key === "ArrowRight") go(index + 1, 1);
  });

  // Swipe on touch screens
  var sx = null;
  slidesEl.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") sx = e.clientX; });
  slidesEl.addEventListener("pointerup", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
  slidesEl.addEventListener("pointercancel", function () { sx = null; });

  var lastSig = null;                                       // what the slider currently shows (so a refresh only rebuilds on a real change)
  function load() {
    S.publicList().then(function (list) {
      var sig = JSON.stringify(list);
      if (sig === lastSig) return;
      lastSig = sig;
      build(list);
    }, function () {
      if (lastSig === null) { lastSig = "error"; build([]); }  // first load failed: show the empty state; later failures keep what is shown
    });
  }
  setInterval(function () { if (!document.hidden) load(); }, 120000);

  /* =============== FORM =============== */
  var countEl = $("fbCount");
  function updateCount() { countEl.textContent = msgEl.value.length + " / " + MAX_LEN; }
  msgEl.addEventListener("input", updateCount);
  updateCount();

  // star label under the stars
  var rateInputs = form.querySelectorAll('input[name="rating"]');
  Array.prototype.forEach.call(rateInputs, function (r) {
    r.addEventListener("change", function () { rateText.textContent = RATE_WORDS[Number(r.value)] || ""; rateText.classList.add("set"); });
  });

  // anonymous radio: hide + disable the name box
  function syncIdentity() {
    var anon = form.querySelector('input[name="identity"]:checked').value === "anon";
    nameField.classList.toggle("off", anon);
    nameEl.disabled = anon;
    if (anon) nameEl.value = "";
  }
  Array.prototype.forEach.call(form.querySelectorAll('input[name="identity"]'), function (r) { r.addEventListener("change", syncIdentity); });
  syncIdentity();

  function recentSends() {
    var now = Date.now();
    try { var a = JSON.parse(localStorage.getItem(RATE_KEY)); return (Array.isArray(a) ? a : []).filter(function (t) { return now - t < SEND_WINDOW; }); }
    catch (e) { return []; }
  }

  function resetForm() {
    form.reset(); syncIdentity(); updateCount();
    rateText.textContent = "Tap a star"; rateText.classList.remove("set");
    say("");
  }
  $("fbAgain").addEventListener("click", function () {
    doneEl.hidden = true; form.classList.remove("sent"); resetForm(); msgEl.focus();
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    say("");
    if (form.elements.website && form.elements.website.value) {      // honeypot: bots fill this hidden field
      resetForm(); doneEl.hidden = false; form.classList.add("sent"); return;
    }
    var checked = form.querySelector('input[name="rating"]:checked');
    var anon = form.querySelector('input[name="identity"]:checked').value === "anon";
    var name = S.clean(nameEl.value, 60), message = S.clean(msgEl.value, MAX_LEN);
    if (!checked) return say("Please choose a star rating.", "error");
    if (!anon && !name) { nameEl.focus(); return say("Please enter your name, or choose to post anonymously.", "error"); }
    if (!message) { msgEl.focus(); return say("Please write a few words first.", "error"); }
    var sends = recentSends();
    if (sends.length >= SEND_LIMIT) return say("Thanks! You've sent a few messages already. Please try again later.", "error");

    sendBtn.disabled = true; form.classList.add("busy");
    S.submit({ name: name, anonymous: anon, rating: Number(checked.value), message: message }).then(function () {
      sends.push(Date.now());
      try { localStorage.setItem(RATE_KEY, JSON.stringify(sends)); } catch (e) { /* blocked */ }
      resetForm();
      form.classList.add("sent");
      doneEl.hidden = false;
    }, function (err) {
      say(err && err.message ? err.message : "Couldn't send your feedback. Please try again.", "error");
    }).then(function () { sendBtn.disabled = false; form.classList.remove("busy"); });
  });

  load();
})();