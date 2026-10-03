![Rainbow Magic Pack Icon](behavior/pack_icon.png)

# Rainbow Magic

A Minecraft Bedrock Edition add-on: mine the rainbow, forge gear that cannot be
broken, and tame the pet that comes with it.

Everything is crafted from **rainbow ore**, which generates underground in the
Overworld.

![Every item, block and trap in this pack, plus the unicorn's texture](docs/preview.png)

*The last cell is the unicorn's texture: a UV atlas the vanilla horse model
wears, not a picture of the animal.*

## What is in it

| Thing | What it does |
| --- | --- |
| **Rainbow Ore** / **Deepslate Rainbow Ore** | Generates underground. Drops 1–3 Rainbow Dust. |
| **Rainbow Dust** → **Rainbow Ingot** | Smelt dust in a furnace. Everything else is made from ingots. |
| **Rainbow Blade** | **100 attack damage** and it never breaks. |
| **Rainbow Pickaxe** | Mines everything, **including bedrock**, and never breaks. |
| **Supershears** | Shear **any** mob in the game, not just sheep. |
| **Magical Traps** ×3 | Consumable traps that arm the ground you are standing on and fire at the first mob to walk onto it. |
| **Rainbow Glitter Unicorn** | A kind, glowing pet. Feed it a Rainbow Ingot to tame it. |

## How it works

### The blade, and why nothing wears out

The blade carries `"minecraft:damage": 100`, so the engine adds 100 to the
player's own attack — that is data, straight from the item file.

Nothing in the pack has a `minecraft:durability` component **at all**. That is
what makes the blade, the pickaxe and the shears unbreakable: an item with no
durability can never take damage, so it can never break. There is no script
repairing them behind your back.

### The pickaxe, and bedrock

Two mechanisms, because no single one covers "everything":

- **Ordinary blocks** go through the item's own `minecraft:digger` speeds: one
  entry matching the pickaxe, axe, shovel and hoe block tags at speed 20. Hard
  blocks like obsidian break at that speed like any other.
- **Blocks no tool can break** — bedrock, barrier, command blocks, jigsaw, light
  block, structure void, end portal frame, reinforced deepslate — are the one
  thing a data file cannot reach. `scripts/main.js` listens for the swing
  (`entityHitBlock`) and removes the block itself, dropping it. These blocks can
  never be *mined*, so no break event ever fires for them; the swing is the only
  hook that exists.

Portals are deliberately **not** on that list. Breaking an end portal or a
nether portal would wreck a world for no fun.

### Supershears

Shearing is a script interaction (`playerInteractWithEntity`). A mob with its own
drop gets it (a cow gives leather, a snow golem gives snowballs); **every other
mob in the game gives Rainbow Dust** — including mobs another add-on adds, because
the fallback is what handles them, not a list.

A sheared mob needs 30 seconds before it can be sheared again, so one cow cannot
be clicked into an infinite farm.

### The traps

A trap is a consumable item. Right-click the ground to arm it where you stand;
the item is spent, and the first mob to walk onto that spot takes the effect.
Your own pet is ignored, and so are you.

| Trap | Recipe | Effect on the mob |
| --- | --- | --- |
| **Snare** | 1 ingot + 4 string → 2 | Slowness IV for 5s, 6 damage |
| **Inferno** | 1 ingot + 4 blaze powder → 2 | Set on fire for 8s, 8 damage |
| **Levity** | 1 ingot + 4 feather → 2 | Levitation V for 3s, 4 damage |

Traps are **per session**: they are not written to the world, so they are gone
after a reload. They are cheap on purpose — throw them down mid-fight.

### The Rainbow Glitter Unicorn

The unicorn reuses the vanilla horse model, wearing a rainbow glitter texture
drawn for this pack, so it animates properly without shipping a custom model.

It is tameable: **feed it a Rainbow Ingot** and it follows you. On spawn the
script gives it glowing (so you can find it) and regeneration (so it is kind
rather than merely harmless). It gives rainbow dust when it dies, and you can
shear it too.

## Crafting

| Item | Recipe |
| --- | --- |
| Rainbow Ingot | Furnace or blast furnace: 1 Rainbow Dust |
| Rainbow Block | 9 Rainbow Ingots in a 3×3 |
| 9 Rainbow Ingots | 1 Rainbow Block, anywhere in the grid |
| Rainbow Blade | Ingot over ingot over stick (a sword shape) |
| Rainbow Pickaxe | 3 ingots across, stick, stick (a pickaxe shape) |
| Supershears | 2 ingots diagonally (a shears shape) |
| Unicorn Spawn Egg | 1 Rainbow Block + 1 Golden Apple + 4 Rainbow Dust |

Ore generates from **y −60 to y 60**, in veins of up to 6, eight attempts per
chunk, so it is common enough to build a sword early and still worth digging for.

## Installation

**On a phone or console:** download `rainbow-magic.mcaddon` from the
[Releases](https://github.com/thani-sh-momo/rainbow-magic/releases) page and open
it. Minecraft imports both packs. Then enable them in your world's settings.

**On a world from a file:** open the `.mcpack` files the same way, or unzip them
into `behavior_packs/` and `resource_packs/`.

### Dedicated server setup

Both packs are needed — the behavior pack holds the items, recipes and ore, and
the resource pack holds the textures. There is no script API toggle to flip, and
**no experiments are required**: everything here uses release features.

1. **Get the packs.** Clone this repository and use `behavior/` and
   `resource-pack/`, or rename the release `.mcpack` files to `.zip` and extract
   them.
2. **Copy them in**, keeping each folder's `manifest.json` directly inside:

   ```text
   <server>/
   ├── behavior_packs/
   │   └── rainbow-magic/          <- behavior/manifest.json lives here
   ├── resource_packs/
   │   └── rainbow-magic/          <- resource-pack/manifest.json lives here
   ├── server.properties
   └── worlds/
       └── Bedrock level/
   ```

3. **Activate both for the world.** Edit `worlds/<level-name>/world_behavior_packs.json`
   and `worlds/<level-name>/world_resource_packs.json`, creating them if they do
   not exist. Use each manifest's `header.uuid` — the header, not a module:

   ```json
   [
     { "pack_id": "bc2a68d1-58da-4029-b56d-82538d854be0", "version": [1, 0, 2] }
   ]
   ```

   The resource pack's header uuid is `d8c6e08f-adbf-4b82-a242-44aa79e4a376`.

4. **Restart the server** and watch for pack-loading errors.
5. **Confirm it loaded.** Add `content-log-file-enabled=true` to
   `server.properties` and restart: the add-on's `RainbowMagic: ...` lines then
   appear in the content log in the server root.

### Building the packs

```bash
python3 tools/build-addon.py     # writes dist/*.mcpack and dist/*.mcaddon
python3 tools/make-textures.py   # redraws every texture and docs/preview.png
```

## Tests

Two checks, both runnable without Minecraft:

```bash
npm test                      # 37 tests: what the script does, under a test double
python3 tools/check-pack.py   # every id, texture and cross-reference resolves
```

`npm test` loads `behavior/scripts/main.js` exactly as it ships, with
`test/stub/minecraft-server.mjs` standing in for the game's Script API, and
asserts what the add-on *did* — destroyed this block, dropped that item, armed
that trap, spent that item — rather than what it logged. Node 22 or newer; there
are no dependencies to install.

`check-pack.py` is the other half: item icons that name a texture nobody drew,
recipes whose result is not defined, a `places_feature` that points at nothing.
Every id in a pack is a string only the game resolves, so a typo there is silent.

### What is verified, and what needs the game

Run and passing here:

- **All scripted behaviour** — the pickaxe on every block on its list, the
  shears on named and unnamed mobs, cooldowns, trap arming, spending and firing,
  and the unicorn's spawn effects (37 tests).
- **Every data cross-reference** — manifests, uuids, textures, recipes, loot
  tables, features and the entity's client definition.
- **The archives** — built and checked for a `manifest.json` at the root.

Learned from an actual load, and fixed: importing the first build into Bedrock
Edition rejected `minecraft:icon` written as an object — that form needs a newer
schema than `format_version` 1.21.50, where the component wants a bare texture
name — and refused all nine crafting recipes for want of `unlock` data. Both are
now gated in `check-pack.py`, and reverting either fix fails that check.

**Still not verified**, because the engine owns these: the values and behaviours
no static check can reach. Worth a look on first launch —

- `minecraft:damage: 100` on the blade (does 100 damage land as intended, or does
  the engine clamp it?),
- the pickaxe's tag-based `minecraft:digger` entry — the tag query needs a recent
  format version, and if the engine ignores it the pickaxe still mines everything
  and still breaks bedrock, just without the speed boost,
- rainbow ore actually generating (the feature rule needs no experiments on
  1.21.50+; if nothing generates, that is the first thing to check),
- the unicorn's model and taming, and whether the crafted spawn egg links to it
  the way a vanilla egg does (the creative-menu egg is the fallback),
- the particle and sound ids the traps use.

## If it will not load

The script module logs its own progress, because the failure it guards against
is invisible: **a script that throws while loading takes the pack down and says
nothing at all** — no content-log entry, no error, just a pack that will not
load. Everything below is one line in the content log per stage.

**Turn the content log on first**, or there is nothing to read:

- *Dedicated server:* add `content-log-file-enabled=true` to `server.properties`
  and restart. The log is written to the server root.
- *Client:* Settings → Creator → **Content Log GUI** (and enable the content log
  in the same section).

Then look for lines starting `[RainbowMagic]`. A healthy load looks like this:

```text
[RainbowMagic] build 1.0.2: script module loaded
[RainbowMagic] afterEvents: entityHitBlock=ok entitySpawn=ok itemUse=ok ...
[RainbowMagic] currentTick=0
[RainbowMagic] overworld=minecraft:overworld
[RainbowMagic] players=0
[RainbowMagic] subscribed: entityHitBlock
... one line per subscription ...
[RainbowMagic] subscribed: interval every 10 ticks
[RainbowMagic] boot sequence complete
[RainbowMagic] alive in the world at tick 10, players=1
```

Read it like this:

| What you see | What it means |
| --- | --- |
| **No `[RainbowMagic]` line at all** | The script module never ran. The problem is the manifest, the script module entry, or the `@minecraft/server` version — not the items, blocks or textures. Try the diagnostic build below. |
| `build …` but no `boot sequence complete` | Something threw during setup; the line above it names what. |
| `cannot subscribe to <event>` | This engine's script API has no such event, so that feature is off. The rest still runs. |
| `<name> handler threw:` | A named handler failed at runtime, with the error and stack. |
| Boot lines but **no** `alive in the world` | The script loaded but its tick loop never ran. |

### Bisecting with the no-script build

`rainbow-magic-diagnostic-no-script.mcaddon` (in `dist/`, and attached to the
release) is the same pack with the script module removed from the manifest — and
its own pack uuid, so it can sit beside the real one. Import it and try again:

- **It loads** → every item, block, recipe, ore, texture and the entity are
  fine, and the failure is the script module or the `@minecraft/server` version
  the manifest asks for.
- **It does not load either** → the problem is in the pack's data, assets or
  manifest, and the script is not involved.

### After changing a pack

Minecraft matches a pack by uuid **and version**, so bump the version (this file
documents `1.0.2`) or the world may keep using the copy it already has. If a
pack misbehaves after an update, try removing it from the world and re-adding it.

## Contributing

Open a pull request against `main`. Run both checks above before you push, and
say what you verified in the description — a change that adds an item needs
`check-pack.py` clean, and a change to `scripts/main.js` needs a test.

## License

MIT — see [LICENSE](LICENSE).
