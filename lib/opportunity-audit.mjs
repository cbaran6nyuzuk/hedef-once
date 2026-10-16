import { evaluateTargetBeforeStop } from "./evaluator.mjs";
import { round } from "./metrics.mjs";

const causeLabels = {
  INSUFFICIENT_HISTORY: "Karar geçmişi henüz oluşmamıştı",
  DELAYED_DECISION_CAPTURE: "Karar mumu geç yakalandı",
  OPEN_CHAOS_WINDOW: "Açılış koruma süresi içindeydi",
  TOO_LATE_FOR_TARGET_WINDOW: "Seansın kalan süresi yetersizdi",
  STALE_OR_MISSING_QUOTE: "Gerçek giriş fiyatı doğrulanamadı",
  STOP_TOO_WIDE: "Gerekli stop fazla genişti",
  RISK_REWARD_TOO_LOW: "Hedefe göre risk fazlaydı",
  CHASING_PRICE: "Hareketin önemli kısmı gerçekleşmişti",
  NO_ENTRY_TRIGGER: "Yakın dönüş tetiği oluşmamıştı",
  ENTRY_TRIGGER_FORMING: "Tetik hazırlanıyor fakat tamamlanmamıştı",
  NO_VWAP_RECLAIM: "VWAP geri alınmamıştı",
  SECTOR_BREAKDOWN: "Sektör baskısı riski artırıyordu"
};

function benchmarkDeadline(row) {
  return row.deadlineAt ?? null;
}

function primaryCause(row) {
  const codes = [...(row.hardVetos ?? []), ...(row.softVetos ?? [])];
  const code = codes[0] ?? row.timingState ?? "NO_REASON_RECORDED";
  return { code, label: causeLabels[code] ?? code };
}

export function buildOpportunityAudit(rows, barsBySymbol, strategy) {
  const quick = strategy.models?.quick;
  const rapidWindowMinutes = 30;
  if (!quick) return null;
  const comparisons = [];
  for (const row of rows.filter((item) => item.modelKey === "quick")) {
    const entryPrice = row.entryPrice;
    const deadlineAt = benchmarkDeadline(row);
    const bars = barsBySymbol[row.symbol] ?? [];
    if (![entryPrice, quick.targetPct, quick.maxStopPct].every(Number.isFinite) || !deadlineAt || !bars.length) continue;
    const result = evaluateTargetBeforeStop({
      entryAt: row.entryAt,
      entryPrice,
      targetPrice: entryPrice * (1 + quick.targetPct),
      stopPrice: entryPrice * (1 - quick.maxStopPct),
      deadlineAt
    }, bars);
    if (result.outcome === "INVALID" || !Number.isFinite(result.exitPrice)) continue;
    const motorEntered = row.signalWindow === "NOW";
    const benchmarkEnter = result.outcome === "TARGET_FIRST";
    const comparisonClass = motorEntered
      ? benchmarkEnter ? "DOGRU_GIRIS" : "YANLIS_GIRIS"
      : benchmarkEnter ? "KACAN_FIRSAT" : "DOGRU_BEKLEME";
    const cause = primaryCause(row);
    const timeToOutcomeMinutes = round((new Date(result.outcomeAt) - new Date(row.entryAt)) / 60_000, 1);
    comparisons.push({
      candidateId: row.candidateId,
      symbol: row.symbol,
      decisionAt: row.entryAt,
      motorDecision: motorEntered ? "GIR" : row.signalWindow === "PREPARE" ? "HAZIRLAN" : "BEKLE",
      motorWindow: row.signalWindow,
      benchmarkDecision: benchmarkEnter ? "GIRSEYDI_HEDEF_ONCE" : "GIRMEMELIYDI",
      benchmarkOutcome: result.outcome,
      comparisonClass,
      entryPrice: round(entryPrice),
      benchmarkTargetPrice: round(entryPrice * (1 + quick.targetPct)),
      benchmarkStopPrice: round(entryPrice * (1 - quick.maxStopPct)),
      outcomeAt: result.outcomeAt,
      timeToOutcomeMinutes,
      rapidOpportunity: benchmarkEnter && timeToOutcomeMinutes <= rapidWindowMinutes,
      mfePct: round((result.mfe ?? 0) * 100, 3),
      maePct: round((result.mae ?? 0) * 100, 3),
      primaryCause: cause,
      hardVetos: row.hardVetos ?? [],
      softVetos: row.softVetos ?? [],
      hindsightOnly: true
    });
  }
  const counts = Object.fromEntries(["DOGRU_GIRIS", "YANLIS_GIRIS", "KACAN_FIRSAT", "DOGRU_BEKLEME"].map((key) => [key, comparisons.filter((item) => item.comparisonClass === key).length]));
  counts.HIZLI_KACAN_FIRSAT = comparisons.filter((item) => item.comparisonClass === "KACAN_FIRSAT" && item.rapidOpportunity).length;
  const missedByCause = Object.entries(comparisons.filter((item) => item.comparisonClass === "KACAN_FIRSAT")
    .reduce((result, item) => ({ ...result, [item.primaryCause.code]: (result[item.primaryCause.code] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, label: causeLabels[code] ?? code }));
  return {
    label: "GELECEK SONUCUYLA DENETIM",
    explanation: "Bu bölüm motorun o anda görmediği sonraki fiyatları yalnız değerlendirme için kullanır. Motor kararına geri verilmez ve ağırlıkları otomatik değiştirmez.",
    benchmark: `Karar anındaki giriş fiyatından +%${quick.targetPct * 100} hedef ve -%${quick.maxStopPct * 100} azami stop karşılaştırması`,
    rapidWindowMinutes,
    evaluatedDecisions: comparisons.length,
    counts,
    missedByCause,
    comparisons
  };
}
