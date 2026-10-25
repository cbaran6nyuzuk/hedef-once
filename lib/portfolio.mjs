import { round } from "./metrics.mjs";

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function portfolioEquity(cash, openPositions) {
  return cash + openPositions.reduce((sum, position) => sum + position.notional, 0);
}

const scoreNames = {
  priceVolume: "giriş zamanlaması", volatilityTime: "hedef süresi", sectorBasket: "memory/sektör desteği",
  newsEvent: "haber ve olay ortamı", targetStop: "hedef/stop geometrisi", macro: "genel piyasa",
  execution: "giriş maliyeti", crowdedRisk: "hareket yorgunluğu"
};

const warningNames = {
  HIGH_IMPACT_EVENT_TODAY: "yüksek etkili olay riski vardı", MIXED_MEMORY_BASKET: "memory grubu karışıktı",
  NEGATIVE_MEMORY_BASKET: "memory grubu negatifti", NO_VWAP_RECLAIM: "VWAP geri alınmamıştı",
  CHASING_PRICE: "fiyat girişten önce fazla ilerlemişti", ENTRY_TRIGGER_FORMING: "giriş tetiği tamamlanmamıştı",
  NEWS_SENTIMENT_UNCLASSIFIED: "haber yönü sınıflanmamıştı"
};

function buildTradeReview(row) {
  const strongest = Object.entries(row.scores ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([key, score]) => `${scoreNames[key] ?? key} ${score}/100`);
  const warnings = (row.softVetos ?? []).map((warning) => warningNames[warning] ?? warning);
  const mfePct = Number.isFinite(row.result?.mfe) ? row.result.mfe * 100 : null;
  const maePct = Number.isFinite(row.result?.mae) ? row.result.mae * 100 : null;
  let understood;
  let missed;
  let developmentQuestion;
  if (row.result.outcome === "TARGET_FIRST") {
    understood = `Kısa yön ve devam varsayımı çalıştı; fiyat +%${(row.targetPct * 100).toLocaleString("tr-TR")} hedefe stop olmadan ulaştı.`;
    missed = warnings.length ? `İşlem kazansa da şu risk uyarıları vardı: ${warnings.join(", ")}. Bunların gereğinden fazla korumacı olup olmadığı tek işlemle söylenemez.` : "Bu işlemde hedefe kadar ana varsayımı bozan bir hareket görülmedi.";
    developmentQuestion = "Kazanan örneklerde hangi giriş kanıtlarının tekrarlandığını geliştirme bölümünde grupla; bu işlem tek başına ağırlık değiştirmesin.";
  } else if (row.result.outcome === "STOP_FIRST") {
    understood = Number.isFinite(mfePct) && mfePct > 0.2
      ? `İlk tepkiyi kısmen gördü; fiyat girişten sonra en fazla +%${mfePct.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ilerledi. Stop kaybı sınırladı.`
      : "Stop mekanizması kaybı önceden belirlenen sınırda kesti.";
    missed = `Tepkinin +%${(row.targetPct * 100).toLocaleString("tr-TR")} hedefe devam edeceği varsayımı yanlıştı; fiyat stopa kadar en fazla %${Math.abs(maePct ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} aleyhe gitti.`;
    developmentQuestion = Number.isFinite(mfePct) && mfePct >= row.targetPct * 50
      ? "Geliştirme örneklerinde hedefin yarısına yaklaşan fakat stop olan işlemler için kâr koruma veya daha güçlü devam teyidi ayrı aday kural olarak sınansın."
      : "Geliştirme örneklerinde stop olan girişlerde ek teyit, sektör uyumu ve olay riski ayrı ayrı sınansın.";
  } else {
    understood = Number.isFinite(row.result?.grossReturn) && row.result.grossReturn > 0 ? "Yön kısmen doğruydu fakat hedef ayrılan sürede gelmedi." : "Stop çalışmadı ancak beklenen hareket de ayrılan sürede oluşmadı.";
    missed = "Hedefe ulaşma süresi varsayımı gerçekleşmedi; sermaye beklenenden uzun süre bağlı kaldı.";
    developmentQuestion = "Timeout örneklerinde beklenen süre tahmini geliştirme bölümünde yeniden ölçülsün.";
  }
  return {
    entryReasons: [...(row.timingReasons ?? []), ...strongest],
    warnings,
    understood,
    missed,
    developmentQuestion,
    modelUpdate: "FROZEN_NO_AUTOMATIC_UPDATE",
    modelUpdateExplanation: "Bu sonuç motoru değiştirmedi. Değişiklik yalnız geliştirme dönemindeki toplu örneklerden adaylaştırılır; doğrulama ve kilitli testte kurallar dondurulur."
  };
}

