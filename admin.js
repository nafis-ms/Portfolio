/* Projects admin. Runs entirely in the browser (data layer: store.js). */
(function () {
  "use strict";
  var MAX_PROJECTS = 24;
  var SESSION_KEY = "portfolio-admin-session";
  var $ = function (s) { return document.querySelector(s); };
  var editingId = null;
  var image = "";
  var busy = false;

  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function getAdmin() {
    try { return JSON.parse(localStorage.getItem(PF.ADMIN_KEY)); } catch (e) { return null; }
  }
  function loggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) { return false; }
  }
  function newId() {
    return Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
  }
  function cleanUrl(raw) {
    try {
      var u = new URL(String(raw).trim());
      return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch (e) { return null; }
  }

  /* ---------- sign in / first-time setup ---------- */
  function showGate() {
    var setup = !getAdmin();
    $("#app").hidden = true;
    $("#gate").hidden = false;
    $("#gateTitle").textContent = setup ? "Create admin password" : "Admin login";
    $("#gateText").textContent = setup
      ? "First time here. Choose a password (at least 8 characters)."
      : "Enter your admin password.";
    $("#gConfirmWrap").hidden = !setup;
    $("#gPass2").required = setup;
    $("#gBtn").textContent = setup ? "Create password" : "Sign in";
    $("#gPass").autocomplete = setup ? "new-password" : "current-password";
    $("#gPass").value = "";
    $("#gPass2").value = "";
    say($("#gMsg"), "");
    $("#gPass").focus();
  }

  $("#gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#gMsg"), pw = $("#gPass").value, admin = getAdmin();
    say(msg, "");
    function fail(err) { say(msg, err.message, "error"); }
    if (!admin) {
      if (pw.length < 8) return say(msg, "Password must be at least 8 characters.", "error");
      if (pw !== $("#gPass2").value) return say(msg, "Passwords do not match.", "error");
      var salt = PF.salt();
      PF.hash(pw, salt).then(function (h) {
        localStorage.setItem(PF.ADMIN_KEY, JSON.stringify({ salt: salt, hash: h }));
        sessionStorage.setItem(SESSION_KEY, "1");
        start();
      }).catch(fail);
    } else {
      PF.hash(pw, admin.salt).then(function (h) {
        if (h !== admin.hash) return say(msg, "Incorrect password.", "error");
        sessionStorage.setItem(SESSION_KEY, "1");
        start();
      }).catch(fail);
    }
  });

  $("#logout").addEventListener("click", function () {
    sessionStorage.removeItem(SESSION_KEY);
    showGate();
  });

  function start() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    resetForm();
    render();
    renderCv();
  }

  /* ---------- list ---------- */
  function render() {
    var projects = PF.projects.all();
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
    PF.projects.save(PF.projects.all().filter(function (x) { return x.id !== p.id; }));
    if (editingId === p.id) resetForm();
    render();
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

  // Resize to max 900px and re-encode as JPEG so many projects fit in browser storage
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
        ctx.fillStyle = "#15151a";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(objUrl);
        resolve(c.toDataURL("image/jpeg", 0.82));
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
    if (!url) return say(msg, "Enter a full URL starting with http:// or https://", "error");
    if (!image) return say(msg, "Choose an image.", "error");

    var list = PF.projects.all(), next;
    if (editingId) {
      next = list.map(function (p) {
        return p.id === editingId ? { id: p.id, title: title, image: image, url: url } : p;
      });
    } else {
      if (list.length >= MAX_PROJECTS) return say(msg, "Limit of " + MAX_PROJECTS + " projects reached.", "error");
      next = list.concat({ id: newId(), title: title, image: image, url: url });
    }
    try {
      PF.projects.save(next);
    } catch (err) {
      return say(msg, "Browser storage is full. Delete a project first.", "error");
    }
    var wasEdit = !!editingId;
    resetForm();
    render();
    say(msg, wasEdit ? "Saved. Your site is updated." : "Added. It's now orbiting on your site.", "ok");
  });

  /* ---------- backup / import ---------- */
  $("#export").addEventListener("click", function () {
    var data = PF.projects.all().map(function (p) {
      return { title: p.title, image: p.image, url: p.url };
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "projects.json";
    document.body.append(a);
    a.click();
    a.remove();
    say($("#dataMsg"), "Saved projects.json. Put it next to index.html to publish.", "ok");
  });

  $("#importFile").addEventListener("change", function () {
    var f = this.files[0], msg = $("#dataMsg");
    this.value = "";
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error("The file must contain a list of projects.");
      var clean = [], skipped = 0;
      data.forEach(function (p) {
        var title = String((p && p.title) || "").trim();
        var url = cleanUrl(p && p.url);
        var img = String((p && p.image) || "").trim();
        var imgOk = /^(data:image\/(png|jpeg|webp|gif);base64,|https?:\/\/|[A-Za-z0-9_\-.\/]+$)/i.test(img);
        if (!title || title.length > 80 || !url || !img || !imgOk) { skipped++; return; }
        clean.push({ id: newId(), title: title, image: img, url: url });
      });
      var replace = $("#importMode").value === "replace";
      var next = (replace ? [] : PF.projects.all()).concat(clean);
      var over = Math.max(0, next.length - MAX_PROJECTS);
      next = next.slice(0, MAX_PROJECTS);
      PF.projects.save(next);
      resetForm();
      render();
      var note = clean.length + " imported";
      if (skipped) note += ", " + skipped + " skipped (incomplete)";
      if (over) note += ", " + over + " dropped (limit " + MAX_PROJECTS + ")";
      say(msg, note + ".", "ok");
    }).catch(function (err) {
      say(msg, err instanceof SyntaxError ? "That file isn't valid JSON." : (err.name === "QuotaExceededError" ? "Browser storage is full." : err.message), "error");
    });
  });

  /* ---------- CV ---------- */
  var MAX_CV_BYTES = 3 * 1024 * 1024;
  var cvBlobUrl = null;

  function dataToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var bin = atob(parts[1]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "application/pdf" });
  }

  function renderCv() {
    var cv = PF.cv.get();
    if (cvBlobUrl) { URL.revokeObjectURL(cvBlobUrl); cvBlobUrl = null; }
    $("#cvView").hidden = $("#cvExport").hidden = $("#cvRemove").hidden = !cv;
    if (!cv) {
      $("#cvStatus").textContent = "No CV uploaded yet. The Download CV buttons are hidden on your site.";
      return;
    }
    var kb = Math.round((cv.data.length * 3 / 4) / 1024);
    $("#cvStatus").textContent = "Current CV: " + (cv.name || "CV.pdf") + " (" + kb + " KB). Live on your site.";
    try {
      cvBlobUrl = URL.createObjectURL(dataToBlob(cv.data));
      $("#cvView").href = cvBlobUrl;
    } catch (e) { $("#cvView").hidden = true; }
  }

  $("#cvFile").addEventListener("change", function () {
    var f = this.files[0], msg = $("#cvMsg"), input = this;
    if (!f) return;
    function done() { input.value = ""; }
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { done(); return say(msg, "Please choose a PDF file.", "error"); }
    if (f.size > MAX_CV_BYTES) { done(); return say(msg, "That PDF is over 3 MB. Please compress it first.", "error"); }
    say(msg, "Saving...");
    var reader = new FileReader();
    reader.onerror = function () { done(); say(msg, "Could not read that file.", "error"); };
    reader.onload = function () {
      var data = String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,");
      try {
        PF.cv.save({ name: f.name, data: data });
      } catch (err) {
        done();
        return say(msg, "Browser storage is full. Delete a project or use a smaller PDF.", "error");
      }
      done();
      renderCv();
      say(msg, "CV saved. The Download CV buttons are live on your site.", "ok");
    };
    reader.readAsDataURL(f);
  });

  $("#cvRemove").addEventListener("click", function () {
    if (!confirm("Remove your CV? The Download CV buttons will disappear from your site.")) return;
    PF.cv.clear();
    renderCv();
    say($("#cvMsg"), "CV removed.", "ok");
  });

  $("#cvExport").addEventListener("click", function () {
    var cv = PF.cv.get();
    if (!cv) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(dataToBlob(cv.data));
    a.download = "cv.pdf";
    document.body.append(a);
    a.click();
    a.remove();
    say($("#cvMsg"), "Saved cv.pdf. Put it next to index.html to publish.", "ok");
  });

  /* ---------- password ---------- */
  $("#pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#pwMsg"), pw = $("#pwNew").value;
    if (pw.length < 8) return say(msg, "Password must be at least 8 characters.", "error");
    var salt = PF.salt();
    PF.hash(pw, salt).then(function (h) {
      localStorage.setItem(PF.ADMIN_KEY, JSON.stringify({ salt: salt, hash: h }));
      $("#pwNew").value = "";
      say(msg, "Password updated.", "ok");
    }).catch(function (err) { say(msg, err.message, "error"); });
  });

  /* ---------- start ---------- */
  if (getAdmin() && loggedIn()) start();
  else showGate();
})();
