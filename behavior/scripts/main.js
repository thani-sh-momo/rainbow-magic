import {
	BlockPermutation,
	EquipmentSlot,
	ItemStack,
	system,
	world,
} from "@minecraft/server";

/**
 * Rainbow Magic -- the scripted behaviour.
 *
 * Only three things need script, and each is something the data files cannot
 * express:
 *   - the rainbow pickaxe breaking the handful of blocks no vanilla tool can
 *     touch (bedrock and friends) -- every other block goes through the
 *     pickaxe's own `minecraft:digger` speeds;
 *   - supershears, which shear any mob rather than the vanilla few;
 *   - the magical traps, which are consumable items that arm the ground where
 *     you stand and fire when a mob walks onto the spot.
 *
 * Everything else is data: the blade's 100 damage is `minecraft:damage`, the
 * tools never break because they carry no `minecraft:durability` component at
 * all, the ore is a feature rule, and the unicorn's taming is the entity's own
 * `minecraft:tameable` component. Nothing here repeats those.
 */

const BLADE = "rainbow_magic:rainbow_blade";
const PICKAXE = "rainbow_magic:rainbow_pickaxe";
const SHEARS = "rainbow_magic:rainbow_shears";
const UNICORN = "rainbow_magic:glitter_unicorn";
const DUST = "rainbow_magic:rainbow_dust";

/**
 * Blocks no tool can break: the engine refuses them to every vanilla pickaxe
 * regardless of tier, so the pickaxe's digger speeds cannot help. Matched by
 * exact type id. Portals (`end_portal`, `nether_portal`) are deliberately NOT
 * here -- breaking them would wreck a world for no fun, and the pickaxe
 * already handles every ordinary block.
 */
const UNBREAKABLE_BLOCKS = [
	"minecraft:allow",
	"minecraft:barrier",
	"minecraft:bedrock",
	"minecraft:border_block",
	"minecraft:chain_command_block",
	"minecraft:client_request_placeholder_block",
	"minecraft:command_block",
	"minecraft:deny",
	"minecraft:end_portal_frame",
	"minecraft:jigsaw",
	"minecraft:light_block",
	"minecraft:reinforced_deepslate",
	"minecraft:repeating_command_block",
	"minecraft:structure_block",
	"minecraft:structure_void",
];

/**
 * What each mob drops to the supershears, and what shearing does to it.
 *
 * Mobs not listed fall through to rainbow dust, so the shears really do work
 * on every mob in the game -- including ones another add-on adds -- without
 * this table having to name them.
 */
const SHEAR_DROPS = {
	"minecraft:cat": { item: "minecraft:string", amount: 2 },
	"minecraft:chicken": { item: "minecraft:feather", amount: 3 },
	"minecraft:cow": { item: "minecraft:leather", amount: 2 },
	"minecraft:donkey": { item: "minecraft:leather", amount: 2 },
	"minecraft:fox": { item: "minecraft:sweet_berries", amount: 2 },
	"minecraft:goat": { item: "minecraft:goat_horn", amount: 1 },
	"minecraft:horse": { item: "minecraft:leather", amount: 2 },
	"minecraft:llama": { item: "minecraft:leather", amount: 3 },
	"minecraft:mooshroom": { item: "minecraft:red_mushroom", amount: 3 },
	"minecraft:mule": { item: "minecraft:leather", amount: 2 },
	"minecraft:panda": { item: "minecraft:bamboo", amount: 2 },
	"minecraft:parrot": { item: "minecraft:feather", amount: 3 },
	"minecraft:pig": { item: "minecraft:porkchop", amount: 1 },
	"minecraft:polar_bear": { item: "minecraft:cod", amount: 2 },
	"minecraft:rabbit": { item: "minecraft:rabbit_hide", amount: 1 },
	"minecraft:sheep": { item: "minecraft:white_wool", amount: 3 },
	"minecraft:snow_golem": { item: "minecraft:snowball", amount: 4 },
	"minecraft:trader_llama": { item: "minecraft:leather", amount: 3 },
	"minecraft:wolf": { item: "minecraft:bone", amount: 2 },
};

