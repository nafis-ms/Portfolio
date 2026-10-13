/* Feedback data layer for the public site (the slider and the submit form).
 * Feedback lives on the server (api/index.js). Visitors can only submit new feedback, which lands in
 * "pending", and read the accepted entries. Everything else is done from the admin panel.
 *
 * Entry shape used everywhere: { id, name, role, anonymous, rating 0-5, message,
 *   status: "pending"|"accepted"|"rejected", source: "visitor"|"admin", createdAt (ms), order }  */
(function () {
  "use strict";
  var API = "/api/index?p=feedback";
  var STATUSES = ["pending", "accepted", "rejected"];

  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  }
  function normalize(e) {
    return {
      id: String(e.id),
      name: clean(e.name, 60), role: clean(e.role, 60),
      anonymous: !!e.anonymous,
      rating: Math.max(0, Math.min(5, Math.round(Number(e.rating) || 0))),
      message: clean(e.message, 1000),
      status: STATUSES.indexOf(e.status) === -1 ? "pending" : e.status,
      source: e.source === "admin" ? "admin" : "visitor",
      createdAt: Number(e.createdAt) || 0,
      order: Number(e.order) || 0
    };
  }
  function byOrder(a, b) { return a.order - b.order || a.createdAt - b.createdAt; }

  function fail(res) {
    return res.json().catch(function () { return {}; }).then(function (j) {
      throw new Error(j.error || (res.status === 429 ? "Please wait a moment before sending again." : "Couldn't send your feedback. Please try again."));
    });
  }

  window.FBStore = {
    clean: clean,
    normalize: normalize,
    byOrder: byOrder,
    publicList: function () {
      return fetch(API, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (rows) { return (Array.isArray(rows) ? rows : []).map(normalize); });
    },
    submit: function (e) {
      return fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: e.anonymous ? "" : e.name, anonymous: !!e.anonymous, rating: e.rating, message: e.message })
      }).then(function (r) { if (!r.ok) return fail(r); }, function () {
        throw new Error("Couldn't reach the server. Check your connection.");
      });
    }
  };
})();