export function simulatePaperPortfolio(rows, options = {}) {
  const settings = {
    initialCapital: boundedNumber(options.initialCapital, 10_000, 1_000, 1_000_000),
    riskPct: boundedNumber(options.riskPct, 1, 0.1, 5),
    maxPositionPct: boundedNumber(options.maxPositionPct, 50, 10, 100),
    maxConcurrent: Math.round(boundedNumber(options.maxConcurrent, 2, 1, 4)),
    feeUsd: boundedNumber(options.feeUsd, 3, 0, 100),
    slippageBpsPerSide: boundedNumber(options.slippageBpsPerSide, 5, 0, 50),
    cadenceMinutes: Math.round(boundedNumber(options.cadenceMinutes, 15, 1, 60))
  };
  const eligible = rows
    .filter((row) => row.signalWindow === "NOW" && row.result?.status === "MATURED")
    .sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt) || b.decisionScore - a.decisionScore || a.candidateId.localeCompare(b.candidateId));
  let cash = settings.initialCapital;
  let peakEquity = settings.initialCapital;
  let maxDrawdown = 0;
  const open = [];
  const trades = [];
  const skipped = [];

  function closeDuePositions(asOf = Infinity) {
    const due = open.filter((position) => new Date(position.outcomeAt).getTime() <= asOf)
      .sort((a, b) => new Date(a.outcomeAt) - new Date(b.outcomeAt));
    for (const position of due) {
      const index = open.indexOf(position);
      if (index !== -1) open.splice(index, 1);
      const slippageUsd = position.notional * settings.slippageBpsPerSide * 2 / 10_000;
      const costsUsd = settings.feeUsd + slippageUsd;
      const grossPnlUsd = position.notional * position.grossReturn;
      const netPnlUsd = grossPnlUsd - costsUsd;
      cash += position.notional + netPnlUsd;
      const equityAfter = portfolioEquity(cash, open);
      peakEquity = Math.max(peakEquity, equityAfter);
      maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? (peakEquity - equityAfter) / peakEquity : 0);
      trades.push({
        ...position,
        grossPnlUsd: round(grossPnlUsd, 2),
        costsUsd: round(costsUsd, 2),
        netPnlUsd: round(netPnlUsd, 2),
        netReturn: round(netPnlUsd / position.notional, 6),
        balanceAfter: round(equityAfter, 2)
      });
    }
  }

  for (let index = 0; index < eligible.length;) {
    const entryAt = eligible[index].entryAt;
    const entryTime = new Date(entryAt).getTime();
    closeDuePositions(entryTime);
    const group = [];
    while (index < eligible.length && eligible[index].entryAt === entryAt) group.push(eligible[index++]);
    group.sort((a, b) => b.decisionScore - a.decisionScore || a.candidateId.localeCompare(b.candidateId));
    for (const row of group) {
      if (open.some((position) => position.symbol === row.symbol)) {
        skipped.push({ candidateId: row.candidateId, entryAt, symbol: row.symbol, modelLabel: row.modelLabel, reason: "SAME_SYMBOL_ALREADY_OPEN" });
        continue;
      }
      if (open.length >= settings.maxConcurrent) {
        skipped.push({ candidateId: row.candidateId, entryAt, symbol: row.symbol, modelLabel: row.modelLabel, reason: "MAX_CONCURRENT_REACHED" });
        continue;
      }
      const equity = portfolioEquity(cash, open);
      const riskBudget = equity * settings.riskPct / 100;
      const stopLossRate = row.stopPct + settings.slippageBpsPerSide * 2 / 10_000;
      const riskSizedNotional = stopLossRate > 0 ? Math.max(0, riskBudget - settings.feeUsd) / stopLossRate : 0;
      const allocationCap = equity * settings.maxPositionPct / 100;
      const notional = round(Math.min(riskSizedNotional, allocationCap, cash), 2);
      if (!Number.isFinite(notional) || notional < 100) {
        skipped.push({ candidateId: row.candidateId, entryAt, symbol: row.symbol, modelLabel: row.modelLabel, reason: "INSUFFICIENT_CASH_OR_RISK_BUDGET" });
        continue;
      }
      cash -= notional;
      open.push({
        candidateId: row.candidateId,
        entryAt,
        outcomeAt: row.result.outcomeAt,
        symbol: row.symbol,
        modelKey: row.modelKey,
        modelLabel: row.modelLabel,
        decisionScore: row.decisionScore,
        riskLevel: row.riskLevel,
        entryPrice: row.entryPrice,
        exitPrice: row.result.exitPrice,
        outcome: row.result.outcome,
        grossReturn: row.result.grossReturn,
        timeToOutcomeMinutes: row.result.timeToOutcomeMinutes ?? round((new Date(row.result.outcomeAt) - new Date(entryAt)) / 60_000, 1),
        mae: row.result.mae,
        mfe: row.result.mfe,
        notional,
        quantity: round(notional / row.entryPrice, 4),
        riskBudget: round(riskBudget, 2),
        reason: `${settings.cadenceMinutes} dakikalık düşünme anında ${row.decisionScore}/100 skorla “Şimdi” penceresi açıldı.`,
        review: buildTradeReview(row)
      });
    }
  }
  closeDuePositions();
  const finalCapital = cash;
  const netProfit = finalCapital - settings.initialCapital;
  const wins = trades.filter((trade) => trade.netPnlUsd > 0);
  const losses = trades.filter((trade) => trade.netPnlUsd <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnlUsd, 0));
  const targetTrades = trades.filter((trade) => trade.outcome === "TARGET_FIRST" && Number.isFinite(trade.timeToOutcomeMinutes));
  const targetMinutes = targetTrades.map((trade) => trade.timeToOutcomeMinutes).sort((a, b) => a - b);
  const averageTargetMinutes = targetMinutes.length ? targetMinutes.reduce((sum, value) => sum + value, 0) / targetMinutes.length : null;
  const medianTargetMinutes = targetMinutes.length
    ? targetMinutes.length % 2 ? targetMinutes[(targetMinutes.length - 1) / 2] : (targetMinutes[targetMinutes.length / 2 - 1] + targetMinutes[targetMinutes.length / 2]) / 2
    : null;
  const weightedCapitalMinutes = trades.reduce((sum, trade) => sum + trade.notional * Math.max(0, trade.timeToOutcomeMinutes ?? 0), 0);
  const totalNotional = trades.reduce((sum, trade) => sum + trade.notional, 0);
  const capitalSessionExposureUsd = weightedCapitalMinutes / 390;
  const adverseMoves = trades.map((trade) => trade.mae).filter(Number.isFinite);
  return {
    mode: "PAPER_CASH_SIMULATION",
    settings,
    cadenceMinutes: settings.cadenceMinutes,
    eligibleSignals: eligible.length,
    executedTrades: trades.length,
    skippedSignals: skipped.length,
    initialCapital: round(settings.initialCapital, 2),
    finalCapital: round(finalCapital, 2),
    netProfit: round(netProfit, 2),
    totalReturn: round(netProfit / settings.initialCapital, 6),
    winRate: trades.length ? round(wins.length / trades.length, 4) : null,
    maxRealizedDrawdown: round(maxDrawdown, 6),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
    capitalEfficiency: {
      targetTrades: targetTrades.length,
      averageTargetMinutes: Number.isFinite(averageTargetMinutes) ? round(averageTargetMinutes, 1) : null,
      medianTargetMinutes: Number.isFinite(medianTargetMinutes) ? round(medianTargetMinutes, 1) : null,
      averageCapitalLockMinutes: totalNotional > 0 ? round(weightedCapitalMinutes / totalNotional, 1) : null,
      worstAdverseExcursion: adverseMoves.length ? round(Math.min(...adverseMoves), 6) : null,
      capitalSessionExposureUsd: round(capitalSessionExposureUsd, 2),
      netReturnPerCapitalSession: capitalSessionExposureUsd > 0 ? round(netProfit / capitalSessionExposureUsd, 6) : null,
      interpretation: "Süre ve ters hareket gerçekleşmiş sonuçlardan hesaplanır. Bu alanlar geleceğe ait tahmin veya başarı olasılığı değildir."
    },
    trades,
    skipped,
    assumptions: [
      `Motor 1 dakikalık akışı izler, tamamlanmış 5 dakikalık yapıyı kurar ve yalnız ${settings.cadenceMinutes} dakikalık düşünme anında “Şimdi” penceresinde sanal işlem açar.`,
      "Pozisyon büyüklüğü işlem başına risk bütçesi, stop uzaklığı, kasa ve azami pozisyon oranının en küçüğüdür.",
      "Aynı hissede aynı anda tek pozisyon taşınır; ücret ve iki yönlü kayma kasadan düşülür.",
      "Kesirli hisse ve tam gerçekleşme varsayılır; sonuçlar gerçek emir gerçekleşme garantisi değildir."
    ]
  };
}
