/* What the level is made of: tiling surface detail for the three.js demo.
 *
 * Every platform was a flat colour, which is the single thing that most made
 * the levels look unfinished next to a textured, sheened rooster. These are
 * the textures, drawn at load time on a canvas -- no image files, nothing to
 * build, and only the surfaces a level actually uses are ever drawn.
 *
 * Each map is a *detail* map: near-white, multiplying the colour the theme
 * already gives the part. That is the same trick the character's fabric
 * maps use (tools/mc/texture.py), and it is what keeps shared/theme.js the
 * one place colour is decided -- a sofa is still the sofa's mauve, only now
 * it is a woven mauve. The material's colour is scaled up by the inverse of
 * the map's mean, so on average a part is exactly as bright as its palette
 * entry and still agrees with the canvas demo, which draws it flat.
 *
 * UVs are in world units (see worldUV), so a texel is the same size on a
 * two-unit crate and a twenty-unit floor, and the floorboards of two ledges
 * side by side line up across the gap.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------- noise */

// Seeded, so the same level draws the same wood grain on every visit.
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

function hash(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Value noise that wraps every `px` by `py` cells, so a texture built from it
 * tiles without a seam. */
function tnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a, p) => ((a % p) + p) % p;
  const x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

// Fractal sum, -0.5..0.5 or so. `fx`, `fy` are cells across the tile.
function fbm(u, v, fx, fy, seed, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tnoise(u * fx, v * fy, fx, fy, seed + o * 17);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm - 0.5;
}

/* --------------------------------------------------------- surfaces
 *
 * Each returns a function of (u, v) in 0..1 across one tile, giving a
 * brightness, or draws on the canvas itself where shapes are easier than
 * fields (leaves, pebbles). `tile` is how many world units one repeat spans:
 * he is one unit tall, so a board is a quarter of him and a kitchen tile half.
 */
const clamp = (x) => Math.max(0, Math.min(1, x));

function woodAt(u, v, seed) {
  // Grain runs along x. Rings are a sine pushed around by low noise; fine
  // streaks on top so it is not a clean stripe.
  const ring = Math.sin((v * 22 + 2.2 * fbm(u, v, 2, 3, seed)) * Math.PI * 2);
  return 0.86 + 0.06 * ring + 0.10 * fbm(u, v, 4, 48, seed + 5, 3);
}

// Where the vertical joints fall in each course of stone, fixed per course.
const STONE_JOINTS = [0, 1, 2].map((row) => {
  const r = rng(81 + row), out = [];
  for (let at = r() * 0.3; at < 1; at += 0.28 + r() * 0.3) out.push(at);
  return out;
});