/**
 * A sheared mob is left alone for this long, so supershears cannot be farmed
 * by clicking the same cow forever. In ticks (30 seconds).
 */
const SHEAR_COOLDOWN_TICKS = 600;

/**
 * Magical traps. Each is a consumable item; using it arms the block you are
 * standing on, and the next mob to walk onto that spot takes the effect.
 *
 * `particle` ids are vanilla Bedrock ones, and every particle and sound call
 * below is wrapped: a wrong id costs a log line, never the trap.
 */
const TRAPS = {
	"rainbow_magic:trap_inferno": {
		label: "Inferno",
		particle: "minecraft:basic_flame_particle",
		sound: "mob.blaze.breathe",
		damage: 8,
		apply: (victim) => victim.setOnFire(8, true),
	},
	"rainbow_magic:trap_levity": {
		label: "Levity",
		particle: "minecraft:endrod",
		sound: "random.pop",
		damage: 4,
		apply: (victim) =>
			victim.addEffect("levitation", 60, { amplifier: 4, showParticles: true }),
	},
	"rainbow_magic:trap_snare": {
		label: "Snare",
		particle: "minecraft:heart_particle",
		sound: "random.orb",
		damage: 6,
		apply: (victim) =>
			victim.addEffect("slowness", 100, { amplifier: 4, showParticles: true }),
	},
};

/** How often armed traps are checked, in ticks. Two checks a second reads as
 * "it went off as they stepped on it" without costing a tick each. */
const TRAP_TICK_INTERVAL = 10;

/** How close a mob has to get to set a trap off, in blocks. */
const TRAP_TRIGGER_DISTANCE = 1.8;

/** Ceiling on armed traps, so a long session cannot grow the list without
 * bound. Traps are per-session: they are not written to the world. */
const TRAP_LIMIT = 64;

/** Armed traps, oldest first. */
const armedTraps = [];

/** Per-entity shear cooldowns, keyed by entity id. */
const shearCooldowns = new Map();

/** The item an entity is holding, or undefined if that cannot be read. */
function heldItem(entity) {
	try {
		const equipment = entity.getComponent("minecraft:equippable");
		return equipment?.getEquipment(EquipmentSlot.Mainhand);
	} catch (err) {
		return undefined;
	}
}

/** True when the entity is a player. `typeId` rather than `instanceof`, so the
 * check still works across the script engine's realm boundary. */
function isPlayer(entity) {
	return entity?.typeId === "minecraft:player";
}

/** Sends an action-bar line, silently doing nothing if that is unavailable. */
function tell(player, message) {
	try {
		player.onScreenDisplay.setActionBar(message);
	} catch (err) {
		console.log("RainbowMagic:", message);
	}
}

/* ------------------------------------------------------------------ *
 * The rainbow pickaxe: blocks no vanilla tool can break
 * ------------------------------------------------------------------ */

/**
 * Destroys a block no pickaxe should be able to destroy, and drops it.
 *
 * Called from the "player just swung at a block" event, which is the only hook
 * that fires for these blocks -- they can never be mined, so no
 * `playerBreakBlock` event is ever raised for them.
 */
function breakUnbreakable(player, block) {
	const typeId = block.typeId;
	const dimension = block.dimension;
	const location = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };

	try {
		block.setPermutation(BlockPermutation.resolve("minecraft:air"));
	} catch (err) {
		console.log("RainbowMagic: could not break", typeId, err);
		return;
	}

	// A few of these (barrier, light block, structure void) have no item form
	// at all; the drop is a bonus, not the point, so a failure is not an error.
	try {
		dimension.spawnItem(new ItemStack(typeId, 1), location);
	} catch (err) {
		// no item form for this block
	}

	try {
		dimension.playSound("random.glass", location);
	} catch (err) {
		// sound ids vary by version
	}

	console.log("RainbowMagic: rainbow pickaxe broke", typeId);
}

