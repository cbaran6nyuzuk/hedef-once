import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { round } from "./metrics.mjs";

const SCORE_BANDS = [[0, 49.99], [50, 59.99], [60, 69.99], [70, 79.99], [80, 100]];
const THRESHOLDS = [50, 55, 60, 65, 70, 75, 80];

function wilson(successes, total, z = 1.96) {
  if (!total) return { low: null, high: null };
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return { low: round(Math.max(0, centre - margin), 4), high: round(Math.min(1, centre + margin), 4) };
}

function metrics(rows) {
  const target = rows.filter((row) => row.result.outcome === "TARGET_FIRST").length;
  const stop = rows.filter((row) => row.result.outcome === "STOP_FIRST").length;
  const timeout = rows.filter((row) => row.result.outcome === "TIMEOUT").length;
  const net = rows.map((row) => row.result.netReturn).filter(Number.isFinite);
  return {
    samples: rows.length,
    targetFirst: target,
    stopFirst: stop,
    timeout,
    targetFirstRate: rows.length ? round(target / rows.length, 4) : null,
    confidence95: wilson(target, rows.length),
    averageNetReturn: net.length ? round(net.reduce((sum, value) => sum + value, 0) / net.length, 6) : null
  };
}

function modelCalibration(rows, modelKey) {
  const modelRows = rows.filter((row) => row.modelKey === modelKey);
  const bands = SCORE_BANDS.map(([minimum, maximum]) => ({
    minimum,
    maximum,
    label: maximum === 100 ? `${minimum}–100` : `${minimum}–${Math.floor(maximum)}`,
    ...metrics(modelRows.filter((row) => row.decisionScore >= minimum && row.decisionScore <= maximum))
  }));
  const thresholds = THRESHOLDS.map((threshold) => ({ threshold, ...metrics(modelRows.filter((row) => row.decisionScore >= threshold)) }));
  const usableBands = bands.filter((band) => band.samples >= 20);
  const monotonic = usableBands.length >= 3
    ? usableBands.every((band, index) => index === 0 || band.targetFirstRate >= usableBands[index - 1].targetFirstRate)
    : null;
  return { modelKey, total: modelRows.length, bands, thresholds, monotonic };
}

function independentRows(rows) {
  const accepted = [];
  const blockedUntil = new Map();
  for (const row of [...rows].sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt))) {
    const key = `${row.symbol}|${row.modelKey}`;
    const entryAt = new Date(row.entryAt).getTime();
    if (!Number.isFinite(entryAt) || entryAt <= (blockedUntil.get(key) ?? -Infinity)) continue;
    const resolvedAt = new Date(row.result.outcomeAt ?? row.result.deadlineAt ?? row.entryAt).getTime();
    accepted.push(row);
    blockedUntil.set(key, Number.isFinite(resolvedAt) ? Math.max(entryAt, resolvedAt) : entryAt);
  }
  return accepted;
}

export function buildScoreCalibration(rows, { engineVersion, evidenceType }) {
  const allMatured = rows.filter((row) => row.engineVersion === engineVersion
    && row.result?.status === "MATURED"
    && ["TARGET_FIRST", "STOP_FIRST", "TIMEOUT"].includes(row.result.outcome)
    && Number.isFinite(row.decisionScore));
  const matured = independentRows(allMatured);
  const days = new Set(matured.map((row) => row.entryAt?.slice(0, 10)).filter(Boolean));
  const models = ["quick", "extended"].map((modelKey) => modelCalibration(matured, modelKey));
  const enoughForThreshold = evidenceType === "FULL_PIT" && days.size >= 10
    && models.every((model) => model.total >= 100 && model.bands.filter((band) => band.samples >= 20).length >= 3);
  return {
    engineVersion,
    evidenceType,
    status: enoughForThreshold ? "THRESHOLD_EVIDENCE_READY" : "INSUFFICIENT_EVIDENCE",
    plainStatus: enoughForThreshold
      ? "Puanın sonuçla ilişkisini değerlendirmek için asgari örnek oluştu. Monotonluk ve güven aralıklarını kontrol et."
      : "Bu sürümde gerçek puan eşiği önermek için yeterli bağımsız FULL_PIT örnek yok. 56 puanın başarısız olduğu varsayılamaz.",
    minimumProof: { fullPitDays: 10, maturedPerModel: 100, populatedBands: 3, samplesPerBand: 20 },
    independenceRule: "Aynı hisse ve modelde önceki hedef/stop/süre penceresi kapanmadan oluşan kararlar tek örnek sayılır.",
    observedDays: days.size,
    observedMaturedRows: allMatured.length,
    maturedSamples: matured.length,
    models
  };
}

async function reportFiles(directory) {
  const output = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) output.push(...await reportFiles(resolved));
      else if (entry.isFile() && entry.name.endsWith(".json")) output.push(resolved);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return output;
}

export async function loadScoreCalibration(dataDir, engineVersion) {
  const preferred = new Map();
  for (const file of await reportFiles(path.join(dataDir, "backtest-runs"))) {
    let report;
    try { report = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
    if (report.engineVersion !== engineVersion) continue;
    const priority = report.mode === "STRICT_POINT_IN_TIME_REPLAY" ? 2 : 1;
    for (const row of report.rows ?? []) {
      const key = row.candidateId;
      if (!key) continue;
      const current = preferred.get(key);
      if (!current || priority > current.priority) preferred.set(key, { priority, row, mode: report.mode });
    }
  }
  const values = [...preferred.values()];
  const fullPitRows = values.filter((item) => item.mode === "STRICT_POINT_IN_TIME_REPLAY").map((item) => item.row);
  const reconstructedRows = values.filter((item) => item.mode === "HISTORICAL_RECONSTRUCTION").map((item) => item.row);
  return {
    generatedAt: new Date().toISOString(),
    engineVersion,
    official: buildScoreCalibration(fullPitRows, { engineVersion, evidenceType: "FULL_PIT" }),
    preliminary: buildScoreCalibration(reconstructedRows, { engineVersion, evidenceType: "RECONSTRUCTED" })
  };
}
