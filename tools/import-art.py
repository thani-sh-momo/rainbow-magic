#!/usr/bin/env python3
"""Imports a folder of generated art into the pack.

    python3 tools/import-art.py ~/Downloads/rainbow-magic-art

Written for art that arrives as JPEG, because the generator this pack's art came
from cannot emit alpha. The sixteen item icons are therefore keyed out of a flat
white background by flood-filling the *connected* border region rather than by
matching white everywhere: an interior white highlight is enclosed by the sprite
and so is never reached, while the anti-aliased fringe along the outline is,
which is what stops a light halo surviving the downscale.

Everything else the pack needs is opaque -- the block tiles, the two armour
sheets, the unicorn sheet and both pack icons -- so it needs no keying at all,
just a resize. Those are full-bleed textures by design, which is why the art
prompts in docs/ART-PROMPTS.md ask for no border on them.

Prompts for all 24 images live in docs/ART-PROMPTS.md.
"""
import argparse
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter

REPO = pathlib.Path(__file__).resolve().parent.parent
RESOURCES = REPO / "resource-pack" / "textures"

ITEM_ICONS = [
    "rainbow_dust", "rainbow_ingot", "rainbow_blade", "rainbow_pickaxe",
    "rainbow_axe", "rainbow_shovel", "rainbow_hoe", "rainbow_shears",
    "rainbow_helmet", "rainbow_chestplate", "rainbow_leggings", "rainbow_boots",
    "trap_snare", "trap_inferno", "trap_levity", "glitter_unicorn_spawn_egg",
]
BLOCK_TILES = ["rainbow_ore", "deepslate_rainbow_ore", "rainbow_block"]
# rainbow_block comes back with a beveled frame around the face, which reads as a
# grid line on every block in the world once it tiles; the middle of the face is
# the part that should tile, so the frame is cropped off.
TILE_CROP = {"rainbow_block": 0.82}

TOL = 24          # how far from the corner colour still counts as background
ERODE = 5         # px of anti-aliased fringe to shave before downscaling
ICON = 16
ICON_INK = 13     # longest side of the sprite, leaving room for the outline
ALPHA_MID = 128   # below this a downscaled edge pixel is dropped
# The same outline the hand-drawn sprites use, so the set reads as one set -- and
# so the pale ones (the levity trap is nearly white) keep an edge against the
# inventory's own light background.
OUTLINE = (28, 20, 44, 255)


def key_out_background(image):
    """Alpha 0 for the connected background, 255 for the sprite."""
    image = image.convert("RGB")
    width, height = image.size
    background = image.getpixel((0, 0))

    flat = Image.new("RGB", image.size, background)
    near = ImageChops.difference(image, flat).convert("L").point(lambda v: 0 if v <= TOL else 255)

    for corner in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if near.getpixel(corner) == 0:
            ImageDraw.floodfill(near, corner, 128, thresh=0)

    alpha = near.point(lambda v: 0 if v == 128 else 255)
    if ERODE:
        alpha = alpha.filter(ImageFilter.MinFilter(2 * ERODE + 1))

    out = image.convert("RGBA")
    out.putalpha(alpha)
    return out


def decimate(image, target):
    """Reduce to `target` by a whole number, or refuse.

    This is the point of the whole sheet layout: a whole factor means the result
    is the source's own pixels averaged in exact blocks, with nothing invented. A
    sheet that comes back at some size nobody asked for -- 2912x1440 is a real
    example -- is cropped to the largest whole multiple of the target first, which
    loses a couple of percent off the outside and keeps the reduction exact.
    """
    factor = min(image.width // target[0], image.height // target[1])
    if factor < 1:
        raise SystemExit(f"{image.size} is smaller than {target}, cannot decimate")
    box = (target[0] * factor, target[1] * factor)
    if box != image.size:
        left, top = (image.width - box[0]) // 2, (image.height - box[1]) // 2
        image = image.crop((left, top, left + box[0], top + box[1]))
    print(f"      {image.size} / {factor} -> {target[0]}x{target[1]}")
    return image.reduce(factor)


def crop_cell(sheet, cols, rows, index):
    cell_w, cell_h = sheet.width // cols, sheet.height // rows
    col, row = index % cols, index // cols
    return sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))