world.afterEvents.entityHitBlock.subscribe((event) => {
	const player = event.damagingEntity;
	if (!isPlayer(player)) {
		return;
	}
	if (heldItem(player)?.typeId !== PICKAXE) {
		return;
	}

	const block = event.hitBlock;
	if (!block || !UNBREAKABLE_BLOCKS.includes(block.typeId)) {
		return;
	}

	breakUnbreakable(player, block);
	// Durability is never spent here: the pickaxe has no
	// `minecraft:durability` component, so it cannot wear out.
	if (heldItem(player)?.typeId !== PICKAXE) {
		tell(player, "The rainbow pickaxe is gone -- that was not it.");
	}
});

/* ------------------------------------------------------------------ *
 * Supershears: shear any mob
 * ------------------------------------------------------------------ */

/** Shears a mob, dropping what that mob gives to the supershears. */
function shearTarget(player, target) {
	if (!target?.isValid()) {
		return;
	}

	const last = shearCooldowns.get(target.id);
	if (last !== undefined && system.currentTick - last < SHEAR_COOLDOWN_TICKS) {
		tell(player, `Nothing left to shear: the ${target.typeId.replace(/^minecraft:/, "")} needs a moment.`);
		return;
	}
	shearCooldowns.set(target.id, system.currentTick);
	if (shearCooldowns.size > 512) {
		// ponytail: entity ids are not reused within a session, so dropping the
		// whole map at 512 is enough; per-id expiry if a world ever holds more
		// than 512 mobs between shearings.
		shearCooldowns.clear();
	}

	const drop = SHEAR_DROPS[target.typeId] ?? { item: DUST, amount: 1 };

	try {
		target.dimension.spawnItem(
			new ItemStack(drop.item, drop.amount),
			target.location,
		);
	} catch (err) {
		console.log("RainbowMagic: shear drop failed for", target.typeId, err);
		return;
	}

	try {
		target.dimension.playSound("mob.sheep.shear", target.location);
	} catch (err) {
		// sound ids vary by version
	}

	console.log("RainbowMagic: sheared", target.typeId, "->", drop.item);
}

world.afterEvents.playerInteractWithEntity.subscribe((event) => {
	if (heldItem(event.player)?.typeId !== SHEARS) {
		return;
	}
	shearTarget(event.player, event.target);
});

/* ------------------------------------------------------------------ *
 * Magical traps
 * ------------------------------------------------------------------ */

/** True when two arming attempts are the same spot in the same tick, which is
 * what the two arming paths below look like when a click raises both. */
function sameSpotAndTick(trap, dimensionId, location) {
	return (
		trap.dimensionId === dimensionId &&
		trap.x === Math.floor(location.x) &&
		trap.y === Math.floor(location.y) &&
		trap.z === Math.floor(location.z) &&
		system.currentTick - trap.armedTick <= 1
	);
}

/**
 * Arms a trap where the player is standing, spending one of the item.
 *
 * Reached from two events on purpose: `playerInteractWithBlock` fires reliably
 * for any held item, and `itemUse` catches the same click when the player is
 * aiming at nothing. Arming twice in one tick is collapsed into one trap.
 */
function armTrap(player, typeId) {
	const dimensionId = player.dimension.id;
	const location = player.location;

	for (const trap of armedTraps) {
		if (trap.type === typeId && sameSpotAndTick(trap, dimensionId, location)) {
			return;
		}
	}

	armedTraps.push({
		type: typeId,
		dimensionId,
		x: Math.floor(location.x),
		y: Math.floor(location.y),
		z: Math.floor(location.z),
		ownerId: player.id,
		armedTick: system.currentTick,
	});
	if (armedTraps.length > TRAP_LIMIT) {
		armedTraps.shift();
	}

	consumeOne(player, typeId);
	tell(player, `${TRAPS[typeId].label} trap armed. Walk away.`);
	console.log("RainbowMagic: armed", typeId, "at", dimensionId, location.y);
}

/** Takes one of `typeId` out of the player's hand, clearing the slot when it
 * was the last one. */
