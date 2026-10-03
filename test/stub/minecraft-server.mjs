/**
 * Test double for the Bedrock Script API.
 *
 * `scripts/main.js` is loaded exactly as it ships, with this module answering its
 * "@minecraft/server" import, so the tests assert what the add-on *did*
 * (destroyed, dropped, armed, fired, logged) rather than what it says.
 *
 * Only the surface the add-on touches is implemented. Each engine call is
 * recorded, and the knobs below exist so tests can reproduce the engine's
 * awkward cases: an entity that is already gone, a query that throws, and an
 * engine whose script API is missing an event entirely.
 */

/** Every event the add-on asks for. A name in `state.missingEvents` is absent
 * from `world.afterEvents`, which is how an older script API looks. */
const EVENT_NAMES = [
	"entityHitBlock",
	"entitySpawn",
	"itemUse",
	"playerInteractWithBlock",
	"playerInteractWithEntity",
	"worldLoad",
];

export const state = {
	/** name -> handlers registered via `world.afterEvents.<name>.subscribe` */
	handlers: {},
	/** Event names this engine does not have */
	missingEvents: [],
	/** Blocks the add-on destroyed, as "dimension x,y,z typeId" */
	broken: [],
	/** { item, amount, dimensionId, location } */
	itemsSpawned: [],
	sounds: [],
	particles: [],
	/** { typeId, effect, ticks, options } */
	effects: [],
	/** { typeId, amount } */
	damage: [],
	setOnFire: [],
	actionBars: [],
	/** Mobs placed in the world for getEntities to find */
	mobs: [],
	/** What getAllPlayers() returns */
	players: [],
	/** { ticks, fn } -- the add-on's intervals, run by the tests */
	intervals: [],
	currentTick: 0,
	/** Dimensions whose getEntities() throws */
	entityQueryFails: false,
};

export function reset() {
	state.handlers = {};
	state.missingEvents = [];
	state.broken = [];
	state.itemsSpawned = [];
	state.sounds = [];
	state.particles = [];
	state.effects = [];
	state.damage = [];
	state.setOnFire = [];
	state.actionBars = [];
	state.mobs = [];
	state.players = [];
	state.intervals = [];
	state.currentTick = 0;
	state.entityQueryFails = false;
}

export class ItemStack {
	constructor(typeId, amount = 1) {
		// A few vanilla blocks have no item form at all, which is the case the
		// add-on's drop is allowed to fail on.
		if (unspawnable.has(typeId)) {
			throw new Error(`no item form for ${typeId}`);
		}
		this.typeId = typeId;
		this.amount = amount;
	}

	clone() {
		return new ItemStack(this.typeId, this.amount);
	}
}

/** Blocks the engine cannot hand back as an item. */
export const unspawnable = new Set([
	"minecraft:barrier",
	"minecraft:light_block",
	"minecraft:structure_void",
]);

export const EquipmentSlot = { Mainhand: "Mainhand" };

export const BlockPermutation = {
	resolve: (typeId) => ({ typeId }),
};

export const system = {
	get currentTick() {
		return state.currentTick;
	},
	runInterval: (fn, ticks) => state.intervals.push({ fn, ticks }),
};

/** Built per access, so a test can hide an event before the add-on is loaded. */
function afterEvents() {
	const events = {};
	for (const name of EVENT_NAMES) {
		if (state.missingEvents.includes(name)) {
			continue;
		}
		events[name] = {
			subscribe: (handler) => {
				(state.handlers[name] ??= []).push(handler);
			},
		};
	}
	return events;
}

export const world = {
	get afterEvents() {
		return afterEvents();
	},
	getDimension: (id) => dimension(id),
	getAllPlayers: () => state.players,
};

let nextEntityId = 1;

