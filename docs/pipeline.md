# How it works

The whole thing is four steps: build geometry, hang it off a skeleton, add
floppiness, then export — either as a 3D model or as rendered sprites.

```
                    texture.py ─────────────┐  (fabric maps)
                                            ▼
rig.py  ──►  pose.py  ──►  floppy.py  ──►  gltf.py / obj.py   (3D model)
                                       └►  raster.py ─► sprites.py  (2D sheets)
```

Both output paths consume the same fabric maps, which is what keeps the
sprites and the live model looking like the same character.

## The modules

| Module | Responsibility |
| --- | --- |
| `vmath.py` | Vectors, 4x4 matrices, quaternions. No numpy. |
| `mesh.py` | Triangle meshes plus the primitives everything is built from: `revolve`, `loft`, `extrude`, and value noise for the plush lumpiness. |
| `rig.py` | The character: materials, every body part, and the joint hierarchy. |
| `texture.py` | Tiling fabric maps — fur, corduroy, felt — and the noise they are built from. |
| `pose.py` | Joint angles to world matrices; bakes a posed rig into one mesh. |
| `anim.py` | The clips, written as friendly parameters (`lean`, `wing_lift`, `squash`). |
| `floppy.py` | Spring solver for secondary motion. |
| `raster.py` | Orthographic software renderer: z-buffered, supersampled, RGBA out. |
| `sprites.py` | Bakes clips into sheets and writes the frame metadata. |
| `gltf.py`, `obj.py`, `png.py` | File formats, all hand-rolled against the specs. |

## Conventions

- Y up, X right, and the character faces **+Z**.
- One unit is the character's standing height. Feet rest on `y = 0`.
- Sprites are rendered with the camera yawed −90°, so he faces screen-right.
  Flip horizontally for the other direction.
- UVs are stored in **world units**, not 0–1. `texture.REPEAT` scales them at
  export time and `REPEAT` wrapping does the tiling, so texel density is
  automatically consistent across parts of different sizes.

## Changing the character

Shape lives in `rig.py`. Each body part is a function returning a mesh in its
own joint's local space, so you can retune one without touching the others —
`beak()`, `comb()`, `wing()`, `foot()` and so on. Colours are the `MATERIALS`
table at the top, sampled from photographs of the toy.

If you add a joint, add it to `SKELETON` (name, parent, offset from the
parent) and return a mesh for it from `build_parts()`. If it should flop, add
an entry to `SOFT` in `floppy.py`.

Motion lives in `anim.py`. Clips are lists of poses; `make_pose` takes
degrees and works out the per-side mirroring, so giving both wings the same
`wing_lift` moves them as mirror images rather than in parallel.

## The renderer

Deferred, in two passes: the first fills a depth/triangle/barycentric buffer,
the second shades only the pixels that survived. That matters because it's
pure Python — overdraw would otherwise be shaded and thrown away.

Shading is built for a fuzzy toy rather than realism:

- **Wrapped diffuse** — light bleeds past the terminator the way it does on fur.
- **Rim light** — grazing angles catch the light, scaled by each material's
  `fuzz`, which is what makes plush read as plush.
- **Depth-break outlines** — the silhouette is darkened, and so is any big
  depth discontinuity inside it. That's what separates a wing from the body
  when both are the same grey and the sprite is only 96 pixels tall.

## UVs and tangents

Nothing here is unwrapped in the usual sense — each primitive knows its own
parameterisation, so it emits UVs directly:

- `revolve` maps u around the circumference and v along the profile's arc
  length. Closed rings get a duplicated seam column so u can reach full
  circumference instead of wrapping back to zero.
- `loft` maps u around the first ring's perimeter and v along the run between
  ring centres, reusing ring zero's spacing so the texture doesn't shear.
- `extrude` maps the sides by perimeter and depth, and the caps planar.

`compute_tangents()` then does the standard accumulate-and-orthonormalise
pass, with handedness in the fourth component the way glTF wants it.
`mirror_x` flips that handedness, which is what keeps the mirrored right-hand
limbs lit correctly.

## Sprite metadata

`mrcluckers_side.json` carries the layout plus the numbers a game needs:

- `anchor` — where world origin (between the feet) sits inside a cell.
  Draw the sprite at `(x - anchor.x, y - anchor.y)` and his feet land on `y`.
- `characterHeightPx` — how many pixels tall he is, for scaling level geometry.
- `unitsPerPixel` — the inverse, if you'd rather work in model units.
