#!/usr/bin/env python3
"""Build Mr. Cluckers: 3D model files and 2D platformer sprite sheets.

    python3 build.py                 # everything, default settings
    python3 build.py --only sprites  # just re-bake the sheets
    python3 build.py --size 128      # bigger sprite cells

No third-party dependencies -- geometry, rendering and export are all here.
"""

import argparse
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))

from mc import anim, gltf, obj, png, pose as po, raster, rig, sprites  # noqa: E402
from mc import texture, vmath as v  # noqa: E402

VIEWS = {
    "side": sprites.SIDE_RIGHT,
    "threequarter": sprites.THREE_QUARTER,
    "front": sprites.FRONT,
}


LEVEL_KEYS = {"name", "theme", "width", "spawn", "goal",
              "platforms", "pickups", "hazards"}


def build_levels(levels_dir):
    """Bundle the hand-authored level JSON into one <script>-able file.

    Browsers block fetch() over file://, so the demos load this bundle the
    same way they load the sprite metadata.
    """
    paths = sorted(glob.glob(os.path.join(levels_dir, "*.json")))
    if not paths:
        print("  %-38s none found" % "levels/")
        return []

    levels, order = {}, []
    for path in paths:
        slug = os.path.splitext(os.path.basename(path))[0]
        with open(path) as fh:
            data = json.load(fh)
        unknown = set(data) - LEVEL_KEYS
        if unknown:
            raise SystemExit("%s: unknown keys %s" % (path, sorted(unknown)))
        for p in data.get("platforms", []):
            for k in ("x", "y", "w"):
                if k not in p:
                    raise SystemExit("%s: platform missing %r" % (path, k))
        levels[slug] = data
        order.append(slug)

    out = os.path.join(levels_dir, "levels.js")
    with open(out, "w") as fh:
        fh.write("window.MRCLUCKERS_LEVELS = %s;\n"
                 % json.dumps(levels, indent=2))
        fh.write("window.MRCLUCKERS_LEVEL_ORDER = %s;\n" % json.dumps(order))
    total = sum(len(l.get("platforms", [])) for l in levels.values())
    print("  %-38s %d levels, %d platforms" % ("levels/levels.js", len(order), total))
    return order


def build_textures(out_dir, size):
    """Generate the fabric maps, write them out, and return the PNG bytes."""
    os.makedirs(out_dir, exist_ok=True)
    maps = texture.build(size=size)
    encoded, total = {}, 0
    for family, m in maps.items():
        base_png = png.encode_gray(size, size, m["gray"])
        norm_png = png.encode_rgb(size, size, m["normal"])
        png.write_bytes(os.path.join(out_dir, "%s_basecolor.png" % family), base_png)
        png.write_bytes(os.path.join(out_dir, "%s_normal.png" % family), norm_png)
        encoded[family] = {"basecolor": base_png, "normal": norm_png}
        total += len(base_png) + len(norm_png)
    print("  %-38s %7.1f KB  (%d families at %dpx)"
          % ("textures/", total / 1024.0, len(maps), size))
    return maps, encoded


def build_model(parts, base, out_dir, clips, textures=None):
    os.makedirs(out_dir, exist_ok=True)
    doc, blob = gltf.build_gltf(parts, rig.MATERIALS, clips=clips, base=base,
                                textures=textures)

    glb = os.path.join(out_dir, "mrcluckers.glb")
    size = gltf.write_glb(glb, doc, blob)
    print("  %-38s %7.1f KB" % ("mrcluckers.glb", size / 1024.0))

    gtf = os.path.join(out_dir, "mrcluckers.gltf")
    gltf.write_gltf(gtf, doc, blob)
    print("  %-38s %7.1f KB" % ("mrcluckers.gltf", os.path.getsize(gtf) / 1024.0))

    rest = po.bake(parts, anim.make_pose(), base)
    obj.write_obj(os.path.join(out_dir, "mrcluckers.obj"),
                  os.path.join(out_dir, "mrcluckers.mtl"),
                  rest, rig.MATERIALS, mtl_name="mrcluckers.mtl",
                  texture_dir="../textures" if textures else None)
    print("  %-38s %7.1f KB" % ("mrcluckers.obj",
                                os.path.getsize(os.path.join(out_dir, "mrcluckers.obj")) / 1024.0))
    return rest


