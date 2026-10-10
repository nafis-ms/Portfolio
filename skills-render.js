
(function (root) {
  "use strict";

  var FOV = 30 * Math.PI / 180;               // vertical field of view
  var CAM_Z = 1 / Math.tan(FOV / 2);          // camera distance so z = 0 has half-height 1
  var TEX_SIZE = 256;                         // logo texture size (power of two for mipmaps)
  var LOGO_SPAN = 0.72;                       // logo covers +-0.72 of the sphere radius (~46 degrees)

  var VERT = [
    "attribute vec3 aDir;",                   // unit direction = position on the unit sphere (object space)
    "uniform mat4 uProj;",
    "uniform vec3 uCenter;",
    "uniform float uRadius;",
    "uniform mat3 uRot;",
    "uniform float uCamZ;",
    "varying vec3 vObj;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "void main() {",
    "  vec3 n = uRot * aDir;",
    "  vec3 world = uCenter + n * uRadius;",
    "  vObj = aDir;",
    "  vNormal = n;",
    "  vWorld = world;",
    "  gl_Position = uProj * vec4(world - vec3(0.0, 0.0, uCamZ), 1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "varying vec3 vObj;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "uniform sampler2D uTex;",
    "uniform float uCamZ;",
    "uniform float uSpan;",
    "uniform vec3 uRimStudio;",
    "uniform vec3 uRimGlow;",
    // A tiny studio: a big soft box above-left, a cool strip on the right, and a faint violet rim behind.
    "vec3 studio(vec3 r) {",
    "  float up = r.y * 0.5 + 0.5;",
    "  vec3 col = mix(vec3(0.10, 0.10, 0.14), vec3(0.42, 0.44, 0.50), smoothstep(0.0, 1.0, up));",
    "  float box1 = smoothstep(0.62, 0.9, dot(r, normalize(vec3(-0.45, 0.75, 0.5))));",
    "  float box2 = smoothstep(0.80, 0.96, dot(r, normalize(vec3(0.85, 0.15, 0.45))));",
    "  float rim = smoothstep(0.55, 0.95, dot(r, normalize(vec3(0.1, 0.1, -1.0))));",
    "  return col + box1 * vec3(1.25) + box2 * vec3(0.5, 0.58, 0.8) + rim * uRimStudio;",
    "}",
    "void main() {",
    "  vec3 n = normalize(vNormal);",
    "  vec3 v = normalize(vec3(0.0, 0.0, uCamZ) - vWorld);",
    "  float ndv = clamp(dot(n, v), 0.0, 1.0);",

    // Logo decal: map the front of the sphere (object-space +z) to the texture, undistorted near the centre
    "  vec3 o = normalize(vObj);",
    "  vec2 uv = o.xy / uSpan * 0.5 + 0.5;",
    "  vec4 t = texture2D(uTex, clamp(uv, 0.0, 1.0));",
    "  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);",
    "  float facing = smoothstep(0.12, 0.4, o.z);",
    "  float decal = t.a * inside * facing;",
    "  vec3 albedo = mix(vec3(0.965, 0.968, 0.98), t.rgb, decal);",

    // Soft diffuse lighting from a key light, a cool fill and a little ambient
    "  vec3 L1 = normalize(vec3(-0.45, 0.75, 0.55));",
    "  vec3 L2 = normalize(vec3(0.8, -0.1, 0.5));",
    "  float d1 = max(dot(n, L1), 0.0);",
    "  float d2 = max(dot(n, L2), 0.0);",
    "  vec3 shade = vec3(0.50 + 0.12 * (n.y * 0.5 + 0.5)) + 0.55 * d1 + vec3(0.10, 0.12, 0.2) * d2;",
    "  vec3 col = albedo * shade;",

    // Glossy clear coat: a sharp highlight, reflections of the studio, and fresnel
    "  vec3 h = normalize(L1 + v);",
    "  float spec = pow(max(dot(n, h), 0.0), 140.0) * 1.3 + pow(max(dot(n, h), 0.0), 18.0) * 0.12;",
    "  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);",
    "  vec3 refl = studio(reflect(-v, n));",
    "  col = col * (1.0 - 0.2 * fres) + refl * (0.05 + 0.45 * fres) + vec3(spec);",
    "  col += uRimGlow * pow(1.0 - ndv, 3.0) * 0.4;",   // violet rim, matches the site

    // A little depth cue: spheres further back are slightly dimmer
    "  col *= 0.8 + 0.2 * smoothstep(-0.45, 0.45, vWorld.z);",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function buildSphere(lat, lon) {
    var pos = [], idx = [];
    for (var i = 0; i <= lat; i++) {
      var th = i * Math.PI / lat, st = Math.sin(th), ct = Math.cos(th);
      for (var j = 0; j <= lon; j++) {
        var ph = j * 2 * Math.PI / lon;
        // Pole axis is y; the logo faces +z (towards the camera)
        pos.push(st * Math.sin(ph), ct, st * Math.cos(ph));
      }
    }
    for (var a = 0; a < lat; a++) {
      for (var b = 0; b < lon; b++) {
        var p = a * (lon + 1) + b, q = p + lon + 1;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
  }

  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader error: " + log);
    }
    return s;
  }

  /* Draw the logo (or, if there is none / it fails to load, the skill name)
   * into a square canvas, keeping the logo's aspect ratio. */
  function makeLogoCanvas(img, label) {
    var c = document.createElement("canvas");
    c.width = c.height = TEX_SIZE;
    var g = c.getContext("2d");
    g.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    var box = TEX_SIZE * 0.84, off = (TEX_SIZE - box) / 2;
    if (img && img.naturalWidth) {
      var s = Math.min(box / img.naturalWidth, box / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.drawImage(img, (TEX_SIZE - w) / 2, (TEX_SIZE - h) / 2, w, h);
    } else {
      // Graceful fallback: the name, fitted to the decal area
      var text = String(label || "?").trim();
      var size = 120;
      g.fillStyle = "#1a1a22";
      g.textAlign = "center";
      g.textBaseline = "middle";
      do {
        g.font = "700 " + size + 'px Kanit, "Segoe UI", Arial, sans-serif';
        size -= 6;
      } while (g.measureText(text).width > box && size > 18);
      g.fillText(text, TEX_SIZE / 2, TEX_SIZE / 2 + 4);
    }
    return c;
  }

  /* Create a renderer on a canvas. Throws if WebGL is unavailable. */
  function create(canvas) {
    var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: "high-performance" }) ||
      canvas.getContext("experimental-webgl");
    if (!gl) throw new Error("WebGL is not available");

    var prog = gl.createProgram();
    var vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    var U = {};
    ["uProj", "uCenter", "uRadius", "uRot", "uCamZ", "uSpan", "uTex", "uRimStudio", "uRimGlow"].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
    var aDir = gl.getAttribLocation(prog, "aDir");

    var mesh = buildSphere(36, 56);
    var vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aDir);
    gl.vertexAttribPointer(aDir, 3, gl.FLOAT, false, 0, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.uniform1f(U.uCamZ, CAM_Z);
    gl.uniform1f(U.uSpan, LOGO_SPAN);
    gl.uniform1i(U.uTex, 0);

    /* Rim colours: violet in dark mode, sky blue in light mode */
    function setLight(on) {
      gl.useProgram(prog);
      if (on) {
        gl.uniform3f(U.uRimStudio, 0.12, 0.5, 0.85);
        gl.uniform3f(U.uRimGlow, 0.04, 0.34, 0.6);
      } else {
        gl.uniform3f(U.uRimStudio, 0.4, 0.14, 0.6);
        gl.uniform3f(U.uRimGlow, 0.2, 0.08, 0.32);
      }
    }
    setLight(false);

    var aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    var proj = new Float32Array(16), rot = new Float32Array(9);
    var textures = {};    // id -> WebGLTexture
    var blank = makeTexture(null);
    var lost = false;

    function makeTexture(source) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      if (source) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    function setTexture(id, source) {
      if (textures[id]) gl.deleteTexture(textures[id]);
      textures[id] = makeTexture(source);
    }
    function removeTexture(id) {
      if (textures[id]) { gl.deleteTexture(textures[id]); delete textures[id]; }
    }

    /* Match the canvas to its CSS size (capped pixel ratio for speed). Returns the aspect ratio. */
    function resize(maxDpr) {
      var dpr = Math.min(maxDpr || 2, root.devicePixelRatio || 1);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      var aspect = w / h;
      perspective(proj, FOV, aspect, 0.1, 20);
      gl.uniformMatrix4fv(U.uProj, false, proj);
      return aspect;
    }

    /* world: a SkillsPhysics world */
    function draw(world) {
      if (lost) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var bodies = world.bodies;
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        world.rotationMatrix(b, rot);
        gl.uniform3f(U.uCenter, b.x, b.y, b.z);
        gl.uniform1f(U.uRadius, b.r);
        gl.uniformMatrix3fv(U.uRot, false, rot);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textures[b.id] || blank);
        gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
      }
    }

    function dispose() {
      Object.keys(textures).forEach(removeTexture);
      gl.deleteTexture(blank);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }

    return {
      resize: resize,
      draw: draw,
      setTexture: setTexture,
      removeTexture: removeTexture,
      dispose: dispose,
      setLight: setLight,
      setLost: function (v) { lost = v; }
    };
  }

  root.SkillsRender = { create: create, makeLogoCanvas: makeLogoCanvas, CAM_Z: CAM_Z };
})(window);
