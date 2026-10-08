/* Shared data layer for the site (script.js) and the admin panel (admin.js).
 * Everything is kept in this browser's localStorage, so no server is needed. */
(function () {
  var PROJECTS_KEY = "portfolio-projects";
  var ADMIN_KEY = "portfolio-admin";

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
