import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { round } from "./metrics.mjs";

function countBy(items) {
  return items.reduce((result, item) => ({ ...result, [item]: (result[item] ?? 0) + 1 }), {});
}

function topCounts(values, limit = 5) {
  return Object.entries(countBy(values.filter(Boolean)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function strongestScores(row) {
  return Object.entries(row.scores ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, score]) => ({ name, score }));
}

function formatPercentLike(value) {
  return Number.isFinite(value) ? round(value * 100, 3) : null;
}

function classifyCase(row) {
  const outcome = row.result?.outcome;
  const correctClass = outcome === "TARGET_FIRST" ? "DOGRU_OKUDU" : outcome === "STOP_FIRST" ? "YANLIS_OKUDU" : "SUREYI_YANLIS_OKUDU";
  const evidence = row.evidence ?? {};
  const tags = [
    `sonuc_${outcome ?? "BILINMIYOR"}`,
    `zamanlama_${row.timingState ?? "BILINMIYOR"}`,
    `risk_${row.riskLevel ?? "BILINMIYOR"}`,
    `memory_${evidence.memoryState ?? "BILINMIYOR"}`,
    `sector_${evidence.sectorState ?? "BILINMIYOR"}`
  ];
  if ((evidence.recentNewsCount ?? 0) > 0) tags.push("yakinda_haber_var");
  if ((evidence.highImpactEventCount ?? 0) > 0) tags.push("yuksek_etkili_olay_var");
  if (Number.isFinite(row.result?.mfe) && row.result.mfe >= row.targetPct * 0.5 && outcome === "STOP_FIRST") tags.push("hedefin_yarisina_yaklasti_sonra_dondu");
  if (Number.isFinite(row.result?.mae) && Math.abs(row.result.mae) >= row.stopPct * 0.8) tags.push("stop_bolgesine_derin_gitti");
  for (const warning of row.softVetos ?? []) tags.push(`uyari_${warning}`);

  return {
    caseId: row.candidateId,
    entryAt: row.entryAt,
    symbol: row.symbol,
    modelKey: row.modelKey,
    modelLabel: row.modelLabel,
    correctClass,
    outcome,
    score: row.decisionScore,
    signalWindow: row.signalWindow,
    netReturn: row.result?.netReturn ?? null,
    timeToOutcomeMinutes: row.result?.timeToOutcomeMinutes ?? null,
    maePct: formatPercentLike(row.result?.mae),
    mfePct: formatPercentLike(row.result?.mfe),
    tags,
    beforeDecision: {
      timingState: row.timingState,
      timingReasons: row.timingReasons ?? [],
      strongestScores: strongestScores(row),
      warnings: row.softVetos ?? [],
      riskReward: row.riskReward,
      spreadBps: evidence.spreadBps ?? null,
      ret5mPct: formatPercentLike(evidence.ret5m),
      ret15mPct: formatPercentLike(evidence.ret15m),
      reboundFromRecentLowPct: formatPercentLike(evidence.reboundFromRecentLowPct),
      volumeRatio: evidence.volumeRatio ?? null,
      recentNewsCount: evidence.recentNewsCount ?? 0,
      highImpactEventCount: evidence.highImpactEventCount ?? 0
    },
    afterResult: {
      plain: outcome === "TARGET_FIRST"
        ? "Hedef stop'tan önce geldi; bu vaka kazanan örnek havuzuna yazıldı."
        : outcome === "STOP_FIRST"
          ? "Stop hedeften önce geldi; giriş kanıtları ve uyarılar kaybeden örnek havuzunda incelenecek."
          : "Hedef ayrılan sürede gelmedi; süre tahmini ayrıca incelenecek.",
      exitPrice: row.result?.exitPrice ?? null,
      outcomeAt: row.result?.outcomeAt ?? null,
      intrabarAmbiguous: Boolean(row.result?.intrabarAmbiguous)
    },
    classificationStatus: "HAM_VAKA_TOPLU_DOGRULAMA_BEKLIYOR"
  };
}

function decisionFunnel(report) {
  const rows = report.rows ?? [];
  const matured = rows.filter((row) => row.result?.status === "MATURED");
  const windows = countBy(rows.map((row) => row.signalWindow ?? "BILINMIYOR"));
  const outcomes = countBy(matured.map((row) => row.result.outcome ?? "BILINMIYOR"));
  const topHardVetos = topCounts(rows.flatMap((row) => row.hardVetos ?? []));
  const topSoftVetos = topCounts(rows.flatMap((row) => row.softVetos ?? []));
  const topTimingStates = topCounts(rows.map((row) => row.timingState));
  const eligibleSignals = report.portfolio?.eligibleSignals ?? rows.filter((row) => row.signalWindow === "NOW" && row.result?.status === "MATURED").length;
  return {
    decisionMoments: report.diagnostics?.fullPointInTimeSnapshots ?? 0,
    generatedCandidates: rows.length,
    windows,
    maturedCandidates: matured.length,
    outcomes,
    independentSignals: report.summary?.independentSignals ?? 0,
    paperEligibleSignals: eligibleSignals,
    paperExecutedTrades: report.portfolio?.executedTrades ?? 0,
    paperSkippedSignals: report.portfolio?.skippedSignals ?? 0,
    topHardVetos,
    topSoftVetos,
    topTimingStates,
    whyFewDecisions: [
      "Motor her 5 dakikada aday üretir; para yalnız “Şimdi” penceresi açılan ve sonucu olgunlaşan adaylara ayrılır.",
      "Aynı sembol ve modelde çakışan sinyaller ana sonuca bir kez sayılır; sanal kasa aynı hissede ikinci pozisyon açmaz.",
      "WAIT, PREPARE ve BLOCKED adayları veri defterine girer ama işlem sayılmaz; bu yüzden bir piyasa gününde az işlem çıkması normal olabilir."
    ]
  };
}

function runParameters(report, strategy, engineFingerprint) {
  return {
    mode: report.mode,
    requested: report.requested,
    generatedAt: report.generatedAt,
    engineVersion: report.engineVersion,
    engineFingerprint,
    portfolio: report.portfolio?.settings ?? null,
    models: Object.fromEntries(Object.entries(strategy.models ?? {}).map(([key, model]) => [key, {
      label: model.label,
      targetPct: model.targetPct,
      minStopPct: model.minStopPct,
      maxStopPct: model.maxStopPct,
      minRiskReward: model.minRiskReward,
      maxHoldingSessions: model.maxHoldingSessions,
      minimumMinutesToSessionClose: model.minimumMinutesToSessionClose
    }])),
    mechanics: {
      featureBarSeconds: strategy.barSeconds,
      outcomeBarSeconds: strategy.outcomeBarSeconds,
      decisionCadenceMinutes: report.portfolio?.cadenceMinutes ?? 5,
      entryCaptureMaxDelaySeconds: strategy.entryCaptureMaxDelaySeconds,
      feeCaseUsd: strategy.feeCasesUsd?.[1] ?? null,
      slippageStressBpsPerSide: strategy.slippageStressBpsPerSide,
      longOnly: true,
      symbols: ["MU", "SNDK"]
    }
  };
}

export function buildBacktestJournal(report, strategy, engineFingerprint) {
  const cases = (report.rows ?? [])
    .filter((row) => row.signalWindow === "NOW" && row.result?.status === "MATURED")
    .sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt))
    .map(classifyCase);
  return {
    runParameters: runParameters(report, strategy, engineFingerprint),
    dataAudit: {
      trustLevel: report.trustReport?.level ?? "UNKNOWN",
      officialForwardCounterEligible: Boolean(report.trustReport?.usableForOfficialForward),
      passedChecks: report.trustReport?.passedChecks ?? report.integrityChecks?.filter((check) => check.passed).length ?? 0,
      totalChecks: report.trustReport?.totalChecks ?? report.integrityChecks?.length ?? 0,
      sourceLines: report.trustReport?.sourceLines ?? [],
      warnings: report.trustReport?.warnings ?? [],
      integrityChecks: report.integrityChecks ?? []
    },
    decisionFunnel: decisionFunnel(report),
    learningCases: cases,
    classificationPlan: [
      "Kazanan, stop olan ve süre dolan vakalar tek tek değil, toplu örnek havuzunda karşılaştırılacak.",
      "Etiketler giriş anındaki kanıtları ve sonrasındaki sonucu ayırır; sonuç bilgisi karar motoruna geri verilmez.",
      "Yeni kural ancak geliştirme günlerinde aday olur; doğrulama ve kilitli testte dondurulmuş motorla sınanır."
    ]
  };
}

