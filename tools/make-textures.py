#!/usr/bin/env python3
"""Draws every texture in this add-on, and the preview sheet in docs/.

The images are committed, so this only needs running when the art changes.
Pure standard library on purpose: no Pillow on the machines this is built on,
so the PNG encoder below is hand-rolled (zlib + struct, RGBA, no interlacing).

Run from anywhere:  python3 tools/make-textures.py
"""

from __future__ import annotations

import colorsys
import math
import os
import random
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = os.path.join(ROOT, "resource-pack", "textures", "items")
BLOCKS = os.path.join(ROOT, "resource-pack", "textures", "blocks")
ENTITY = os.path.join(ROOT, "resource-pack", "textures", "entity", "rainbow_magic")
DOCS = os.path.join(ROOT, "docs")

TRANSPARENT = (0, 0, 0, 0)


def hsv(hue: float, sat: float = 0.85, val: float = 1.0, alpha: int = 255):
    """Hue in 0..1, straight to an RGBA tuple."""
    red, green, blue = colorsys.hsv_to_rgb(hue % 1.0, sat, val)
    return (int(red * 255), int(green * 255), int(blue * 255), alpha)


def rainbow(t: float, sat: float = 0.85, val: float = 1.0):
    """Six evenly spaced hues across t in 0..1 -- red through violet."""
    return hsv(t * 0.83, sat, val)


class Canvas:
    """An RGBA pixel buffer with just the primitives the sprites need."""

    def __init__(self, width: int, height: int | None = None, fill=TRANSPARENT):
        self.width = width
        self.height = height if height is not None else width
        self.px = [[fill for _ in range(self.width)] for _ in range(self.height)]

    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def set(self, x: int, y: int, colour) -> None:
        if colour is None:
            return
        x, y = int(x), int(y)
        if self.inside(x, y):
            self.px[y][x] = colour

    def get(self, x: int, y: int):
        return self.px[int(y)][int(x)]

    def rect(self, x: int, y: int, w: int, h: int, colour) -> None:
        for dy in range(h):
            for dx in range(w):
                self.set(x + dx, y + dy, colour)

    def line(self, x0: int, y0: int, x1: int, y1: int, colour) -> None:
        """Bresenham, so diagonal blade edges stay one pixel crisp."""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.set(x0, y0, colour)
            if x0 == x1 and y0 == y1:
                return
            doubled = 2 * err
            if doubled > -dy:
                err -= dy
                x0 += sx
            if doubled < dx:
                err += dx
                y0 += sy

    def thick_line(self, x0, y0, x1, y1, width: int, colour_at) -> None:
        """A line `width` pixels across; `colour_at` takes 0..1 along its length,
        which is how the rainbow gradient runs down a blade."""
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        half = (width - 1) / 2.0
        for step in range(steps):
            t = step / max(steps - 1, 1)
            cx = x0 + (x1 - x0) * t
            cy = y0 + (y1 - y0) * t
            colour = colour_at(t)
            for offset in range(width):
                shift = offset - half
                # Perpendicular-ish: for the near-45 degree art here, stepping
                # both axes is within a pixel of the true normal.
                for dx, dy in ((1, 1), (1, -1)):
                    self.set(round(cx + dx * shift), round(cy + dy * shift), colour)

    def disc(self, cx: float, cy: float, radius: float, colour, filled=True) -> None:
        span = int(radius) + 2
        for y in range(int(cy) - span, int(cy) + span + 1):
            for x in range(int(cx) - span, int(cx) + span + 1):
                distance = math.hypot(x - cx, y - cy)
                if distance <= radius if filled else radius - 1 <= distance <= radius:
                    self.set(x, y, colour)

    def ellipse(self, cx, cy, rx, ry, colour, filled=True) -> None:
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                norm = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if norm <= 1.0 if filled else 0.78 <= norm <= 1.0:
                    self.set(x, y, colour)

    def scaled(self, factor: int) -> "Canvas":
        out = Canvas(self.width * factor, self.height * factor)
        for y in range(self.height):
            for x in range(self.width):
                if self.px[y][x][3] == 0:
                    continue
                out.rect(x * factor, y * factor, factor, factor, self.px[y][x])
        return out

    def paste(self, other: "Canvas", at_x: int, at_y: int) -> None:
        for y in range(other.height):
            for x in range(other.width):
                if other.px[y][x][3] != 0:
                    self.set(at_x + x, at_y + y, other.px[y][x])

    def rows(self):
        return [[channel for pixel in row for channel in pixel] for row in self.px]


