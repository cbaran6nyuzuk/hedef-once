import test from "node:test";
import assert from "node:assert/strict";
import { buildScoreCalibration } from "../lib/score-calibration.mjs";

function row(index, score, outcome, modelKey = "quick") {
  return { candidateId: `${modelKey}-${index}`, engineVersion: "v", modelKey, decisionScore: score,
    symbol: index % 2 ? "MU" : "SNDK",
    entryAt: `2026-10-${String(1 + index % 12).padStart(2, "0")}T14:00:00Z`,
    result: { status: "MATURED", outcome, outcomeAt: `2026-10-${String(1 + index % 12).padStart(2, "0")}T14:05:00Z`, netReturn: outcome === "TARGET_FIRST" ? 0.008 : -0.009 } };
}

test("puan bandı düşük skordaki başarıyı gizlemez", () => {
  const rows = [row(1, 56, "TARGET_FIRST"), row(2, 58, "STOP_FIRST"), row(3, 72, "TARGET_FIRST")];
  const report = buildScoreCalibration(rows, { engineVersion: "v", evidenceType: "FULL_PIT" });
  const quick = report.models.find((model) => model.modelKey === "quick");
  const band = quick.bands.find((item) => item.minimum === 50);
  assert.equal(band.samples, 2);
  assert.equal(band.targetFirstRate, 0.5);
  assert.equal(report.status, "INSUFFICIENT_EVIDENCE");
});

test("yeniden kurulmuş veri resmi eşik kanıtı olamaz", () => {
  const rows = Array.from({ length: 240 }, (_, index) => row(index, 50 + index % 40, index % 2 ? "TARGET_FIRST" : "STOP_FIRST", index % 4 < 2 ? "quick" : "extended"));
  const report = buildScoreCalibration(rows, { engineVersion: "v", evidenceType: "RECONSTRUCTED" });
  assert.equal(report.status, "INSUFFICIENT_EVIDENCE");
});

test("çakışan kararlar bağımsız kanıt gibi çoğaltılmaz", () => {
  const first = row(1, 56, "TARGET_FIRST");
  first.entryAt = "2026-10-01T14:00:00Z";
  first.result.outcomeAt = "2026-10-01T14:30:00Z";
  const overlapping = row(3, 58, "TARGET_FIRST");
  overlapping.entryAt = "2026-10-01T14:15:00Z";
  overlapping.result.outcomeAt = "2026-10-01T14:20:00Z";
  const report = buildScoreCalibration([first, overlapping], { engineVersion: "v", evidenceType: "FULL_PIT" });
  assert.equal(report.observedMaturedRows, 2);
  assert.equal(report.maturedSamples, 1);
});
