#!/usr/bin/env python3
"""Packs the two packs into the files a player actually imports.

    rainbow-magic-behavior.mcpack      one pack
    rainbow-magic-resources.mcpack     the other
    rainbow-magic.mcaddon              both at once -- the easy download

A .mcpack is a zip whose root holds manifest.json, so each folder is zipped
with its own contents at the top level. `zip` is not on every machine this is
built on, hence the standard library.

It also writes a diagnostic pair with the script module stripped out of the
behaviour pack's manifest. A pack that will not load can be bisected with it in
one download: if the no-script build loads and the real one does not, the script
module -- or the `@minecraft/server` version the manifest asks for -- is the
problem, and every item, block, recipe and texture in the pack is fine.

Run from anywhere:  python3 tools/build-addon.py
"""

from __future__ import annotations

import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

# Anything that is not part of a pack: keep the zips to assets and data only.
EXCLUDE_DIRS = {"__pycache__", ".git"}
EXCLUDE_FILES = {".DS_Store", "package.json", "package-lock.json"}

# The diagnostic build must not collide with the real pack's uuid: two packs
# sharing one uuid and version is its own silent mess.
DIAGNOSTIC_HEADER_UUID = "3f1c8bb4-6d20-4a1e-9a2f-6c5d4e3b2a19"


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


def pack_without_script(folder: str, destination: str) -> str:
    """The behaviour pack with no script module: no scripts/main.js, no
    @minecraft/server dependency, and its own identity so it can sit beside the
    real pack while being tested."""
    with open(os.path.join(folder, "manifest.json"), encoding="utf-8") as handle:
        manifest = json.load(handle)

    manifest["header"]["name"] = "Rainbow Magic (diagnostic: no script)"
    manifest["header"]["uuid"] = DIAGNOSTIC_HEADER_UUID
    manifest["header"]["version"] = [0, 0, 1]
    manifest["modules"] = [module for module in manifest["modules"] if module["type"] != "script"]
    for module in manifest["modules"]:
        module["version"] = [0, 0, 1]
    manifest["dependencies"] = [
        dependency for dependency in manifest["dependencies"] if "module_name" not in dependency
    ]

    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent="\t") + "\n")
        for path, arcname in files_in(folder):
            if arcname == "manifest.json" or arcname.startswith("scripts/"):
                continue
            archive.write(path, arcname)
    return destination


def addon(behavior: str, resources: str, destination: str) -> str:
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(behavior, os.path.basename(behavior))
        archive.write(resources, os.path.basename(resources))
    return destination


def report(paths) -> None:
    for path in paths:
        size = os.path.getsize(path)
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            broken = archive.testzip()
        if broken:
            raise SystemExit(f"{path}: corrupt entry {broken}")
        if path.endswith(".mcpack") and "manifest.json" not in names:
            raise SystemExit(f"{path}: no manifest.json at the root, Minecraft will reject it")
        print(f"{os.path.relpath(path, ROOT)}  {size // 1024} KiB  {len(names)} entries")


def main() -> None:
    os.makedirs(DIST, exist_ok=True)
    behavior_folder = os.path.join(ROOT, "behavior")
    resources_folder = os.path.join(ROOT, "resource-pack")

    behavior = pack(behavior_folder, os.path.join(DIST, "rainbow-magic-behavior.mcpack"))
    resources = pack(resources_folder, os.path.join(DIST, "rainbow-magic-resources.mcpack"))
    no_script = pack_without_script(
        behavior_folder, os.path.join(DIST, "rainbow-magic-diagnostic-no-script.mcpack")
    )

    report([behavior, resources, no_script])
    report(
        [
            addon(behavior, resources, os.path.join(DIST, "rainbow-magic.mcaddon")),
            addon(no_script, resources, os.path.join(DIST, "rainbow-magic-diagnostic-no-script.mcaddon")),
        ]
    )


if __name__ == "__main__":
    main()
