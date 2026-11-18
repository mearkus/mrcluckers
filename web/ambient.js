/* Things that move on their own: dust, leaves, water.
 *
 * A level stood perfectly still around him -- nothing drifted, nothing fell,
 * the water was a flat blue box -- and stillness is most of what makes a
 * scene read as a diorama under glass rather than a place. None of this is
 * gameplay: nothing here collides, scores or can hurt him, and all of it is
 * driven from the game's own update, so pausing freezes it with everything
 * else.
 *
 * A theme says what drifts in it with `ambient` (shared/theme.js):
 *   { kind: 'motes',  color, count }     dust hanging in the light, indoors
 *   { kind: 'leaves', colors, count }    things falling and tumbling, outdoors
 *
 * Anyone who has asked their system for reduced motion gets none of it, and
 * still water. Phones get half as many of each.
 */
import * as THREE from 'three';

const KINDS = ['motes', 'leaves'];
/** Ambient kinds a theme asked for that do not exist -- for the checks. */
export const missing = new Set();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 'rgba(r, g, b, a)' or a hex string, as a colour and an alpha. */
export function parseColour(s, fallbackAlpha = 1) {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return { color: new THREE.Color(s || '#ffffff'), alpha: fallbackAlpha };
  const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
  return { color: new THREE.Color(r / 255, g / 255, b / 255),
           alpha: Number.isFinite(a) ? a : fallbackAlpha };
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function leafShape() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(2, 16);
  g.quadraticCurveTo(30, -4, 62, 16);
  g.quadraticCurveTo(30, 36, 2, 16);
  g.fill();
  // The midrib, a shade darker, so a leaf turning over still reads as one.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(4, 16); g.lineTo(58, 16); g.stroke();
  return new THREE.CanvasTexture(c);
}

/** The half-size of what the camera currently shows, in world units. */
function viewHalf(camera) {
  return { w: (camera.right - camera.left) / 2 / camera.zoom,
           h: (camera.top - camera.bottom) / 2 / camera.zoom };
}

/* Keep a coordinate within `span` of the camera by wrapping it round, so a
 * screenful of particles serves a level of any length. */
const wrap = (v, centre, span) =>
  centre + ((((v - centre + span / 2) % span) + span) % span) - span / 2;

/**
 * The ambient life for a theme. Returns `{ update(dt, camera), count }`;
 * count is how many things are drifting, for the checks.
 */
