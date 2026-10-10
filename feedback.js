/* Feedback section. LEFT: the form. RIGHT: the slider (second half of this file).
 *
 * Form: two ways to deliver, chosen in index.html on <form id="fbForm">:
 *   data-endpoint  an https form service (Formspree, Web3Forms, ...). The message is POSTed as
 *                  JSON and lands in your inbox. data-access-key is added for Web3Forms.
 *   (empty)        the visitor's email app opens with the message filled in, addressed to
 *                  data-email. No setup, but the visitor has to press send themselves. */
(function () {
  "use strict";
  var form = document.getElementById("fbForm");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var status = $("fbStatus"), btn = $("fbSend"), msg = $("fbMsg"), count = $("fbCount");
  var endpoint = (form.dataset.endpoint || "").trim();
  var key = (form.dataset.accessKey || "").trim();
  var to = (form.dataset.email || "").trim();
  var LAST = "portfolio-feedback-last", COOLDOWN = 30000;
  var sending = false;

  if (endpoint && !/^(https:\/\/|\/(?!\/))/i.test(endpoint)) endpoint = "";   // https URL, or a path on this site (/api/feedback)

  function say(text, kind) {
    status.textContent = text || "";
    status.className = "fb-status" + (kind ? " " + kind : "");
  }
  function lastSent() { try { return Number(localStorage.getItem(LAST)) || 0; } catch (e) { return 0; } }
  function markSent() { try { localStorage.setItem(LAST, String(Date.now())); } catch (e) { /* blocked */ } }
  function done(text) {
    form.reset();
    count.textContent = "0 / 1000";
    markSent();
    say(text, "ok");
  }

  msg.addEventListener("input", function () { count.textContent = msg.value.length + " / 1000"; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (form.website.value) return done("Thank you!");            // honeypot: bots fill the hidden field
    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      rating: (form.querySelector('input[name="rating"]:checked') || {}).value || "",
      message: msg.value.trim()
    };
    if (!data.message) { say("Please write a few words first.", "error"); return msg.focus(); }
    if (data.email && !form.email.checkValidity()) { say("That email address doesn't look right.", "error"); return form.email.focus(); }
    if (Date.now() - lastSent() < COOLDOWN) return say("Thanks! Please wait a moment before sending another.", "error");

    if (!endpoint) {
      var body = (data.rating ? "Rating: " + data.rating + "/5\n" : "") +
        (data.name ? "Name: " + data.name + "\n" : "") +
        (data.email ? "Email: " + data.email + "\n" : "") + "\n" + data.message;
      if (!to) return say("Feedback isn't set up yet.", "error");
      location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Portfolio feedback") + "&body=" + encodeURIComponent(body);
      return done("Your email app should open with the message ready. Press send there to deliver it.");
    }

    sending = true;
    btn.disabled = true;
    say("Sending...");
    var payload = { name: data.name, email: data.email, rating: data.rating, message: data.message, _subject: "Portfolio feedback" };
    if (key) payload.access_key = key;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok) return done("Thank you! Your feedback was sent. It will appear on the right once I have approved it.");
      return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.error || "");
        e.safe = !!j.error;                       // a message written by our own server
        throw e;
      });
    }).catch(function (err) {
      say(err && err.safe ? err.message : "Couldn't send that. Please try again in a moment.", "error");
    }).then(function () {
      sending = false;
      btn.disabled = false;
    });
  });
})();

