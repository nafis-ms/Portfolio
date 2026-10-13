/* Profile admin: about paragraph, contact details and social links.
 * Saved on the server (admin-api.js); the site reads them on every page load. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var form = $("#profForm");
  if (!form || !window.ADMIN) return;

  var FIELDS = {
    about: "#profAbout", phone: "#profPhone", email: "#profEmail",
    address: "#profAddress", facebook: "#profFacebook", linkedin: "#profLinkedin",
    whatsapp: "#profWhatsapp", discord: "#profDiscord", instagram: "#profInstagram"
  };

  function say(text, kind) {
    var el = $("#profMsg");
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }

  function fill(c) {
    var p = (c && c.profile) || {};
    Object.keys(FIELDS).forEach(function (k) { $(FIELDS[k]).value = p[k] || ""; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var p = {};
    Object.keys(FIELDS).forEach(function (k) { p[k] = $(FIELDS[k]).value.trim(); });
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return say("That email address doesn't look right.", "error");
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    say("Saving...");
    ADMIN.api("admin/profile", "POST", p).then(function (c) {
      ADMIN.set(c);
      say("Profile saved. Your site is updated.", "ok");
    }, function (err) { say(err.message, "error"); }).then(function () { btn.disabled = false; });
  });

  // Fill the form when the data first arrives (and after a save, which returns the cleaned values)
  ADMIN.on(fill);
})();