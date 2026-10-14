import test from "node:test";
import assert from "node:assert/strict";
import { createReplaySandbox, decisionCadenceMinutes } from "../lib/replay-sandbox.mjs";

function chart(symbol, minutes) {
  const start = Date.parse("2026-10-13T13:30:00.000Z") / 1000;
  return {
    symbol,
    bars: Array.from({ length: minutes }, (_, index) => ({ timestamp: start + index * 60 }))
  };
}

test("replay sandbox her mumu görür ama 15 dakikada bir düşünür", () => {
  const sandbox = createReplaySandbox({
    mode: "TEST",
    strategy: { decisionCadenceMinutes: 15 },
    startedAt: "2026-10-13T13:30:00.000Z"
  });
  const thoughts = [];
  for (let minute = 1; minute <= 45; minute += 1) {
    const observedAt = new Date(Date.parse("2026-10-13T13:30:00.000Z") + minute * 60_000).toISOString();
    sandbox.observe({ observedAt, charts: [chart("MU", minute), chart("SNDK", minute)] });
    const thought = sandbox.shouldThink(observedAt);
    if (thought) thoughts.push(thought);
  }

  assert.equal(thoughts.length, 3);
  assert.deepEqual(thoughts.map((item) => item.observedStepsBeforeDecision), [15, 30, 45]);
  assert.equal(thoughts[0].seenBarsBySymbol.MU, 15);
  assert.equal(thoughts[2].seenBarsBySymbol.SNDK, 45);
  assert.match(thoughts[0].memoryPolicy, /sandbox hafızasında/);

  const summary = sandbox.summary();
  assert.equal(summary.observedSteps, 45);
  assert.equal(summary.decisionThoughts, 3);
  assert.equal(summary.averageObservedStepsPerThought, 15);
});

test("decision cadence varsayılanı 15 dakikadır", () => {
  assert.equal(decisionCadenceMinutes({}), 15);
  assert.equal(decisionCadenceMinutes({ decisionCadenceMinutes: 5 }), 5);
});
