/* Profile + Social admin: about paragraph, contact details (Profile tab) and social links (Social tab).
 * Both save to the same server record (admin-api.js); each form sends the other form's saved values
 * unchanged, so saving one never wipes the other. The site reads them on every page load. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  if (!window.ADMIN) return;

  var PROFILE = {
    about: "#profAbout", phone: "#profPhone", email: "#profEmail", address: "#profAddress"
  };
  var SOCIAL = {
    facebook: "#profFacebook", linkedin: "#profLinkedin", whatsapp: "#profWhatsapp",
    discord: "#profDiscord", instagram: "#profInstagram"
  };

  function say(sel, text, kind) {
    var el = $(sel);
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }

  function fill(c) {
    var p = (c && c.profile) || {};
    [PROFILE, SOCIAL].forEach(function (map) {
      Object.keys(map).forEach(function (k) { var el = $(map[k]); if (el) el.value = p[k] || ""; });
    });
  }

  function wire(formSel, map, msgSel, okText) {
    var form = $(formSel);
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var saved = (ADMIN.data && ADMIN.data.profile) || {};
      var p = {};
      Object.keys(PROFILE).concat(Object.keys(SOCIAL)).forEach(function (k) { p[k] = saved[k] || ""; });
      Object.keys(map).forEach(function (k) { p[k] = $(map[k]).value.trim(); });
      if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return say(msgSel, "That email address doesn't look right.", "error");
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      say(msgSel, "Saving...");
      ADMIN.api("admin/profile", "POST", p).then(function (c) {
        ADMIN.set(c);
        say(msgSel, okText, "ok");
      }, function (err) { say(msgSel, err.message, "error"); }).then(function () { btn.disabled = false; });
    });
  }

  wire("#profForm", PROFILE, "#profMsg", "Profile saved. Your site is updated.");
  wire("#socialForm", SOCIAL, "#socMsg", "Social links saved. Your site is updated.");

  // Fill the forms when the data first arrives (and after a save, which returns the cleaned values)
  ADMIN.on(fill);
})();