export function dimension(id = "minecraft:overworld") {
	return {
		id,
		getEntities: ({ location, maxDistance = Infinity, excludeTypes = [] } = {}) => {
			if (state.entityQueryFails) {
				throw new Error("cannot read entities in this dimension right now");
			}
			return state.mobs.filter(
				(candidate) =>
					candidate.dimensionId === id &&
					!excludeTypes.includes(candidate.typeId) &&
					distanceSquared(candidate.location, location) <= maxDistance * maxDistance,
			);
		},
		spawnItem: (item, location) => {
			state.itemsSpawned.push({ item, amount: item.amount, dimensionId: id, location });
		},
		playSound: (sound, location) => state.sounds.push({ sound, dimensionId: id, location }),
		spawnParticle: (particle, location) =>
			state.particles.push({ particle, dimensionId: id, location }),
	};
}

function distanceSquared(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return dx * dx + dy * dy + dz * dz;
}

/** An entity shaped like the engine's, wired to record what the add-on does. */
export function entity({
	typeId,
	location = { x: 0, y: 64, z: 0 },
	dimensionId = "minecraft:overworld",
	families = ["mob"],
	held,
	isValid = true,
}) {
	const record = {
		typeId,
		id: nextEntityId++,
		location,
		dimensionId,
		families,
		held,
		isValid,
	};

	const handle = {
		typeId,
		id: record.id,
		location,
		dimensionId,
		dimension: dimension(dimensionId),
		/** What the entity is holding right now, so a test can see an item spent. */
		get held() {
			return record.held;
		},
		isValid: () => record.isValid,
		matches: (options) =>
			(options?.families ?? []).some((family) => record.families.includes(family)),
		getComponent: (componentId) =>
			componentId === "minecraft:equippable"
				? {
						getEquipment: () => record.held,
						setEquipment: (_slot, item) => {
							record.held = item;
						},
					}
				: undefined,
		applyDamage: (amount) => {
			state.damage.push({ typeId, amount });
		},
		setOnFire: (seconds) => {
			state.setOnFire.push({ typeId, seconds });
		},
		addEffect: (effect, ticks, options) => {
			state.effects.push({ typeId, effect, ticks, options });
		},
		onScreenDisplay: {
			setActionBar: (message) => state.actionBars.push(message),
		},
		remove: () => {
			record.isValid = false;
		},
	};

	return handle;
}

/** A player is an entity whose type id is the engine's player id. */
export function player(options = {}) {
	return entity({ typeId: "minecraft:player", ...options });
}

/** A block in the world, with the fields the add-on reads. */
export function block({ typeId, x = 0, y = 64, z = 0, dimensionId = "minecraft:overworld" }) {
	return {
		typeId,
		x,
		y,
		z,
		dimension: dimension(dimensionId),
		setPermutation: (permutation) => {
			state.broken.push(`${dimensionId} ${x},${y},${z} ${permutation.typeId}`);
		},
	};
}

/** Places mobs the add-on's `getEntities` calls can find. */
export function placeMobs(mobs) {
	state.mobs.push(...mobs);
}

/* ------------------------------------------------------------------ *
 * raising the events the add-on subscribes to
 * ------------------------------------------------------------------ */

function raise(name, event) {
	for (const handler of state.handlers[name] ?? []) {
		handler(event);
	}
}

export function swingAt(entity, block) {
	raise("entityHitBlock", { damagingEntity: entity, hitBlock: block });
}

export function interactWithEntity(playerEntity, target) {
	raise("playerInteractWithEntity", { player: playerEntity, target });
}

export function interactWithBlock(playerEntity, block) {
	raise("playerInteractWithBlock", { player: playerEntity, block });
}

export function useItem(entity, itemStack) {
	raise("itemUse", { source: entity, itemStack });
}

export function raiseSpawn(entityToSpawn) {
	raise("entitySpawn", { entity: entityToSpawn });
}

export function raiseWorldLoad() {
	raise("worldLoad", {});
}

/** Runs every registered interval once, as the engine's tick loop would. */
export function tick() {
	state.currentTick += 1;
	for (const interval of state.intervals) {
		interval.fn();
	}
}
