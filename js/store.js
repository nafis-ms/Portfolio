/* Shared data layer for the site (script.js) and the admin panel (admin.js).
 * Everything is kept in this browser's localStorage, so no server is needed. */
(function () {
  var PROJECTS_KEY = "portfolio-projects";
  var ADMIN_KEY = "portfolio-admin";
  var CV_KEY = "portfolio-cv";
  var SKILLS_KEY = "portfolio-skills";
  var FEEDBACK_KEY = "portfolio-feedback";
  var PROFILE_KEY = "portfolio-profile";

  function readFeedback() {
    try {
      var list = JSON.parse(localStorage.getItem(FEEDBACK_KEY));
      return Array.isArray(list) ? list : null;
    } catch (e) {
      return null;
    }
  }

  function readProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      return p && typeof p === "object" && !Array.isArray(p) ? p : null;
    } catch (e) {
      return null;
    }
  }

  function readSkills() {
    try {
      var list = JSON.parse(localStorage.getItem(SKILLS_KEY));
      return Array.isArray(list) ? list : null;
    } catch (e) {
      return null;
    }
  }

  function readCv() {
    try {
      var cv = JSON.parse(localStorage.getItem(CV_KEY));
      return cv && typeof cv.data === "string" && /^data:application\/pdf;base64,/.test(cv.data) ? cv : null;
    } catch (e) {
      return null;
    }
  }

  function read() {
    try {
      var list = JSON.parse(localStorage.getItem(PROJECTS_KEY));
      return Array.isArray(list) ? list : null;
    } catch (e) {
      return null;
    }
  }

  function toHex(buf) {
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); })
      .join("");
  }

  window.PF = {
    KEY: PROJECTS_KEY,
    ADMIN_KEY: ADMIN_KEY,
    CV_KEY: CV_KEY,
    SKILLS_KEY: SKILLS_KEY,
    FEEDBACK_KEY: FEEDBACK_KEY,
    PROFILE_KEY: PROFILE_KEY,
    // Profile: { about, phone, address, email, facebook, linkedin } (all strings, all optional)
    profile: {
      get: readProfile,
      has: function () { return readProfile() !== null; }, // false until the admin saves once
      save: function (p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } // throws if storage is full
    },
    // Feedback: [{ id, name, role, rating (0-5), message, visible }] in display order
    feedback: {
      all: function () { return readFeedback() || []; },
      has: function () { return readFeedback() !== null; }, // false until the admin saves once
      save: function (list) { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list)); } // throws if storage is full
    },
    // Skills: [{ id, name, logo, category, size, visible }] in display order
    skills: {
      all: function () { return readSkills() || []; },
      has: function () { return readSkills() !== null; }, // false until the admin saves once
      save: function (list) { localStorage.setItem(SKILLS_KEY, JSON.stringify(list)); } // throws if storage is full
    },
    cv: {
      get: readCv, // { name, data } or null
      save: function (cv) { localStorage.setItem(CV_KEY, JSON.stringify(cv)); }, // throws if storage is full
      clear: function () { localStorage.removeItem(CV_KEY); }
    },
    projects: {
      all: function () { return read() || []; },
      has: function () { return read() !== null; }, // false until the admin saves once
      save: function (list) { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } // throws if storage is full
    },
    salt: function () {
      return toHex(crypto.getRandomValues(new Uint8Array(16)));
    },
    hash: function (text, salt) {
      if (!window.crypto || !crypto.subtle) {
        return Promise.reject(new Error("This browser can't hash passwords here. Open the site with Live Server or http://localhost."));
      }
      return crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(salt + ":" + text))
        .then(toHex);
    }
  };
})();