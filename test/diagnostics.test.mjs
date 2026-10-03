/**
 * The script module's own diagnostics.
 *
 * A script that throws while it loads takes the pack down with it and logs
 * nothing, which is invisible from outside. These tests pin the behaviour that
 * makes such a failure visible: a boot line, an inventory of the events the
 * engine actually offers, a line per subscription, and a line whenever a
 * handler throws instead of the throw vanishing.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	RAINBOW_PICKAXE,
	TRAP_SNARE,
	capture,
	holding,
	interactWithBlock,
	item,
	loadAddon,
	raiseBreak,
	state,
	tick,
	useItem,
} from "./harness.mjs";

/** True when any captured line contains `needle`. */
function logged(lines, needle) {
	return lines.some((line) => line.includes(needle));
}

describe("the boot sequence", () => {
	test("it announces the build before anything else", async () => {
		const lines = await loadAddon();

		assert.ok(logged(lines, "script module loaded"), lines.join("\n"));
		assert.ok(logged(lines, "build "), "the log must say which build is running");
	});

	test("it reports which events this engine offers", async () => {
		const lines = await loadAddon();

		const surface = lines.find((line) => line.includes("afterEvents:"));
		assert.ok(surface, "no event inventory was logged");
		for (const name of [
			"entityHitBlock",
			"entitySpawn",
			"itemUse",
			"playerInteractWithBlock",
			"playerInteractWithEntity",
		]) {
			assert.ok(surface.includes(`${name}=ok`), `${name} should be reported present`);
		}
	});

	test("it says so when it finishes wiring itself up", async () => {
		const lines = await loadAddon();

		assert.ok(logged(lines, "boot sequence complete"));
	});

	test("every subscription is announced", async () => {
		const lines = await loadAddon();

		for (const name of [
			"entityHitBlock",
			"entitySpawn",
			"itemUse",
			"playerInteractWithBlock",
			"playerInteractWithEntity",
		]) {
			assert.ok(logged(lines, `subscribed: ${name}`), `no line for ${name}`);
		}
	});
});

describe("an engine missing an event", () => {
	test("a missing event is reported, and the rest of the boot survives", async () => {
		const lines = await loadAddon({ missingEvents: ["itemUse", "worldLoad"] });

		assert.ok(
			logged(lines, "cannot subscribe to itemUse"),
			"a missing event must be named, not silently skipped",
		);
		assert.equal(logged(lines, "subscribed: itemUse"), false);
		// The point of the guard: one absent event does not stop the module.
		assert.ok(logged(lines, "boot sequence complete"));
		assert.ok(logged(lines, "subscribed: playerInteractWithBlock"));
		assert.ok(logged(lines, "subscribed: interval every"));
	});

	test("the features that do not need the missing event still work", async () => {
		await loadAddon({ missingEvents: ["itemUse"] });
		const player = holding(TRAP_SNARE);

		interactWithBlock(player, { typeId: "minecraft:stone", x: 0, y: 64, z: 0, dimension: undefined });

		assert.equal(player.held, undefined, "the surviving arming path still spends the trap");
	});
});

describe("a handler that throws", () => {
	test("the throw is logged with the handler's name instead of vanishing", async () => {
		await loadAddon();

		// A player with no dimension: the trap handler cannot read where it is.
		const lines = capture(() => {
			useItem({ typeId: "minecraft:player" }, item(TRAP_SNARE));
		});

		assert.ok(
			logged(lines, "itemUse handler threw"),
			`expected the handler to name itself, got: ${lines.join("\n")}`,
		);
	});

	test("it does not stop the handlers that follow it", async () => {
		await loadAddon();

		capture(() => useItem({ typeId: "minecraft:player" }, item(TRAP_SNARE)));

		// The shears path still answers after that failure.
		const player = holding("rainbow_magic:rainbow_shears");
		assert.doesNotThrow(() =>
			interactWithBlock(player, { typeId: "minecraft:stone", x: 0, y: 64, z: 0 }),
		);
	});
});

describe("the content probe", () => {
	test("it reports every id the engine knows", async () => {
		await loadAddon();

		const lines = capture(() => tick());

		assert.ok(
			logged(lines, "content: items 9/9, blocks 3/3"),
			`expected a clean content report, got: ${lines.join("\n")}`,
		);
		assert.equal(logged(lines, "MISSING"), false);
	});

	test("it names each id the engine does not have", async () => {
		await loadAddon();
		// What a pack looks like when its data module never registered: the
		// script still runs, so this is the only way to tell from inside.
		state.unknownIds = ["rainbow_magic:rainbow_blade", "rainbow_magic:rainbow_ore"];

		const lines = capture(() => tick());

		assert.ok(logged(lines, "items 8/9"), lines.join("\n"));
		assert.ok(logged(lines, "blocks 2/3"), lines.join("\n"));
		assert.ok(
			logged(lines, "MISSING rainbow_magic:rainbow_blade rainbow_magic:rainbow_ore"),
			lines.join("\n"),
		);
	});

	test("it is reported once, with the heartbeat", async () => {
		await loadAddon();
		capture(() => tick());

		const later = capture(() => tick());

		assert.equal(logged(later, "content:"), false);
	});
});

describe("the pickaxe break report", () => {
	test("it reports the engine's own break with the pickaxe", async () => {
		await loadAddon();

		const lines = capture(() => {
			raiseBreak(holding(RAINBOW_PICKAXE), { type: { id: "minecraft:stone" } });
		});

		assert.ok(
			logged(lines, "the engine broke minecraft:stone with the rainbow pickaxe"),
			`expected a break report, got: ${lines.join("\n")}`,
		);
	});

	test("it stays quiet for any other tool", async () => {
		await loadAddon();

		const lines = capture(() => {
			raiseBreak(holding("minecraft:diamond_pickaxe"), { type: { id: "minecraft:stone" } });
		});

		assert.equal(logged(lines, "the engine broke"), false);
	});

	test("it stops after a few, so it cannot become a firehose", async () => {
		await loadAddon();
		const player = holding(RAINBOW_PICKAXE);

		const lines = capture(() => {
			for (let i = 0; i < 10; i += 1) {
				raiseBreak(player, { type: { id: "minecraft:stone" } });
			}
		});

		assert.equal(lines.filter((line) => line.includes("the engine broke")).length, 3);
	});
});

describe("liveness", () => {
	test("the first tick proves the script is running inside the world", async () => {
		await loadAddon();

		const lines = capture(() => tick());

		assert.ok(
			logged(lines, "alive in the world"),
			`expected a heartbeat, got: ${lines.join("\n")}`,
		);
	});

	test("the heartbeat is once, not every tick", async () => {
		await loadAddon();
		capture(() => tick());

		const later = capture(() => {
			tick();
			tick();
			tick();
		});

		assert.equal(logged(later, "alive in the world"), false, "a per-tick heartbeat is noise");
	});

	test("it reports how many players are connected", async () => {
		await loadAddon();
		state.players = [{ typeId: "minecraft:player" }, { typeId: "minecraft:player" }];

		const lines = capture(() => tick());

		assert.ok(logged(lines, "players=2"), lines.join("\n"));
	});
});