def build_sprites(parts, base, clips, out_dir, cell, view, supersample, outline,
                  textures=None):
    os.makedirs(out_dir, exist_ok=True)
    camera = sprites.make_camera(cell, yaw=VIEWS[view])
    order = ["idle", "walk", "run", "jump", "fall", "land", "crouch",
             "peck", "crow", "hurt", "squeak", "tumble"]
    rows, total = [], 0
    start = time.time()
    for name in order:
        clip = clips[name]
        frames = sprites.render_frames(parts, rig.MATERIALS, clip.poses(),
                                       camera, cell, base=base,
                                       supersample=supersample, outline=outline,
                                       textures=textures)
        rows.append((name, frames))
        total += len(frames)
        sys.stdout.write("\r  rendering %s (%d frames)      " % (name, total))
        sys.stdout.flush()

    stem = "mrcluckers_%s" % view
    w, h = sprites.write_sheet(os.path.join(out_dir, stem + ".png"),
                               os.path.join(out_dir, stem + ".json"),
                               rows, clips, cell, camera, view_name=view)
    print("\r  %-38s %4dx%-4d %d frames, %.1fs" %
          (stem + ".png", w, h, total, time.time() - start))
    return os.path.join(out_dir, stem + ".png")


def build_turnaround(parts, base, out_dir, size=256, steps=8, supersample=3,
                     textures=None):
    os.makedirs(out_dir, exist_ok=True)
    mesh = po.bake(parts, anim.make_pose(wing_lift_l=0, wing_lift_r=0,
                                         wing_sweep_l=0, wing_sweep_r=0), base)
    sheet = bytearray(size * steps * size * 4)
    for i in range(steps):
        cam = raster.Camera(yaw=v.deg(360.0 * i / steps), pitch=v.deg(6),
                            target=(0.0, 0.52, 0.0), height=1.26)
        buf = raster.render(mesh, rig.MATERIALS, size, size, cam,
                            supersample=supersample, outline=0.25,
                            textures=textures)
        png.blit(sheet, size * steps, buf, size, size, i * size, 0)
    path = os.path.join(out_dir, "turnaround.png")
    png.write_rgba(path, size * steps, size, sheet)
    print("  %-38s %4dx%-4d" % ("turnaround.png", size * steps, size))
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="assets", help="output directory")
    ap.add_argument("--size", type=int, default=96, help="sprite cell size in px")
    ap.add_argument("--supersample", type=int, default=3, help="anti-aliasing factor")
    ap.add_argument("--outline", type=float, default=0.30, help="silhouette darkening 0-1")
    ap.add_argument("--views", default="side",
                    help="comma separated: side,threequarter,front")
    ap.add_argument("--no-fuzz", action="store_true", help="skip plush surface noise")
    ap.add_argument("--flop", type=float, default=1.0,
                    help="secondary-motion amount: 0 stiff, 1 plush, >1 cartoon")
    ap.add_argument("--texture-size", type=int, default=128,
                    help="fabric tile resolution in px (128 or 256)")
    ap.add_argument("--no-textures", action="store_true",
                    help="flat colours, no fabric maps")
    ap.add_argument("--levels", default="levels", help="level source directory")
    ap.add_argument("--only", choices=["model", "sprites", "turnaround", "levels"],
                    action="append", help="build only these (repeatable)")
    args = ap.parse_args()

    only = set(args.only or ["model", "sprites", "turnaround", "levels"])
    print("Mr. Cluckers build")
    t0 = time.time()

    if "levels" in only:
        build_levels(args.levels)
    if only == {"levels"}:
        print("  done in %.1fs" % (time.time() - t0))
        return

    parts = rig.build_parts(fuzz=not args.no_fuzz)
    base = po.fit_base(parts)
    tris = sum(len(p.faces) for p in parts.values())
    print("  rig: %d parts, %d triangles" % (len(parts), tris))
    clips = anim.all_clips(flop=args.flop)

    maps = encoded = None
    if not args.no_textures:
        maps, encoded = build_textures(os.path.join(args.out, "textures"),
                                       args.texture_size)

    if "model" in only:
        build_model(parts, base, os.path.join(args.out, "model"), clips, encoded)
    if "sprites" in only:
        for view in args.views.split(","):
            view = view.strip()
            if view not in VIEWS:
                raise SystemExit("unknown view %r" % view)
            build_sprites(parts, base, clips, os.path.join(args.out, "sprites"),
                          args.size, view, args.supersample, args.outline, maps)
    if "turnaround" in only:
        build_turnaround(parts, base, os.path.join(args.out, "reference"),
                         textures=maps)

    print("  done in %.1fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
