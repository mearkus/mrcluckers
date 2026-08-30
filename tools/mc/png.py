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


def _encode(width, height, pixels, color_type, channels):
    raw = bytearray()
    stride = width * channels
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    png = b"\x89PNG\r\n\x1a\n"
    png += _chunk(b"IHDR",
                  struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0))
    png += _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _chunk(b"IEND", b"")
    return png


def encode_gray(width, height, pixels):
    """8-bit greyscale PNG bytes -- a third the size of RGB, for detail maps."""
    return _encode(width, height, pixels, 0, 1)


def encode_rgb(width, height, pixels):
    """24-bit RGB PNG bytes, no alpha channel to carry around."""
    return _encode(width, height, pixels, 2, 3)


def write_bytes(path, data):
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


def write_gray(path, width, height, pixels):
    return write_bytes(path, encode_gray(width, height, pixels))


def write_rgb(path, width, height, pixels):
    return write_bytes(path, encode_rgb(width, height, pixels))


def blit(dst, dw, src, sw, sh, x0, y0):
    """Copy an RGBA buffer into a larger one at (x0, y0)."""
    for y in range(sh):
        d = ((y0 + y) * dw + x0) * 4
        s = y * sw * 4
        dst[d:d + sw * 4] = src[s:s + sw * 4]
