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


def key_out_background(path):
    """Alpha 0 for the connected background, 255 for the sprite."""
    image = Image.open(path).convert("RGB")
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


def icon_sprite(sprite):
    """Fit the keyed sprite into a 16x16 icon, centred, with a dark outline."""
    box = sprite.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("sprite keyed away to nothing -- is its background flat?")
    sprite = sprite.crop(box)

    longest = max(sprite.size)
    scale = ICON_INK / longest
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(size, Image.LANCZOS)
    sprite.putalpha(sprite.getchannel("A").point(lambda v: 255 if v >= ALPHA_MID else 0))

    alpha = sprite.getchannel("A")
    ring = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(3)), alpha)
    sprite = Image.composite(Image.new("RGBA", sprite.size, OUTLINE), sprite, ring)

    canvas = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    canvas.paste(sprite, ((ICON - sprite.width) // 2, (ICON - sprite.height) // 2))
    return canvas


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path, help="folder holding the generated art")
    args = parser.parse_args()

    src = args.source
    if not src.is_dir():
        raise SystemExit(f"{src} is not a directory")

    def find(name):
        hits = list(src.rglob(f"{name}.jpg")) + list(src.rglob(f"{name}.png"))
        if not hits:
            raise SystemExit(f"no {name}.jpg or {name}.png under {src}")
        return hits[0]

    print("item icons:")
    for name in ITEM_ICONS:
        save(icon_sprite(key_out_background(find(name))), RESOURCES / "items" / f"{name}.png")

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


if __name__ == "__main__":
    main()