def write_png(path: str, canvas: Canvas) -> None:
    raw = b"".join(b"\x00" + bytes(row) for row in canvas.rows())

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", canvas.width, canvas.height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(png)


def read_png_size(path: str):
    """Reads back the IHDR, so a broken encoder cannot pass unnoticed."""
    with open(path, "rb") as handle:
        data = handle.read(33)
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError(f"{path} is not a PNG")
    return struct.unpack(">II", data[16:24])


# --------------------------------------------------------------------------- #
# items
# --------------------------------------------------------------------------- #

OUTLINE = (28, 20, 44, 255)


def sprite_rainbow_dust() -> Canvas:
    """A small mound of glitter, not scattered confetti: the pile shape is what
    makes it read as dust at 16 pixels."""
    canvas = Canvas(16)
    rng = random.Random(11)
    # (y, half-width) from the base up, so the silhouette is a heap.
    for y, half in ((12, 5), (11, 5), (10, 4), (9, 3), (8, 2)):
        for x in range(8 - half, 8 + half + 1):
            t = (x - (8 - half)) / (2 * half)
            canvas.set(x, y, rainbow(t * 0.75 + 0.05, 0.9, 0.95 if y < 12 else 0.7))
    for x in range(3, 14):
        canvas.set(x, 13, OUTLINE)
    for x in range(5, 11):
        canvas.set(x, 7, OUTLINE)
    for x, y in ((6, 8), (9, 9), (7, 10)):
        canvas.set(x, y, (255, 255, 255, 235))
    for _ in range(3):
        canvas.set(rng.randint(4, 12), rng.randint(2, 6), (255, 255, 255, 190))
    return canvas


def sprite_rainbow_ingot() -> Canvas:
    canvas = Canvas(16)
    # A trapezoid, drawn row by row so the outline closes cleanly.
    for y in range(5, 12):
        inset = 3 if y < 7 else (2 if y < 10 else 1)
        left, right = 2 + inset, 13 - inset
        for x in range(left, right + 1):
            canvas.set(x, y, rainbow((x + y) / 26.0))
        canvas.set(left, y, OUTLINE)
        canvas.set(right, y, OUTLINE)
    for x in range(5, 11):
        canvas.set(x, 5, OUTLINE)
        canvas.set(x, 11, OUTLINE)
    for x in range(4, 10):
        canvas.set(x, 6, (255, 255, 255, 150))
    return canvas


def sprite_rainbow_blade() -> Canvas:
    canvas = Canvas(16)
    canvas.thick_line(3, 12, 6, 9, 3, lambda t: (96, 64, 40, 255) if t < 0.9 else (150, 108, 62, 255))
    for x in range(2, 7):
        canvas.set(x, 10, (240, 200, 110, 255))
    canvas.thick_line(5, 10, 14, 1, 5, lambda t: rainbow(t))
    canvas.thick_line(5, 10, 14, 1, 1, lambda t: hsv(t * 0.83, 0.15, 1.0))
    canvas.set(3, 8, (255, 255, 255, 235))
    canvas.set(13, 2, (255, 255, 255, 235))
    return canvas


def sprite_rainbow_pickaxe() -> Canvas:
    canvas = Canvas(16)
    canvas.thick_line(6, 13, 10, 5, 3, lambda t: (96, 64, 40, 255))
    # A flat bar across the top with two down-swept tips: the profile is what
    # makes it a pick rather than a dome on a stick.
    for step in range(41):
        t = step / 40
        x = 2 + 11 * t
        y = 3 + 1.6 * (abs(t - 0.5) * 2) ** 2
        canvas.set(round(x), round(y), rainbow(t))
        canvas.set(round(x), round(y) + 1, rainbow(t, 0.9, 0.75))
    for i in range(4):
        canvas.set(2 + i, 4 + i, rainbow(0.02, 0.9, 0.95))
        canvas.set(13 - i, 4 + i, rainbow(0.52, 0.9, 0.95))
    canvas.set(2, 3, OUTLINE)
    canvas.set(13, 3, OUTLINE)
    return canvas


