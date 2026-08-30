"""glTF 2.0 / GLB exporter: rigid-part hierarchy plus node animations.

The character is a plush toy, so every part is rigid -- animating node
transforms (rather than skinning) matches how the real thing moves and
imports cleanly into Blender, Godot, Unity and three.js.
"""

import base64
import json
import struct

from . import rig
from . import texture
from . import vmath as v

FLOAT = 5126
UNSIGNED_INT = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963
REPEAT = 10497
LINEAR = 9729
LINEAR_MIPMAP_LINEAR = 9987


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_linear(h):
    h = h.lstrip("#")
    return [_srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)] + [1.0]


class _Buffer:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def _pad(self, alignment=4):
        while len(self.data) % alignment:
            self.data.append(0)

    def add_view(self, payload, target=None):
        self._pad()
        offset = len(self.data)
        self.data += payload
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        return len(self.views) - 1

    def add_vec3(self, values, target=ARRAY_BUFFER, minmax=False):
        payload = bytearray()
        for x, y, z in values:
            payload += struct.pack("<fff", x, y, z)
        acc = {
            "bufferView": self.add_view(payload, target),
            "componentType": FLOAT,
            "count": len(values),
            "type": "VEC3",
        }
        if minmax and values:
            acc["min"] = [min(p[i] for p in values) for i in range(3)]
            acc["max"] = [max(p[i] for p in values) for i in range(3)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def add_vec2(self, values):
        payload = bytearray()
        for a, b in values:
            payload += struct.pack("<ff", a, b)
        self.accessors.append({
            "bufferView": self.add_view(payload, ARRAY_BUFFER),
            "componentType": FLOAT,
            "count": len(values),
            "type": "VEC2",
        })
        return len(self.accessors) - 1

    def add_vec4(self, values, target=None):
        payload = bytearray()
        for a, b, c, d in values:
            payload += struct.pack("<ffff", a, b, c, d)
        self.accessors.append({
            "bufferView": self.add_view(payload, target),
            "componentType": FLOAT,
            "count": len(values),
            "type": "VEC4",
        })
        return len(self.accessors) - 1

    def add_scalar(self, values, minmax=True):
        payload = bytearray()
        for x in values:
            payload += struct.pack("<f", x)
        acc = {
            "bufferView": self.add_view(payload),
            "componentType": FLOAT,
            "count": len(values),
            "type": "SCALAR",
        }
        if minmax and values:
            acc["min"] = [min(values)]
            acc["max"] = [max(values)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def add_indices(self, values):
        payload = bytearray()
        for i in values:
            payload += struct.pack("<I", i)
        self.accessors.append({
            "bufferView": self.add_view(payload, ELEMENT_ARRAY_BUFFER),
            "componentType": UNSIGNED_INT,
            "count": len(values),
            "type": "SCALAR",
        })
        return len(self.accessors) - 1


def _mesh_primitives(mesh, buf, material_index, textured):
    """One primitive per material, each with its own compacted vertex range."""
    by_material = {}
    for a, b, c, mat in mesh.faces:
        by_material.setdefault(mat, []).append((a, b, c))

    primitives = []
    for mat, faces in by_material.items():
        remap = {}
        positions, normals, uvs, tans, indices = [], [], [], [], []
        for tri in faces:
            for i in tri:
                j = remap.get(i)
                if j is None:
                    j = len(positions)
                    remap[i] = j
                    positions.append(mesh.verts[i])
                    normals.append(mesh.norms[i])
                    # UVs are stored in world units; REPEAT wrapping turns
                    # the scaled value into a tiling detail map.
                    u, w = mesh.uvs[i]
                    uvs.append((u * texture.REPEAT, w * texture.REPEAT))
                    tans.append(mesh.tans[i] if mesh.tans else (1.0, 0.0, 0.0, 1.0))
                indices.append(j)
        attrs = {
            "POSITION": buf.add_vec3(positions, minmax=True),
            "NORMAL": buf.add_vec3(normals),
        }
        if textured:
            attrs["TEXCOORD_0"] = buf.add_vec2(uvs)
            attrs["TANGENT"] = buf.add_vec4(tans, target=ARRAY_BUFFER)
        primitives.append({
            "attributes": attrs,
            "indices": buf.add_indices(indices),
            "material": material_index[mat],
            "mode": 4,
        })
    return primitives


def build_gltf(parts, materials, clips=None, base=None, name="MrCluckers",
               textures=None):
    """Assemble the glTF document and its binary blob.

    `textures` maps a fabric family name to {"basecolor": png_bytes,
    "normal": png_bytes}; pass None for an untextured, flat-colour model.
    """
    buf = _Buffer()
    clips = clips or {}

    # Named apart from the animation samplers below, which would shadow it.
    images, tex_samplers, textures_json, tex_index = [], [], [], {}
    if textures:
        tex_samplers.append({
            "wrapS": REPEAT, "wrapT": REPEAT,
            "magFilter": LINEAR, "minFilter": LINEAR_MIPMAP_LINEAR,
        })
        for family in sorted(textures):
            for kind in ("basecolor", "normal"):
                png_bytes = textures[family][kind]
                images.append({
                    "name": "%s_%s" % (family, kind),
                    "mimeType": "image/png",
                    "bufferView": buf.add_view(png_bytes),
                })
                textures_json.append({"sampler": 0, "source": len(images) - 1})
                tex_index[(family, kind)] = len(textures_json) - 1

    mats_json, material_index = [], {}
    for mat_name, spec in materials.items():
        material_index[mat_name] = len(mats_json)
        pbr = {
            "baseColorFactor": _hex_linear(spec["color"]),
            "metallicFactor": 0.0,
            "roughnessFactor": spec.get("rough", 0.9),
        }
        mat = {"name": mat_name, "doubleSided": False,
               "pbrMetallicRoughness": pbr}
        family = spec.get("tex")
        if family and (family, "basecolor") in tex_index:
            pbr["baseColorTexture"] = {"index": tex_index[(family, "basecolor")]}
            mat["normalTexture"] = {
                "index": tex_index[(family, "normal")],
                "scale": spec.get("normal_scale", 1.0),
            }
        mats_json.append(mat)

    textured = bool(tex_index)
    meshes, mesh_index = [], {}
    for joint, mesh in parts.items():
        mesh_index[joint] = len(meshes)
        meshes.append({
            "name": "%s_mesh" % joint,
            "primitives": _mesh_primitives(mesh, buf, material_index, textured),
        })

    # Nodes: one armature node carrying the fit transform, then the joints.
    nodes, node_index = [], {}
    for joint in rig.ORDER:
        node_index[joint] = len(nodes) + 1        # +1 for the armature node
        nodes.append(None)
    armature = {"name": name, "children": [node_index["root"]]}
    if base is not None:
        scale = v.length((base[0][0], base[1][0], base[2][0]))
        armature["scale"] = [scale, scale, scale]
        armature["translation"] = [base[0][3], base[1][3], base[2][3]]
    nodes_out = [armature]

    for joint in rig.ORDER:
        node = {"name": joint, "translation": list(rig.REST_T[joint])}
        children = [node_index[c] for c, p, _ in rig.SKELETON if p == joint]
        if children:
            node["children"] = children
        if joint in mesh_index:
            node["mesh"] = mesh_index[joint]
        nodes_out.append(node)

    animations = []
    for clip_name, clip in clips.items():
        channels, samplers = [], []
        times = [k[0] for k in clip.keys]
        time_acc = buf.add_scalar(times)
        moved = set()
        for _, pose in clip.keys:
            moved |= set(pose.keys())
        for joint in rig.ORDER:
            if joint not in moved:
                continue
            quats = []
            for _, pose in clip.keys:
                rx, ry, rz = pose.get(joint, (0.0, 0.0, 0.0))
                quats.append(v.quat_from_euler(rx, ry, rz))
            samplers.append({"input": time_acc, "interpolation": "LINEAR",
                             "output": buf.add_vec4(quats)})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": node_index[joint], "path": "rotation"}})
        scaled = set()
        for _, p in clip.keys:
            scaled |= set(getattr(p, "scales", {}))
        for joint in rig.ORDER:
            if joint not in scaled:
                continue
            values = [getattr(p, "scales", {}).get(joint, (1.0, 1.0, 1.0))
                      for _, p in clip.keys]
            samplers.append({"input": time_acc, "interpolation": "LINEAR",
                             "output": buf.add_vec3(values)})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": node_index[joint], "path": "scale"}})

        offsets = [getattr(p, "root_offset", (0.0, 0.0, 0.0)) for _, p in clip.keys]
        if any(o != (0.0, 0.0, 0.0) for o in offsets):
            translations = [v.add(rig.REST_T["root"], o) for o in offsets]
            samplers.append({"input": time_acc, "interpolation": "LINEAR",
                             "output": buf.add_vec3(translations)})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": node_index["root"], "path": "translation"}})
        animations.append({"name": clip_name, "channels": channels, "samplers": samplers})

    doc = {
        "asset": {"version": "2.0", "generator": "mrcluckers procedural rig"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [0]}],
        "nodes": nodes_out,
        "meshes": meshes,
        "materials": mats_json,
        "accessors": buf.accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.data)}],
    }
    if animations:
        doc["animations"] = animations
    if images:
        doc["images"] = images
        doc["samplers"] = tex_samplers
        doc["textures"] = textures_json
    return doc, bytes(buf.data)


def write_glb(path, doc, blob):
    while len(blob) % 4:
        blob += b"\x00"
    doc = dict(doc)
    doc["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    with open(path, "wb") as fh:
        fh.write(out)
    return total


def write_gltf(path, doc, blob):
    """Self-contained .gltf with the buffer inlined as a data URI."""
    doc = dict(doc)
    doc["buffers"] = [{
        "byteLength": len(blob),
        "uri": "data:application/octet-stream;base64," +
               base64.b64encode(blob).decode("ascii"),
    }]
    with open(path, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
