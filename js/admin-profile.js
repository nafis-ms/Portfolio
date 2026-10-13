/* Profile admin: about paragraph, contact details and social links.
 * Saved in this browser (store.js) and published as profile.json. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var form = $("#profForm");
  if (!form || !window.PF) return;

  var FIELDS = {
    about: "#profAbout", phone: "#profPhone", email: "#profEmail",
    address: "#profAddress", facebook: "#profFacebook", linkedin: "#profLinkedin"
  };

  function say(text, kind) {
    var el = $("#profMsg");
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function httpUrl(raw) {
    raw = String(raw || "").trim();
    if (!raw) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
    try { var u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; }
  }

  function fill() {
    var p = PF.profile.get() || {};
    Object.keys(FIELDS).forEach(function (k) { $(FIELDS[k]).value = p[k] || ""; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var p = {};
    Object.keys(FIELDS).forEach(function (k) { p[k] = $(FIELDS[k]).value.trim(); });
    var email = p.email;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("That email address doesn't look right.", "error");
    var fb = httpUrl(p.facebook), li = httpUrl(p.linkedin);
    if (fb === null) return say("The Facebook link isn't a valid web address.", "error");
    if (li === null) return say("The LinkedIn link isn't a valid web address.", "error");
    p.facebook = fb; p.linkedin = li;
    try { PF.profile.save(p); } catch (err) { return say("Couldn't save: browser storage is full.", "error"); }
    fill();
    say("Profile saved. Apply Changes to publish it.", "ok");
  });

  fill();
})();
