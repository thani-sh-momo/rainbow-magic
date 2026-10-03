/**
 * Shared setup for the tests.
 *
 * The add-on keeps module-level state (armed traps, shear cooldowns), so each
 * test gets a fresh copy of the script rather than the instance another test
 * has already warmed up. The test double is a single module, so its record of
 * what the add-on did survives those reloads.
 */
import { ItemStack, player, reset, state } from "./stub/minecraft-server.mjs";

export { state };
export {
	block,
	entity,
	interactWithBlock,
	interactWithEntity,
	placeMobs,
	player,
	raiseSpawn,
	swingAt,
	tick,
	useItem,
} from "./stub/minecraft-server.mjs";

let instances = 0;

/** Load a fresh copy of the add-on. */
export async function loadAddon() {
	reset();
	await import(`../behavior/scripts/main.js?instance=${(instances += 1)}`);
}

export const RAINBOW_BLADE = "rainbow_magic:rainbow_blade";
export const RAINBOW_PICKAXE = "rainbow_magic:rainbow_pickaxe";
export const RAINBOW_SHEARS = "rainbow_magic:rainbow_shears";
export const RAINBOW_DUST = "rainbow_magic:rainbow_dust";
export const UNICORN = "rainbow_magic:glitter_unicorn";
export const TRAP_SNARE = "rainbow_magic:trap_snare";
export const TRAP_INFERNO = "rainbow_magic:trap_inferno";
export const TRAP_LEVITY = "rainbow_magic:trap_levity";

export function item(typeId, amount = 1) {
	return new ItemStack(typeId, amount);
}

export function at(x, y = 64, z = 0) {
	return { x, y, z };
}

/** A player holding one item, which is how nearly every case starts. */
export function holding(typeId, { amount = 1, ...options } = {}) {
	return player({ held: item(typeId, amount), ...options });
}

/** What the add-on dropped into the world, as "typeId xN". */
export function drops() {
	return state.itemsSpawned.map((entry) => `${entry.item.typeId} x${entry.amount}`);
}