def sprite_band(alpha):
    """The rows holding the sprite, not the label underneath it.

    The generator put a text label below every sprite on the icon sheet. A label
    is a short run of rows; a sprite is a tall one; a pair of boots side by side is
    still one tall run. Keeping only the tallest run erases the label while
    leaving the sprite exactly where it was drawn, which is what lets the cell be
    decimated without being cropped or re-fitted.
    """
    width, height = alpha.size
    raw = alpha.tobytes()
    row_has = [max(raw[y * width:(y + 1) * width]) > 0 for y in range(height)]

    runs, start, quiet = [], None, 0
    for index, has_ink in enumerate(row_has):
        if has_ink:
            quiet = 0
            if start is None:
                start = index
        else:
            quiet += 1
            if start is not None and quiet >= 3:
                runs.append((start, index - quiet))
                start = None
    if start is not None:
        runs.append((start, height - 1))
    if not runs:
        return None
    return max(runs, key=lambda run: run[1] - run[0])


def icon_from_cell(cell):
    """One icon sheet cell -> a 16x16 icon, by exact decimation.

    The cell is not decimated whole. The sprite is cropped to a box that is a
    whole multiple of the reduction factor, so the sprite fills its icon the way
    the per-asset route made it fill one, and the reduction stays exact -- the two
    things a plain resize of a bbox cannot both have. The label band is dropped
    first so it cannot drag the crop down.
    """
    keyed = key_out_background(cell)
    alpha = keyed.getchannel("A")

    band = sprite_band(alpha)
    if band is None:
        raise SystemExit("cell is empty")
    top, bottom = band
    kept = Image.new("L", alpha.size, 0)
    kept.paste(alpha.crop((0, top, alpha.width, bottom + 1)), (0, top))

    box = kept.getbbox()
    if box is None:
        raise SystemExit("cell has no sprite after dropping the label band")
    left, upper, right, lower = box

    factor = min(cell.width // ICON, cell.height // ICON)
    if factor < 2:
        raise SystemExit(f"cell {cell.size} is too small to decimate to {ICON}x{ICON}")

    def span(start, end, limit):
        """Grow [start, end) to a whole multiple of the factor, inside the cell."""
        want = max(factor, -(-(end - start) // factor) * factor)
        want = min(want, limit - limit % factor)
        origin = start - (want - (end - start)) // 2
        origin = max(0, min(origin, limit - want))
        return origin, want

    x, width = span(left, right, cell.width)
    y, height = span(upper, lower, cell.height)

    sprite = decimate(keyed.crop((x, y, x + width, y + height)), (width // factor, height // factor))
    return finish_icon(sprite)


def finish_icon(sprite):
    """Threshold the alpha, add the outline if it fits, centre on a 16x16 canvas.

    The outline is the same one the hand-drawn sprites use. It is not decoration:
    the model's pale sprites (the levity trap is nearly white) lose their
    silhouette against the inventory's own light background without it. It is
    skipped when the sprite is wide enough to fill the canvas, because the one
    pixel would have to be clipped off.
    """
    sprite.putalpha(sprite.getchannel("A").point(lambda v: 255 if v >= ALPHA_MID else 0))

    if max(sprite.size) <= ICON - 2:
        alpha = sprite.getchannel("A")
        ring = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(3)), alpha)
        sprite = Image.composite(Image.new("RGBA", sprite.size, OUTLINE), sprite, ring)

    canvas = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    canvas.paste(sprite, ((ICON - sprite.width) // 2, (ICON - sprite.height) // 2))
    return canvas


def icon_sprite(sprite):
    """Fit one keyed sprite into a 16x16 icon, centred, aspect preserved."""
    box = sprite.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("sprite keyed away to nothing -- is its background flat?")
    sprite = sprite.crop(box)

    longest = max(sprite.size)
    scale = ICON_INK / longest
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    return finish_icon(sprite.resize(size, Image.LANCZOS))


def flat_resize(path, size, crop=None):
    image = Image.open(path).convert("RGB")
    if crop:
        width, height = image.size
        image = image.crop((
            round(width * (1 - crop) / 2), round(height * (1 - crop) / 2),
            round(width * (1 + crop) / 2), round(height * (1 + crop) / 2),
        ))
    return image.resize(size, Image.LANCZOS).convert("RGBA")


def save(image, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)
    print(f"  {target.relative_to(REPO)}  {image.width}x{image.height}")


def import_folder(src):
    def find(name):
        hits = list(src.rglob(f"{name}.jpg")) + list(src.rglob(f"{name}.png"))
        if not hits:
            raise SystemExit(f"no {name}.jpg or {name}.png under {src}")
        return hits[0]

    print("item icons:")
    for name in ITEM_ICONS:
        save(icon_sprite(key_out_background(Image.open(find(name)))),
             RESOURCES / "items" / f"{name}.png")

    print("block tiles:")
    for name in BLOCK_TILES:
        save(flat_resize(find(name), (16, 16), TILE_CROP.get(name)),
             RESOURCES / "blocks" / f"{name}.png")

    print("armour sheets:")
    for name in ("rainbow_1", "rainbow_2"):
        save(flat_resize(find(name), (64, 32)), RESOURCES / "models" / "armor" / f"{name}.png")

    print("unicorn sheet:")
    save(flat_resize(find("glitter_unicorn"), (64, 64)),
         RESOURCES / "entity" / "rainbow_magic" / "glitter_unicorn.png")

    print("pack icons:")
    icons = sorted(src.rglob("pack_icon.jpg")) + sorted(src.rglob("pack_icon.png"))
    behavior_icon = [p for p in icons if "behavior" in p.parts]
    resource_icon = [p for p in icons if "behavior" not in p.parts]
    if not behavior_icon or not resource_icon:
        raise SystemExit("need one pack_icon under a behavior/ folder and one outside it")
    save(flat_resize(behavior_icon[0], (128, 128)), REPO / "behavior" / "pack_icon.png")
    save(flat_resize(resource_icon[0], (128, 128)), REPO / "resource-pack" / "pack_icon.png")


def find_sheet(folder, stem):
    for suffix in (".jpg", ".jpeg", ".png"):
        candidate = folder / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    raise SystemExit(f"no {stem}.jpg under {folder}")


def import_sheets(folder):
    """Import the five-sheet layout: whole set, exact decimation, no resampling."""
    print("icons from sheet_1 (4x4 grid):")
    sheet = Image.open(find_sheet(folder, "sheet_1")).convert("RGB")
    for index, name in enumerate(ITEM_ICONS):
        save(icon_from_cell(crop_cell(sheet, 4, 4, index)), RESOURCES / "items" / f"{name}.png")

    print("block tiles from sheet_2 (2x2 grid, last cell empty):")
    sheet = Image.open(find_sheet(folder, "sheet_2")).convert("RGB")
    for index, name in enumerate(BLOCK_TILES):
        save(decimate(crop_cell(sheet, 2, 2, index), (16, 16)).convert("RGBA"),
             RESOURCES / "blocks" / f"{name}.png")

    # The strip is one continuous spectrum, so both armour layers take the whole
    # rainbow rather than half each: the UV islands of the two layers sample
    # different parts of the sheet anyway, so a full spectrum on both reads as a
    # full rainbow on the armour.
    print("armour from sheet_3 (one strip, both layers):")
    sheet = Image.open(find_sheet(folder, "sheet_3")).convert("RGB")
    strip = decimate(sheet, (64, 32)).convert("RGBA")
    for name in ("rainbow_1", "rainbow_2"):
        save(strip.copy(), RESOURCES / "models" / "armor" / f"{name}.png")

    print("unicorn fur from sheet_4:")
    sheet = Image.open(find_sheet(folder, "sheet_4")).convert("RGB")
    save(decimate(sheet, (64, 64)).convert("RGBA"),
         RESOURCES / "entity" / "rainbow_magic" / "glitter_unicorn.png")

    print("pack icons from sheet_5 (two halves):")
    sheet = Image.open(find_sheet(folder, "sheet_5")).convert("RGB")
    targets = (REPO / "behavior" / "pack_icon.png", REPO / "resource-pack" / "pack_icon.png")
    for index, target in enumerate(targets):
        save(decimate(crop_cell(sheet, 2, 1, index), (128, 128)).convert("RGBA"), target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=pathlib.Path,
                        help="folder holding one image per asset")
    parser.add_argument("--sheets", type=pathlib.Path,
                        help="folder holding the five sheet images instead")
    args = parser.parse_args()

    if args.sheets:
        if not args.sheets.is_dir():
            raise SystemExit(f"{args.sheets} is not a directory")
        import_sheets(args.sheets)
    elif args.source:
        if not args.source.is_dir():
            raise SystemExit(f"{args.source} is not a directory")
        import_folder(args.source)
    else:
        parser.error("give a folder, or --sheets FOLDER")


if __name__ == "__main__":
    main()
