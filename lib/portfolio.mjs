import { round } from "./metrics.mjs";

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function portfolioEquity(cash, openPositions) {
  return cash + openPositions.reduce((sum, position) => sum + position.notional, 0);
}

export function simulatePaperPortfolio(rows, options = {}) {
  const settings = {
    initialCapital: boundedNumber(options.initialCapital, 10_000, 1_000, 1_000_000),
    riskPct: boundedNumber(options.riskPct, 1, 0.1, 5),
    maxPositionPct: boundedNumber(options.maxPositionPct, 50, 10, 100),
    maxConcurrent: Math.round(boundedNumber(options.maxConcurrent, 2, 1, 4)),
    feeUsd: boundedNumber(options.feeUsd, 3, 0, 100),
    slippageBpsPerSide: boundedNumber(options.slippageBpsPerSide, 5, 0, 50)
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
        notional,
        quantity: round(notional / row.entryPrice, 4),
        riskBudget: round(riskBudget, 2),
        reason: `5 dakikalık karar anında ${row.decisionScore}/100 skorla “Şimdi” penceresi açıldı.`
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
  return {
    mode: "PAPER_CASH_SIMULATION",
    settings,
    cadenceMinutes: 5,
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
    trades,
    skipped,
    assumptions: [
      "Motor yalnızca tamamlanmış 5 dakikalık karar anlarında ve “Şimdi” penceresinde sanal işlem açar.",
      "Pozisyon büyüklüğü işlem başına risk bütçesi, stop uzaklığı, kasa ve azami pozisyon oranının en küçüğüdür.",
      "Aynı hissede aynı anda tek pozisyon taşınır; ücret ve iki yönlü kayma kasadan düşülür.",
      "Kesirli hisse ve tam gerçekleşme varsayılır; sonuçlar gerçek emir gerçekleşme garantisi değildir."
    ]
  };
}
