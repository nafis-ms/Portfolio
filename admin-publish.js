/* Apply Changes: publishes projects.json, skills.json and cv.pdf (feedback lives on the server, see api/) to your GitHub
 * repository so that visitors see your changes.
 *
 * It runs entirely in the browser and talks to GitHub's API directly (no server,
 * no database). Vercel redeploys whenever the repo changes, so the live site
 * updates about a minute after you click the button.
 *
 * The token is stored in this browser only (localStorage). Use a fine-grained
 * token limited to this one repository with "Contents: Read and write". */
(function () {
  "use strict";
  var SETTINGS_KEY = "portfolio-publish";
  var API = "https://api.github.com";
  var $ = function (s) { return document.querySelector(s); };

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }

  /* ---------- settings (saved in this browser) ---------- */
  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  }
  function putSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  function readForm() {
    var folder = $("#pubFolder").value.trim().replace(/^\/+|\/+$/g, "");
    return {
      repo: $("#pubRepo").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, ""),
      branch: $("#pubBranch").value.trim() || "main",
      folder: folder,
      token: $("#pubToken").value.trim()
    };
  }

  function validate(s) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repo)) return "Enter the repository as owner/name, for example musbitul/portfolio.";
    if (!/^[A-Za-z0-9_.\/-]+$/.test(s.branch) || s.branch.indexOf("..") !== -1) return "That branch name doesn't look right.";
    if (s.folder && (!/^[A-Za-z0-9_.\/ -]+$/.test(s.folder) || s.folder.indexOf("..") !== -1)) return "That folder name doesn't look right.";
    if (!s.token) return "Paste your GitHub token.";
    return "";
  }

  function fillForm() {
    var s = getSettings();
    $("#pubRepo").value = s.repo || "";
    $("#pubBranch").value = s.branch || "main";
    $("#pubFolder").value = s.folder || "";
    $("#pubToken").value = s.token || "";
    $("#pubForget").hidden = !s.token;
    if (!s.repo || !s.token) $("#pubSettings").open = true;
  }

  $("#pubSave").addEventListener("click", function () {
    var s = readForm(), msg = $("#pubMsg"), err = validate(s);
    if (err) return say(msg, err, "error");
    putSettings(s);
    $("#pubForget").hidden = false;
    say(msg, "Settings saved in this browser.", "ok");
  });

  $("#pubForget").addEventListener("click", function () {
    var s = getSettings();
    delete s.token;
    putSettings(s);
    $("#pubToken").value = "";
    $("#pubForget").hidden = true;
    say($("#pubMsg"), "Token removed from this browser.", "ok");
  });

  /* ---------- bytes helpers ---------- */
  function textBytes(str) { return new TextEncoder().encode(str); }

  function bytesToBase64(bytes) {
    var out = "", step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(out);
  }

  function dataUrlBytes(dataUrl) {
    var bin = atob(dataUrl.split(",")[1] || ""), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  // Git identifies a file by SHA-1("blob <size>\0<content>"). Matching it tells us
  // whether the file on GitHub is already identical, so we skip pointless commits.
  function gitBlobSha(bytes) {
    var head = textBytes("blob " + bytes.length + "\0");
    var all = new Uint8Array(head.length + bytes.length);
    all.set(head, 0);
    all.set(bytes, head.length);
    return crypto.subtle.digest("SHA-1", all).then(toHex);
  }

  /* ---------- GitHub API ---------- */
  function GitHubError(status, message) {
    var e = new Error(message);
    e.status = status;
    return e;
  }

  function explain(status) {
    if (status === 401) return "GitHub rejected the token. It may be wrong or expired.";
    if (status === 403) return "The token isn't allowed to do this. It needs \"Contents: Read and write\" on this repository (or GitHub is rate-limiting you; wait a minute).";
    if (status === 404) return "GitHub can't find that repository or branch, or the token can't access it. Check the repo name, branch and token permissions.";
    if (status === 409 || status === 422) return "GitHub reported a conflict. Click Apply Changes again.";
    return "GitHub returned an error (" + status + ").";
  }

  function gh(s, method, path, body) {
    var url = API + "/repos/" + s.repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
    if (method === "GET") url += "?ref=" + encodeURIComponent(s.branch);
    return fetch(url, {
      method: method,
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + s.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    }).catch(function () {
      throw GitHubError(0, "Couldn't reach GitHub. Check your internet connection.");
    });
  }

  function remoteSha(s, path) {
    return gh(s, "GET", path).then(function (r) {
      if (r.status === 404) return null;                       // new file (or no access; PUT will tell us)
      if (!r.ok) throw GitHubError(r.status, explain(r.status));
      return r.json().then(function (j) { return Array.isArray(j) ? null : j.sha; });
    });
  }

  /* Commit one file. Resolves "committed" or "unchanged". */
  function publishFile(s, path, bytes, message) {
    return Promise.all([remoteSha(s, path), gitBlobSha(bytes)]).then(function (r) {
      var sha = r[0], local = r[1];
      if (sha && sha === local) return "unchanged";
      function put(existing) {
        var body = { message: message, content: bytesToBase64(bytes), branch: s.branch };
        if (existing) body.sha = existing;
        return gh(s, "PUT", path, body);
      }
      return put(sha).then(function (res) {
        if (res.status === 409 || res.status === 422) {          // someone changed it meanwhile: retry once
          return remoteSha(s, path).then(put);
        }
        return res;
      }).then(function (res) {
        if (!res.ok) throw GitHubError(res.status, explain(res.status));
        return "committed";
      });
    });
  }

  /* ---------- what gets published ---------- */
  function collect() {
    var files = [], notes = [];
    if ($("#pubProjects").checked) {
      if (PF.projects.has()) {
        var projects = PF.projects.all().map(function (p) { return { title: p.title, image: p.image, url: p.url }; });
        files.push({ name: "projects.json", bytes: textBytes(JSON.stringify(projects, null, 2)) });
      } else notes.push("projects.json: nothing saved in this browser yet, so it was skipped");
    }
    if ($("#pubSkills").checked) {
      if (PF.skills.has()) {
        var skills = PF.skills.all().map(function (k) {
          return { name: k.name, logo: k.logo, category: k.category || "", size: k.size || "medium", visible: k.visible !== false };
        });
        files.push({ name: "skills.json", bytes: textBytes(JSON.stringify(skills, null, 2)) });
      } else notes.push("skills.json: nothing saved in this browser yet, so it was skipped");
    }
    if ($("#pubCv").checked) {
      var cv = PF.cv.get();
      if (cv) files.push({ name: "cv.pdf", bytes: dataUrlBytes(cv.data) });
      else notes.push("cv.pdf: no CV uploaded in this browser, so it was skipped");
    }
    return { files: files, notes: notes };
  }

  var running = false;
  $("#pubApply").addEventListener("click", function () {
    if (running) return;
    var msg = $("#pubMsg"), s = readForm(), err = validate(s);
    if (err) { $("#pubSettings").open = true; return say(msg, err, "error"); }
    putSettings(s);
    $("#pubForget").hidden = false;

    var job = collect();
    if (!job.files.length) return say(msg, job.notes.join(". ") || "Tick at least one thing to publish.", "error");

    running = true;
    $("#pubApply").disabled = true;
    say(msg, "Publishing...");
    var prefix = s.folder ? s.folder + "/" : "";
    var message = "Update portfolio data from the admin panel";
    var results = [];

    // One file at a time, so a failure stops cleanly and the message says which file
    job.files.reduce(function (chain, f) {
      return chain.then(function () {
        say(msg, "Publishing " + f.name + "...");
        return publishFile(s, prefix + f.name, f.bytes, message + " (" + f.name + ")").then(function (r) {
          results.push(f.name + ": " + r);
        }).catch(function (e) {
          e.file = f.name;
          throw e;
        });
      });
    }, Promise.resolve()).then(function () {
      var changed = results.some(function (r) { return /committed/.test(r); });
      say(msg, (changed
        ? "Applied. Vercel is redeploying now; your changes go live in about a minute. "
        : "Nothing to apply: the files on GitHub already match. ") + "(" + results.join(", ") + ")" +
        (job.notes.length ? " Skipped: " + job.notes.join("; ") + "." : ""), "ok");
    }).catch(function (e) {
      var done = results.length ? " Already published: " + results.join(", ") + "." : "";
      say(msg, (e.file ? e.file + ": " : "") + e.message + done, "error");
    }).then(function () {
      running = false;
      $("#pubApply").disabled = false;
    });
  });

  fillForm();
})();
