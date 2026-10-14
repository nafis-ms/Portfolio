/* Skills admin: add, edit, delete, show/hide and reorder the skills that become
 * the 3D spheres on the site. Saved on the server through admin-api.js; sign-in is handled by admin.js. */
(function () {
  "use strict";
  var MAX_SKILLS = 40;
  var LOGO_MAX = 256;           // logos are resized to fit in 256 px
  var $ = function (s) { return document.querySelector(s); };
  var editingId = null;
  var logo = "";           // an existing logo's URL, or a freshly chosen data URL
  var hadLogo = false;     // the skill being edited already has a logo on the server
  var busy = false;
  var DEFAULT_LEVEL = { large: 90, medium: 70, small: 40 };   // same defaults as the site's All Skills popup

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function all() { return (ADMIN.data && ADMIN.data.skills) || []; }

  /* ---------- list ---------- */
  function render() {
    var skills = all();
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
      var lvl = s.percent === null || s.percent === undefined ? DEFAULT_LEVEL[s.size] || 70 : s.percent;
      sub.textContent = [s.category, cap(s.size || "medium"), lvl + "%" + (s.percent === null || s.percent === undefined ? " (default)" : ""), s.visible === false ? "Hidden" : "Visible"]
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

  // Runs one server call, then shows the fresh list (or the error)
  function run(call, msgEl, okText) {
    return call.then(function (c) {
      ADMIN.set(c);
      if (okText) say(msgEl, okText, "ok");
      return true;
    }, function (err) { say(msgEl, err.message, "error"); return false; });
  }
  function fields(s, over) {
    var o = { name: s.name, category: s.category || "", size: s.size || "medium", visible: s.visible !== false,
              percent: s.percent === null || s.percent === undefined ? "" : s.percent };
    for (var k in over) o[k] = over[k];
    return o;
  }

  function move(i, dir) {
    var ids = all().map(function (x) { return x.id; }), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    run(ADMIN.api("admin/skills-order", "POST", { ids: ids }), $("#skillMsg"));
  }
  function toggle(s) {
    run(ADMIN.api("admin/skills/" + s.id, "POST", fields(s, { visible: s.visible === false })), $("#skillMsg"),
      s.visible === false ? '"' + s.name + '" is now visible on your site.' : '"' + s.name + '" is hidden from your site.');
  }
  function remove(s) {
    if (!confirm('Delete "' + s.name + '"? This removes it from your site.')) return;
    run(ADMIN.api("admin/skills/" + s.id, "DELETE"), $("#skillMsg"), "Deleted.").then(function (ok) {
      if (ok && editingId === s.id) resetForm();
    });
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

  function updatePlaceholder() {                         // the empty box shows what the site will use
    $("#skillPercent").placeholder = "Default " + (DEFAULT_LEVEL[$("#skillSize").value] || 70) + "%";
  }
  $("#skillSize").addEventListener("change", updatePlaceholder);

  function resetForm() {
    editingId = null;
    hadLogo = false;
    form.reset();
    updatePlaceholder();
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
    $("#skillPercent").value = s.percent === null || s.percent === undefined ? "" : s.percent;
    updatePlaceholder();
    $("#skillVisible").checked = s.visible !== false;
    hadLogo = !!s.logo;
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

    var rawPct = $("#skillPercent").value.trim().replace(/%$/, "").trim();
    if (rawPct !== "" && (!/^\d{1,3}$/.test(rawPct) || Number(rawPct) > 100)) {
      return say(msg, "Skill level must be a whole number from 0 to 100, or left empty.", "error");
    }
    var entry = {
      name: name,
      category: $("#skillCategory").value.trim().slice(0, 40),
      size: $("#skillSize").value,
      percent: rawPct === "" ? "" : Number(rawPct),          // "" = use the size default
      visible: $("#skillVisible").checked
    };
    if (logo.indexOf("data:") === 0) entry.logo = logo;             // only send a logo that was just chosen
    else if (!logo && hadLogo) entry.logo = "";                      // the logo was removed
    if (!editingId && all().length >= MAX_SKILLS) return say(msg, "Limit of " + MAX_SKILLS + " skills reached.", "error");
    var wasEdit = !!editingId;
    busy = true;
    $("#skillSave").disabled = true;
    say(msg, "Saving...");
    run(ADMIN.api(wasEdit ? "admin/skills/" + editingId : "admin/skills", "POST", entry), msg).then(function (ok) {
      busy = false;
      $("#skillSave").disabled = false;
      if (!ok) return;
      resetForm();
      say(msg, wasEdit ? "Saved. Your site is updated." : "Added. It's now floating on your site.", "ok");
    });
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
    var msg = $("#skillDataMsg"), have = {}, todo = [];
    all().forEach(function (s) { have[s.name.toLowerCase()] = true; });
    SAMPLES.forEach(function (s) {
      var name = s[3] || s[0];
      if (!have[name.toLowerCase()] && all().length + todo.length < MAX_SKILLS) todo.push({ name: name, logo: badge(s[0], s[1], s[2]) });
    });
    if (!todo.length) return say(msg, "The sample skills are already in your list.");
    var btn = this, added = 0;
    btn.disabled = true;
    say(msg, "Adding sample skills...");
    (function next() {
      var t = todo.shift();
      if (!t) {
        btn.disabled = false;
        return say(msg, added + " sample skills added. Edit each one to upload its real logo.", "ok");
      }
      ADMIN.api("admin/skills", "POST", { name: t.name, logo: t.logo, category: "", size: "medium", visible: true }).then(function (c) {
        ADMIN.set(c); added++; next();
      }, function (err) { btn.disabled = false; say(msg, err.message, "error"); });
    })();
  });

  ADMIN.on(render);
  resetForm();
})();