const SURFACES = {
  wood: { tile: 1.2, field: (u, v) => woodAt(u, v, 11) },

  // Floorboards and plank walls: wood in courses, four to the unit, with a
  // staggered butt joint in each.
  boards: {
    tile: 1, field: (u, v) => {
      const row = Math.floor(v * 4);
      const inRow = v * 4 - row;
      const joint = hash(row, 3, 7);
      let w = woodAt(u + row * 0.37, v, 23 + row);
      if (inRow < 0.035 || inRow > 0.965) w *= 0.62;
      const du = Math.abs(((u - joint + 1) % 1));
      if (du < 0.006 || du > 0.994) w *= 0.66;
      return w;
    }
  },

  fabric: {
    tile: 0.35, field: (u, v) => {
      const n = 28;
      const warp = Math.sin(u * n * Math.PI * 2), weft = Math.sin(v * n * Math.PI * 2);
      const weave = (Math.floor(u * n) + Math.floor(v * n)) % 2 ? warp : weft;
      return 0.90 + 0.045 * weave + 0.07 * fbm(u, v, 3, 3, 31);
    }
  },

  bark: {
    tile: 1, field: (u, v) => {
      const ridge = Math.abs(Math.sin((v * 9 + 1.5 * fbm(u, v, 3, 2, 41)) * Math.PI));
      return 0.74 + 0.16 * ridge + 0.10 * fbm(u, v, 3, 24, 43, 3);
    }
  },

  metal: {
    tile: 1, field: (u, v) => 0.94 + 0.05 * fbm(u, v, 2, 80, 51, 3)
  },

  soil: {
    tile: 1.4, field: (u, v) => {
      const strata = 0.04 * Math.sin((v * 7 + fbm(u, v, 2, 2, 61)) * Math.PI * 2);
      return 0.86 + 0.14 * fbm(u, v, 6, 6, 63) + strata;
    },
    // Stones in the earth: some pale, some dark, all small.
    draw(g, S, rand) {
      for (let i = 0; i < 70; i++) {
        const x = rand() * S, y = rand() * S;
        const r = (0.006 + rand() * 0.016) * S;
        const tone = rand() < 0.55 ? 235 + rand() * 20 : 150 + rand() * 30;
        wrapped(g, S, x, y, r * 2.5, (gx, gy) => {
          g.fillStyle = `rgb(${tone},${tone},${tone})`;
          g.beginPath();
          g.ellipse(gx, gy, r * (1.1 + rand() * 0.5), r, rand() * Math.PI, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
  },

  // Wall and floor tile: two to the unit, grout between, each tile its own
  // shade so the grid reads as separate pieces and not a printed pattern.
  tile: {
    tile: 1, field: (u, v) => {
      const n = 2, gu = u * n, gv = v * n;
      const fu = gu - Math.floor(gu), fv = gv - Math.floor(gv);
      if (fu < 0.03 || fu > 0.97 || fv < 0.03 || fv > 0.97) return 0.70;
      const shade = hash(Math.floor(gu), Math.floor(gv), 71) * 0.05;
      return 0.95 - shade + 0.02 * fbm(u, v, 8, 8, 73, 2);
    }
  },

  // Coursed stone: three courses to the unit, blocks of uneven length.
  stone: {
    tile: 1, field: (u, v) => {
      const row = Math.floor(v * 3);
      const fv = v * 3 - row;
      if (fv < 0.05 || fv > 0.95) return 0.66;
      const joints = STONE_JOINTS[row];
      let block = 0;
      for (const j of joints) {
        const d = Math.abs(u - j);
        if (Math.min(d, 1 - d) < 0.012) return 0.66;
        if (u >= j) block++;
      }
      return 0.84 + hash(block, row, 83) * 0.1 + 0.10 * fbm(u, v, 5, 5, 85);
    }
  },

  // Foliage: drawn as leaves rather than a field, overlapping, each its own
  // tone, so a hedge has depth instead of a green-on-green speckle.
  leaves: {
    tile: 0.8, field: () => 0.62,
    draw(g, S, rand) {
      for (let i = 0; i < 900; i++) {
        const x = rand() * S, y = rand() * S;
        const len = (0.025 + rand() * 0.03) * S;
        const tone = 165 + rand() * 90;
        const rot = rand() * Math.PI;
        wrapped(g, S, x, y, len, (gx, gy) => {
          g.fillStyle = `rgb(${tone},${tone},${tone})`;
          g.beginPath();
          g.ellipse(gx, gy, len, len * 0.42, rot, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
  },

  // The grass on a ledge, seen side-on. Blades, upright and close.
  grass: {
    tile: 0.6, field: (u, v) => 0.86 + 0.12 * fbm(u, v, 40, 2, 91, 3)
  }
};

/** Draw `fn` at (x, y) and at every wrapped copy that could touch the tile. */
function wrapped(g, S, x, y, reach, fn) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      const gx = x + dx, gy = y + dy;
      if (gx + reach < 0 || gx - reach > S || gy + reach < 0 || gy - reach > S) continue;
      fn(gx, gy);
    }
  }
}

/* -------------------------------------------------------- textures */

const cache = new Map();
/** Surface names a level asked for that do not exist -- for the checks. */
export const missing = new Set();

export const names = () => Object.keys(SURFACES);

/**
 * The detail texture for a surface, and how to use it: `{ map, mean, tile }`.
 * Null for a surface that does not exist, which is recorded in `missing` --
 * a typo in a theme otherwise just leaves that part flat, silently.
 */
export function surface(name, size = 256) {
  const key = name + '@' + size;
  if (cache.has(key)) return cache.get(key);
  const spec = SURFACES[name];
  if (!spec) { missing.add(name); cache.set(key, null); return null; }

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const b = Math.round(clamp(spec.field(x / size, y / size)) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (spec.draw) spec.draw(g, size, rng(name.length * 977 + size));

  // The mean, so the material can be brightened back to its palette colour.
  const px = g.getImageData(0, 0, size, size).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i];
  const mean = sum / (px.length / 4) / 255;

  const map = new THREE.CanvasTexture(c);
  // A multiplier, not a colour: 0.9 has to mean "90% of the palette", which
  // is only true if it is not run through the sRGB curve on the way in.
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const out = { map, mean, tile: spec.tile };
  cache.set(key, out);
  return out;
}

/**
 * The grass edge on a ledge: solid at the top, blades hanging over the earth
 * below. Mapped across the cap's full height rather than in world units,
 * since the blade tips have to land on its bottom edge.
 */
export function grassFringe(size = 256, solidFrac = 0.55) {
  const key = 'fringe@' + size + '@' + solidFrac;
  if (cache.has(key)) return cache.get(key);
  const W = size, H = size / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(4242);
  const solid = H * solidFrac;
  // The body of the turf.
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const b = Math.round(clamp(SURFACES.grass.field(x / W, y / H)) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = y < solid ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  // Blades: thin wedges from the turf down, of every length, wrapped in x.
  for (let i = 0; i < W * 0.9; i++) {
    const x = rand() * W;
    const len = (0.25 + rand() * 0.75) * (H - solid);
    const half = 0.8 + rand() * 1.6;
    const lean = (rand() - 0.5) * 3;
    const tone = 190 + rand() * 65;
    for (const dx of [-W, 0, W]) {
      g.fillStyle = `rgb(${tone},${tone},${tone})`;
      g.beginPath();
      g.moveTo(x + dx - half, solid - 2);
      g.lineTo(x + dx + half, solid - 2);
      g.lineTo(x + dx + lean, solid + len);
      g.closePath();
      g.fill();
    }
  }
  const px = g.getImageData(0, 0, W, Math.floor(solid)).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i];
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const out = { map, mean: sum / (px.length / 4) / 255, tile: SURFACES.grass.tile };
  cache.set(key, out);
  return out;
}

/* ------------------------------------------------------------- UVs */

/**
 * Re-map a geometry's UVs to world units, projected along each vertex's
 * dominant normal axis -- a box mapping. (ox, oy) is where the mesh sits, so
 * neighbouring pieces continue one another's pattern. `tile` is the world
 * size of one repeat.
 */
export function worldUV(geo, ox, oy, tile) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nz >= nx && nz >= ny) { u = x; v = y; }
    else if (ny >= nx) { u = x; v = z; }
    else { u = z; v = y; }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geo;
}