export async function saveBacktestRun(dataDir, report, strategy, engineFingerprint) {
  const journal = buildBacktestJournal(report, strategy, engineFingerprint);
  const hash = createHash("sha256").update(JSON.stringify({
    mode: report.mode,
    requested: report.requested,
    generatedAt: report.generatedAt,
    portfolio: report.portfolio?.settings,
    engineVersion: report.engineVersion
  })).digest("hex").slice(0, 12);
  const day = (report.requested?.date ?? report.generatedAt.slice(0, 10)).slice(0, 10);
  const directory = path.join(dataDir, "backtest-runs", day);
  await mkdir(directory, { recursive: true });
  const savedAt = new Date().toISOString();
  const savedFiles = {
    report: path.join(directory, `${hash}.json`),
    cases: path.join(directory, `${hash}-cases.ndjson`)
  };
  const savedReport = { ...report, runId: hash, savedAt, backtestJournal: journal, savedFiles };
  await writeFile(savedFiles.report, `${JSON.stringify(savedReport, null, 2)}\n`, "utf8");
  await writeFile(savedFiles.cases, journal.learningCases.map((item) => JSON.stringify(item)).join("\n") + (journal.learningCases.length ? "\n" : ""), "utf8");
  await appendFile(path.join(dataDir, "backtest-runs", "index.ndjson"), `${JSON.stringify({
    runId: hash,
    savedAt,
    mode: report.mode,
    requested: report.requested,
    trustLevel: journal.dataAudit.trustLevel,
    officialForwardCounterEligible: journal.dataAudit.officialForwardCounterEligible,
    decisionMoments: journal.decisionFunnel.decisionMoments,
    generatedCandidates: journal.decisionFunnel.generatedCandidates,
    independentSignals: journal.decisionFunnel.independentSignals,
    executedTrades: report.portfolio?.executedTrades ?? 0,
    netProfit: report.portfolio?.netProfit ?? null,
    totalReturn: report.portfolio?.totalReturn ?? null,
    reportPath: savedFiles.report,
    casesPath: savedFiles.cases
  })}\n`, "utf8");
  return savedReport;
}

export async function listBacktestRuns(dataDir, limit = 20) {
  try {
    const indexPath = path.join(dataDir, "backtest-runs", "index.ndjson");
    const lines = (await readFile(indexPath, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
    return lines.reverse().slice(0, limit);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
