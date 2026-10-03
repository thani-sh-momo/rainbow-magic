/**
 * Supershears shear any mob, not just the vanilla few.
 *
 * The interesting cases are the mobs the game does not normally allow shearing
 * at all, and the cooldown that stops one cow becoming an infinite farm.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	RAINBOW_DUST,
	RAINBOW_SHEARS,
	at,
	drops,
	entity,
	holding,
	interactWithEntity,
	loadAddon,
	state,
} from "./harness.mjs";

describe("shearing a mob", () => {
	test("a sheep gives wool", async () => {
		await loadAddon();

		interactWithEntity(holding(RAINBOW_SHEARS), entity({ typeId: "minecraft:sheep" }));

		assert.deepEqual(drops(), ["minecraft:white_wool x3"]);
	});

	test("mobs the vanilla shears refuse still give something", async () => {
		await loadAddon();
		const player = holding(RAINBOW_SHEARS);
		const mobs = {
			"minecraft:cow": "minecraft:leather x2",
			"minecraft:chicken": "minecraft:feather x3",
			"minecraft:mooshroom": "minecraft:red_mushroom x3",
			"minecraft:snow_golem": "minecraft:snowball x4",
			"minecraft:wolf": "minecraft:bone x2",
		};

		for (const [typeId, expected] of Object.entries(mobs)) {
			const target = entity({ typeId });
			interactWithEntity(player, target);
			assert.deepEqual(drops().at(-1), expected, typeId);
		}
	});

	test("a mob the table does not name gives rainbow dust", async () => {
		await loadAddon();

		// A hostile mob, and a type id no vanilla table could know: the fallback
		// is what makes the shears work on every mob, including an add-on's.
		interactWithEntity(holding(RAINBOW_SHEARS), entity({ typeId: "minecraft:zombie" }));
		interactWithEntity(holding(RAINBOW_SHEARS), entity({ typeId: "another_pack:gloop" }));

		assert.deepEqual(drops(), [`${RAINBOW_DUST} x1`, `${RAINBOW_DUST} x1`]);
	});

	test("other items are not shears", async () => {
		await loadAddon();

		interactWithEntity(holding("minecraft:diamond_sword"), entity({ typeId: "minecraft:sheep" }));
		interactWithEntity(holding("minecraft:shears"), entity({ typeId: "minecraft:sheep" }));

		assert.deepEqual(drops(), []);
	});

	test("the same mob cannot be farmed inside the cooldown", async () => {
		await loadAddon();
		const player = holding(RAINBOW_SHEARS);
		const sheep = entity({ typeId: "minecraft:sheep" });

		interactWithEntity(player, sheep);
		state.currentTick += 599;
		interactWithEntity(player, sheep);

		assert.deepEqual(drops(), ["minecraft:white_wool x3"], "still inside the 30 second cooldown");

		state.currentTick += 1;
		interactWithEntity(player, sheep);

		assert.deepEqual(drops(), ["minecraft:white_wool x3", "minecraft:white_wool x3"]);
	});

	test("two different mobs have independent cooldowns", async () => {
		await loadAddon();
		const player = holding(RAINBOW_SHEARS);

		interactWithEntity(player, entity({ typeId: "minecraft:sheep" }));
		interactWithEntity(player, entity({ typeId: "minecraft:sheep" }));

		assert.deepEqual(drops(), ["minecraft:white_wool x3", "minecraft:white_wool x3"]);
	});

	test("a mob that is already gone is left alone", async () => {
		await loadAddon();

		interactWithEntity(
			holding(RAINBOW_SHEARS),
			entity({ typeId: "minecraft:sheep", isValid: false }),
		);

		assert.deepEqual(drops(), []);
	});

	test("the drop lands at the mob", async () => {
		await loadAddon();

		interactWithEntity(
			holding(RAINBOW_SHEARS),
			entity({ typeId: "minecraft:sheep", location: at(100, 40, -7) }),
		);

		assert.deepEqual(state.itemsSpawned[0].location, at(100, 40, -7));
	});
});
