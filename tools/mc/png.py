"""Minimal RGBA PNG writer (stdlib zlib only)."""

import struct
import zlib


def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_rgba(path, width, height, pixels):
    """`pixels` is a flat bytes-like of length width*height*4."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)                        # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]
    png = b"\x89PNG\r\n\x1a\n"
    png += _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def blit(dst, dw, src, sw, sh, x0, y0):
    """Copy an RGBA buffer into a larger one at (x0, y0)."""
    for y in range(sh):
        d = ((y0 + y) * dw + x0) * 4
        s = y * sw * 4
        dst[d:d + sw * 4] = src[s:s + sw * 4]
