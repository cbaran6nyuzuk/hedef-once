import { MARKET_SYMBOLS, MEMORY_SYMBOLS, SECTOR_SYMBOLS, MARKET_CONTEXT_SYMBOLS, CORE_SYMBOLS } from "./config.mjs";
import { fetchYahooChart } from "./yahoo.mjs";
import { fetchHistoricalNewsFeed } from "./news.mjs";
import { fetchRecentFilings } from "./sec.mjs";
import { fetchEconomicCalendar, fetchEarningsCalendar } from "./nasdaq.mjs";
import { buildDataReadiness, round, summarizeBasket, summarizeChart } from "./metrics.mjs";
import { generatePredictions } from "./predictor.mjs";
import { evaluateCandidate, primaryRows } from "./replay.mjs";
import { simulatePaperPortfolio } from "./portfolio.mjs";
import { replayTrustReport } from "./replay-trust.mjs";
import { createReplaySandbox, decisionCadenceMinutes } from "./replay-sandbox.mjs";

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() { while (cursor < items.length) { const index = cursor++; output[index] = await worker(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function nyClock(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp * 1000));
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return value("hour") * 60 + value("minute");
}

function regularBounds(chart) {
  const regular = chart.bars.filter((bar) => nyClock(bar.timestamp) >= 570 && nyClock(bar.timestamp) < 960);
  if (!regular.length) return null;
  return { start: regular[0].timestamp, end: regular.at(-1).timestamp + 60, timezone: "EDT" };
}

function summary(rows) {
  const target = rows.filter((row) => row.result.outcome === "TARGET_FIRST").length;
  const stop = rows.filter((row) => row.result.outcome === "STOP_FIRST").length;
  const timeout = rows.filter((row) => row.result.outcome === "TIMEOUT").length;
  const returns = rows.map((row) => row.result.netReturn).filter(Number.isFinite);
  return { independentSignals: rows.length, targetFirst: target, stopFirst: stop, timeout,
    targetFirstRate: rows.length ? round(target / rows.length, 4) : null,
    averageNetReturn: returns.length ? round(returns.reduce((sum, value) => sum + value, 0) / returns.length, 6) : null };
}

function executionProxy(symbol, price, observedAt, spreadBps = 5) {
  const half = spreadBps / 20_000;
  return { symbol, source: "historical_ohlc_execution_proxy", observedAt, availableAt: observedAt,
    availabilityBasis: "CONSERVATIVE_SPREAD_PROXY", marketStatus: "Historical regular session", isRealTime: false,
    last: price, bid: round(price * (1 - half)), ask: round(price * (1 + half)), bidSize: null, askSize: null,
    spreadBps, qualityStatus: "VALID" };
}

function historicalTrace({ candidate, visibleCharts, context, observedAt, timestamp }) {
  const chart = visibleCharts.find((item) => item.symbol === candidate.symbol);
  const observed = new Date(observedAt);
  return {
    mode: "HISTORICAL_RECONSTRUCTION",
    priceSource: candidate.dataLineage?.priceSource,
    executionSource: candidate.dataLineage?.executionSource,
    latestFeatureBarEndAt: candidate.decisionAt,
    contextObservedAt: context.observedAt,
    featureCutoffValid: candidate.dataLineage?.pointInTimeOrderValid === true && chart.bars.every((bar) => bar.timestamp + 60 <= timestamp),
    newsCutoffValid: context.news.every((item) => new Date(item.publishedAt) <= observed),
    filingCutoffValid: context.filings.every((item) => !item.acceptedAt || new Date(item.acceptedAt) <= observed),
    executionIsProxy: true,
    newsFirstSeenIsProxy: true,
    officialForwardCounterEligible: false
  };
}

export async function runHistoricalReplay(strategy, { date, portfolio }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Geçerli bir tarih seçmelisin.");
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const ageDays = (Date.now() - start.getTime()) / 86_400_000;
  if (ageDays < 0 || ageDays > 30) throw new Error("Anahtarsız dakika kaynağı yalnız son 30 günü veriyor. Son 30 gün içinden bir ABD işlem günü seç.");

  const [charts, newsGroups, filingsGroups, events, earnings] = await Promise.all([
    mapLimit(MARKET_SYMBOLS, 4, (instrument) => fetchYahooChart(instrument.symbol, { interval: "1m", period1: start, period2: end })),
    Promise.all([
      fetchHistoricalNewsFeed("MU", '"Micron Technology" OR MU semiconductor', date),
      fetchHistoricalNewsFeed("SNDK", '"Sandisk Corporation" OR "SNDK stock"', date),
      fetchHistoricalNewsFeed("MEMORY", "DRAM OR NAND OR HBM memory semiconductor", date)
    ]),
    Promise.all(CORE_SYMBOLS.map((symbol) => fetchRecentFilings(symbol, end.toISOString()))),
    fetchEconomicCalendar(date),
    fetchEarningsCalendar(date, CORE_SYMBOLS)
  ]);
  const chartBySymbol = Object.fromEntries(charts.map((chart) => [chart.symbol, chart]));
  const bounds = regularBounds(chartBySymbol.MU);
  if (!bounds) throw new Error("Seçilen tarihte ABD normal seans dakika verisi bulunamadı; hafta sonu veya tatil olabilir.");
  for (const chart of charts) chart.meta = { ...chart.meta, currentTradingPeriod: { regular: bounds } };
  const minuteCounts = Object.fromEntries(charts.map((chart) => [chart.symbol, chart.bars.filter((bar) => bar.timestamp >= bounds.start && bar.timestamp < bounds.end).length]));
  const incomplete = Object.entries(minuteCounts).filter(([, count]) => count < 300).map(([symbol]) => symbol);
  if (incomplete.length) throw new Error(`Tarihsel dakika verisi eksik: ${incomplete.join(", ")}. Eksik katmanla sonuç üretilmedi.`);

  const news = newsGroups.flat();
  const filings = filingsGroups.flat();
  const allEvents = [...events, ...earnings];
  const sandbox = createReplaySandbox({ mode: "HISTORICAL_RECONSTRUCTION", strategy, startedAt: new Date(bounds.start * 1000).toISOString() });
  const minuteTimes = [];
  for (let timestamp = bounds.start + 60; timestamp <= bounds.end; timestamp += 60) minuteTimes.push(timestamp);
  let decisionThoughts = 0;
  const rows = [];
  for (const timestamp of minuteTimes) {
    const observedAt = new Date(timestamp * 1000).toISOString();
    const visibleCharts = charts.map((chart) => ({ ...chart, bars: chart.bars.filter((bar) => bar.timestamp + 60 <= timestamp) }));
    sandbox.observe({ observedAt, charts: visibleCharts });
    const thought = sandbox.shouldThink(observedAt);
    if (!thought) continue;
    decisionThoughts += 1;
    const quotes = Object.fromEntries(visibleCharts.map((chart) => [chart.symbol, summarizeChart(chart, observedAt)]));
    const execution = Object.fromEntries(CORE_SYMBOLS.map((symbol) => [symbol, executionProxy(symbol, quotes[symbol]?.price, observedAt)]));
    const snapshot = { schemaVersion: "historical-reconstruction-v0.1", observedAt, sourceProfile: "NO_KEY_HISTORICAL_RECONSTRUCTION",
      sourceNotice: "Tarihsel dakika verisi; bid/ask muhafazakâr proxy ile kurulmuştur.", quotes, execution,
      baskets: { memory: summarizeBasket(quotes, MEMORY_SYMBOLS), sector: summarizeBasket(quotes, SECTOR_SYMBOLS), marketContext: summarizeBasket(quotes, MARKET_CONTEXT_SYMBOLS) },
      readiness: buildDataReadiness(quotes, [], MARKET_SYMBOLS.map((item) => item.symbol)) };
    const context = { observedAt, news: news.filter((item) => new Date(item.publishedAt) <= new Date(observedAt)),
      filings: filings.filter((item) => !item.acceptedAt || new Date(item.acceptedAt) <= new Date(observedAt)), events: allEvents,
      readiness: { newsConnected: true, filingsConnected: true, calendarConnected: true, historicalPitReady: false } };
    const prediction = await generatePredictions(snapshot, visibleCharts, context, strategy);
    rows.push(...prediction.candidates.map((candidate) => {
      const replayDataTrace = historicalTrace({ candidate, visibleCharts, context, observedAt, timestamp });
      replayDataTrace.sandbox = thought;
      return {
        ...candidate,
        historicalReconstruction: true,
        historicalNewsCutoffValid: replayDataTrace.newsCutoffValid,
        historicalFilingCutoffValid: replayDataTrace.filingCutoffValid,
        replayDataTrace
      };
    }));
  }
  const outcomeBars = Object.fromEntries(CORE_SYMBOLS.map((symbol) => [symbol, chartBySymbol[symbol].bars
    .filter((bar) => bar.timestamp >= bounds.start && bar.timestamp < bounds.end)
    .map((bar) => ({ ...bar, eventAt: new Date(bar.timestamp * 1000).toISOString(), availableAt: new Date((bar.timestamp + 60) * 1000).toISOString(), availabilityBasis: "OBSERVED_LIVE", qualityStatus: "VALID", extendedHours: false }))]));
  const latestObservedAt = new Date(bounds.end * 1000).toISOString();
  const evaluated = rows.map((candidate) => ({ ...candidate, result: evaluateCandidate(candidate, outcomeBars[candidate.symbol], latestObservedAt) }));
  const primary = primaryRows(evaluated);
  const integrityChecks = [
    { name: "Karar anından sonraki fiyat özelliklere girmedi", passed: evaluated.every((row) => new Date(row.decisionAt) <= new Date(row.entryAt) && row.replayDataTrace?.featureCutoffValid === true) },
    { name: "Haberler yayın zamanından ve SEC kayıtları kabul zamanından önce görünmedi", passed: evaluated.every((row) => row.replayDataTrace?.newsCutoffValid === true && row.replayDataTrace?.filingCutoffValid === true) },
    { name: "Sonuç fiyatları karar sonrasından geldi", passed: evaluated.every((row) => row.result.status !== "MATURED" || new Date(row.result.outcomeAt) > new Date(row.entryAt)) },
    { name: "Canlı motor ve strateji kuralları kullanıldı", passed: evaluated.every((row) => row.engineVersion === strategy.version) },
    { name: "19 piyasa serisinin dakika kapsamı yeterli", passed: incomplete.length === 0 }
  ];
  const dataQuality = { level: "RECONSTRUCTED", marketBars: "Tarihsel 1 dakikalık OHLCV", execution: "Gerçek tarihsel bid/ask yok; 5 bps muhafazakâr spread proxy", news: "Yayın zamanı proxy; ilk görülme zamanı bilinmiyor", filings: "Resmi SEC kabul zamanı", calendar: "Seçilen günün takvim kaydı", officialForwardCounterEligible: false };
  const report = { generatedAt: new Date().toISOString(), engineVersion: strategy.version, mode: "HISTORICAL_RECONSTRUCTION",
    requested: { startAt: new Date(bounds.start * 1000).toISOString(), endAt: new Date(bounds.end * 1000).toISOString(), date },
    diagnostics: { capturedSnapshots: minuteTimes.length, consideredSnapshots: decisionThoughts, fullPointInTimeSnapshots: decisionThoughts, excludedByReason: {}, duplicateDecisionBars: 0, sandbox: sandbox.summary() },
    candidates: evaluated.length, maturedCandidates: evaluated.filter((row) => row.result.status === "MATURED").length,
    pendingCandidates: evaluated.filter((row) => row.result.status === "PENDING").length, actionableCandidates: evaluated.filter((row) => row.signalWindow === "NOW").length,
    summary: summary(primary), integrityChecks, portfolio: simulatePaperPortfolio(evaluated, { ...portfolio, feeUsd: strategy.feeCasesUsd[1], slippageBpsPerSide: strategy.slippageStressBpsPerSide, cadenceMinutes: decisionCadenceMinutes(strategy) }),
    rows: evaluated.sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt)),
    dataQuality };
  return { ...report, trustReport: replayTrustReport(report) };
}