def sprite_rainbow_shears() -> Canvas:
    canvas = Canvas(16)

    def metal(t):
        return hsv(0.5 + t * 0.35, 0.35, 1.0)

    canvas.thick_line(3, 2, 9, 9, 2, metal)
    canvas.thick_line(13, 2, 7, 9, 2, metal)
    canvas.set(8, 9, OUTLINE)
    canvas.set(8, 10, (60, 60, 70, 255))
    canvas.thick_line(7, 10, 4, 13, 2, lambda t: rainbow(0.05 + t * 0.2))
    canvas.thick_line(9, 10, 12, 13, 2, lambda t: rainbow(0.55 + t * 0.2))
    canvas.disc(4, 13, 2, OUTLINE, filled=False)
    canvas.disc(12, 13, 2, OUTLINE, filled=False)
    for x in range(6, 11):
        canvas.set(x, 1, (255, 255, 255, 200))
    return canvas


def trap_base(canvas: Canvas, hue: float) -> None:
    """The frame every magical trap shares, so the three read as one set."""
    canvas.disc(8, 8, 6.5, OUTLINE, filled=False)
    canvas.disc(8, 8, 5.2, rainbow(hue), filled=False)
    for angle in (45, 135, 225, 315):
        canvas.disc(8 + 6 * math.cos(math.radians(angle)),
                    8 + 6 * math.sin(math.radians(angle)), 1.2, rainbow(hue, 0.9, 0.8))


def sprite_trap_snare() -> Canvas:
    canvas = Canvas(16)
    trap_base(canvas, 0.28)
    # A knot of cord.
    canvas.line(5, 5, 11, 11, (240, 245, 255, 255))
    canvas.line(11, 5, 5, 11, (240, 245, 255, 255))
    canvas.disc(8, 8, 2.2, (150, 255, 200, 255), filled=False)
    canvas.set(8, 8, (255, 255, 255, 255))
    return canvas


def sprite_trap_inferno() -> Canvas:
    canvas = Canvas(16)
    trap_base(canvas, 0.02)
    # A broad flame with side tongues, filling most of the ring's interior.
    for y in range(3, 13):
        t = (y - 3) / 9.0
        half = 3.4 * (0.45 + t * 0.55)
        for x in range(8 - int(half), 8 + int(half) + 1):
            canvas.set(x, y, rainbow(0.0 + 0.09 * (1 - t), 0.95, 1.0))
    canvas.line(8, 11, 5, 6, (255, 236, 150, 255))
    canvas.line(8, 11, 11, 7, (255, 236, 150, 255))
    for y in range(7, 13):
        canvas.rect(7, y, 2, 1, (255, 250, 220, 255))
    return canvas


def sprite_trap_levity() -> Canvas:
    canvas = Canvas(16)
    trap_base(canvas, 0.55)
    # An upward arrow, which is the whole idea of the trap.
    canvas.rect(7, 5, 2, 7, (240, 250, 255, 255))
    for step in range(4):
        canvas.set(7 - step, 8 - step, (240, 250, 255, 255))
        canvas.set(8 + step, 8 - step, (240, 250, 255, 255))
        canvas.set(6 - step, 8 - step, (240, 250, 255, 255))
        canvas.set(9 + step, 8 - step, (240, 250, 255, 255))
    canvas.set(8, 4, (255, 255, 255, 255))
    return canvas


def sprite_spawn_egg() -> Canvas:
    canvas = Canvas(16)
    canvas.ellipse(7.5, 8.5, 4.6, 5.6, OUTLINE)
    canvas.ellipse(7.5, 8.5, 3.9, 4.9, (255, 122, 184, 255))
    spots = [(6, 6, 0.16), (9, 7, 0.42), (7, 10, 0.7), (10, 11, 0.9)]
    for x, y, hue in spots:
        canvas.disc(x, y, 1.4, rainbow(hue, 0.7, 1.0))
    for x in range(5, 9):
        canvas.set(x, 5, (255, 255, 255, 170))
    return canvas


