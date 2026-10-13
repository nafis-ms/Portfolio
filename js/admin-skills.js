/* Skills admin: add, edit, delete, show/hide and reorder the skills that become
 * the 3D spheres on the site. Runs entirely in the browser; the data layer is
 * store.js (PF.skills), the same as projects. Sign-in is handled by admin.js. */
(function () {
  "use strict";
  var MAX_SKILLS = 40;
  var LOGO_MAX = 256;           // logos are resized to fit in 256 px
  var $ = function (s) { return document.querySelector(s); };
  var editingId = null;
  var logo = "";
  var busy = false;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function newId() {
    return Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function save(list) { PF.skills.save(list); }   // throws if storage is full

  /* ---------- list ---------- */
  function render() {
    var skills = PF.skills.all();
    var list = $("#skillList");
    list.textContent = "";
    $("#skillCount").textContent = skills.length ? "(" + skills.length + ")" : "";
    $("#skillEmpty").hidden = skills.length > 0;

    skills.forEach(function (s, i) {
      var li = document.createElement("li");
      li.className = "item" + (s.visible === false ? " is-hidden" : "");

      var img = document.createElement("img");
      img.className = "logo-thumb";
      img.alt = "";
      if (s.logo) img.src = s.logo; else img.style.visibility = "hidden";
      img.addEventListener("error", function () { img.style.visibility = "hidden"; });   // broken logo URL

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = s.name;
      var sub = document.createElement("span");
      sub.className = "site";
      sub.textContent = [s.category, cap(s.size || "medium"), s.visible === false ? "Hidden" : "Visible"]
        .filter(Boolean).join(" · ");
      meta.append(name, sub);

      var actions = document.createElement("div");
      actions.className = "actions";
      function btn(label, cls, fn, aria, disabled) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn ghost" + (cls ? " " + cls : "");
        b.textContent = label;
        if (aria) b.setAttribute("aria-label", aria);
        b.disabled = !!disabled;
        b.addEventListener("click", fn);
        return b;
      }
      actions.append(
        btn("↑", "", function () { move(i, -1); }, "Move " + s.name + " earlier", i === 0),
        btn("↓", "", function () { move(i, 1); }, "Move " + s.name + " later", i === skills.length - 1),
        btn(s.visible === false ? "Show" : "Hide", "", function () { toggle(s); }),
        btn("Edit", "", function () { startEdit(s); }),
        btn("Delete", "danger", function () { remove(s); })
      );

      li.append(img, meta, actions);
      list.append(li);
    });
  }

  function persist(next, msgEl, okText) {
    try {
      save(next);
    } catch (err) {
      say(msgEl, "Browser storage is full. Delete a project or skill, or use smaller logos.", "error");
      return false;
    }
    render();
    if (okText) say(msgEl, okText, "ok");
    return true;
  }

  function move(i, dir) {
    var list = PF.skills.all(), j = i + dir;
    if (j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    persist(list, $("#skillMsg"));
  }
  function toggle(s) {
    persist(PF.skills.all().map(function (x) {
      if (x.id !== s.id) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      c.visible = x.visible === false;
      return c;
    }), $("#skillMsg"), s.visible === false ? '"' + s.name + '" is now visible on your site.' : '"' + s.name + '" is hidden from your site.');
  }
  function remove(s) {
    if (!confirm('Delete "' + s.name + '"? This removes it from your site.')) return;
    if (persist(PF.skills.all().filter(function (x) { return x.id !== s.id; }), $("#skillMsg"), "Deleted.")) {
      if (editingId === s.id) resetForm();
    }
  }

  /* ---------- add / edit ---------- */
  var form = $("#skillForm");

  function setLogo(src) {
    logo = src || "";
    var prev = $("#skillPreview");
    if (logo) { prev.src = logo; prev.hidden = false; }
    else { prev.removeAttribute("src"); prev.hidden = true; }
    $("#skillLogoClear").hidden = !logo;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    setLogo("");
    $("#skillFormTitle").textContent = "Add a skill";
    $("#skillSave").textContent = "Add skill";
    $("#skillCancel").hidden = true;
  }

  function startEdit(s) {
    editingId = s.id;
    form.reset();
    $("#skillName").value = s.name;
    $("#skillCategory").value = s.category || "";
    $("#skillSize").value = s.size || "medium";
    $("#skillVisible").checked = s.visible !== false;
    setLogo(s.logo);
    $("#skillFormTitle").textContent = "Edit skill";
    $("#skillSave").textContent = "Save changes";
    $("#skillCancel").hidden = false;
    say($("#skillMsg"), "Choose a new logo only if you want to replace the current one.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#skillName").focus();
  }

  $("#skillCancel").addEventListener("click", function () {
    resetForm();
    say($("#skillMsg"), "");
  });
  $("#skillLogoClear").addEventListener("click", function () {
    $("#skillLogo").value = "";
    setLogo("");
  });

  // Keep transparency, preserve the aspect ratio, and shrink so many skills fit in browser storage
  function processLogo(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error("Please choose an image file."));
      var objUrl = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth || LOGO_MAX, h = im.naturalHeight || LOGO_MAX;   // SVGs without a size
        var s = Math.min(1, LOGO_MAX / Math.max(w, h));
        if (/svg/.test(file.type)) s = LOGO_MAX / Math.max(w, h);               // vector: always render crisp at 256
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(objUrl);
        var out = c.toDataURL("image/webp", 0.92);                               // small, keeps transparency
        if (out.indexOf("data:image/webp") !== 0) out = c.toDataURL("image/png"); // Safari can't encode WebP
        resolve(out);
      };
      im.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error("Could not read that image."));
      };
      im.src = objUrl;
    });
  }

  $("#skillLogo").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    busy = true;
    $("#skillSave").disabled = true;
    say($("#skillMsg"), "Processing logo...");
    processLogo(f).then(function (data) {
      setLogo(data);
      say($("#skillMsg"), "");
    }).catch(function (err) {
      $("#skillLogo").value = "";
      say($("#skillMsg"), err.message, "error");
    }).then(function () {
      busy = false;
      $("#skillSave").disabled = false;
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#skillMsg");
    say(msg, "");
    if (busy) return;
    var name = $("#skillName").value.trim();
    if (!name) return say(msg, "Enter a skill name.", "error");
    if (name.length > 40) return say(msg, "Skill name must be 40 characters or fewer.", "error");

    var entry = {
      id: editingId || newId(),
      name: name,
      logo: logo,
      category: $("#skillCategory").value.trim().slice(0, 40),
      size: $("#skillSize").value,
      visible: $("#skillVisible").checked
    };
    var list = PF.skills.all(), next;
    if (editingId) {
      next = list.map(function (s) { return s.id === editingId ? entry : s; });
    } else {
      if (list.length >= MAX_SKILLS) return say(msg, "Limit of " + MAX_SKILLS + " skills reached.", "error");
      next = list.concat(entry);
    }
    var wasEdit = !!editingId;
    if (persist(next, msg)) {
      resetForm();
      say(msg, wasEdit ? "Saved. Your site is updated." : "Added. It's now floating on your site.", "ok");
    }
  });

  /* ---------- sample skills (generated badges, so no outside logo service is needed) ---------- */
  var SAMPLES = [
    ["HTML", "#E34F26", "#FFFFFF"], ["CSS", "#1572B6", "#FFFFFF"], ["JS", "#F7DF1E", "#222222", "JavaScript"],
    ["React", "#20232A", "#61DAFB"], ["Node", "#3C873A", "#FFFFFF", "Node.js"], ["Python", "#3776AB", "#FFD43B"],
    ["C++", "#00599C", "#FFFFFF"], ["Git", "#F05032", "#FFFFFF"], ["GitHub", "#181717", "#FFFFFF"],
    ["Three", "#049EF4", "#FFFFFF", "Three.js"]
  ];
  function badge(text, bg, fg) {
    var c = document.createElement("canvas");
    c.width = c.height = 200;
    var g = c.getContext("2d");
    g.fillStyle = bg;
    g.beginPath();
    if (g.roundRect) g.roundRect(10, 10, 180, 180, 36); else g.rect(10, 10, 180, 180);
    g.fill();
    g.fillStyle = fg;
    g.font = "700 " + (text.length > 4 ? 44 : text.length > 2 ? 62 : 84) + "px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 100, 106);
    return c.toDataURL("image/png");
  }

  $("#skillSamples").addEventListener("click", function () {
    var msg = $("#skillDataMsg"), list = PF.skills.all();
    var have = {};
    list.forEach(function (s) { have[s.name.toLowerCase()] = true; });
    var added = 0;
    SAMPLES.forEach(function (s) {
      var name = s[3] || s[0];
      if (have[name.toLowerCase()] || list.length >= MAX_SKILLS) return;
      list.push({ id: newId(), name: name, logo: badge(s[0], s[1], s[2]), category: "", size: "medium", visible: true });
      added++;
    });
    if (!added) return say(msg, "The sample skills are already in your list.");
    if (persist(list, msg)) say(msg, added + " sample skills added. Edit each one to upload its real logo.", "ok");
  });

  /* ---------- backup / import (skills.json) ---------- */
  $("#skillExport").addEventListener("click", function () {
    var data = PF.skills.all().map(function (s) {
      return { name: s.name, logo: s.logo, category: s.category || "", size: s.size || "medium", visible: s.visible !== false };
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "skills.json";
    document.body.append(a);
    a.click();
    a.remove();
    say($("#skillDataMsg"), "Saved skills.json. Put it next to index.html to publish.", "ok");
  });

  $("#skillImport").addEventListener("change", function () {
    var f = this.files[0], msg = $("#skillDataMsg");
    this.value = "";
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error("The file must contain a list of skills.");
      var clean = [], skipped = 0;
      data.forEach(function (s) {
        var name = String((s && s.name) || "").trim();
        var lg = String((s && s.logo) || "").trim();
        var logoOk = !lg || /^(data:image\/(png|jpeg|webp|gif|svg\+xml);|https?:\/\/|[A-Za-z0-9_\-.\/ ]+$)/i.test(lg);
        if (!name || name.length > 40 || !logoOk) { skipped++; return; }
        clean.push({
          id: newId(), name: name, logo: lg,
          category: String((s && s.category) || "").trim().slice(0, 40),
          size: /^(small|medium|large)$/.test(s && s.size) ? s.size : "medium",
          visible: !(s && s.visible === false)
        });
      });
      var replace = $("#skillImportMode").value === "replace";
      var next = (replace ? [] : PF.skills.all()).concat(clean);
      var over = Math.max(0, next.length - MAX_SKILLS);
      next = next.slice(0, MAX_SKILLS);
      save(next);
      resetForm();
      render();
      var note = clean.length + " imported";
      if (skipped) note += ", " + skipped + " skipped (incomplete)";
      if (over) note += ", " + over + " dropped (limit " + MAX_SKILLS + ")";
      say(msg, note + ".", "ok");
    }).catch(function (err) {
      say(msg, err instanceof SyntaxError ? "That file isn't valid JSON." : (err.name === "QuotaExceededError" ? "Browser storage is full." : err.message), "error");
    });
  });

  resetForm();
  render();
})();
