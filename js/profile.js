/* Public site: fills the About paragraph, the contact boxes and the social links
 * from the admin panel's Profile tab.
 * Source order: 1) profile saved in this browser (store.js), 2) a published profile.json. */
(function () {
  "use strict";
  var PROFILE_URL = "profile.json";
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function httpUrl(raw) {
    raw = String(raw || "").trim();
    if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
    try {
      var u = new URL(raw);
      return /^https?:$/.test(u.protocol) ? u.href : "";
    } catch (e) { return ""; }
  }
  function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

  function apply(p) {
    p = p && typeof p === "object" ? p : {};

    // About paragraph (empty = keep the default text already in the page)
    var about = str(p.about, 1200);
    if (about && window.setAbout) window.setAbout(about);

    // Contact boxes
    var email = str(p.email, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = "";
    var phone = str(p.phone, 40), address = str(p.address, 160);
    var vals = { phone: phone, email: email, address: address };
    var any = false;
    document.querySelectorAll(".info-box").forEach(function (box) {
      var v = vals[box.dataset.field], val = $(".info-val", box);
      box.hidden = !v;
      if (!v) return;
      any = true;
      val.textContent = v;
      if (box.dataset.field === "phone") val.href = "tel:" + v.replace(/[^\d+]/g, "");
      if (box.dataset.field === "email") val.href = "mailto:" + email;
    });
    $("#infoGrid").hidden = !any;

    // "Email Me" button in the contact section follows the admin's email
    if (email) {
      var btn = document.querySelector("#contact a.contact-btn");
      if (btn) btn.href = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(email) + "&su=" + encodeURIComponent("Hello Musbitul");
    }

    // Social links: a card shows only when its link is a valid http(s) address
    var links = { facebook: httpUrl(p.facebook), linkedin: httpUrl(p.linkedin) };
    var anySocial = false;
    document.querySelectorAll(".social-card").forEach(function (card) {
      var href = links[card.dataset.net];
      card.hidden = !href;
      if (href) { card.href = href; anySocial = true; }
    });
    $("#social").hidden = !anySocial;
    var navSocial = document.querySelector('.gnav-links a[href="#social"]');
    if (navSocial) navSocial.parentElement.hidden = !anySocial;
    document.dispatchEvent(new CustomEvent("profile:applied"));
  }

  function load() {
    if (window.PF && PF.profile.has()) return apply(PF.profile.get());
    fetch(PROFILE_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(apply, function () { apply({}); });   // missing/invalid file = defaults
  }

  addEventListener("storage", function (e) { if (window.PF && e.key === PF.PROFILE_KEY) load(); });
  load();
})();