# --------------------------------------------------------------------------- #
# blocks
# --------------------------------------------------------------------------- #

def ore_sprite(base_dark, base_light, seed: int) -> Canvas:
    canvas = Canvas(16)
    rng = random.Random(seed)
    for y in range(16):
        for x in range(16):
            blend = rng.random()
            shade = tuple(
                int(base_dark[i] + (base_light[i] - base_dark[i]) * blend) for i in range(3)
            ) + (255,)
            canvas.set(x, y, shade)
    # Gem clusters, not dust: vanilla ore is legible because its specks are big
    # enough to read as a mineral at 16 pixels.
    for x, y, hue in [(2, 3, 0.0), (9, 2, 0.28), (3, 9, 0.55), (10, 8, 0.75), (7, 12, 0.9)]:
        canvas.rect(x, y, 3, 3, rainbow(hue, 0.85, 0.85))
        canvas.rect(x, y, 2, 1, hsv(hue * 0.83, 0.25, 1.0))
        canvas.set(x + 2, y + 2, hsv(hue * 0.83, 0.95, 0.55))
    return canvas


def sprite_rainbow_block() -> Canvas:
    """Four tiles of rainbow with grout between them, so it reads as masonry
    rather than a gradient swatch."""
    canvas = Canvas(16)
    for tile_y in range(2):
        for tile_x in range(2):
            for y in range(7):
                for x in range(7):
                    px, py = tile_x * 8 + x, tile_y * 8 + y
                    canvas.set(px, py, rainbow((x + y) / 20.0 + (tile_x + tile_y) * 0.12))
    for i in range(16):
        canvas.set(i, 7, (36, 28, 52, 255))
        canvas.set(7, i, (36, 28, 52, 255))
        canvas.set(i, 0, (255, 255, 255, 80))
        canvas.set(0, i, (255, 255, 255, 60))
        canvas.set(i, 15, (0, 0, 0, 80))
        canvas.set(15, i, (0, 0, 0, 70))
    for x, y in ((3, 3), (11, 3), (3, 11), (11, 11)):
        canvas.set(x, y, (255, 255, 255, 210))
    return canvas


# --------------------------------------------------------------------------- #
# the unicorn, and the pack icons
# --------------------------------------------------------------------------- #

def sprite_unicorn() -> Canvas:
    """The adult horse model samples this one 64x64 texture for every part, so
    this is a UV atlas rather than a picture. Horizontal bands stand in for the
    parts, which is what makes the mane differ from the body and the legs differ
    from both once the model is wearing it."""
    canvas = Canvas(64)
    rng = random.Random(23)
    bands = (
        (0, 16, 0.90, 0.55),   # head and mane
        (16, 36, 0.04, 0.50),  # body
        (36, 52, 0.50, 0.60),  # legs and tail
        (52, 64, 0.72, 0.55),  # hooves and the rest
    )
    for top, bottom, hue, sat in bands:
        for y in range(top, bottom):
            for x in range(64):
                along = (x / 64.0) * 0.26 + ((y - top) / (bottom - top)) * 0.07
                canvas.set(x, y, rainbow(hue + along, sat, 1.0))
    for y in range(17, 19):
        for x in range(64):
            canvas.set(x, y, (255, 255, 255, 120))
    for _ in range(90):
        x, y = rng.randrange(64), rng.randrange(64)
        canvas.set(x, y, (255, 255, 255, 235))
        canvas.set(x + 1, y, (255, 255, 255, 140))
        canvas.set(x, y + 1, (255, 255, 255, 140))
    return canvas