export function createAmbient(scene, theme, { coarse = false, reduced = false, pixelRatio = 1 } = {}) {
  const spec = theme && theme.ambient;
  const none = { update() {}, count: 0 };
  if (!spec) return none;
  if (!KINDS.includes(spec.kind)) { missing.add(spec.kind); return none; }
  if (reduced) return none;

  const rand = rng(1234);
  const n = Math.max(1, Math.round((spec.count || 40) * (coarse ? 0.5 : 1)));
  // The box particles live in, around the camera: a margin wider and taller
  // than a desktop view so nothing pops in at an edge, and no bigger -- every
  // unit of margin is particles nobody sees.
  const SPAN_X = 10, SPAN_Y = 6;

  if (spec.kind === 'motes') {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const vel = [], phase = [];
    const base = new THREE.Color(spec.color || '#fff6e0');
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() - 0.5) * SPAN_X;
      pos[i * 3 + 1] = (rand() - 0.5) * SPAN_Y;
      // Some behind him and some in front: depth is what makes it air.
      pos[i * 3 + 2] = -0.45 + rand() * 2.0;
      vel.push([(rand() - 0.5) * 0.08, 0.01 + rand() * 0.04]);
      phase.push(rand() * Math.PI * 2);
      const k = 0.6 + rand() * 0.4;
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: (spec.size || 5) * pixelRatio, vertexColors: true, map: softDot(),
      transparent: true, opacity: spec.opacity || 0.75, depthWrite: false,
      // The orthographic camera does not shrink points with distance anyway.
      sizeAttenuation: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    let t = 0;
    return {
      count: n,
      update(dt, camera) {
        t += dt;
        const cx = camera.position.x, cy = camera.position.y;
        for (let i = 0; i < n; i++) {
          const j = i * 3;
          pos[j] += (vel[i][0] + 0.03 * Math.sin(t * 0.7 + phase[i])) * dt;
          pos[j + 1] += (vel[i][1] + 0.02 * Math.cos(t * 0.5 + phase[i])) * dt;
          pos[j] = wrap(pos[j], cx, SPAN_X);
          pos[j + 1] = wrap(pos[j + 1], cy, SPAN_Y);
        }
        geo.attributes.position.needsUpdate = true;
      }
    };
  }

  // Leaves: each a little lit card, falling, swaying and turning over.
  const colors = (spec.colors || ['#7a9a4a']).map((c) => new THREE.Color(c));
  const geo = new THREE.PlaneGeometry(spec.size || 0.16, (spec.size || 0.16) * 0.5);
  const mat = new THREE.MeshStandardMaterial({
    map: leafShape(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8
  });
  const leaves = new THREE.InstancedMesh(geo, mat, n);
  leaves.frustumCulled = false;
  const st = [];
  for (let i = 0; i < n; i++) {
    st.push({
      x: (rand() - 0.5) * SPAN_X, y: (rand() - 0.5) * SPAN_Y, z: -0.45 + rand() * 2.0,
      fall: 0.16 + rand() * 0.22, sway: 0.15 + rand() * 0.35, freq: 0.6 + rand() * 0.9,
      spin: (rand() - 0.5) * 4, phase: rand() * Math.PI * 2,
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize()
    });
    leaves.setColorAt(i, colors[Math.floor(rand() * colors.length)]);
  }
  leaves.instanceColor.needsUpdate = true;
  scene.add(leaves);
  const o = new THREE.Object3D(), q = new THREE.Quaternion();
  let t = 0;
  return {
    count: n,
    update(dt, camera) {
      t += dt;
      const cx = camera.position.x, cy = camera.position.y;
      const half = viewHalf(camera);
      for (let i = 0; i < n; i++) {
        const s = st[i];
        s.y -= s.fall * dt;
        s.x += Math.sin(t * s.freq + s.phase) * s.sway * dt + 0.04 * dt;
        // Gone under the view: back in again above it, somewhere new.
        if (s.y < cy - half.h - 0.6) {
          s.y = cy + half.h + 0.4 + rand() * 0.8;
          s.x = cx + (rand() - 0.5) * SPAN_X;
        }
        s.y = wrap(s.y, cy, SPAN_Y);
        s.x = wrap(s.x, cx, SPAN_X);
        o.position.set(s.x, s.y, s.z);
        q.setFromAxisAngle(s.axis, t * s.spin + s.phase);
        o.quaternion.copy(q);
        o.updateMatrix();
        leaves.setMatrixAt(i, o.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    }
  };
}

/**
 * Water that moves: the theme's own colours (the canvas demo's `hazard`),
 * light drifting across it, and a surface that rises and falls.
 */
export function createWater(scene, hazards, theme, { reduced = false } = {}) {
  if (!hazards || !hazards.length) return { update() {} };
  const H = (theme && theme.hazard) || {};
  const body = parseColour(H.body || 'rgba(74, 143, 190, .75)', 0.75);
  const top = parseColour(H.top || 'rgba(190, 220, 240, .8)', 0.8);

  // Light on the water: soft horizontal streaks over a top-to-bottom fade.
  // A multiplier like the platform surfaces, so the theme's colour stands.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const fade = g.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgb(255,255,255)');
  fade.addColorStop(1, 'rgb(150,150,150)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 256, 128);
  const rand = rng(77);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256, y = rand() * 128, w = 10 + rand() * 40;
    g.fillStyle = `rgba(255,255,255,${0.12 + rand() * 0.25 * (1 - y / 128)})`;
    for (const dx of [-256, 0, 256]) {
      g.beginPath();
      g.ellipse(x + dx, y, w, 1.2 + rand() * 1.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  // Unlit, like the canvas demo's flat tint. Lit, the lane's blue under a low
  // orange sun came out grey, and glossy it washed out to milk; water reads
  // as water by its colour here, not by its shading. A little brighter than
  // the theme colour where the fade is white, so the body averages near it,
  // and more opaque than the canvas demo's alpha, which is laid over a flat
  // backdrop -- here it is over a textured bank.
  const mat = new THREE.MeshBasicMaterial({
    color: body.color.clone().multiplyScalar(1.15), map,
    transparent: true, opacity: Math.max(0.82, body.alpha + 0.27)
  });
  const surfMat = new THREE.MeshBasicMaterial({
    color: top.color, transparent: true, opacity: top.alpha, depthWrite: false
  });

  const strips = [];
  for (const h of hazards) {
    const geo = new THREE.BoxGeometry(h.w, h.h, 2.4);
    // One repeat of the streaks per unit of width, whatever the pool's size.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * h.w);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(h.x + h.w / 2, h.y - h.h / 2, 0);
    scene.add(m);

    // The surface: a thin bright band along the front edge whose top rises
    // and falls in a slow travelling wave.
    const seg = Math.max(8, Math.round(h.w * 10));
    const sg = new THREE.PlaneGeometry(h.w, 0.045, seg, 1);
    const s = new THREE.Mesh(sg, surfMat);
    s.position.set(h.x + h.w / 2, h.y - 0.02, 1.21);
    scene.add(s);
    const p = sg.attributes.position;
    const rest = [];
    for (let i = 0; i < p.count; i++) rest.push(p.getY(i));
    strips.push({ geo: sg, rest, x0: h.x });
  }

  let t = 0;
  return {
    update(dt) {
      if (reduced) return;
      t += dt;
      map.offset.x = (map.offset.x + dt * 0.04) % 1;
      for (const s of strips) {
        const p = s.geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (s.rest[i] <= 0) continue;          // only the top edge moves
          const x = p.getX(i) + s.x0;
          p.setY(i, s.rest[i] + 0.018 * Math.sin(x * 5 - t * 1.6)
                              + 0.010 * Math.sin(x * 11 + t * 2.3));
        }
        p.needsUpdate = true;
      }
    }
  };
}
