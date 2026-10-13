/* All API routes for Vercel (one catch-all function). Data lives in Upstash Redis (REST), no packages needed.
   Env vars: ADMIN_PASSWORD, plus UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN),
   which the Upstash integration adds for you.

   Every route is called as /api/index?p=<route>:
     public   GET  content            the site data as a script: window.SITE = {profile, projects, skills, cv}
              GET  img/<id>           a project picture or skill logo
              GET  cv                 the CV download
              GET  feedback           approved feedback for the slider
              POST feedback           a visitor submits feedback (goes to Pending)
     admin    (header x-admin-key: <ADMIN_PASSWORD>)
              GET  admin/ping         checks the password and the storage connection
              GET  admin/content      everything the admin panel needs
              POST admin/profile      about, contact details, social links
              POST admin/projects             add            POST admin/projects/<id>   edit      DELETE admin/projects/<id>
              POST admin/skills               add            POST admin/skills/<id>     edit      DELETE admin/skills/<id>
              POST admin/skills-order         {ids:[...]}    reorder the spheres
              POST admin/cv                   {name, data}   upload / replace   (empty data = remove)   DELETE admin/cv
              GET  admin/feedback[&status=]   POST admin/feedback  add     POST admin/feedback/<id>  edit     DELETE admin/feedback/<id> */
const crypto = require("crypto");
const RU = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const RT = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const KEY = process.env.ADMIN_PASSWORD || "";

async function R(...cmd) {
  if (!RU || !RT) { const e = new Error("Storage is not connected. Add the Upstash Redis integration to this Vercel project, then redeploy."); e.storage = true; throw e; }
  const r = await fetch(RU, { method: "POST", headers: { Authorization: "Bearer " + RT, "Content-Type": "application/json" }, body: JSON.stringify(cmd.map(String)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error("Storage error: " + (j.error || r.status)); e.storage = true; throw e; }
  return j.result;
}
const clone = o => JSON.parse(JSON.stringify(o));

const DEFAULTS = {
  profile: {},     /* {about, phone, email, address, facebook, linkedin, whatsapp, discord, instagram}: empty = the page keeps its built-in text / hides the box */
  projects: [],    /* [{id, title, url, image}] */
  skills: [],      /* [{id, name, logo, category, size, visible}] in display order */
  cv: null         /* {name, url} */
};
const MAX_PROJECTS = 24, MAX_SKILLS = 40, MAX_FEEDBACK = 1000, SLIDER_MAX = 300;

const S = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, n) : "";
const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
function cleanUrl(v) {                            /* http(s) only; "example.com/x" gets https:// added */
  v = S(v, 500);
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) { if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v)) return null; v = "https://" + v; }
  let u; try { u = new URL(v); } catch (e) { return null; }
  return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null;
}
function optUrl(v, label) {                       /* optional profile link: empty is fine, anything else must be a web address */
  v = S(v, 300);
  if (!v) return "";
  const u = cleanUrl(v);
  if (!u) throw new Error("The " + label + " link isn't a valid web address.");
  return u;
}

async function getContent() {
  const c = clone(DEFAULTS), raw = await R("GET", "site:content");
  if (raw) { try { const o = JSON.parse(raw); for (const k in o) c[k] = o[k]; } catch (e) {} }
  return c;
}
const setContent = c => R("SET", "site:content", JSON.stringify(c));

/* Pictures (project covers, skill logos) are stored as "<mime>|<base64>" and served from /api/index?p=img/<id> */
const imgUrl = id => "/api/index?p=img/" + id;
const imgId = url => { const m = /[?&]p=img\/([a-f0-9]+)/.exec(typeof url === "string" ? url : ""); return m ? m[1] : ""; };
function parseImage(u, maxB64) {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(typeof u === "string" ? u : "");
  if (!m) throw new Error("Please choose a PNG, JPG, WebP or GIF picture.");
  if (m[2].length > maxB64) throw new Error("That picture is too large. Try a smaller one.");
  return { type: "image/" + m[1], b64: m[2] };
}
async function saveImage(dataUrl, maxB64) {
  const img = parseImage(dataUrl, maxB64), id = crypto.randomBytes(8).toString("hex");
  await R("SET", "site:img:" + id, img.type + "|" + img.b64);
  return imgUrl(id);
}
const dropImage = async url => { const id = imgId(url); if (id) await R("DEL", "site:img:" + id); };

