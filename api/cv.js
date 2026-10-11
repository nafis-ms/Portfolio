/* Public endpoint. GET /api/cv serves the CV PDF that was uploaded in the admin panel. */
"use strict";
const L = require("./_lib");
const S = require("./_site");

module.exports = L.wrap(async (req, res) => {
  const meta = S.parse(await L.redis(["GET", S.KEY.cv]), null);
  if (!meta || !meta.chunks) return L.send(res, 404, { error: "No CV yet." });
  const parts = await L.redis(["MGET"].concat(Array.from({ length: meta.chunks }, (_, i) => S.KEY.chunk + i)));
  if (!Array.isArray(parts) || parts.some((p) => typeof p !== "string")) return L.send(res, 404, { error: "No CV yet." });
  const name = String(meta.name || "CV.pdf").replace(/[^\w.\- ]/g, "_").slice(0, 100);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="' + name + '"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(Buffer.from(parts.join(""), "base64"));
});
