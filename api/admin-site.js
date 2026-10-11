/* Admin endpoint (needs the x-admin-key header = ADMIN_KEY in Vercel).
 *   GET   everything, including hidden skills
 *   POST  { action, ... } where action is one of:
 *     project-add     { title, url, image }          image = data:image/... (png, jpeg or webp)
 *     project-update  { id, title, url, image? }     image only when it is replaced
 *     project-delete  { id }
 *     skill-add       { name, category, size, visible, logo? }
 *     skill-update    { id, name, category, size, visible, logo?, removeLogo? }
 *     skill-delete    { id }
 *     skills-save     { list: [{ id, visible }] }    new order and visibility
 *     cv-set          { name, data }                 data = data:application/pdf;base64,...
 *     cv-delete
 * Every POST answers with the fresh data. */
"use strict";
const crypto = require("crypto");
const L = require("./_lib");
const S = require("./_site");

const MAX_PROJECTS = 24, MAX_SKILLS = 40;
const IMG_MAX = 700000;     // base64 characters per picture (Upstash accepts about 1 MB per request)
const CV_MAX = 3400000;     // base64 characters, about 2.5 MB of PDF (Vercel accepts 4.5 MB per request)
const CHUNK = 600000;
const SIZES = ["small", "medium", "large"];

const rid = () => crypto.randomBytes(8).toString("hex");
const bad = (m) => new L.HttpError(400, m);
const put = (key, val) => L.redis(["SET", key, typeof val === "string" ? val : JSON.stringify(val)]);

function parseImage(u, required) {
  if (!u) { if (required) throw bad("Choose an image."); return null; }
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(u));
  if (!m) throw bad("Please use a PNG, JPG or WebP image.");
  if (m[2].length > IMG_MAX) throw bad("That image is too large. Try a smaller one.");
  return "image/" + m[1] + "|" + m[2];
}
async function putImage(v) { const id = rid(); await put(S.KEY.img + id, v); return id; }
const dropImage = (id) => (id ? L.redis(["DEL", S.KEY.img + id]) : null);

function cleanUrl(raw) {
  try { const u = new URL(String(raw).trim()); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : null; } catch (e) { return null; }
}
function projectFields(b) {
  const title = L.clean(b.title, 80), url = cleanUrl(b.url);
  if (!title) throw bad("Enter a project name.");
  if (!url) throw bad("Enter a full URL starting with http:// or https://");
  return { title, url };
}
function skillFields(b) {
  const name = L.clean(b.name, 40);
  if (!name) throw bad("Enter a skill name.");
  return { name, category: L.clean(b.category, 40), size: SIZES.includes(b.size) ? b.size : "medium", visible: b.visible !== false };
}
const find = (list, id) => {
  const it = list.find((x) => x.id === String(id || ""));
  if (!it) throw new L.HttpError(404, "That item no longer exists. Refresh the page.");
  return it;
};

const A = {
  async "project-add"(b, d) {
    const f = projectFields(b);
    if (d.projects.length >= MAX_PROJECTS) throw bad("Limit of " + MAX_PROJECTS + " projects reached.");
    const img = await putImage(parseImage(b.image, true));
    d.projects.push({ id: rid(), title: f.title, url: f.url, img });
    await put(S.KEY.projects, d.projects);
  },
  async "project-update"(b, d) {
    const p = find(d.projects, b.id), f = projectFields(b), raw = parseImage(b.image, false);
    const old = p.img;
    if (raw) p.img = await putImage(raw);
    p.title = f.title; p.url = f.url;
    await put(S.KEY.projects, d.projects);
    if (raw) await dropImage(old);
  },
  async "project-delete"(b, d) {
    const p = find(d.projects, b.id);
    d.projects = d.projects.filter((x) => x !== p);
    await put(S.KEY.projects, d.projects);
    await dropImage(p.img);
  },
  async "skill-add"(b, d) {
    const f = skillFields(b), raw = parseImage(b.logo, false);
    if (d.skills.length >= MAX_SKILLS) throw bad("Limit of " + MAX_SKILLS + " skills reached.");
    const img = raw ? await putImage(raw) : "";
    d.skills.push(Object.assign({ id: rid(), img }, f));
    await put(S.KEY.skills, d.skills);
  },
  async "skill-update"(b, d) {
    const s = find(d.skills, b.id), f = skillFields(b), raw = parseImage(b.logo, false);
    const old = s.img;
    if (raw) s.img = await putImage(raw); else if (b.removeLogo) s.img = "";
    Object.assign(s, f);
    await put(S.KEY.skills, d.skills);
    if (old && old !== s.img) await dropImage(old);
  },
  async "skill-delete"(b, d) {
    const s = find(d.skills, b.id);
    d.skills = d.skills.filter((x) => x !== s);
    await put(S.KEY.skills, d.skills);
    await dropImage(s.img);
  },
  async "skills-save"(b, d) {
    if (!Array.isArray(b.list)) throw bad("Invalid list.");
    const seen = new Set(), next = [];
    b.list.forEach((x) => {
      const s = d.skills.find((k) => k.id === String(x && x.id));
      if (!s || seen.has(s.id)) return;
      seen.add(s.id);
      if (x.visible === true || x.visible === false) s.visible = x.visible;
      next.push(s);
    });
    d.skills.forEach((s) => { if (!seen.has(s.id)) next.push(s); });   // never lose a skill by accident
    d.skills = next;
    await put(S.KEY.skills, d.skills);
  },
  async "cv-set"(b, d) {
    const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ""));
    if (!m) throw bad("Please choose a PDF file.");
    if (m[1].length > CV_MAX) throw bad("That PDF is too large (about 2.5 MB at most). Please compress it first.");
    if (Buffer.from(m[1].slice(0, 16), "base64").toString("latin1").slice(0, 4) !== "%PDF") throw bad("That file is not a valid PDF.");
    const old = d.cv, chunks = Math.ceil(m[1].length / CHUNK);
    for (let i = 0; i < chunks; i++) await put(S.KEY.chunk + i, m[1].slice(i * CHUNK, (i + 1) * CHUNK));
    d.cv = { name: L.clean(b.name, 100) || "CV.pdf", size: Math.floor(m[1].length * 3 / 4), chunks, v: Date.now() };
    await put(S.KEY.cv, d.cv);
    if (old && old.chunks) for (let i = chunks; i < old.chunks; i++) await L.redis(["DEL", S.KEY.chunk + i]);
  },
  async "cv-delete"(b, d) {
    const old = d.cv;
    d.cv = null;
    await L.redis(["DEL", S.KEY.cv]);
    if (old && old.chunks) for (let i = 0; i < old.chunks; i++) await L.redis(["DEL", S.KEY.chunk + i]);
  }
};

const view = (d) => ({ projects: S.pubProjects(d.projects), skills: S.pubSkills(d.skills, true), cv: S.pubCv(d.cv) });

module.exports = L.wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return L.send(res, 405, { error: "Method not allowed." }); }
  await L.requireAdmin(req);
  const d = await S.readAll();
  if (req.method === "GET") return L.send(res, 200, view(d));
  const b = await L.readBody(req), fn = Object.prototype.hasOwnProperty.call(A, b.action) ? A[b.action] : null;
  if (!fn) throw bad("Unknown action.");
  await fn(b, d);
  L.send(res, 200, view(d));
});
