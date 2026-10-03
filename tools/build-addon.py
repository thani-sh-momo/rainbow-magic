#!/usr/bin/env python3
"""Packs the two packs into the files a player actually imports.

    rainbow-magic-behavior.mcpack    one pack
    rainbow-magic-resources.mcpack   the other
    rainbow-magic.mcaddon            both at once -- the easy download

A .mcpack is a zip whose root holds manifest.json, so each folder is zipped
with its own contents at the top level. `zip` is not on every machine this is
built on, hence the standard library.

Run from anywhere:  python3 tools/build-addon.py
"""

from __future__ import annotations

import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

# Anything that is not part of a pack: keep the zips to assets and data only.
EXCLUDE_DIRS = {"__pycache__", ".git"}
EXCLUDE_FILES = {".DS_Store", "package.json", "package-lock.json"}


def files_in(folder: str):
    for base, dirs, names in os.walk(folder):
        dirs[:] = [name for name in dirs if name not in EXCLUDE_DIRS]
        for name in sorted(names):
            if name in EXCLUDE_FILES or name.endswith(".pyc"):
                continue
            path = os.path.join(base, name)
            yield path, os.path.relpath(path, folder)


def pack(folder: str, destination: str) -> str:
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, arcname in files_in(folder):
            archive.write(path, arcname)
    return destination


def main() -> None:
    os.makedirs(DIST, exist_ok=True)
    behavior = pack(os.path.join(ROOT, "behavior"), os.path.join(DIST, "rainbow-magic-behavior.mcpack"))
    resources = pack(os.path.join(ROOT, "resource-pack"), os.path.join(DIST, "rainbow-magic-resources.mcpack"))

    # A .mcaddon is a zip of the two .mcpack files, named after the packs they hold.
    addon = os.path.join(DIST, "rainbow-magic.mcaddon")
    with zipfile.ZipFile(addon, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(behavior, "rainbow-magic-behavior.mcpack")
        archive.write(resources, "rainbow-magic-resources.mcpack")

    for path in (behavior, resources, addon):
        size = os.path.getsize(path)
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            broken = archive.testzip()
        if broken:
            raise SystemExit(f"{path}: corrupt entry {broken}")
        print(f"{os.path.relpath(path, ROOT)}  {size // 1024} KiB  {len(names)} entries")
        if not any(name == "manifest.json" for name in names) and path.endswith(".mcpack"):
            raise SystemExit(f"{path}: no manifest.json at the root, Minecraft will reject it")


if __name__ == "__main__":
    main()
