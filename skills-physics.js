/* Skills physics: a small, dependency-free 3D sphere simulation.
 *
 * - Zero gravity. A soft spring pulls every sphere toward the centre.
 * - Spheres collide (momentum is exchanged, with a little bounce and spin).
 * - The cursor pushes nearby spheres along its direction of travel, scaled by
 *   its speed, plus a radial push away from its path.
 * - Everything is in "world units": the visible half-height at z = 0 is 1, the
 *   visible half-width is `aspect`. The renderer uses the same units.
 *
 * Nothing here touches the DOM, so it can be tested in Node. */
(function (root) {
  "use strict";

  // Tweak these to change how the cluster feels.
  var CONFIG = {
    attraction: 1.6,     // pull toward the centre, in 1/s^2 (higher = tighter cluster)
    flatten: 7,          // extra pull on z so the cluster stays a shallow slab facing the camera
    drag: 0.9,           // air drag per second (higher = settles faster)
    restitution: 0.55,   // bounciness of collisions (0 = none, 1 = perfect)
    idleDrift: 0.5,      // strength of the slow wandering when nobody interacts
    maxSpeed: 5,         // hard cap on sphere speed (world units / s)
    pointerRadius: 0.5,  // how far from the cursor spheres are affected
    pointerPush: 1.7,    // push along the cursor's direction of travel (grows with speed)
    pointerRepel: 1.3,   // push away from the cursor's path (grows with speed)
    spinDrag: 2.0,       // damping of rotation
    faceCamera: 3.5,     // gentle torque that swings logos back toward the viewer
    keepUpright: 0.9,    // gentle torque that keeps logos the right way up
    idleSpin: 0.7,       // slow rotational wobble so spheres feel alive
    collisionSpin: 0.5,  // how much a glancing collision spins the spheres
    substep: 1 / 120,    // fixed physics step in seconds
    iterations: 3,       // collision solver passes per step
    seed: 12345
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createWorld(options) {
    var cfg = {};
    var k;
    for (k in CONFIG) cfg[k] = CONFIG[k];
    for (k in (options || {})) cfg[k] = options[k];

    var rand = mulberry32(cfg.seed);
    var bodies = [];
    var bounds = { w: 1.6, h: 1 };
    var pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false };
    var time = 0, acc = 0;
    var dragFactor = Math.exp(-cfg.drag * cfg.substep);
    var spinFactor = Math.exp(-cfg.spinDrag * cfg.substep);

    function makeBody(id, r) {
      // Start spread out so the cluster visibly pulls together, with the logo
      // roughly facing the camera plus a little random tilt.
      var ang = rand() * Math.PI * 2, dist = Math.sqrt(rand()) * 0.95;
      var tilt = (rand() - 0.5) * 0.9, roll = (rand() - 0.5) * 0.7, yaw = (rand() - 0.5) * 0.9;
      var cx = Math.cos(tilt / 2), sx = Math.sin(tilt / 2);
      var cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
      var cz = Math.cos(roll / 2), sz = Math.sin(roll / 2);
      // q = qz * qy * qx
      var qw = cz * cy * cx + sz * sy * sx;
      var qx = cz * cy * sx - sz * sy * cx;
      var qy = cz * sy * cx + sz * cy * sx;
      var qz = sz * cy * cx - cz * sy * sx;
      return {
        id: id, r: r, m: r * r * r,
        x: Math.cos(ang) * dist * bounds.w * 0.8,
        y: Math.sin(ang) * dist * bounds.h * 0.8,
        z: (rand() - 0.5) * 0.3,
        vx: (rand() - 0.5) * 0.3, vy: (rand() - 0.5) * 0.3, vz: 0,
        qx: qx, qy: qy, qz: qz, qw: qw,
        wx: 0, wy: 0, wz: 0,
        p1: rand() * 6.283, p2: rand() * 6.283, p3: rand() * 6.283, p4: rand() * 6.283,
        f1: 0.55 + rand() * 0.5, f2: 0.7 + rand() * 0.6
      };
    }

    /* items: [{ id, radius }] in display order. Existing spheres keep their
     * position and motion; new ones are added; missing ones are removed. */
    function sync(items) {
      var byId = {};
      bodies.forEach(function (b) { byId[b.id] = b; });
      bodies = items.map(function (it) {
        var b = byId[it.id];
        if (b) { b.r = it.radius; b.m = it.radius * it.radius * it.radius; return b; }
        return makeBody(it.id, it.radius);
      });
    }

    function resize(w, h) {
      var sx = bounds.w ? w / bounds.w : 1, sy = bounds.h ? h / bounds.h : 1;
      bodies.forEach(function (b) { b.x *= sx; b.y *= sy; });
      bounds.w = w; bounds.h = h;
    }

    function setPointer(x, y, vx, vy, on) {
      pointer.x = x; pointer.y = y; pointer.vx = vx; pointer.vy = vy; pointer.on = !!on;
    }

    function integrateBody(b, h) {
      var t = time;
      // Soft attraction toward the centre (no gravity, no floor)
      var ax = -cfg.attraction * b.x;
      var ay = -cfg.attraction * b.y;
      var az = -(cfg.attraction + cfg.flatten) * b.z;

      // Idle drift: each sphere wanders on its own slow rhythm
      ax += cfg.idleDrift * (Math.sin(t * b.f1 + b.p1) + 0.5 * Math.sin(t * b.f2 * 1.7 + b.p2));
      ay += cfg.idleDrift * (Math.sin(t * b.f2 + b.p3) + 0.5 * Math.sin(t * b.f1 * 1.9 + b.p4));

      // Cursor: push along its direction of travel + away from its path
      if (pointer.on) {
        var speed = Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy);
        if (speed > 0.05) {
          var dx = b.x - pointer.x, dy = b.y - pointer.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          var R = cfg.pointerRadius + b.r;
          if (d < R) {
            var f = 1 - d / R;
            f *= f; // strongest right at the cursor, fading smoothly
            var rx = d > 1e-4 ? dx / d : 0, ry = d > 1e-4 ? dy / d : 0;
            var sp = Math.min(speed, 6);
            // Force grows with speed (a fast pass spends less time near a sphere,
            // so a plain linear force would push every speed equally hard)
            ax += f * sp * (cfg.pointerPush * pointer.vx + cfg.pointerRepel * sp * rx);
            ay += f * sp * (cfg.pointerPush * pointer.vy + cfg.pointerRepel * sp * ry);
          }
        }
      }

      b.vx = (b.vx + ax * h) * dragFactor;
      b.vy = (b.vy + ay * h) * dragFactor;
      b.vz = (b.vz + az * h) * dragFactor;
      var v2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (v2 > cfg.maxSpeed * cfg.maxSpeed) {
        var s = cfg.maxSpeed / Math.sqrt(v2);
        b.vx *= s; b.vy *= s; b.vz *= s;
      }
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;

      // Keep the sphere inside the visible area (bounce softly off the edges)
      var lx = bounds.w - b.r, ly = bounds.h - b.r;
      if (lx < 0) lx = 0;
      if (ly < 0) ly = 0;
      if (b.x > lx) { b.x = lx; if (b.vx > 0) b.vx *= -0.4; }
      else if (b.x < -lx) { b.x = -lx; if (b.vx < 0) b.vx *= -0.4; }
      if (b.y > ly) { b.y = ly; if (b.vy > 0) b.vy *= -0.4; }
      else if (b.y < -ly) { b.y = -ly; if (b.vy < 0) b.vy *= -0.4; }

      // Rotation: damped, with gentle torques that keep the logo readable
      var qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
      var zx = 2 * (qx * qz + qy * qw), zy = 2 * (qz * qy - qx * qw);
      var yx = 2 * (qx * qy - qz * qw);
      b.wx += (zy * cfg.faceCamera + cfg.idleSpin * Math.sin(t * 0.55 + b.p1)) * h;
      b.wy += (-zx * cfg.faceCamera + cfg.idleSpin * Math.sin(t * 0.43 + b.p2)) * h;
      b.wz += (yx * cfg.keepUpright) * h;
      b.wx *= spinFactor; b.wy *= spinFactor; b.wz *= spinFactor;
      var w2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
      if (w2 > 36) { var ws = 6 / Math.sqrt(w2); b.wx *= ws; b.wy *= ws; b.wz *= ws; }

      var hx = 0.5 * h;
      var nqx = qx + hx * (b.wx * qw + b.wy * qz - b.wz * qy);
      var nqy = qy + hx * (b.wy * qw + b.wz * qx - b.wx * qz);
      var nqz = qz + hx * (b.wz * qw + b.wx * qy - b.wy * qx);
      var nqw = qw + hx * (-b.wx * qx - b.wy * qy - b.wz * qz);
      var inv = 1 / Math.sqrt(nqx * nqx + nqy * nqy + nqz * nqz + nqw * nqw);
      b.qx = nqx * inv; b.qy = nqy * inv; b.qz = nqz * inv; b.qw = nqw * inv;
    }

    function collide(pass) {
      var n = bodies.length;
      for (var i = 0; i < n; i++) {
        var a = bodies[i];
        for (var j = i + 1; j < n; j++) {
          var b = bodies[j];
          var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          var minD = a.r + b.r;
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= minD * minD) continue;
          var d = Math.sqrt(d2), nx, ny, nz;
          if (d < 1e-6) { nx = 1; ny = 0; nz = 0; d = 0; }
          else { nx = dx / d; ny = dy / d; nz = dz / d; }

          var ima = 1 / a.m, imb = 1 / b.m, sum = ima + imb;

          // Push apart (shared by inverse mass) so spheres never stay overlapped
          var pen = (minD - d) * 0.8;
          a.x -= nx * pen * ima / sum; a.y -= ny * pen * ima / sum; a.z -= nz * pen * ima / sum;
          b.x += nx * pen * imb / sum; b.y += ny * pen * imb / sum; b.z += nz * pen * imb / sum;

          if (pass !== 0) continue;
          // Exchange momentum along the contact normal
          var rvx = b.vx - a.vx, rvy = b.vy - a.vy, rvz = b.vz - a.vz;
          var vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            var e = -vn > 0.15 ? cfg.restitution : 0; // tiny impacts don't bounce (stops jitter)
            var jimp = -(1 + e) * vn / sum;
            a.vx -= jimp * nx * ima; a.vy -= jimp * ny * ima; a.vz -= jimp * nz * ima;
            b.vx += jimp * nx * imb; b.vy += jimp * ny * imb; b.vz += jimp * nz * imb;

            // Friction at the contact point. It uses the surface velocity of each
            // sphere (centre velocity + spin), so a rolling contact stops pushing
            // and resting neighbours do not spin each other forever.
            var wax = a.wy * nz - a.wz * ny, way = a.wz * nx - a.wx * nz, waz = a.wx * ny - a.wy * nx;
            var wbx = b.wy * nz - b.wz * ny, wby = b.wz * nx - b.wx * nz, wbz = b.wx * ny - b.wy * nx;
            var sx = rvx - b.r * wbx - a.r * wax, sy = rvy - b.r * wby - a.r * way, sz = rvz - b.r * wbz - a.r * waz;
            var sn = sx * nx + sy * ny + sz * nz;
            var tx = sx - sn * nx, ty = sy - sn * ny, tz = sz - sn * nz;
            var tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
            if (tl > 1e-6) {
              tx /= tl; ty /= tl; tz /= tl;
              var jt = Math.min(cfg.collisionSpin * jimp, tl / (3.5 * sum));
              a.vx += jt * tx * ima; a.vy += jt * ty * ima; a.vz += jt * tz * ima;
              b.vx -= jt * tx * imb; b.vy -= jt * ty * imb; b.vz -= jt * tz * imb;
              var cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
              var ka = 2.5 * jt * ima / a.r, kb = 2.5 * jt * imb / b.r;
              a.wx += cx * ka; a.wy += cy * ka; a.wz += cz * ka;
              b.wx += cx * kb; b.wy += cy * kb; b.wz += cz * kb;
            }
          }
        }
      }
    }

    function substep(h) {
      time += h;
      for (var i = 0; i < bodies.length; i++) integrateBody(bodies[i], h);
      for (var p = 0; p < cfg.iterations; p++) collide(p);
      // Collision push-outs can nudge a sphere a hair past the edge: keep all inside
      for (var k = 0; k < bodies.length; k++) {
        var b = bodies[k];
        var lx = Math.max(0, bounds.w - b.r), ly = Math.max(0, bounds.h - b.r);
        if (b.x > lx) b.x = lx; else if (b.x < -lx) b.x = -lx;
        if (b.y > ly) b.y = ly; else if (b.y < -ly) b.y = -ly;
      }
    }

    /* Advance by dt seconds (any frame rate) using fixed sub-steps. */
    function step(dt) {
      acc += Math.min(dt, 0.05);
      var guard = 0;
      while (acc >= cfg.substep && guard < 6) {
        substep(cfg.substep);
        acc -= cfg.substep;
        guard++;
      }
      if (acc > cfg.substep) acc = 0;
    }

    /* Run the simulation without rendering (used for reduced-motion users). */
    function settle(seconds) {
      var was = pointer.on;
      pointer.on = false;
      for (var t = 0; t < seconds; t += cfg.substep) substep(cfg.substep);
      pointer.on = was;
    }

    /* Column-major 3x3 rotation matrix for WebGL. */
    function rotationMatrix(b, out) {
      var x = b.qx, y = b.qy, z = b.qz, w = b.qw;
      out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + z * w); out[2] = 2 * (x * z - y * w);
      out[3] = 2 * (x * y - z * w); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z + x * w);
      out[6] = 2 * (x * z + y * w); out[7] = 2 * (y * z - x * w); out[8] = 1 - 2 * (x * x + y * y);
      return out;
    }

    return {
      config: cfg,
      bounds: bounds,
      get bodies() { return bodies; },
      sync: sync,
      resize: resize,
      setPointer: setPointer,
      step: step,
      settle: settle,
      rotationMatrix: rotationMatrix
    };
  }

  var api = { createWorld: createWorld, CONFIG: CONFIG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SkillsPhysics = api;
})(typeof window !== "undefined" ? window : globalThis);
