#!/usr/bin/env python3
"""Checks the data files against each other, before Minecraft has to.

Every id in this pack is a string that only the game resolves, so a typo is
silent: the item loads, the recipe quietly never matches, the texture is the
missing-texture checkerboard. This walks the cross-references instead.

Run from anywhere:  python3 tools/check-pack.py   (exit code 1 on a problem)
"""

from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEHAVIOR = os.path.join(ROOT, "behavior")
RESOURCES = os.path.join(ROOT, "resource-pack")

problems: list[str] = []

# The version that added tag-query block descriptors to minecraft:digger. Below
# it the descriptor is accepted but matches nothing, which leaves destroy_speeds
# empty -- and a digger with no matching entry mines nothing at all.
TAGS_DESCRIPTOR_VERSION = (1, 26, 20)

# Bedrock effect ids. "glowing" is deliberately absent: it is a Java-only effect
# and an entity.addEffect("glowing", ...) call throws at runtime.
BEDROCK_EFFECTS = {
    "absorption", "bad_omen", "blindness", "conduit_power", "darkness", "fatal_poison",
    "fire_resistance", "haste", "health_boost", "hunger", "infested", "instant_damage",
    "instant_health", "invisibility", "jump_boost", "levitation", "mining_fatigue",
    "nausea", "night_vision", "oozing", "poison", "raid_omen", "regeneration",
    "resistance", "saturation", "slow_falling", "slowness", "speed", "strength",
    "trial_omen", "village_hero", "water_breathing", "weakness", "weaving",
    "wind_charged", "wither",
}


def version_tuple(value) -> tuple:
    """Turns "1.26.50" or [1, 26, 50] into a comparable tuple."""
    if isinstance(value, (list, tuple)):
        return tuple(int(part) for part in value)
    return tuple(int(part) for part in str(value).split("."))


def complain(message: str) -> None:
    problems.append(message)


