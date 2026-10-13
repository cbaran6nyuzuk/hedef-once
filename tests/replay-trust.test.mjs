import test from "node:test";
import assert from "node:assert/strict";
import { replayTrustReport } from "../lib/replay-trust.mjs";

const checks = [{ name: "kontrol", passed: true }];

test("tam point-in-time replay resmi forward sayacına uygundur", () => {
  const report = replayTrustReport({
    mode: "STRICT_POINT_IN_TIME_REPLAY",
    diagnostics: {},
    integrityChecks: checks,
    dataQuality: {
      marketBars: "canlı mum",
      execution: "canlı bid/ask",
      news: "ilk görülme zamanı",
      filings: "SEC",
      calendar: "takvim",
      officialForwardCounterEligible: true
    }
  });
  assert.equal(report.level, "FULL_PIT");
  assert.equal(report.usableForOfficialForward, true);
  assert.equal(report.warnings.length, 0);
});

test("tarihsel canlandırma proxy uyarılarını açık taşır", () => {
  const report = replayTrustReport({
    mode: "HISTORICAL_RECONSTRUCTION",
    diagnostics: {},
    integrityChecks: checks,
    dataQuality: {
      marketBars: "tarihsel mum",
      execution: "proxy spread",
      news: "yayın zamanı proxy",
      filings: "SEC",
      calendar: "takvim",
      officialForwardCounterEligible: false
    }
  });
  assert.equal(report.level, "RECONSTRUCTED");
  assert.equal(report.usableForOfficialForward, false);
  assert.ok(report.warnings.some((warning) => warning.includes("bid/ask")));
  assert.ok(report.warnings.some((warning) => warning.includes("resmi forward")));
});
