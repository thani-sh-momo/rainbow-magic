import {
	BlockPermutation,
	EquipmentSlot,
	ItemStack,
	system,
	world,
} from "@minecraft/server";

/**
 * Rainbow Magic -- the scripted behaviour, and its own diagnostics.
 *
 * A script module that throws while it loads takes the whole pack down with it
 * and says nothing: the content log stays empty and the only symptom is a pack
 * that will not load. So this file announces itself, guards every subscription,
 * and wraps every handler, which turns "it does not load" into a line in the
 * content log naming the stage that failed.
 *
 * The logging is deliberately front-loaded and quiet afterwards: the boot
 * sequence, one line when the world is live, and a line whenever something
 * throws. Nothing logs per swing or per trap tick, or the log would be useless.
 */

/**
 * Reported in the boot line, so the content log says which build is installed.
 * Bump it on every change that alters behaviour.
 */
const BUILD = "1.0.10";

const TAG = "[RainbowMagic]";

const BLADE = "rainbow_magic:rainbow_blade";
const PICKAXE = "rainbow_magic:rainbow_pickaxe";
const SHEARS = "rainbow_magic:rainbow_shears";
const UNICORN = "rainbow_magic:glitter_unicorn";
const DUST = "rainbow_magic:rainbow_dust";

/**
 * Logging goes through `console.warn` rather than `console.log`: on a dedicated
 * server both land in the content log, but only one of them is visible with the
 * default content-log settings, and a diagnostic nobody sees is not a
 * diagnostic. Every call is itself guarded -- logging must never be the thing
 * that breaks the pack.
 */
function log(message, ...rest) {
	try {
		console.warn(`${TAG} ${message}`, ...rest);
	} catch (err) {
		// Nothing left to do: the engine has taken the console away.
	}
}

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
		log(message);
	}
}

/* ------------------------------------------------------------------ *
 * Wiring, with everything that can fail on its own say so
 * ------------------------------------------------------------------ */

/**
 * Wraps a handler so anything it throws is logged with the handler's name.
 *
 * Without this an exception inside an event handler is invisible: the content
 * log stays empty, the feature quietly stops working, and the pack looks fine.
 */
function guard(name, handler) {
	return (event) => {
		try {
			handler(event);
		} catch (err) {
			log(`${name} handler threw:`, err, err?.stack ?? "");
		}
	};
}

/**
 * Subscribes to an event, announcing the outcome either way.
 *
 * Registered handlers are the pipeline for everything else in this file, so a
 * subscription that silently does not take is worth a line: it is the
 * difference between "the feature is broken" and "the event does not exist in
 * this engine's script API version".
 */
function subscribe(name, signal, handler) {
	if (!signal || typeof signal.subscribe !== "function") {
		log(`cannot subscribe to ${name}: this engine has no such event`);
		return;
	}
	try {
		signal.subscribe(guard(name, handler));
		log(`subscribed: ${name}`);
	} catch (err) {
		log(`subscribing to ${name} failed:`, err);
	}
}

/**
 * Reports what this engine's script API actually offers.
 *
 * This is the line that separates the two ways a pack like this fails: if the
 * boot line and these appear, the script module loaded and the failure is
 * elsewhere in the pack; if nothing appears at all, the module never ran and
 * the problem is the manifest, the script module entry, or the
 * `@minecraft/server` version the manifest asks for.
 */
function reportEngineSurface() {
	const events = [
		"entityHitBlock",
		"entitySpawn",
		"itemUse",
		"playerInteractWithBlock",
		"playerInteractWithEntity",
		"worldLoad",
	];

	const found = [];
	for (const name of events) {
		let available = false;
		try {
			available = typeof world?.afterEvents?.[name]?.subscribe === "function";
		} catch (err) {
			available = false;
		}
		found.push(`${name}=${available ? "ok" : "MISSING"}`);
	}
	log(`afterEvents: ${found.join(" ")}`);

	try {
		log(`currentTick=${system.currentTick}`);
	} catch (err) {
		log("currentTick unreadable:", err);
	}

	try {
		log(`overworld=${world.getDimension("minecraft:overworld").id}`);
	} catch (err) {
		log("getDimension threw:", err);
	}

	try {
		log(`players=${world.getAllPlayers().length}`);
	} catch (err) {
		log("getAllPlayers threw:", err);
	}
}