def load(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def relative(path: str) -> str:
    return os.path.relpath(path, ROOT)


def each_json(*folders: str):
    """Yields (path, document) for every .json under each folder, not recursive
    beyond one level, which is the whole shape of a pack."""
    for folder in folders:
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            path = os.path.join(folder, name)
            if name.endswith(".json") and os.path.isfile(path):
                yield path, load(path)


# --------------------------------------------------------------------------- #
# collect what the pack defines
# --------------------------------------------------------------------------- #

items: dict[str, str] = {}
for path, document in each_json(os.path.join(BEHAVIOR, "items")):
    identifier = document["minecraft:item"]["description"]["identifier"]
    items[identifier] = path

blocks: dict[str, str] = {}
for path, document in each_json(os.path.join(BEHAVIOR, "blocks")):
    identifier = document["minecraft:block"]["description"]["identifier"]
    blocks[identifier] = path

entities: dict[str, str] = {}
for path, document in each_json(os.path.join(BEHAVIOR, "entities")):
    identifier = document["minecraft:entity"]["description"]["identifier"]
    entities[identifier] = path

custom_ids = set(items) | set(blocks) | set(entities)


def is_ours(identifier: str) -> bool:
    return identifier.startswith("rainbow_magic:")


def defined(identifier: str) -> bool:
    return identifier in custom_ids


# --------------------------------------------------------------------------- #
# manifests
# --------------------------------------------------------------------------- #

uuids: dict[str, str] = {}
for pack in ("behavior", "resource-pack"):
    manifest_path = os.path.join(ROOT, pack, "manifest.json")
    manifest = load(manifest_path)["header"]
    for uuid, where in [(manifest["uuid"], f"{pack} header")]:
        if uuid in uuids:
            complain(f"{uuid}: same uuid used by {uuids[uuid]} and {where}")
        uuids[uuid] = where
    for module in load(manifest_path)["modules"]:
        if module["uuid"] in uuids:
            complain(f"{module['uuid']}: same uuid used by {uuids[module['uuid']]} and a module")
        uuids[module["uuid"]] = f"{pack} module"

behavior_manifest = load(os.path.join(BEHAVIOR, "manifest.json"))
resource_header = load(os.path.join(RESOURCES, "manifest.json"))["header"]

# This pack deliberately does NOT depend on the resource pack's uuid. The link
# would only auto-enable the resource pack, which the player enables for the
# world anyway -- while an unmet pack dependency is a silent refusal to load,
# which is exactly the failure this pack spent a release chasing. If such a
# dependency is ever added back, it must match the resource pack's header.
for dependency in behavior_manifest["dependencies"]:
    if "uuid" not in dependency:
        continue
    if dependency["uuid"] != resource_header["uuid"]:
        complain("the behavior pack depends on a uuid that is not the resource pack's header")
    elif dependency["version"] != resource_header["version"]:
        complain("the behavior pack depends on a different resource pack version")

# --------------------------------------------------------------------------- #
# items -> textures, and blocks -> textures
# --------------------------------------------------------------------------- #

item_textures = load(os.path.join(RESOURCES, "textures", "item_texture.json"))["texture_data"]
terrain_textures = load(os.path.join(RESOURCES, "textures", "terrain_texture.json"))["texture_data"]


def texture_exists(reference: str) -> bool:
    return os.path.isfile(os.path.join(RESOURCES, reference + ".png"))


for key, entry in item_textures.items():
    if not texture_exists(entry["textures"]):
        complain(f"item_texture.json: {key} points at a missing {entry['textures']}.png")
for key, entry in terrain_textures.items():
    if not texture_exists(entry["textures"]):
        complain(f"terrain_texture.json: {key} points at a missing {entry['textures']}.png")

for identifier, path in items.items():
    components = load(path)["minecraft:item"]["components"]
    icon = components.get("minecraft:icon")
    if icon is None:
        complain(f"{relative(path)}: no minecraft:icon, so it would be a missing texture")
        continue
    if isinstance(icon, dict):
        # At the format_version this pack declares, the engine wants a bare
        # texture name. The { "texture": ... } object form is a newer schema and
        # is rejected outright: "this member was found in the input, but is not
        # present in the Schema".
        complain(
            f"{relative(path)}: minecraft:icon is an object, but this format_version wants "
            f"a plain texture name -- the {{'texture': ...}} form needs a newer schema"
        )
        icon = icon.get("texture")
    if icon not in item_textures:
        complain(f"{relative(path)}: icon '{icon}' is not in item_texture.json")

    # Old-syntax component keys are not in the current schema, and ONE bad key
    # rejects the whole item: every component on it is dropped, which is how the
    # pickaxe ended up with no digger and could not mine anything.
    for key in components:
        if key.startswith("tag:"):
            complain(
                f"{relative(path)}: component '{key}' is the old item-tag syntax and is not in the "
                f"schema -- one bad key discards every component on the item; use minecraft:tags "
                f"with a tags array instead"
            )

    damage = components.get("minecraft:damage")
    if damage is not None and not isinstance(damage, dict):
        complain(
            f"{relative(path)}: minecraft:damage must be an object like "
            f'{{"value": <int>}}, not a bare {type(damage).__name__} -- vanilla writes the object form'
        )

    tags = components.get("minecraft:tags")
    if tags is not None and not (isinstance(tags, dict) and isinstance(tags.get("tags"), list)):
        complain(f"{relative(path)}: minecraft:tags must be an object with a tags array")

for identifier, path in blocks.items():
    section = load(path)["minecraft:block"]
    components = section["components"]
    # A custom block with no geometry has no model, and renders as the
    # missing-texture block: a question mark on a dirt-coloured cube.
    if "minecraft:geometry" not in components:
        complain(
            f"{relative(path)}: no minecraft:geometry -- the block has no model and "
            f"shows as the missing-texture placeholder"
        )
    for instance in components.get("minecraft:material_instances", {}).values():
        texture = instance["texture"]
        if ":" not in texture:
            complain(
                f"{relative(path)}: texture '{texture}' is not namespaced -- terrain_texture "
                f"shortnames are written as namespace:name"
            )
        if texture not in terrain_textures:
            complain(f"{relative(path)}: texture '{texture}' is not in terrain_texture.json")

    # A BLOCK's minecraft:tags is a plain array; an ITEM's is an object with a
    # tags key. Getting that backwards is silently ignored.
    block_tags = components.get("minecraft:tags")
    if block_tags is not None and not (
        isinstance(block_tags, list) and all(isinstance(tag, str) for tag in block_tags)
    ):
        complain(
            f"{relative(path)}: a block's minecraft:tags is an array of strings -- the item form "
            f"(an object with a tags key) is not valid here"
        )

for identifier, path in items.items():
    document = load(path)
    section = document["minecraft:item"]
    digger = section["components"].get("minecraft:digger")
    if not digger:
        continue
    item_version = version_tuple(document["format_version"])
    if item_version < TAGS_DESCRIPTOR_VERSION:
        for entry in digger.get("destroy_speeds", []):
            block = entry.get("block")
            if isinstance(block, dict) and "tags" in block:
                complain(
                    f"{relative(path)}: a tags block descriptor needs format_version "
                    f"{'.'.join(str(part) for part in TAGS_DESCRIPTOR_VERSION)} or later, and this "
                    f"file declares {document['format_version']} -- the descriptor is accepted but "
                    f"matches nothing, so the item mines nothing at all"
                )

    # Every canonical "is this item a pickaxe" test in the documentation pairs
    # minecraft:is_tool with the tool tag. Without is_tool the engine does not
    # treat the item as a tool at all: blocks break and nothing is harvested,
    # which reads as "it breaks but does not mine".
    tool_tags = section["components"].get("minecraft:tags", {}).get("tags", [])
    if "minecraft:is_tool" not in tool_tags:
        complain(
            f"{relative(path)}: a digger must declare the minecraft:is_tool tag as well as its tool "
            f"tag, or the engine breaks blocks without harvesting them -- has {tool_tags}"
        )

# --------------------------------------------------------------------------- #
# recipes
# --------------------------------------------------------------------------- #

for path, document in each_json(os.path.join(BEHAVIOR, "recipes")):
    key = next(key for key in document if key.startswith("minecraft:recipe_"))
    recipe = document[key]
    identifier = recipe["description"]["identifier"]
    if not is_ours(identifier):
        complain(f"{relative(path)}: recipe id '{identifier}' is not in the pack's namespace")

    result = recipe.get("result") or recipe.get("output")
    result_item = result["item"] if isinstance(result, dict) else result
    if is_ours(result_item) and not defined(result_item):
        complain(f"{relative(path)}: result '{result_item}' is not defined by this pack")

    ingredients: list[str] = []
    if "key" in recipe:
        ingredients = [entry["item"] for entry in recipe["key"].values()]
    elif "ingredients" in recipe:
        ingredients = [entry["item"] for entry in recipe["ingredients"]]
    elif "input" in recipe:
        entry = recipe["input"]
        ingredients = [entry["item"] if isinstance(entry, dict) else entry]
    for ingredient in ingredients:
        if is_ours(ingredient) and not defined(ingredient):
            complain(f"{relative(path)}: ingredient '{ingredient}' is not defined by this pack")

    tags = recipe.get("tags", [])
    if "crafting_table" in tags and len(recipe.get("pattern", [])) == 0 and "ingredients" not in recipe:
        complain(f"{relative(path)}: a crafting_table recipe with neither a pattern nor ingredients")

    # Confirmed by the engine's own error: "1.20+ Recipes require unlock data".
    # Furnace recipes are exempt -- the same load reported no error for the one
    # furnace recipe in this pack.
    if key in ("minecraft:recipe_shaped", "minecraft:recipe_shapeless") and "unlock" not in recipe:
        complain(f"{relative(path)}: a crafting recipe needs unlock data at format_version 1.20+")
    for unlock in recipe.get("unlock", []) if isinstance(recipe.get("unlock"), list) else []:
        if "item" in unlock and is_ours(unlock["item"]) and not defined(unlock["item"]):
            complain(f"{relative(path)}: unlocks on '{unlock['item']}', which this pack does not define")

# --------------------------------------------------------------------------- #
# loot tables, features and feature rules
# --------------------------------------------------------------------------- #

loot = [path for path, _ in each_json(os.path.join(BEHAVIOR, "loot_tables", "blocks"))]
loot += [path for path, _ in each_json(os.path.join(BEHAVIOR, "loot_tables", "entities"))]

for path, document in each_json(os.path.join(BEHAVIOR, "blocks"), os.path.join(BEHAVIOR, "entities")):
    section = document.get("minecraft:block") or document.get("minecraft:entity")
    table = section["components"].get("minecraft:loot")
    if table is None:
        continue
    reference = table["table"] if isinstance(table, dict) else table
    if not os.path.isfile(os.path.join(BEHAVIOR, reference)):
        complain(f"{relative(path)}: loot table '{reference}' does not exist")

for path, document in each_json(os.path.join(BEHAVIOR, "loot_tables", "blocks"), os.path.join(BEHAVIOR, "loot_tables", "entities")):
    for pool in document["pools"]:
        for entry in pool["entries"]:
            if is_ours(entry["name"]) and not defined(entry["name"]):
                complain(f"{relative(path)}: drops '{entry['name']}', which this pack does not define")

features = {document["minecraft:ore_feature"]["description"]["identifier"]
            for _, document in each_json(os.path.join(BEHAVIOR, "features"))}
for path, document in each_json(os.path.join(BEHAVIOR, "feature_rules")):
    rule = document["minecraft:feature_rules"]
    placed = rule["description"]["places_feature"]
    if placed not in features:
        complain(f"{relative(path)}: places_feature '{placed}' is not a feature in this pack")
    if rule["conditions"]["placement_pass"] not in (
        "underground_pass", "surface_pass", "after_surface_pass", "before_surface_pass",
        "pregeneration_pass", "sky_pass", "first_pass", "final_pass",
    ):
        complain(f"{relative(path)}: unknown placement_pass '{rule['conditions']['placement_pass']}'")

for identifier, path in blocks.items():
    for path2, document in each_json(os.path.join(BEHAVIOR, "features")):
        for rule in document["minecraft:ore_feature"]["replace_rules"]:
            if rule["places_block"] not in blocks:
                complain(f"{relative(path2)}: places_block '{rule['places_block']}' is not a block in this pack")

# --------------------------------------------------------------------------- #
# the entity: client definition, geometry and the script's own ids
# --------------------------------------------------------------------------- #

client_entities = {}
for path, document in each_json(os.path.join(RESOURCES, "entity")):
    client = document["minecraft:client_entity"]["description"]
    client_entities[client["identifier"]] = (path, client)

for identifier in entities:
    if identifier not in client_entities:
        complain(f"{identifier}: has a behavior definition but no client entity, so it cannot render")

for identifier, (path, client) in client_entities.items():
    if identifier not in entities:
        complain(f"{relative(path)}: client entity '{identifier}' has no behavior definition")
    for name, reference in client["textures"].items():
        if not texture_exists(reference):
            complain(f"{relative(path)}: texture '{name}' points at a missing {reference}.png")
    # animation.horse.v3.look_at_player calls query.head_y_rotation(20), and the
    # engine only accepts that clamp argument on the vanilla horse-family types:
    # on a custom entity it errors on every frame the animation runs.
    for name, reference in client.get("animations", {}).items():
        if reference == "animation.horse.v3.look_at_player":
            complain(
                f"{relative(path)}: '{name}' is animation.horse.v3.look_at_player, which calls "
                f"query.head_y_rotation -- accepted only on vanilla horse types, so it errors every "
                f"frame on a custom entity"
            )

SCRIPT = os.path.join(BEHAVIOR, "scripts", "main.js")
script = open(SCRIPT, encoding="utf-8").read()
for identifier in re.findall(r'"(rainbow_magic:[a-z_]+)"', script):
    if not defined(identifier):
        complain(f"scripts/main.js refers to '{identifier}', which this pack does not define")

# Effect names must be Bedrock effects. A Java-only name like "glowing" throws
# only when an entity actually spawns, which is far too late to notice -- and it
# costs the other effects in the same call.
declared = re.findall(r"UNICORN_EFFECTS\s*=\s*\[([^\]]*)\]", script, re.DOTALL)
effects = set(re.findall(r'"([a-z_]+)"', " ".join(declared)))
effects |= set(re.findall(r'addEffect\(\s*"([a-z_]+)"', script))
if not effects:
    complain("scripts/main.js: no effect names found to check -- the shape changed, so the check is blind")
for effect in sorted(effects):
    if effect not in BEDROCK_EFFECTS:
        complain(f"scripts/main.js: '{effect}' is not a Bedrock effect (Java-only effects throw at runtime)")

for identifier in entities:
    if f'"{identifier}"' not in script:
        complain(f"{identifier}: not mentioned in scripts/main.js -- intentional? check the unicorn handling")

# min_engine_version has to be at least the highest format_version in the pack,
# or an engine that accepts the pack then rejects the files inside it.
engine = version_tuple(behavior_manifest["header"]["min_engine_version"])
highest = (None, (0,), "")
for path, document in each_json(
    os.path.join(BEHAVIOR, "items"),
    os.path.join(BEHAVIOR, "blocks"),
    os.path.join(BEHAVIOR, "entities"),
    os.path.join(BEHAVIOR, "recipes"),
    os.path.join(BEHAVIOR, "features"),
    os.path.join(BEHAVIOR, "feature_rules"),
):
    version = document.get("format_version")
    if isinstance(version, str) and version_tuple(version) > highest[1]:
        highest = (path, version_tuple(version), version)
if highest[0] and highest[1] > engine:
    complain(
        f"{relative(highest[0])} declares format_version {highest[2]}, above the manifest's "
        f"min_engine_version {'.'.join(str(part) for part in engine)} -- the pack loads and then "
        f"this file is rejected"
    )

# --------------------------------------------------------------------------- #

if problems:
    for problem in problems:
        print(f"FAIL  {problem}")
    print(f"\n{len(problems)} problem(s)")
    sys.exit(1)

print(f"OK  {len(items)} items, {len(blocks)} blocks, {len(entities)} entity, "
      f"{len(list(each_json(os.path.join(BEHAVIOR, 'recipes'))))} recipes, "
      f"{len(uuids)} uuids, every texture present")
