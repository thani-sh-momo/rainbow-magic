/**
 * The rainbow pickaxe and the blocks no vanilla tool can touch.
 *
 * Everything else is mined by the item's own `minecraft:digger` speeds, so the
 * script's whole job is the handful of blocks the engine refuses outright.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	RAINBOW_PICKAXE,
	block,
	drops,
	holding,
	loadAddon,
	player,
	state,
	swingAt,
} from "./harness.mjs";

const bedrock = () => block({ typeId: "minecraft:bedrock", x: 4, y: 5, z: 6 });

describe("breaking blocks no tool can break", () => {
	test("bedrock is destroyed and dropped", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);

		swingAt(player, bedrock());

		assert.deepEqual(state.broken, ["minecraft:overworld 4,5,6 minecraft:air"]);
		assert.deepEqual(drops(), ["minecraft:bedrock x1"]);
	});

	test("a barrier breaks but leaves nothing behind", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);

		swingAt(player, block({ typeId: "minecraft:barrier" }));

		assert.equal(state.broken.length, 1, "the block should still be gone");
		assert.deepEqual(drops(), [], "a barrier has no item form, and that is not a failure");
	});

	test("every block on the list is covered", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);
		const names = [
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

		for (const typeId of names) {
			swingAt(player, block({ typeId }));
		}

		assert.equal(state.broken.length, names.length);
	});

	test("only the rainbow pickaxe does it", async () => {
		await loadAddon();
		const player = holding("minecraft:diamond_pickaxe");

		swingAt(player, bedrock());

		assert.deepEqual(state.broken, []);
		assert.deepEqual(drops(), []);
	});

	test("an empty hand does nothing", async () => {
		await loadAddon();

		swingAt(player(), bedrock());

		assert.deepEqual(state.broken, []);
	});

	test("an ordinary block is left to the pickaxe's own dig speeds", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);

		swingAt(player, block({ typeId: "minecraft:stone" }));
		swingAt(player, block({ typeId: "minecraft:obsidian" }));

		assert.deepEqual(state.broken, [], "these break by mining, not by a script swing");
	});

	test("a mob swinging at bedrock does nothing", async () => {
		await loadAddon();
		const zombie = holding(RAINBOW_PICKAXE, { typeId: "minecraft:zombie" });

		swingAt(zombie, bedrock());

		assert.deepEqual(state.broken, []);
	});

	test("the portals are deliberately left alone", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);

		swingAt(player, block({ typeId: "minecraft:end_portal" }));
		swingAt(player, block({ typeId: "minecraft:nether_portal" }));

		assert.deepEqual(state.broken, [], "breaking a portal would wreck the world");
	});

	test("it works in any dimension", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE, { dimensionId: "minecraft:the_nether" });

		swingAt(player, block({ typeId: "minecraft:bedrock", dimensionId: "minecraft:the_nether" }));

		assert.deepEqual(state.broken, ["minecraft:the_nether 0,64,0 minecraft:air"]);
	});
});
