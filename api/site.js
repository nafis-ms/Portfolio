/* Public endpoint. GET /api/site answers a tiny script that sets window.SITE with the projects,
 * visible skills and CV link, so the page can draw them without waiting for another request.
 * index.html loads it just before store.js. */
"use strict";
const L = require("./_lib");
const S = require("./_site");

module.exports = L.wrap(async (req, res) => {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return L.send(res, 405, { error: "Method not allowed." }); }
  let site = null;
  try {
    const d = await S.readAll();
    site = { projects: S.pubProjects(d.projects), skills: S.pubSkills(d.skills, false), cv: S.pubCv(d.cv) };
  } catch (e) { console.error("[site api]", e.message); }       // storage down: window.SITE = null, the page shows no extras
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", site ? "public, s-maxage=10, stale-while-revalidate=30" : "no-store");
  res.end("window.SITE=" + JSON.stringify(site).replace(/</g, "\\u003c") + ";");
});