def sprite_pack_icon() -> Canvas:
    canvas = Canvas(128)
    for y in range(128):
        for x in range(128):
            canvas.set(x, y, rainbow((x + y) / 256.0, 0.8, 1.0))
    for y in range(128):
        for x in range(128):
            if (x + y) % 32 < 2:
                canvas.set(x, y, (255, 255, 255, 60))
    cx, cy = 64, 60
    for radius, colour in ((34, (255, 255, 255, 70)), (24, (255, 255, 255, 120)), (14, (255, 255, 255, 255))):
        for y in range(128):
            for x in range(128):
                distance = math.hypot(x - cx, y - cy)
                if radius - 1 <= distance <= radius:
                    canvas.set(x, y, colour)
    for length, colour in ((44, (255, 255, 255, 255)), (30, (255, 255, 255, 255))):
        canvas.rect(cx - 2, cy - length, 4, length * 2, colour)
        canvas.rect(cx - length, cy - 2, length * 2, 4, colour)
    canvas.disc(cx, cy, 6, (255, 255, 255, 255))
    rng = random.Random(5)
    for _ in range(26):
        canvas.disc(rng.randrange(128), rng.randrange(128), 1.5, (255, 255, 255, 200))
    return canvas


# --------------------------------------------------------------------------- #

def preview(sheet: list[tuple[str, Canvas, int]]) -> None:
    """One image showing every sprite, so the art can be reviewed at a glance."""
    columns, cell, gutter = 4, 132, 10
    rows = (len(sheet) + columns - 1) // columns
    canvas = Canvas(columns * cell + gutter, rows * cell + gutter, (24, 22, 34, 255))
    for index, (_, sprite, scale) in enumerate(sheet):
        column, row = index % columns, index // columns
        x = gutter + column * cell
        y = gutter + row * cell
        canvas.rect(x, y, cell, cell, (38, 35, 52, 255))
        for i in range(4):
            canvas.rect(x + i, y + i, cell - i * 2, cell - i * 2, (38, 35, 52, 255))
        big = sprite.scaled(scale)
        canvas.paste(big, x + (cell - big.width) // 2, y + (cell - big.height) // 2)
    write_png(os.path.join(DOCS, "preview.png"), canvas)


def main() -> None:
    items = {
        "rainbow_dust": sprite_rainbow_dust(),
        "rainbow_ingot": sprite_rainbow_ingot(),
        "rainbow_blade": sprite_rainbow_blade(),
        "rainbow_pickaxe": sprite_rainbow_pickaxe(),
        "rainbow_shears": sprite_rainbow_shears(),
        "trap_snare": sprite_trap_snare(),
        "trap_inferno": sprite_trap_inferno(),
        "trap_levity": sprite_trap_levity(),
        "glitter_unicorn_spawn_egg": sprite_spawn_egg(),
    }
    blocks = {
        "rainbow_ore": ore_sprite((104, 104, 104), (146, 146, 146), 7),
        "deepslate_rainbow_ore": ore_sprite((58, 58, 64), (92, 92, 100), 13),
        "rainbow_block": sprite_rainbow_block(),
    }
    entity = {"glitter_unicorn": sprite_unicorn()}

    written = []
    for name, sprite in items.items():
        path = os.path.join(ITEMS, f"{name}.png")
        write_png(path, sprite)
        written.append(path)
    for name, sprite in blocks.items():
        path = os.path.join(BLOCKS, f"{name}.png")
        write_png(path, sprite)
        written.append(path)
    for name, sprite in entity.items():
        path = os.path.join(ENTITY, f"{name}.png")
        write_png(path, sprite)
        written.append(path)

    icon = sprite_pack_icon()
    for path in (
        os.path.join(ROOT, "behavior", "pack_icon.png"),
        os.path.join(ROOT, "resource-pack", "pack_icon.png"),
    ):
        write_png(path, icon)
        written.append(path)

    preview(
        [(name, sprite, 8) for name, sprite in items.items()]
        + [(name, sprite, 8) for name, sprite in blocks.items()]
        + [(name, sprite, 2) for name, sprite in entity.items()]
    )

    for path in written:
        width, height = read_png_size(path)
        expected = 128 if path.endswith("pack_icon.png") else None
        if expected and (width, height) != (expected, expected):
            raise SystemExit(f"{path}: expected {expected}x{expected}, got {width}x{height}")
        print(f"{os.path.relpath(path, ROOT)}  {width}x{height}")


if __name__ == "__main__":
    main()
