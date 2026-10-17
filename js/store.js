/* Data layer for the public site.
 * Everything you manage in the admin panel is saved on the server (api/index.js) and arrives
 * with the page as window.SITE, from <script src="/api/index?p=content"> in index.html.
 * If that script can't load (for example the page is opened as a plain file), every list is empty. */
(function () {
  "use strict";
  var site = window.SITE && typeof window.SITE === "object" ? window.SITE : {};
  function list(v) { return Array.isArray(v) ? v : []; }
  if (!window.SITE) console.warn("[portfolio] /api/index?p=content did not load, so projects, skills and the CV are empty. The API only runs on Vercel (or `vercel dev`); see README.md.");

  window.PF = {
    // Profile: { about, phone, address, email, facebook, linkedin, whatsapp, discord, instagram } (all strings, all optional)
    profile: { get: function () { return site.profile && typeof site.profile === "object" ? site.profile : {}; } },
    // Skills: [{ id, name, logo, category, size, visible }] in display order
    skills: { all: function () { return list(site.skills); } },
    // Projects: [{ id, title, url, image, status }]  status: online | offline | local | construction
    projects: { all: function () { return list(site.projects); } },
    // CV: { name, url } or null
    cv: { get: function () { return site.cv && typeof site.cv.url === "string" ? site.cv : null; } }
  };
})();
