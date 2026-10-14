import test from "node:test";
import assert from "node:assert/strict";
import { buildBacktestJournal } from "../lib/backtest-journal.mjs";

const strategy = {
  barSeconds: 300,
  outcomeBarSeconds: 60,
  decisionCadenceMinutes: 15,
  entryCaptureMaxDelaySeconds: 90,
  feeCasesUsd: [1, 3],
  slippageStressBpsPerSide: 5,
  models: {
    quick: {
      label: "Hızlı +1",
      targetPct: 0.01,
      minStopPct: 0.004,
      maxStopPct: 0.012,
      minRiskReward: 1.1,
      maxHoldingSessions: 1,
      minimumMinutesToSessionClose: 45
    }
  }
};

function row({ id, outcome, netReturn }) {
  return {
    candidateId: id,
    entryAt: "2026-10-13T14:00:00.000Z",
    symbol: "MU",
    modelKey: "quick",
    modelLabel: "Hızlı +1",
    signalWindow: "NOW",
    timingState: "REVERSAL_TRIGGER",
    timingReasons: ["5 dakikalık dönüş"],
    decisionScore: 82,
    riskLevel: "MEDIUM",
    riskReward: 1.4,
    targetPct: 0.01,
    stopPct: 0.006,
    softVetos: ["MIXED_MEMORY_BASKET"],
    scores: { priceVolume: 88, targetStop: 72, execution: 70 },
    evidence: { memoryState: "MIXED", sectorState: "POSITIVE", ret5m: 0.004, ret15m: 0.006, reboundFromRecentLowPct: 0.008, volumeRatio: 1.3, spreadBps: 4, recentNewsCount: 1, highImpactEventCount: 0 },
    result: { status: "MATURED", outcome, netReturn, grossReturn: netReturn, timeToOutcomeMinutes: 24, mae: -0.003, mfe: 0.012, exitPrice: 101, outcomeAt: "2026-10-13T14:24:00.000Z" }
  };
}

test("backtest defteri parametreleri, huni ve vaka sınıflarını üretir", () => {
  const journal = buildBacktestJournal({
    mode: "STRICT_POINT_IN_TIME_REPLAY",
    generatedAt: "2026-10-13T15:00:00.000Z",
    engineVersion: "test",
    requested: { startAt: "2026-10-13T13:30:00.000Z", endAt: "2026-10-13T20:00:00.000Z" },
    diagnostics: { fullPointInTimeSnapshots: 12, sandbox: { decisionCadenceMinutes: 15, observedSteps: 48, seenBarsBySymbol: { MU: 42, SNDK: 41 } } },
    summary: { independentSignals: 2 },
    portfolio: { settings: { initialCapital: 10_000, riskPct: 1, maxPositionPct: 50 }, cadenceMinutes: 15, eligibleSignals: 2, executedTrades: 2, skippedSignals: 0 },
    trustReport: { level: "FULL_PIT", usableForOfficialForward: true, passedChecks: 6, totalChecks: 6, sourceLines: [], warnings: [] },
    integrityChecks: [{ name: "ok", passed: true }],
    rows: [
      row({ id: "win", outcome: "TARGET_FIRST", netReturn: 0.009 }),
      row({ id: "loss", outcome: "STOP_FIRST", netReturn: -0.007 })
    ]
  }, strategy, "abc123");
  assert.equal(journal.runParameters.mechanics.featureBarSeconds, 300);
  assert.equal(journal.runParameters.mechanics.decisionCadenceMinutes, 15);
  assert.equal(journal.decisionFunnel.observedSteps, 48);
  assert.equal(journal.decisionFunnel.observedBars, 42);
  assert.equal(journal.dataAudit.trustLevel, "FULL_PIT");
  assert.equal(journal.decisionFunnel.paperExecutedTrades, 2);
  assert.equal(journal.learningCases.length, 2);
  assert.equal(journal.learningCases[0].correctClass, "DOGRU_OKUDU");
  assert.equal(journal.learningCases[1].correctClass, "YANLIS_OKUDU");
});
