"""Bake the posed 3D model into sprite sheets for a 2D platformer.

Every frame is rendered with the same fixed orthographic camera, so cells
line up and the recorded anchor pixel maps the character's feet into the
game world.
"""

import json

from . import png, pose as po, raster
from . import vmath as v
from .vmath import deg

SIDE_RIGHT = deg(-90.0)      # character faces screen-right
THREE_QUARTER = deg(-64.0)   # a friendlier platformer angle
FRONT = deg(0.0)


def make_camera(cell, view_height=1.32, target_y=0.50, pitch=deg(4.0),
                yaw=SIDE_RIGHT):
    return raster.Camera(yaw=yaw, pitch=pitch, target=(0.0, target_y, 0.0),
                         height=view_height)


def anchor_pixel(camera, cell):
    """Where world (0,0,0) -- the point between the feet -- lands in a cell."""
    p = v.transform_point(camera.view_matrix(), (0.0, 0.0, 0.0))
    scale = cell / camera.height
    return (cell * 0.5 + p[0] * scale, cell * 0.5 - p[1] * scale)


def render_frames(parts, materials, poses, camera, cell, base=None,
                  supersample=3, outline=0.30, on_frame=None):
    frames = []
    for i, p in enumerate(poses):
        mesh = po.bake(parts, p, base)
        buf = raster.render(mesh, materials, cell, cell, camera,
                            supersample=supersample, outline=outline)
        frames.append(buf)
        if on_frame:
            on_frame(i, len(poses))
    return frames


def pack_sheet(rows, cell):
    """Lay clips out one per row; returns (buffer, width, height)."""
    cols = max(len(f) for _, f in rows)
    w, h = cols * cell, len(rows) * cell
    sheet = bytearray(w * h * 4)
    layout = {}
    for r, (name, frames) in enumerate(rows):
        boxes = []
        for c, frame in enumerate(frames):
            png.blit(sheet, w, frame, cell, cell, c * cell, r * cell)
            boxes.append({"x": c * cell, "y": r * cell, "w": cell, "h": cell})
        layout[name] = boxes
    return sheet, w, h, layout


def write_sheet(path_png, path_json, rows, clips, cell, camera, image_name=None,
                view_name="side"):
    sheet, w, h, layout = pack_sheet(rows, cell)
    png.write_rgba(path_png, w, h, sheet)

    ax, ay = anchor_pixel(camera, cell)
    doc = {
        "image": image_name or path_png.rsplit("/", 1)[-1],
        "meta": {
            "generator": "mrcluckers procedural rig",
            "size": {"w": w, "h": h},
            "cell": {"w": cell, "h": cell},
            "anchor": {"x": round(ax, 2), "y": round(ay, 2)},
            "unitsPerPixel": round(camera.height / cell, 6),
            "characterHeightPx": round(cell / camera.height, 2),
            "view": view_name,
        },
        "animations": {},
    }
    for name, boxes in layout.items():
        clip = clips[name]
        doc["animations"][name] = {
            "loop": clip.loop,
            "fps": clip.fps,
            "frames": [dict(b, duration=round(1000.0 / clip.fps)) for b in boxes],
        }
    with open(path_json, "w") as fh:
        json.dump(doc, fh, indent=2)

    # A .js twin of the same data, so demos work straight off the filesystem
    # without a web server (fetch() is blocked on file:// URLs).
    with open(path_json[:-5] + ".js", "w") as fh:
        fh.write("window.MRCLUCKERS = window.MRCLUCKERS || {};\n")
        fh.write("window.MRCLUCKERS[%s] = %s;\n"
                 % (json.dumps(doc["meta"].get("view", "side")),
                    json.dumps(doc, indent=2)))
    return w, h
