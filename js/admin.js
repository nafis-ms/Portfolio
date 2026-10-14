/* Admin sign-in, Projects and CV. Everything is saved on the server (api/index.js) through admin-api.js. */
(function () {
  "use strict";
  var MAX_PROJECTS = 24;
  var $ = function (s) { return document.querySelector(s); };
  var editingId = null;
  var image = "";          // an existing picture's URL, or a freshly chosen data URL
  var busy = false;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function cleanUrl(raw) {
    raw = String(raw).trim();
    if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
    try {
      var u = new URL(raw);
      return /^https?:$/.test(u.protocol) && u.hostname.indexOf(".") > 0 ? u.href : null;
    } catch (e) { return null; }
  }

  /* ---------- sign in ---------- */
  function showGate(note) {
    $("#app").hidden = true;
    $("#gate").hidden = false;
    $("#gPass").value = "";
    say($("#gMsg"), note || "", note ? "error" : "");
    $("#gPass").focus();
  }

  $("#gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#gMsg"), btn = $("#gBtn");
    say(msg, "");
    ADMIN.setKey($("#gPass").value);
    btn.disabled = true;
    ADMIN.api("admin/ping").then(function () { start(); }, function (err) {
      ADMIN.setKey("");
      say(msg, err.message, "error");
    }).then(function () { btn.disabled = false; });
  });

  ADMIN.onAuthLost = function (note) { ADMIN.setKey(""); showGate(note || "Please sign in again."); };

  $("#logout").addEventListener("click", function () { ADMIN.setKey(""); showGate(); });
  $("#logout2").addEventListener("click", function () { ADMIN.setKey(""); showGate(); });

  function start() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    resetForm();
    ADMIN.load().catch(function (err) { if (err.status !== 401) say($("#ovMsg"), err.message, "error"); });
    document.dispatchEvent(new CustomEvent("admin:start"));
  }

  /* ---------- list ---------- */
  function render() {
    var projects = (ADMIN.data && ADMIN.data.projects) || [];
    var list = $("#list");
    list.textContent = "";
    $("#count").textContent = projects.length ? "(" + projects.length + ")" : "";
    $("#empty").hidden = projects.length > 0;

    projects.forEach(function (p) {
      var li = document.createElement("li");
      li.className = "item";

      var img = document.createElement("img");
      img.src = p.image;
      img.alt = "";

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = p.title;
      var site = document.createElement("a");
      site.className = "site";
      site.href = p.url;
      site.target = "_blank";
      site.rel = "noopener noreferrer";
      site.textContent = p.url;
      meta.append(name, site);

      var actions = document.createElement("div");
      actions.className = "actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn ghost";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { startEdit(p); });
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn ghost danger";
      del.textContent = "Delete";
      del.addEventListener("click", function () { remove(p); });
      actions.append(edit, del);

      li.append(img, meta, actions);
      list.append(li);
    });
  }

  function remove(p) {
    if (!confirm('Delete "' + p.title + '"? This removes it from your site.')) return;
    ADMIN.api("admin/projects/" + p.id, "DELETE").then(function (c) {
      ADMIN.set(c);
      if (editingId === p.id) resetForm();
      say($("#formMsg"), "Deleted.", "ok");
    }, function (err) { say($("#formMsg"), err.message, "error"); });
  }

  /* ---------- add / edit ---------- */
  var form = $("#projectForm");

  function setImage(src) {
    image = src || "";
    var prev = $("#preview");
    if (image) { prev.src = image; prev.hidden = false; }
    else { prev.removeAttribute("src"); prev.hidden = true; }
  }

  function resetForm() {
    editingId = null;
    form.reset();
    setImage("");
    $("#formTitle").textContent = "Add a project";
    $("#save").textContent = "Add project";
    $("#cancel").hidden = true;
  }

  function startEdit(p) {
    editingId = p.id;
    form.reset();
    $("#title").value = p.title;
    $("#url").value = p.url;
    setImage(p.image);
    $("#formTitle").textContent = "Edit project";
    $("#save").textContent = "Save changes";
    $("#cancel").hidden = false;
    say($("#formMsg"), "Choose a new image only if you want to replace the current one.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#title").focus();
  }

  $("#cancel").addEventListener("click", function () {
    resetForm();
    say($("#formMsg"), "");
  });

  // Resize to max 900px and re-encode so uploads stay small. WebP keeps transparency; browsers that
  // cannot encode WebP (older Safari) get a JPEG on a dark background instead.
  function processImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error("Please choose an image file."));
      var objUrl = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, 900 / Math.max(im.width, im.height));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * s));
        c.height = Math.max(1, Math.round(im.height * s));
        var ctx = c.getContext("2d");
        ctx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(objUrl);
        var out = "", webp = true;
        [0.85, 0.72, 0.58, 0.42].some(function (q) {
          out = c.toDataURL("image/webp", q);
          if (out.indexOf("data:image/webp") !== 0) { webp = false; return true; }   // not supported here
          return out.length < 600000;
        });
        if (!webp || out.length >= 600000) {
          ctx.globalCompositeOperation = "destination-over";    // paint the dark fill behind the picture
          ctx.fillStyle = "#15151a";
          ctx.fillRect(0, 0, c.width, c.height);
          [0.82, 0.7, 0.55, 0.4].some(function (q) { out = c.toDataURL("image/jpeg", q); return out.length < 600000; });
        }
        resolve(out);
      };
      im.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error("Could not read that image."));
      };
      im.src = objUrl;
    });
  }

  $("#image").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    busy = true;
    $("#save").disabled = true;
    say($("#formMsg"), "Processing image...");
    processImage(f).then(function (data) {
      setImage(data);
      say($("#formMsg"), "");
    }).catch(function (err) {
      $("#image").value = "";
      say($("#formMsg"), err.message, "error");
    }).then(function () {
      busy = false;
      $("#save").disabled = false;
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#formMsg");
    say(msg, "");
    if (busy) return;
    var title = $("#title").value.trim();
    var url = cleanUrl($("#url").value);
    if (!title) return say(msg, "Enter a project name.", "error");
    if (title.length > 80) return say(msg, "Project name must be 80 characters or fewer.", "error");
    if (!url) return say(msg, "Enter a full URL, for example https://example.com", "error");
    if (!image) return say(msg, "Choose an image.", "error");
    if (!editingId && ((ADMIN.data && ADMIN.data.projects) || []).length >= MAX_PROJECTS) {
      return say(msg, "Limit of " + MAX_PROJECTS + " projects reached.", "error");
    }

    var wasEdit = !!editingId;
    var body = { title: title, url: url };
    if (image.indexOf("data:") === 0) body.image = image;          // only send a picture that was just chosen
    busy = true;
    $("#save").disabled = true;
    say(msg, "Saving...");
    ADMIN.api(wasEdit ? "admin/projects/" + editingId : "admin/projects", "POST", body).then(function (c) {
      ADMIN.set(c);
      resetForm();
      say(msg, wasEdit ? "Saved. Your site is updated." : "Added. It's now orbiting on your site.", "ok");
    }, function (err) { say(msg, err.message, "error"); }).then(function () {
      busy = false;
      $("#save").disabled = false;
    });
  });

  /* ---------- CV ---------- */
  var MAX_CV_BYTES = 3 * 1024 * 1024;

  function renderCv() {
    var cv = ADMIN.data && ADMIN.data.cv;
    $("#cvView").hidden = $("#cvRemove").hidden = !cv;
    if (!cv) {
      $("#cvStatus").textContent = "No CV uploaded yet. The Download CV buttons are hidden on your site.";
      return;
    }
    $("#cvStatus").textContent = "Current CV: " + (cv.name || "CV.pdf") + ". Live on your site.";
    $("#cvView").href = cv.url + "&inline=1";
  }

  $("#cvFile").addEventListener("change", function () {
    var f = this.files[0], msg = $("#cvMsg"), input = this;
    if (!f) return;
    function done() { input.value = ""; }
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { done(); return say(msg, "Please choose a PDF file.", "error"); }
    if (f.size > MAX_CV_BYTES) { done(); return say(msg, "That PDF is over 3 MB. Please compress it first.", "error"); }
    say(msg, "Uploading...");
    var reader = new FileReader();
    reader.onerror = function () { done(); say(msg, "Could not read that file.", "error"); };
    reader.onload = function () {
      var data = String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,");
      ADMIN.api("admin/cv", "POST", { name: f.name, data: data }).then(function (c) {
        ADMIN.set(c);
        say(msg, "CV saved. The Download CV buttons are live on your site.", "ok");
      }, function (err) { say(msg, err.message, "error"); }).then(done);
    };
    reader.readAsDataURL(f);
  });

  $("#cvRemove").addEventListener("click", function () {
    if (!confirm("Remove your CV? The Download CV buttons will disappear from your site.")) return;
    ADMIN.api("admin/cv", "DELETE").then(function (c) {
      ADMIN.set(c);
      say($("#cvMsg"), "CV removed.", "ok");
    }, function (err) { say($("#cvMsg"), err.message, "error"); });
  });

  /* ---------- start ---------- */
  ADMIN.on(function () { render(); renderCv(); });
  if (ADMIN.hasKey()) {
    ADMIN.api("admin/ping").then(start, function () { ADMIN.setKey(""); showGate(); });
  } else showGate();
})();
