import test from "node:test";
import assert from "node:assert/strict";
import { simulatePaperPortfolio } from "../lib/portfolio.mjs";

function row({ id, symbol = "MU", entryAt, outcomeAt, grossReturn, score = 85, stopPct = 0.006 }) {
  return {
    candidateId: id, symbol, modelKey: "quick", modelLabel: "Hızlı +1", signalWindow: "NOW",
    entryAt, entryPrice: 100, stopPct, decisionScore: score, riskLevel: "MEDIUM",
    targetPct: 0.01, timingReasons: ["5 dakikalık dönüş oluştu"], softVetos: ["HIGH_IMPACT_EVENT_TODAY"],
    scores: { priceVolume: 88, targetStop: 90, execution: 75 },
    result: { status: "MATURED", outcomeAt, outcome: grossReturn > 0 ? "TARGET_FIRST" : "STOP_FIRST", exitPrice: 100 * (1 + grossReturn), grossReturn, mfe: grossReturn > 0 ? 0.01 : 0.006, mae: grossReturn > 0 ? -0.002 : -0.006 }
  };
}

test("sanal kasa yalnız NOW ve olgunlaşmış kararları işler", () => {
  const valid = row({ id: "a", entryAt: "2026-10-08T14:00:00Z", outcomeAt: "2026-10-08T14:10:00Z", grossReturn: 0.01 });
  const wait = { ...row({ id: "b", entryAt: "2026-10-08T14:20:00Z", outcomeAt: "2026-10-08T14:30:00Z", grossReturn: 0.01 }), signalWindow: "WAIT" };
  const pending = { ...row({ id: "c", entryAt: "2026-10-08T14:40:00Z", outcomeAt: "2026-10-08T14:50:00Z", grossReturn: 0.01 }), result: { status: "PENDING" } };
  const report = simulatePaperPortfolio([valid, wait, pending], { initialCapital: 10_000, feeUsd: 3, slippageBpsPerSide: 5 });
  assert.equal(report.eligibleSignals, 1);
  assert.equal(report.executedTrades, 1);
  assert.ok(report.finalCapital > 10_000);
});

test("aynı hissede çakışan ikinci pozisyonu açmaz", () => {
  const report = simulatePaperPortfolio([
    row({ id: "a", entryAt: "2026-10-08T14:00:00Z", outcomeAt: "2026-10-08T15:00:00Z", grossReturn: -0.006 }),
    row({ id: "b", entryAt: "2026-10-08T14:05:00Z", outcomeAt: "2026-10-08T14:20:00Z", grossReturn: 0.01 })
  ]);
  assert.equal(report.executedTrades, 1);
  assert.equal(report.skippedSignals, 1);
  assert.equal(report.skipped[0].reason, "SAME_SYMBOL_ALREADY_OPEN");
});

test("risk bütçesi, pozisyon tavanı ve gerçek maliyet kasaya uygulanır", () => {
  const report = simulatePaperPortfolio([
    row({ id: "a", entryAt: "2026-10-08T14:00:00Z", outcomeAt: "2026-10-08T14:10:00Z", grossReturn: -0.006 })
  ], { initialCapital: 10_000, riskPct: 1, maxPositionPct: 50, feeUsd: 3, slippageBpsPerSide: 5 });
  assert.equal(report.trades[0].notional, 5000);
  assert.equal(report.trades[0].costsUsd, 8);
  assert.equal(report.trades[0].netPnlUsd, -38);
  assert.equal(report.finalCapital, 9962);
  assert.match(report.trades[0].review.missed, /varsayımı yanlıştı/);
  assert.equal(report.trades[0].review.modelUpdate, "FROZEN_NO_AUTOMATIC_UPDATE");
});
