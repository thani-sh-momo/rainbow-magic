/**
 * The Rainbow Glitter Unicorn: what the script gives it on spawn.
 *
 * The taming itself is the entity's own `minecraft:tameable` component, so it
 * is data rather than code and has nothing to assert here.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { capture, UNICORN, entity, loadAddon, raiseSpawn, state } from "./harness.mjs";

describe("the unicorn on spawn", () => {
	test("it is kind and it keeps up", async () => {
		await loadAddon();

		raiseSpawn(entity({ typeId: UNICORN }));

		assert.deepEqual(
			state.effects.map((entry) => entry.effect),
			["regeneration", "speed"],
		);
	});

	test("no Java-only effect is asked for", async () => {
		await loadAddon();

		raiseSpawn(entity({ typeId: UNICORN }));

		// "glowing" does not exist in Bedrock and throws InvalidArgumentError,
		// which used to cost the regeneration too.
		for (const entry of state.effects) {
			assert.notEqual(entry.effect, "glowing");
		}
	});

	test("one effect failing does not cost the other", async () => {
		await loadAddon();
		const partial = entity({ typeId: UNICORN });
		const realAddEffect = partial.addEffect;
		partial.addEffect = (effect, ...rest) => {
			if (effect === "regeneration") {
				throw new Error("the entity is not ready for effects yet");
			}
			return realAddEffect(effect, ...rest);
		};

		capture(() => raiseSpawn(partial));

		assert.deepEqual(
			state.effects.map((entry) => entry.effect),
			["speed"],
			"the effect after the failing one must still be applied",
		);
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

		// The failure is expected here, so its log line is captured rather than
		// left in the test output.
		capture(() => raiseSpawn(broken));
		raiseSpawn(entity({ typeId: UNICORN }));

		assert.equal(state.effects.length, 2, "the next unicorn still gets its effects");
	});
});