/* Feedback entry: {id, name, role, anonymous, rating 0-5, message, status: pending|accepted|rejected,
   source: visitor|admin, createdAt (ms), order}. Stored in one Redis hash. */
const STATUSES = ["pending", "accepted", "rejected"];
async function allFb() {
  const a = (await R("HGETALL", "site:fb")) || [], out = [];
  for (let i = 0; i < a.length; i += 2) { try { out.push(JSON.parse(a[i + 1])); } catch (e) {} }
  return out;
}
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);
const nextOrder = list => list.reduce((m, f) => f.status === "accepted" ? Math.max(m, f.order || 0) : m, 0) + 1;
const rating = v => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));

/* CV (PDF): stored in Redis as base64 chunks, because Upstash limits the size of a single request.
   Content only holds {name, url}; the file itself is served by GET /api/index?p=cv */
const CV_CHUNK = 600000, CV_MAX_B64 = 4200000;   /* ~3 MB file; Vercel's request body limit is 4.5 MB */
async function cvMeta() { try { return JSON.parse((await R("GET", "site:cv:meta")) || "null"); } catch (e) { return null; } }
async function delCvChunks(from, to) { for (let i = from; i < to; i++) await R("DEL", "site:cv:" + i); }

async function route(req, res, send) {
  const u = new URL(req.url, "http://x"), q = u.searchParams, m = req.method;
  const p = (q.has("p") ? "/api/" + q.get("p") : u.pathname).replace(/\/+$/, "");
  const body = () => { let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } } return b && typeof b === "object" && !Array.isArray(b) ? b : null; };
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";

  /* public: site content as a script, so the page can render before anything else runs */
  if (p === "/api/content" && m === "GET") {
    let c; try { c = await getContent(); } catch (e) { c = clone(DEFAULTS); }
    res.statusCode = 200; res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
    return res.end("window.SITE=" + JSON.stringify(c).replace(/</g, "\\u003c") + ";");
  }
  /* public: pictures */
  if (p.startsWith("/api/img/") && m === "GET") {
    const id = p.slice(9).replace(/[^a-f0-9]/g, ""), v = id && await R("GET", "site:img:" + id);
    if (!v) { res.statusCode = 404; return res.end("Not found"); }
    const i = v.indexOf("|");
    res.statusCode = 200; res.setHeader("Content-Type", v.slice(0, i)); res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.end(Buffer.from(v.slice(i + 1), "base64"));
  }
  /* public: the CV download */
  if (p === "/api/cv" && m === "GET") {
    const meta = await cvMeta();
    if (!meta || !meta.n) { res.statusCode = 404; return res.end("Not found"); }
    let b64 = "";
    for (let i = 0; i < meta.n; i++) {
      const part = await R("GET", "site:cv:" + i);
      if (!part) { res.statusCode = 404; return res.end("Not found"); }
      b64 += part;
    }
    const fname = String(meta.name || "CV.pdf").replace(/[^\w.\- ]/g, "_");
    res.statusCode = 200; res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", (q.has("inline") ? "inline" : "attachment") + '; filename="' + fname + '"');
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");   /* the link carries a version, so a new upload gets a new URL */
    return res.end(Buffer.from(b64, "base64"));
  }
  /* public: read approved feedback, submit new feedback */
  if (p === "/api/feedback") {
    try {
      if (m === "GET") {
        const out = (await allFb()).filter(f => f.status === "accepted").sort(byOrder)
          .map(f => ({ id: f.id, name: f.anonymous ? "" : f.name, role: f.anonymous ? "" : f.role || "", anonymous: !!f.anonymous,   /* a hidden name never leaves the server */
                       rating: f.rating || 0, message: f.message, status: "accepted", source: f.source, createdAt: f.createdAt, order: f.order || 0 }));
        return send(200, out);
      }
      if (m === "POST") {
        const b = body() || {}, anonymous = b.anonymous === true, name = anonymous ? "" : S(b.name, 60), message = S(b.message, SLIDER_MAX);
        if ((!anonymous && !name) || !message) return send(400, { error: "Please enter your name (or choose anonymous) and a message." });
        if (!(await R("SET", "rl:fb:" + ip, "1", "EX", "10", "NX"))) return send(429, { error: "Please wait a moment before sending again." });
        const n = await R("INCR", "rl:fbh:" + ip);
        if (n === 1) await R("EXPIRE", "rl:fbh:" + ip, 3600);
        if (n > 8) return send(429, { error: "Thanks! You've sent a few messages already. Please try again later." });
        if ((await R("HLEN", "site:fb")) >= MAX_FEEDBACK) return send(503, { error: "The feedback inbox is full right now. Please try again later." });
        const id = newId();
        await R("HSET", "site:fb", id, JSON.stringify({ id, name, role: "", anonymous, rating: rating(b.rating), message, status: "pending", source: "visitor", createdAt: Date.now(), order: 0 }));
        return send(201, { ok: true });
      }
    } catch (e) { return send(e.storage ? 503 : 400, { error: e.message }); }
  }

  /* admin */
  if (p.startsWith("/api/admin/")) {
    if (!KEY) return send(503, { error: "ADMIN_PASSWORD is not set. Add it in Vercel > Settings > Environment Variables, then redeploy." });
    let n = 0;
    const fk = "fail:" + ip, hs = x => crypto.createHash("sha256").update(String(x)).digest();
    const good = crypto.timingSafeEqual(hs(req.headers["x-admin-key"] || ""), hs(KEY));
    try {
      n = +(await R("GET", fk)) || 0;
      if (n >= 10) return send(429, { error: "Too many attempts. Try again in a few minutes." });
      if (!good) {
        if ((await R("INCR", fk)) === 1) await R("EXPIRE", fk, 600);
        return send(401, { error: "Wrong password." });
      }
      if (n) await R("DEL", fk);
    } catch (e) {
      if (!good) return send(e.storage ? 503 : 401, { error: e.storage ? e.message : "Wrong password." });   /* storage down: still never let a wrong password in */
    }
    const seg = p.split("/").filter(Boolean), area = seg[2], id = seg[3];
    try {
      if (area === "ping" && m === "GET") {
        let storage = true; try { await R("PING"); } catch (e) { storage = false; }
        return send(200, { ok: true, storage });
      }
      if (area === "content" && !id && m === "GET") return send(200, await getContent());

      /* profile: about paragraph, contact details, social links (empty = hidden / default on the site) */
      if (area === "profile" && !id && m === "POST") {
        const b = body(); if (!b) return send(400, { error: "Invalid input." });
        const email = S(b.email, 120);
        if (email && !EMAIL.test(email)) throw new Error("That email address doesn't look right.");
        const c = await getContent();
        c.profile = { about: S(b.about, 1200), phone: S(b.phone, 40), email, address: S(b.address, 160),
                      facebook: optUrl(b.facebook, "Facebook"), linkedin: optUrl(b.linkedin, "LinkedIn"),
                      whatsapp: optUrl(b.whatsapp, "WhatsApp"), discord: optUrl(b.discord, "Discord"), instagram: optUrl(b.instagram, "Instagram") };
        await setContent(c); return send(200, c);
      }

      /* projects: title + link + picture */
      if (area === "projects") {
        if (!id && m === "POST") {
          const b = body() || {}, title = S(b.title, 80), url = cleanUrl(b.url);
          if (!title) throw new Error("Enter a project name.");
          if (!url) throw new Error("Enter a full URL, for example https://example.com");
          if (!b.image) throw new Error("Choose an image.");
          const c = await getContent();
          if (c.projects.length >= MAX_PROJECTS) throw new Error("Limit of " + MAX_PROJECTS + " projects reached.");
          const image = await saveImage(b.image, 700000);
          c.projects.push({ id: newId(), title, url, image });
          await setContent(c); return send(201, c);
        }
        if (id && m === "POST") {
          const b = body() || {}, c = await getContent(), pr = c.projects.find(x => x.id === id);
          if (!pr) return send(404, { error: "Not found." });
          const title = S(b.title, 80), url = cleanUrl(b.url);
          if (!title) throw new Error("Enter a project name.");
          if (!url) throw new Error("Enter a full URL, for example https://example.com");
          const old = pr.image;
          if (b.image) pr.image = await saveImage(b.image, 700000);
          pr.title = title; pr.url = url;
          await setContent(c); if (b.image) await dropImage(old);
          return send(200, c);
        }
        if (id && m === "DELETE") {
          const c = await getContent(), pr = c.projects.find(x => x.id === id);
          if (!pr) return send(404, { error: "Not found." });
          c.projects = c.projects.filter(x => x.id !== id);
          await setContent(c); await dropImage(pr.image);
          return send(200, c);
        }
      }

      /* skills: the 3D spheres */
      if (area === "skills") {
        const fields = (b, cur) => {
          const name = S(b.name, 40); if (!name) throw new Error("Enter a skill name.");
          return { name, category: S(b.category, 40), size: ["small", "medium", "large"].includes(b.size) ? b.size : "medium", visible: b.visible !== false };
        };
        if (!id && m === "POST") {
          const b = body() || {}, f = fields(b), c = await getContent();
          if (c.skills.length >= MAX_SKILLS) throw new Error("Limit of " + MAX_SKILLS + " skills reached.");
          const logo = b.logo ? await saveImage(b.logo, 400000) : "";
          c.skills.push({ id: newId(), logo, ...f });
          await setContent(c); return send(201, c);
        }
        if (id && m === "POST") {
          const b = body() || {}, c = await getContent(), s = c.skills.find(x => x.id === id);
          if (!s) return send(404, { error: "Not found." });
          const f = fields(b), old = s.logo;
          let logo = old;                                 /* logo missing = keep, "" = remove, data URL = replace */
          if (typeof b.logo === "string" && b.logo.startsWith("data:")) logo = await saveImage(b.logo, 400000);
          else if (b.logo === "") logo = "";
          Object.assign(s, f, { logo });
          await setContent(c); if (logo !== old) await dropImage(old);
          return send(200, c);
        }
        if (id && m === "DELETE") {
          const c = await getContent(), s = c.skills.find(x => x.id === id);
          if (!s) return send(404, { error: "Not found." });
          c.skills = c.skills.filter(x => x.id !== id);
          await setContent(c); await dropImage(s.logo);
          return send(200, c);
        }
      }
      if (area === "skills-order" && !id && m === "POST") {
        const b = body(), c = await getContent();
        if (!b || !Array.isArray(b.ids)) return send(400, { error: "Invalid input." });
        const pos = new Map(b.ids.map((x, i) => [String(x), i]));
        c.skills.sort((x, y) => (pos.has(x.id) ? pos.get(x.id) : 1e6) - (pos.has(y.id) ? pos.get(y.id) : 1e6));
        await setContent(c); return send(200, c);
      }

      /* CV: upload / replace ({name, data: PDF data URL}) or remove (empty data / DELETE) */
      if (area === "cv" && !id && (m === "POST" || m === "DELETE")) {
        const b = m === "POST" ? body() : {}; if (!b) return send(400, { error: "Invalid input." });
        const c = await getContent(), old = await cvMeta(), oldN = (old && old.n) || 0;
        if (m === "DELETE" || !b.data) {
          c.cv = null; await setContent(c); await delCvChunks(0, oldN); await R("DEL", "site:cv:meta");
          return send(200, c);
        }
        const mm = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(typeof b.data === "string" ? b.data : "");
        if (!mm) throw new Error("Please choose a PDF file.");
        const b64 = mm[1];
        if (b64.length > CV_MAX_B64) throw new Error("That PDF is too large (3 MB max).");
        if (Buffer.from(b64.slice(0, 8), "base64").toString("latin1").slice(0, 4) !== "%PDF") throw new Error("That file is not a valid PDF.");
        let name = S(b.name, 120).replace(/[\\\/]/g, "_") || "CV.pdf";
        if (!/\.pdf$/i.test(name)) name += ".pdf";
        const cn = Math.ceil(b64.length / CV_CHUNK);
        for (let i = 0; i < cn; i++) await R("SET", "site:cv:" + i, b64.slice(i * CV_CHUNK, (i + 1) * CV_CHUNK));
        await R("SET", "site:cv:meta", JSON.stringify({ name, n: cn }));
        await delCvChunks(cn, oldN);                       /* drop leftover chunks of a longer, older file */
        c.cv = { name, url: "/api/index?p=cv&v=" + Date.now().toString(36) };
        await setContent(c); return send(200, c);
      }

      /* feedback: list, add (admin-written), accept / reject / edit / reorder / delete */
      if (area === "feedback") {
        if (!id && m === "GET") {
          const s = q.get("status");
          return send(200, (await allFb()).filter(x => !s || x.status === s).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        }
        if (!id && m === "POST") {
          const b = body() || {}, all = await allFb(), anonymous = b.anonymous === true;
          const name = anonymous ? "" : S(b.name, 60), message = S(b.message, SLIDER_MAX);
          if (!message) throw new Error("Enter the feedback text (max " + SLIDER_MAX + " characters).");
          if (!anonymous && !name) throw new Error("Enter a name, or tick Anonymous.");
          if (all.length >= MAX_FEEDBACK) throw new Error("The feedback list is full. Delete some entries first.");
          const fid = newId();
          await R("HSET", "site:fb", fid, JSON.stringify({ id: fid, name, role: S(b.role, 60), anonymous, rating: rating(b.rating), message, status: "accepted", source: "admin", createdAt: Date.now(), order: nextOrder(all) }));
          return send(201, { ok: true });
        }
        const raw = id && await R("HGET", "site:fb", id);
        if (!raw) return send(404, { error: "Not found." });
        if (m === "POST") {
          const b = body(); if (!b) return send(400, { error: "Invalid input." });
          const it = JSON.parse(raw), was = it.status;
          if ("status" in b) { if (!STATUSES.includes(b.status)) return send(400, { error: "Invalid status." }); it.status = b.status; }
          if ("anonymous" in b) it.anonymous = b.anonymous === true;
          if ("name" in b) it.name = S(b.name, 60);
          if ("role" in b) it.role = S(b.role, 60);
          if ("rating" in b) it.rating = rating(b.rating);
          if ("message" in b) { it.message = S(b.message, 1000); if (!it.message) throw new Error("Enter the feedback text."); }
          if ("order" in b) it.order = Math.max(0, Math.min(1e6, Math.round(Number(b.order) || 0)));
          if (!it.anonymous && !it.name) throw new Error("Enter a name, or tick Anonymous.");
          if (it.status === "accepted" && it.message.length > SLIDER_MAX) throw new Error("The slider shows up to " + SLIDER_MAX + " characters. Edit this feedback shorter first.");
          if (it.status === "accepted" && was !== "accepted" && !("order" in b)) it.order = nextOrder(await allFb());
          if (it.status !== "accepted") it.order = 0;
          await R("HSET", "site:fb", id, JSON.stringify(it));
          return send(200, it);
        }
        if (m === "DELETE") { await R("HDEL", "site:fb", id); return send(200, { ok: true }); }
      }
    } catch (e) { return send(e.storage ? 503 : 400, { error: e.message }); }
    return send(404, { error: "Not found." });
  }
  return send(404, { error: "Not found." });
}

module.exports = async (req, res) => {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  try { await route(req, res, send); } catch (e) { send(e.storage ? 503 : 500, { error: e.message }); }
};