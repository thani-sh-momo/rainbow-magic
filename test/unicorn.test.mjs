/**
 * The Rainbow Glitter Unicorn: what the script gives it on spawn.
 *
 * The taming itself is the entity's own `minecraft:tameable` component, so it
 * is data rather than code and has nothing to assert here.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { UNICORN, entity, loadAddon, raiseSpawn, state } from "./harness.mjs";

describe("the unicorn on spawn", () => {
	test("it glitters and it is kind", async () => {
		await loadAddon();

		raiseSpawn(entity({ typeId: UNICORN }));

		assert.deepEqual(
			state.effects.map((entry) => entry.effect),
			["glowing", "regeneration"],
		);
		assert.equal(state.effects[1].options.amplifier, 1);
	});

	test("its blessings never show particles of their own", async () => {
		await loadAddon();

		raiseSpawn(entity({ typeId: UNICORN }));

		for (const effect of state.effects) {
			assert.equal(effect.options.showParticles, false);
		}
		assert.deepEqual(state.particles, []);
	});

	test("other mobs are left as they are", async () => {
		await loadAddon();

		raiseSpawn(entity({ typeId: "minecraft:zombie" }));
		raiseSpawn(entity({ typeId: "minecraft:sheep" }));

		assert.deepEqual(state.effects, []);
	});

	test("a unicorn that cannot be blessed does not break the spawn handler", async () => {
		await loadAddon();
		const broken = entity({ typeId: UNICORN });
		broken.addEffect = () => {
			throw new Error("the entity is not ready for effects yet");
		};

		raiseSpawn(broken);
		raiseSpawn(entity({ typeId: UNICORN }));

		assert.equal(state.effects.length, 2, "the next unicorn still gets its effects");
	});
});