// The whole boot is one try/catch: a throw anywhere in here takes the module
// down, and a module that throws while loading is exactly the silent failure
// this file is trying to make visible.
try {
	log(`build ${BUILD}: script module loaded`);
	reportEngineSurface();
} catch (err) {
	log("boot diagnostics threw:", err, err?.stack ?? "");
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
		log(`could not break ${typeId}:`, err);
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

	log(`pickaxe broke ${typeId}`);
}

subscribe("entityHitBlock", world?.afterEvents?.entityHitBlock, (event) => {
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
});

/** How many pickaxe breaks to report, so the log answers "is the engine's own
 * mining path running with this tool" without becoming a firehose. */
const PICKAXE_BREAK_LOGS = 3;

let pickaxeBreaksLogged = 0;

/**
 * Reports the first few blocks the engine itself broke while the rainbow pickaxe
 * was held.
 *
 * This is the difference between the two ways mining can look broken: a block
 * reached the engine's own break path with this tool, or it never did because
 * the tool is not being treated as a pickaxe. Only the first few are logged.
 */
subscribe("playerBreakBlock", world?.afterEvents?.playerBreakBlock, (event) => {
	if (pickaxeBreaksLogged >= PICKAXE_BREAK_LOGS) {
		return;
	}
	if (heldItem(event.player)?.typeId !== PICKAXE) {
		return;
	}
	pickaxeBreaksLogged += 1;

	let broken = "unreadable";
	try {
		broken = event.brokenBlockPermutation?.type?.id ?? broken;
	} catch (err) {
		// left as unreadable
	}
	log(`the engine broke ${broken} with the rainbow pickaxe (its mining path, not the script)`);
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
		log(`shear drop failed for ${target.typeId}:`, err);
		return;
	}

	try {
		target.dimension.playSound("mob.sheep.shear", target.location);
	} catch (err) {
		// sound ids vary by version
	}

	log(`sheared ${target.typeId} -> ${drop.item}`);
}

/** How many entity interactions to report. The shears path depends on the engine
 * raising this event at all with a custom item in hand, which is not something a
 * data file can express -- so the first few say whether it fires and what the
 * engine thinks is held. */
const INTERACTION_LOGS = 3;

let interactionsLogged = 0;

subscribe("playerInteractWithEntity", world?.afterEvents?.playerInteractWithEntity, (event) => {
	if (interactionsLogged < INTERACTION_LOGS) {
		interactionsLogged += 1;
		let held = "nothing";
		try {
			held = heldItem(event.player)?.typeId ?? held;
		} catch (err) {
			// left as nothing
		}
		log(`interacted with ${event.target?.typeId}, holding ${held}`);
	}

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
	log(`armed ${typeId} at ${dimensionId} ${location.y}`);
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
		log("could not consume the trap item:", err);
	}
}

subscribe("playerInteractWithBlock", world?.afterEvents?.playerInteractWithBlock, (event) => {
	const typeId = heldItem(event.player)?.typeId;
	if (TRAPS[typeId]) {
		armTrap(event.player, typeId);
	}
});

