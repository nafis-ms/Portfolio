/* Public endpoint.
 *   GET  /api/feedback   the ACCEPTED feedback, for the slider on the site
 *   POST /api/feedback   a visitor sends feedback; it waits as "pending" for you to review */
"use strict";
const L = require("./_lib");

module.exports = L.wrap(async (req, res) => {
  if (req.method === "GET") {
    const list = (await L.loadAll()).filter((i) => i.status === "accepted").sort(L.byOrder).map(L.publicView);
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return L.send(res, 200, list);
  }

  if (req.method === "POST") {
    const b = await L.readBody(req);
    if (b.website) return L.send(res, 200, { ok: true });          // honeypot: bots fill this hidden field

    const message = L.clean(b.message, 1000);
    const email = L.clean(b.email, 120);
    if (!message) throw new L.HttpError(400, "Please write a few words first.");
    if (email && !L.validEmail(email)) throw new L.HttpError(400, "That email address doesn't look right.");

    if (!(await L.hit("portfolio:rl:" + L.ipHash(req), 5, 3600))) {
      throw new L.HttpError(429, "Thanks! You have sent a few messages already. Please try again later.");
    }
    const all = await L.loadAll();
    if (all.length >= L.MAX_ITEMS || all.filter((i) => i.status === "pending").length >= L.MAX_PENDING) {
      throw new L.HttpError(503, "The feedback inbox is full right now. Please try again later.");
    }

    const item = {
      id: require("crypto").randomBytes(6).toString("hex"),
      name: L.clean(b.name, 60),
      role: "",
      email,
      rating: L.cleanRating(b.rating),
      message,
      status: "pending",
      source: "visitor",
      createdAt: Date.now(),
      order: 0
    };
    await L.saveItems([item]);
    return L.send(res, 201, { ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  L.send(res, 405, { error: "Method not allowed." });
});
