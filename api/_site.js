/* Shared by the site-data endpoints: where things live in Redis and how they are shown to visitors.
 * Files that start with "_" in /api are helpers, not public endpoints.
 *   portfolio:projects   JSON [{ id, title, url, img }]
 *   portfolio:skills     JSON [{ id, name, category, size, visible, img }]
 *   portfolio:cvmeta     JSON { name, size, chunks, v }
 *   portfolio:img:<id>   "mime|base64" (project pictures and skill logos)
 *   portfolio:cv:<n>     base64 pieces of the CV PDF (Upstash limits one request to about 1 MB) */
"use strict";
const L = require("./_lib");

const KEY = { projects: "portfolio:projects", skills: "portfolio:skills", cv: "portfolio:cvmeta", img: "portfolio:img:", chunk: "portfolio:cv:" };
const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };

async function readAll() {
  const r = await L.redis(["MGET", KEY.projects, KEY.skills, KEY.cv]);
  const projects = parse(r && r[0], []), skills = parse(r && r[1], []);
  return { projects: Array.isArray(projects) ? projects : [], skills: Array.isArray(skills) ? skills : [], cv: parse(r && r[2], null) };
}

const imgUrl = (id) => (id ? "/api/img?id=" + id : "");
const pubProjects = (l) => l.map((p) => ({ id: p.id, title: p.title, url: p.url, image: imgUrl(p.img) }));
// Visitors never get hidden skills; the admin gets everything
const pubSkills = (l, all) => l.filter((s) => all || s.visible !== false).map((s) => ({
  id: s.id, name: s.name, logo: imgUrl(s.img), category: s.category || "", size: s.size || "medium", visible: s.visible !== false
}));
const pubCv = (c) => (c ? { name: c.name, size: c.size, url: "/api/cv?v=" + c.v } : null);

module.exports = { KEY, parse, readAll, pubProjects, pubSkills, pubCv };
