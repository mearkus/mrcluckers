"""Wavefront OBJ + MTL export of a baked pose."""


def write_obj(obj_path, mtl_path, mesh, materials, mtl_name=None):
    mtl_name = mtl_name or mtl_path.rsplit("/", 1)[-1]
    with open(mtl_path, "w") as fh:
        for name, spec in materials.items():
            h = spec["color"].lstrip("#")
            r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
            fh.write("newmtl %s\n" % name)
            fh.write("Kd %.6f %.6f %.6f\n" % (r, g, b))
            fh.write("Ka %.6f %.6f %.6f\n" % (r * 0.2, g * 0.2, b * 0.2))
            fh.write("Ks 0.05 0.05 0.05\n")
            fh.write("Ns %.1f\n" % max(2.0, (1.0 - spec.get("rough", 0.9)) * 200.0))
            fh.write("d 1.0\nillum 2\n\n")

    with open(obj_path, "w") as fh:
        fh.write("# Mr. Cluckers - procedurally generated plush rooster\n")
        fh.write("mtllib %s\n" % mtl_name)
        fh.write("o MrCluckers\n")
        for x, y, z in mesh.verts:
            fh.write("v %.6f %.6f %.6f\n" % (x, y, z))
        for x, y, z in mesh.norms:
            fh.write("vn %.6f %.6f %.6f\n" % (x, y, z))
        by_material = {}
        for a, b, c, mat in mesh.faces:
            by_material.setdefault(mat, []).append((a, b, c))
        for mat, faces in by_material.items():
            fh.write("g %s\nusemtl %s\n" % (mat, mat))
            for a, b, c in faces:
                fh.write("f %d//%d %d//%d %d//%d\n"
                         % (a + 1, a + 1, b + 1, b + 1, c + 1, c + 1))