/* ---------- Slider: feedback kept in the admin panel, sliding by itself ---------- */
(function () {
  "use strict";
  var FEEDBACK_API = "/api/feedback";        // accepted feedback, kept on the server (see api/)
  var FEEDBACK_URL = "feedback.json";        // fallback when the API is not available (e.g. a local preview)
  var INTERVAL = 2500;                       // ms each slide stays
  var $ = function (id) { return document.getElementById(id); };
  var board = $("fbShow"), slidesEl = $("fbSlides"), dotsEl = $("fbDots"), emptyEl = $("fbEmpty"), nav = $("fbNav");
  var section = $("feedback");
  if (!board || !slidesEl || !section) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = [], slides = [], dots = [], idx = 0, timer = 0, paused = false, inView = false;

  function normalize(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (f) {
      if (!f || f.visible === false) return;
      var name = String(f.name || "").trim().slice(0, 60);
      var message = String(f.message || "").trim().slice(0, 300);
      if (!name || !message) return;
      out.push({
        name: name,
        role: String(f.role || "").trim().slice(0, 60),
        rating: Math.max(0, Math.min(5, Math.round(Number(f.rating) || 0))),
        message: message
      });
    });
    return out.slice(0, 50);
  }

  function show(i) {
    if (!slides.length) return;
    idx = (i + slides.length) % slides.length;
    slides.forEach(function (s, k) {
      s.classList.toggle("on", k === idx);
      s.setAttribute("aria-hidden", k === idx ? "false" : "true");
    });
    dots.forEach(function (d, k) { d.setAttribute("aria-current", k === idx ? "true" : "false"); });
  }

  function restart() {
    clearInterval(timer);
    timer = 0;
    if (reduce || items.length < 2) return;
    timer = setInterval(function () {
      if (!paused && inView && !document.hidden) show(idx + 1);
    }, INTERVAL);
  }
  function go(i) { show(i); restart(); }       // manual move: give the new slide its full time

  function build(list) {
    items = normalize(list);
    slidesEl.textContent = "";
    dotsEl.textContent = "";
    slides = []; dots = [];
    board.hidden = items.length === 0;
    emptyEl.hidden = items.length > 0;
    nav.hidden = items.length < 2;
    items.forEach(function (it, i) {
      var fig = document.createElement("figure");
      fig.className = "fb-slide";
      if (it.rating) {
        var st = document.createElement("div");
        st.className = "fb-slide-stars";
        st.setAttribute("role", "img");
        st.setAttribute("aria-label", it.rating + " out of 5 stars");
        st.textContent = "\u2605".repeat(it.rating) + "\u2606".repeat(5 - it.rating);
        fig.append(st);
      }
      var bq = document.createElement("blockquote");
      var p = document.createElement("p");
      p.textContent = it.message;                 // textContent: feedback text can never inject HTML
      bq.append(p);
      var cap = document.createElement("figcaption");
      var b = document.createElement("b");
      b.textContent = it.name;
      cap.append(b);
      if (it.role) { var r = document.createElement("span"); r.textContent = it.role; cap.append(r); }
      fig.append(bq, cap);
      slidesEl.append(fig);
      slides.push(fig);

      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Show feedback " + (i + 1) + " of " + items.length);
      dot.addEventListener("click", function () { go(i); });
      dotsEl.append(dot);
      dots.push(dot);
    });
    show(Math.min(idx, Math.max(0, slides.length - 1)));
    restart();
  }

  function getList(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (list) {
      if (!Array.isArray(list)) throw new Error("not a list");
      return list;
    });
  }
  function load() {
    getList(FEEDBACK_API)
      .catch(function () { return getList(FEEDBACK_URL); })   // no API here: a published feedback.json
      .then(build, function () { build([]); });               // nothing at all: show the invitation
  }

  $("fbPrev").addEventListener("click", function () { go(idx - 1); });
  $("fbNext").addEventListener("click", function () { go(idx + 1); });

  // Stand still while the visitor hovers or focuses the slider, so they can finish reading
  var area = board.closest(".fb-board") || board;
  area.addEventListener("pointerenter", function () { paused = true; });
  area.addEventListener("pointerleave", function () { paused = false; });
  area.addEventListener("focusin", function () { paused = true; });
  area.addEventListener("focusout", function () { paused = false; });

  new IntersectionObserver(function (e) { inView = e[0].isIntersecting; }, { threshold: 0.2 }).observe(section);

  load();
})();
