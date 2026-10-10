/* Admin endpoint (needs the x-admin-key header).
 *   GET  /api/admin-feedback          every entry (pending, accepted, rejected) with emails
 *   POST /api/admin-feedback          { action, id, ... } where action is one of:
 *        accept   pending/rejected -> accepted (shown in the slider)
 *        reject   -> rejected (kept in the Rejected list)
 *        pending  -> back to pending (also "unpublish")
 *        delete   remove for good
 *        update   edit name, role, rating, message
 *        add      you write one yourself: it is accepted straight away
 *        move     { id, dir: -1 | 1 } reorder inside the slider
 * Every POST answers with the full, fresh list. */
"use strict";
const L = require("./_lib");

const STATUS = { accept: "accepted", reject: "rejected", pending: "pending" };

function tooLong(msg) {
  return new L.HttpError(400, "This feedback is " + msg.length + " characters, but the slider shows up to " + L.SLIDER_MAX + ". Edit it shorter first (Edit button), then accept it.");
}

module.exports = L.wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return L.send(res, 405, { error: "Method not allowed." });
  }
  await L.requireAdmin(req);

  if (req.method === "GET") {
    return L.send(res, 200, { items: (await L.loadAll()).sort((a, b) => b.createdAt - a.createdAt) });
  }

  const b = await L.readBody(req);
  const all = await L.loadAll();
  const find = () => {
    const it = all.find((x) => x.id === String(b.id || ""));
    if (!it) throw new L.HttpError(404, "That feedback no longer exists. Refresh the list.");
    return it;
  };
  const nextOrder = () => all.reduce((m, i) => (i.status === "accepted" ? Math.max(m, i.order || 0) : m), 0) + 1;
  const changed = [];

  switch (b.action) {
    case "accept": {
      const it = find();
      if (it.message.length > L.SLIDER_MAX) throw tooLong(it.message);
      if (it.status !== "accepted") { it.status = "accepted"; it.order = nextOrder(); changed.push(it); }
      break;
    }
    case "reject":
    case "pending": {
      const it = find();
      if (it.status !== STATUS[b.action]) { it.status = STATUS[b.action]; it.order = 0; changed.push(it); }
      break;
    }
    case "delete": {
      const it = find();
      await L.redis(["HDEL", L.HASH, it.id]);
      all.splice(all.indexOf(it), 1);
      break;
    }
    case "update": {
      const it = find();
      const name = L.clean(b.name, 60), message = L.clean(b.message, 1000);
      if (!message) throw new L.HttpError(400, "Enter the feedback text.");
      if (it.status === "accepted" && message.length > L.SLIDER_MAX) throw tooLong(message);
      it.name = name; it.role = L.clean(b.role, 60); it.rating = L.cleanRating(b.rating); it.message = message;
      changed.push(it);
      break;
    }
    case "add": {
      const name = L.clean(b.name, 60), message = L.clean(b.message, 1000);
      if (!name) throw new L.HttpError(400, "Enter a name.");
      if (!message) throw new L.HttpError(400, "Enter the feedback text.");
      if (message.length > L.SLIDER_MAX) throw tooLong(message);
      if (all.length >= L.MAX_ITEMS) throw new L.HttpError(400, "Limit of " + L.MAX_ITEMS + " entries reached. Delete some first.");
      const it = {
        id: require("crypto").randomBytes(6).toString("hex"), name, role: L.clean(b.role, 60), email: "",
        rating: L.cleanRating(b.rating), message, status: "accepted", source: "admin",
        createdAt: Date.now(), order: nextOrder()
      };
      all.push(it); changed.push(it);
      break;
    }
    case "move": {
      const it = find();
      const acc = all.filter((i) => i.status === "accepted").sort(L.byOrder);
      const from = acc.indexOf(it), to = from + (Number(b.dir) < 0 ? -1 : 1);
      if (from < 0 || to < 0 || to >= acc.length) break;
      acc.splice(to, 0, acc.splice(from, 1)[0]);
      acc.forEach((i, k) => { if (i.order !== k + 1) { i.order = k + 1; changed.push(i); } });
      break;
    }
    default:
      throw new L.HttpError(400, "Unknown action.");
  }

  if (changed.length) await L.saveItems(changed);
  L.send(res, 200, { ok: true, items: all.sort((a, b) => b.createdAt - a.createdAt) });
});
