/**
 * The magical traps: arming one costs an item and marks the spot you stand on,
 * and the first mob to walk onto that spot takes the effect.
 *
 * Traps are per-session -- they are never written to the world -- so the tests
 * drive the interval by hand rather than waiting on a clock.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	TRAP_INFERNO,
	TRAP_LEVITY,
	TRAP_SNARE,
	UNICORN,
	at,
	block,
	entity,
	holding,
	interactWithBlock,
	loadAddon,
	placeMobs,
	player,
	state,
	tick,
	useItem,
} from "./harness.mjs";

/** The trap lands on the player's feet: block (0,64,0), centre (0.5,64,0.5). */
const onTheTrap = at(0.5, 64, 1);
const stone = () => block({ typeId: "minecraft:stone" });

/** Arms a trap where the player stands, and hands the player back. */
function arm(typeId, options = {}) {
	const holder = holding(typeId, options);
	interactWithBlock(holder, stone());
	return holder;
}

describe("arming a trap", () => {
	test("it spends one and leaves the rest", async () => {
		await loadAddon();

		const holder = arm(TRAP_SNARE, { amount: 2 });

		assert.equal(holder.held.amount, 1);
		assert.equal(holder.held.typeId, TRAP_SNARE);
	});

	test("the last one is spent entirely", async () => {
		await loadAddon();

		const holder = arm(TRAP_SNARE);

		assert.equal(holder.held, undefined, "the hand is empty once the last trap is used");
	});

	test("the player is told what happened", async () => {
		await loadAddon();

		arm(TRAP_INFERNO);

		assert.deepEqual(state.actionBars, ["Inferno trap armed. Walk away."]);
	});

	test("right-clicking and using the item in the same tick arm one trap", async () => {
		await loadAddon();
		const holder = arm(TRAP_SNARE, { amount: 2 });

		// Both events fire for one click; the player must not pay twice.
		useItem(holder, holder.held);

		assert.equal(holder.held.amount, 1);

		placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);
		tick();

		assert.equal(state.damage.length, 1, "one trap, one firing");
	});

	test("a second trap can be armed on another block", async () => {
		await loadAddon();
		const holder = holding(TRAP_SNARE, { amount: 2 });

		interactWithBlock(holder, stone());
		holder.location = at(20, 64, 20);
		interactWithBlock(holder, stone());
		placeMobs([
			entity({ typeId: "minecraft:zombie", location: onTheTrap }),
			entity({ typeId: "minecraft:zombie", location: at(20.5, 64, 21) }),
		]);
		tick();

		assert.equal(state.damage.length, 2, "each trap fires on its own spot");
	});
});

describe("a trap firing", () => {
	test("a mob that steps on it is caught", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);

		tick();

		assert.deepEqual(state.damage, [{ typeId: "minecraft:zombie", amount: 6 }]);
		assert.equal(state.effects[0].effect, "slowness");
		assert.equal(state.particles.length, 1);
	});

	test("it fires once and is then spent", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);

		tick();
		tick();

		assert.equal(state.damage.length, 1);
	});

	test("the player who set it is never caught", async () => {
		await loadAddon();
		const holder = arm(TRAP_SNARE);
		placeMobs([player({ location: onTheTrap, id: holder.id })]);

		tick();

		assert.deepEqual(state.damage, []);
	});

	test("the unicorn is spared", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([entity({ typeId: UNICORN, location: onTheTrap })]);

		tick();

		assert.deepEqual(state.damage, [], "your own pet must not walk into your own trap");
	});

	test("a dropped item is not a mob", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([entity({ typeId: "minecraft:item", location: onTheTrap, families: [] })]);

		tick();

		assert.deepEqual(state.damage, []);
	});

	test("a mob three blocks away leaves it armed", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([entity({ typeId: "minecraft:zombie", location: at(0.5, 64, 4) })]);

		tick();

		assert.deepEqual(state.damage, []);

		placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);
		tick();

		assert.equal(state.damage.length, 1, "the trap was still there");
	});

	test("a mob in another dimension does not set it off", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([
			entity({
				typeId: "minecraft:zombie",
				location: onTheTrap,
				dimensionId: "minecraft:the_nether",
			}),
		]);

		tick();

		assert.deepEqual(state.damage, []);
	});

	test("every mob standing on it is caught", async () => {
		await loadAddon();
		arm(TRAP_SNARE);
		placeMobs([
			entity({ typeId: "minecraft:zombie", location: onTheTrap }),
			entity({ typeId: "minecraft:creeper", location: at(0.5, 64, 0.5) }),
		]);

		tick();

		assert.equal(state.damage.length, 2);
	});
});

describe("the three traps differ", () => {
	test("inferno burns and hits harder", async () => {
		await loadAddon();
		arm(TRAP_INFERNO);
		placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);

		tick();

		assert.deepEqual(state.damage, [{ typeId: "minecraft:zombie", amount: 8 }]);
		assert.deepEqual(state.setOnFire, [{ typeId: "minecraft:zombie", seconds: 8 }]);
	});

	test("levity lifts the mob off the ground", async () => {
		await loadAddon();
		arm(TRAP_LEVITY);
		placeMobs([entity({ typeId: "minecraft:creeper", location: onTheTrap })]);

		tick();

		assert.equal(state.effects[0].effect, "levitation");
		assert.equal(state.damage[0].amount, 4);
	});

	test("every trap has its own particle", async () => {
		await loadAddon();
		const seen = new Set();

		for (const typeId of [TRAP_SNARE, TRAP_INFERNO, TRAP_LEVITY]) {
			state.mobs = [];
			state.particles = [];
			arm(typeId);
			placeMobs([entity({ typeId: "minecraft:zombie", location: onTheTrap })]);
			tick();
			for (const entry of state.particles) {
				seen.add(entry.particle);
			}
		}

		assert.equal(seen.size, 3, "three traps, three particles");
	});
});
