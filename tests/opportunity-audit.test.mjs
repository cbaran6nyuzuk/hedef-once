import test from "node:test";
import assert from "node:assert/strict";
import { buildOpportunityAudit } from "../lib/opportunity-audit.mjs";

const strategy = { models: { quick: { targetPct: 0.01, maxStopPct: 0.0085 } } };
const base = {
  modelKey: "quick", symbol: "MU", entryAt: "2026-10-13T14:00:00.000Z",
  deadlineAt: "2026-10-13T20:00:00.000Z", entryPrice: 100, hardVetos: [], softVetos: []
};

test("motorun beklediği fakat hedefe giden karar kaçan fırsat olarak işaretlenir", () => {
  const rows = [{ ...base, candidateId: "miss", signalWindow: "WAIT", timingState: "CHASING", softVetos: ["CHASING_PRICE"] }];
  const bars = { MU: [{ eventAt: "2026-10-13T14:01:00.000Z", high: 101.1, low: 99.7, close: 101 }] };
  const audit = buildOpportunityAudit(rows, bars, strategy);
  assert.equal(audit.counts.KACAN_FIRSAT, 1);
  assert.equal(audit.counts.HIZLI_KACAN_FIRSAT, 1);
  assert.equal(audit.comparisons[0].primaryCause.code, "CHASING_PRICE");
  assert.equal(audit.comparisons[0].hindsightOnly, true);
});

test("motorun girdiği ve stop olan karar yanlış giriş olarak işaretlenir", () => {
  const rows = [{ ...base, candidateId: "bad", signalWindow: "NOW", timingState: "REVERSAL_TRIGGER" }];
  const bars = { MU: [{ eventAt: "2026-10-13T14:01:00.000Z", high: 100.2, low: 99, close: 99.2 }] };
  const audit = buildOpportunityAudit(rows, bars, strategy);
  assert.equal(audit.counts.YANLIS_GIRIS, 1);
});