subscribe("itemUse", world?.afterEvents?.itemUse, (event) => {
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
			log(`trap had no effect on ${victim.typeId}:`, err);
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

	log(`${spec.label} trap fired on ${victims.length} mob(s)`);
}

/** Every id this pack defines in the behaviour pack: reported on the first
 * tick, so the log says whether the engine actually loaded them. */
const ITEM_IDS = [
	"rainbow_magic:rainbow_dust",
	"rainbow_magic:rainbow_ingot",
	"rainbow_magic:rainbow_blade",
	"rainbow_magic:rainbow_pickaxe",
	"rainbow_magic:rainbow_shears",
	"rainbow_magic:trap_snare",
	"rainbow_magic:trap_inferno",
	"rainbow_magic:trap_levity",
	"rainbow_magic:glitter_unicorn_spawn_egg",
];

const BLOCK_IDS = [
	"rainbow_magic:rainbow_ore",
	"rainbow_magic:deepslate_rainbow_ore",
	"rainbow_magic:rainbow_block",
];

/**
 * Reports which of this pack's own ids the engine actually knows.
 *
 * The script module can run even when the rest of the pack is unhappy, so "the
 * script works" is not evidence that the items and blocks loaded. Asking the
 * engine to resolve each id is the only runtime check available -- an unknown
 * id throws -- and it splits "the pack loaded" from "the script loaded".
 */
function reportContent() {
	const missing = [];
	let items = 0;
	for (const id of ITEM_IDS) {
		try {
			// Constructing an ItemStack resolves the type against the registry.
			void new ItemStack(id, 1);
			items += 1;
		} catch (err) {
			missing.push(id);
		}
	}

	let blocks = 0;
	for (const id of BLOCK_IDS) {
		try {
			void BlockPermutation.resolve(id);
			blocks += 1;
		} catch (err) {
			missing.push(id);
		}
	}

	log(
		`content: items ${items}/${ITEM_IDS.length}, blocks ${blocks}/${BLOCK_IDS.length}` +
			(missing.length ? `, MISSING ${missing.join(" ")}` : ""),
	);
}

/** Set once the interval has run in a live world, so the "alive" line is a
 * heartbeat rather than a per-tick flood. */
let announcedAlive = false;

/**
 * Watches every armed trap. A trap fires at the first mob to step on it and is
 * spent; the owner and the unicorn are ignored.
 *
 * This interval doubles as the liveness check: the first time it runs, the
 * script proves it is executing inside a real world, not merely loading. If
 * the boot line appears and this one never does, the script loaded but its
 * tick loop never ran.
 */
function trapTick() {
	if (!announcedAlive) {
		announcedAlive = true;
		let players = "unreadable";
		try {
			players = String(world.getAllPlayers().length);
		} catch (err) {
			// left as unreadable
		}
		log(`alive in the world at tick ${system.currentTick}, players=${players}`);
		// Reported here rather than at boot: by the first tick everything the
		// pack defines is registered, so a missing id means missing, not early.
		reportContent();
	}

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
			log("trap scan failed:", err);
			continue;
		}

		const victims = nearby.filter(isTrapVictim);
		if (victims.length === 0) {
			continue;
		}

		fireTrap(trap, dimension, location, victims);
		armedTraps.splice(index, 1);
	}
}

try {
	system.runInterval(guard("trapTick", trapTick), TRAP_TICK_INTERVAL);
	log(`subscribed: interval every ${TRAP_TICK_INTERVAL} ticks`);
} catch (err) {
	log("could not start the trap interval:", err);
}

/* ------------------------------------------------------------------ *
 * The Rainbow Glitter Unicorn
 * ------------------------------------------------------------------ */

/**
 * How long the unicorn's blessing lasts. Long enough for a play session without
 * being refreshed every tick. Ticks.
 */
const UNICORN_BLESSING_TICKS = 1000000;

/**
 * Bedrock effect ids the unicorn is given. Both must be Bedrock effects:
 * "glowing" is a Java-only one, and asking for it throws
 * InvalidArgumentError: Invalid type passed to argument [0]. tools/check-pack.py
 * checks every name in this list against the Bedrock effect list, because a
 * wrong name here is silent until an entity spawns.
 */
const UNICORN_EFFECTS = ["regeneration", "speed"];

const UNICORN_EFFECT_OPTIONS = { amplifier: 0, showParticles: false };

subscribe("entitySpawn", world?.afterEvents?.entitySpawn, (event) => {
	if (event.entity?.typeId !== UNICORN) {
		return;
	}
	// A kind, nimble pet: the regeneration is what makes it kind rather than
	// merely harmless, and the speed is what keeps it with you. Each is applied
	// on its own, so one failing does not cost the other.
	for (const effect of UNICORN_EFFECTS) {
		try {
			event.entity.addEffect(effect, UNICORN_BLESSING_TICKS, UNICORN_EFFECT_OPTIONS);
		} catch (err) {
			log(`could not apply ${effect} to the unicorn:`, err);
		}
	}
});

// `worldLoad` only exists on newer script API versions, so it is offered rather
// than required: present, it is the earliest proof the script is live.
if (world?.afterEvents?.worldLoad) {
	subscribe("worldLoad", world.afterEvents.worldLoad, () => {
		log("world loaded -- the script is live for this world");
	});
}

log("boot sequence complete");