function consumeOne(player, typeId) {
	try {
		const equipment = player.getComponent("minecraft:equippable");
		const hand = equipment?.getEquipment(EquipmentSlot.Mainhand);
		if (!hand || hand.typeId !== typeId) {
			return;
		}
		if (hand.amount > 1) {
			const rest = hand.clone();
			rest.amount -= 1;
			equipment.setEquipment(EquipmentSlot.Mainhand, rest);
		} else {
			equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
		}
	} catch (err) {
		console.log("RainbowMagic: could not consume the trap item", err);
	}
}

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
	const typeId = heldItem(event.player)?.typeId;
	if (TRAPS[typeId]) {
		armTrap(event.player, typeId);
	}
});

world.afterEvents.itemUse.subscribe((event) => {
	const typeId = event.itemStack?.typeId;
	if (TRAPS[typeId] && isPlayer(event.source)) {
		armTrap(event.source, typeId);
	}
});

/** True when the entity is a mob the traps should act on: not a player, not a
 * dropped item, and not the unicorn -- walking your own pet over a trap must
 * not hurt it. */
function isTrapVictim(entity) {
	if (!entity) {
		return false;
	}
	if (isPlayer(entity) || entity.typeId === UNICORN) {
		return false;
	}
	try {
		return entity.matches({ families: ["mob"] });
	} catch (err) {
		return false;
	}
}

/** Fires one trap: every mob standing on it takes the effect, and the trap is
 * spent. */
function fireTrap(trap, dimension, location, victims) {
	const spec = TRAPS[trap.type];

	for (const victim of victims) {
		try {
			if (spec.damage > 0) {
				victim.applyDamage(spec.damage);
			}
			spec.apply(victim);
		} catch (err) {
			console.log("RainbowMagic: trap had no effect on", victim.typeId, err);
		}
	}

	try {
		dimension.spawnParticle(spec.particle, { x: location.x, y: location.y + 1, z: location.z });
	} catch (err) {
		// particle ids vary by version
	}
	try {
		dimension.playSound(spec.sound, location);
	} catch (err) {
		// sound ids vary by version
	}

	console.log("RainbowMagic:", spec.label, "trap fired on", victims.length, "mob(s)");
}

/**
 * Watches every armed trap. A trap fires at the first mob to step on it and is
 * spent; the owner and the unicorn are ignored.
 */
system.runInterval(() => {
	if (armedTraps.length === 0) {
		return;
	}

	for (let index = armedTraps.length - 1; index >= 0; index--) {
		const trap = armedTraps[index];
		const location = { x: trap.x + 0.5, y: trap.y, z: trap.z + 0.5 };

		let dimension;
		try {
			dimension = world.getDimension(trap.dimensionId);
		} catch (err) {
			armedTraps.splice(index, 1);
			continue;
		}

		let nearby = [];
		try {
			nearby = dimension.getEntities({
				location,
				maxDistance: TRAP_TRIGGER_DISTANCE,
				excludeTypes: ["minecraft:player", UNICORN],
			});
		} catch (err) {
			console.log("RainbowMagic: trap scan failed:", err);
			continue;
		}

		const victims = nearby.filter(isTrapVictim);
		if (victims.length === 0) {
			continue;
		}

		fireTrap(trap, dimension, location, victims);
		armedTraps.splice(index, 1);
	}
}, TRAP_TICK_INTERVAL);

/* ------------------------------------------------------------------ *
 * The Rainbow Glitter Unicorn
 * ------------------------------------------------------------------ */

/** Long enough that a unicorn glows for a play session without being refreshed
 * every tick. Ticks. */
const UNICORN_GLOW_TICKS = 1000000;

world.afterEvents.entitySpawn.subscribe((event) => {
	if (event.entity?.typeId !== UNICORN) {
		return;
	}
	// A glittering pet: the glow makes it easy to find once tamed, and the
	// regeneration is what makes it kind rather than merely harmless.
	try {
		event.entity.addEffect("glowing", UNICORN_GLOW_TICKS, { showParticles: false });
		event.entity.addEffect("regeneration", UNICORN_GLOW_TICKS, {
			amplifier: 1,
			showParticles: false,
		});
	} catch (err) {
		console.log("RainbowMagic: could not bless the unicorn:", err);
	}
});
