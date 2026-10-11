/* Public endpoint. GET /api/img?id=<16 hex chars> serves a project picture or skill logo. */
"use strict";
const L = require("./_lib");
const S = require("./_site");

module.exports = L.wrap(async (req, res) => {
  const id = String(new URL(req.url, "http://x").searchParams.get("id") || "");
  if (!/^[a-f0-9]{16}$/.test(id)) return L.send(res, 404, { error: "Not found." });
  const v = await L.redis(["GET", S.KEY.img + id]);
  const i = typeof v === "string" ? v.indexOf("|") : -1;
  const type = i > 0 ? v.slice(0, i) : "";
  if (!/^image\/(png|jpeg|webp)$/.test(type)) return L.send(res, 404, { error: "Not found." });
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");   // an id is never reused
  res.end(Buffer.from(v.slice(i + 1), "base64"));
});
