import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_INTERVAL_MS, CONTEXT_INTERVAL_MS } from "./lib/config.mjs";
import { collectMarketSnapshot } from "./lib/collector.mjs";
import { collectContextSnapshot } from "./lib/context.mjs";
import { generatePredictions } from "./lib/predictor.mjs";
import { labelMaturedSignals } from "./lib/labeler.mjs";
import { buildForwardBacktestReport } from "./lib/backtest.mjs";
import { getReplayAvailability, runPointInTimeReplay } from "./lib/replay.mjs";
import { runHistoricalReplay } from "./lib/historical-replay.mjs";
import { listBacktestRuns, saveBacktestRun } from "./lib/backtest-journal.mjs";
import { PointInTimeStore } from "./lib/store.mjs";
import { loadScoreCalibration } from "./lib/score-calibration.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const store = new PointInTimeStore(dataDir);
await store.init();
const strategy = JSON.parse(await readFile(path.join(rootDir, "config", "strategy-v0.1.json"), "utf8"));
const engineSourceFiles = ["predictor.mjs", "features.mjs", "news.mjs", "evaluator.mjs", "labeler.mjs"];
const engineSources = await Promise.all(engineSourceFiles.map((file) => readFile(path.join(rootDir, "lib", file), "utf8")));
const engineFingerprint = createHash("sha256")
  .update(`${JSON.stringify(strategy)}\n${engineSources.join("\n---engine-file---\n")}`)
  .digest("hex").slice(0, 12);

let latest = await store.loadLatest();
let latestContext = await store.loadLatestContext();
let latestPredictions = await store.loadLatestPredictions();
if (latestPredictions?.engineVersion !== strategy.version) latestPredictions = null;
let latestCharts = null;
let latestBacktest = await buildForwardBacktestReport(dataDir, strategy.version);
let collecting = null;
let collectingContext = null;
const decisionCadenceMs = (strategy.decisionCadenceMinutes ?? 15) * 60_000;
const latestPredictionOnlyDelayed = latestPredictions?.candidates?.length
  && latestPredictions.candidates.every((candidate) => candidate.hardVetos?.includes("DELAYED_DECISION_CAPTURE"));
let lastPredictionBucket = latestPredictions?.generatedAt && !latestPredictionOnlyDelayed
  ? Math.floor(new Date(latestPredictions.generatedAt).getTime() / decisionCadenceMs)
  : null;

async function refresh() {
  if (collecting) return collecting;
  collecting = collectMarketSnapshot(store)
    .then(({ snapshot, charts }) => {
      if (!Object.keys(snapshot.quotes ?? {}).length && latest && Object.keys(latest.quotes ?? {}).length) {
        console.warn(`[${snapshot.observedAt}] Kaynak boş döndü; son geçerli piyasa görünümü korunuyor.`);
        return latest;
      }
      latest = snapshot;
      latestCharts = charts;
      console.log(`[${snapshot.observedAt}] ${Object.keys(snapshot.quotes).length} piyasa serisi güncellendi.`);
      return snapshot;
    })
    .catch((error) => {
      console.error(`[${new Date().toISOString()}] Veri toplama hatası:`, error.message);
      throw error;
    })
    .finally(() => {
      collecting = null;
    });
  return collecting;
}

async function refreshPredictions() {
  if (!latest || !latestCharts?.length) return latestPredictions;
  const currentBucket = Math.floor(new Date(latest.observedAt).getTime() / decisionCadenceMs);
  if (currentBucket === lastPredictionBucket) return latestPredictions;
  latestPredictions = await generatePredictions(latest, latestCharts, latestContext);
  const onlyDelayed = latestPredictions.candidates?.length
    && latestPredictions.candidates.every((candidate) => candidate.hardVetos?.includes("DELAYED_DECISION_CAPTURE"));
  if (!onlyDelayed) lastPredictionBucket = currentBucket;
  await store.savePredictions(latestPredictions);
  await labelMaturedSignals(dataDir);
  latestBacktest = await buildForwardBacktestReport(dataDir, strategy.version);
  return latestPredictions;
}

async function refreshContext() {
  if (collectingContext) return collectingContext;
  collectingContext = collectContextSnapshot(store)
    .then((context) => {
      latestContext = context;
      console.log(`[${context.observedAt}] Haber, SEC ve olay katmanları güncellendi.`);
      return context;
    })
    .catch((error) => {
      console.error(`[${new Date().toISOString()}] Bağlam toplama hatası:`, error.message);
      throw error;
    })
    .finally(() => {
      collectingContext = null;
    });
  return collectingContext;
}

if (process.argv.includes("--collect-once")) {
  await Promise.all([refresh(), refreshContext()]);
  await refreshPredictions();
  process.exit(0);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, value) {
  if (response.writableEnded) return;
  response.writeHead(status, { "Content-Type": contentTypes[".json"], "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function buildSystemStatus() {
  const now = Date.now();
  const marketAgeSeconds = latest?.observedAt ? Math.round((now - new Date(latest.observedAt)) / 1000) : null;
  const contextAgeSeconds = latestContext?.observedAt ? Math.round((now - new Date(latestContext.observedAt)) / 1000) : null;
  const predictionAgeSeconds = latestPredictions?.generatedAt ? Math.round((now - new Date(latestPredictions.generatedAt)) / 1000) : null;
  const marketFresh = Number.isFinite(marketAgeSeconds) && marketAgeSeconds <= 150 && Object.keys(latest?.quotes ?? {}).length === 19;
  const contextConnected = Boolean(latestContext?.readiness?.newsConnected && latestContext?.readiness?.filingsConnected && latestContext?.readiness?.calendarConnected);
  const contextFresh = contextConnected && Number.isFinite(contextAgeSeconds) && contextAgeSeconds <= CONTEXT_INTERVAL_MS / 1000 + 300;
  const predictorCurrent = latestPredictions?.engineVersion === strategy.version && Number.isFinite(predictionAgeSeconds)
    && predictionAgeSeconds <= decisionCadenceMs / 1000 + 150;
  const marketState = latest?.quotes?.MU?.marketState ?? "UNKNOWN";
  const infrastructureReady = marketFresh && contextFresh && predictorCurrent;
  const state = !infrastructureReady ? "DEGRADED" : marketState === "REGULAR" ? "LIVE_AND_SCORING" : "CONNECTED_WAITING_SESSION";
  return {
    state,
    label: state === "LIVE_AND_SCORING" ? "Canlı ve karar üretiyor" : state === "CONNECTED_WAITING_SESSION" ? "Bağlı · normal seans bekleniyor" : "Canlı sistemde eksik var",
    canGenerateSignal: infrastructureReady && marketState === "REGULAR",
    marketState,
    engineVersion: strategy.version,
    engineFingerprint,
    checks: {
      market: { passed: marketFresh, ageSeconds: marketAgeSeconds, series: Object.keys(latest?.quotes ?? {}).length, requiredSeries: 19 },
      context: { passed: contextFresh, ageSeconds: contextAgeSeconds, news: Boolean(latestContext?.readiness?.newsConnected), filings: Boolean(latestContext?.readiness?.filingsConnected), calendar: Boolean(latestContext?.readiness?.calendarConnected) },
      predictor: { passed: predictorCurrent, ageSeconds: predictionAgeSeconds, generatedAt: latestPredictions?.generatedAt ?? null, candidates: latestPredictions?.candidates?.length ?? 0 },
      replayParity: { passed: true, engineVersion: strategy.version, engineFingerprint, explanation: "Canlı motor ve Zaman Makinesi aynı generatePredictions fonksiyonunu ve aynı strateji dosyasını kullanır." }
    },
    plainExplanation: !infrastructureReady
      ? "En az bir canlı veri veya motor katmanı güncel değil. Sinyale güvenme."
      : marketState === "REGULAR"
        ? `Normal seans açık; veri her dakika izleniyor ve motor ${strategy.decisionCadenceMinutes ?? 15} dakikada bir karar arıyor.`
        : `Bağlantılar güncel fakat piyasa ${marketState}. Normal seans açılana kadar sinyal üretilmemesi beklenen davranıştır.`
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error("İstek çok büyük.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(requestPath, response) {
  const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const resolved = path.resolve(publicDir, relative);
  if (!resolved.startsWith(`${path.resolve(publicDir)}${path.sep}`) && resolved !== path.join(publicDir, "index.html")) {
    sendJson(response, 403, { error: "Yasak yol" });
    return;
  }
  try {
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("Dosya değil");
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(resolved)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(resolved));
  } catch {
    sendJson(response, 404, { error: "Bulunamadı" });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/api/health") {
    const system = buildSystemStatus();
    sendJson(response, 200, {
      status: system.state,
      observedAt: latest?.observedAt ?? null,
      collecting: Boolean(collecting),
      collectingContext: Boolean(collectingContext),
      readiness: latest?.readiness ?? null,
      contextReadiness: latestContext?.readiness ?? null,
      system
    });
    return;
  }
  if (url.pathname === "/api/snapshot") {
    if (!latest) {
      try { await refresh(); } catch {}
    }
    if (!latest) {
      sendJson(response, 503, { error: "Henüz piyasa verisi alınamadı." });
      return;
    }
    sendJson(response, 200, { ...latest, context: latestContext, predictions: latestPredictions, backtest: latestBacktest, system: buildSystemStatus() });
    return;
  }
  if (url.pathname === "/api/replay/availability") {
    try { sendJson(response, 200, await getReplayAvailability(dataDir)); }
    catch (error) { sendJson(response, 500, { error: error.message }); }
    return;
  }
  if (url.pathname === "/api/backtest-runs") {
    try { sendJson(response, 200, { runs: await listBacktestRuns(dataDir) }); }
    catch (error) { sendJson(response, 500, { error: error.message }); }
    return;
  }
  if (url.pathname === "/api/score-calibration") {
    try { sendJson(response, 200, await loadScoreCalibration(dataDir, strategy.version)); }
    catch (error) { sendJson(response, 500, { error: error.message }); }
    return;
  }
  if (url.pathname === "/api/replay" && request.method === "POST") {
    try {
      const input = await readJsonBody(request);
      const report = await runPointInTimeReplay(dataDir, strategy, input);
      const saved = await saveBacktestRun(dataDir, { ...report, engineVersion: strategy.version, engineFingerprint }, strategy, engineFingerprint);
      sendJson(response, 200, saved);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/historical-replay" && request.method === "POST") {
    try {
      const input = await readJsonBody(request);
      const report = await runHistoricalReplay(strategy, input);
      const saved = await saveBacktestRun(dataDir, { ...report, engineVersion: strategy.version, engineFingerprint }, strategy, engineFingerprint);
      sendJson(response, 200, saved);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/collect" && request.method === "POST") {
    try {
      const [market, context] = await Promise.all([refresh(), refreshContext()]);
      const predictions = await refreshPredictions();
      sendJson(response, 200, { ...market, context, predictions, backtest: latestBacktest, system: buildSystemStatus() });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }
  await serveStatic(url.pathname, response);
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(`[${new Date().toISOString()}] İstek işleme hatası:`, error?.stack ?? error);
    if (!response.headersSent) sendJson(response, 500, { error: "Beklenmeyen sunucu hatası. Canlı toplama devam ediyor." });
    else if (!response.writableEnded) response.end();
  });
});

server.on("clientError", (error, socket) => {
  console.warn(`[${new Date().toISOString()}] Geçersiz istemci isteği: ${error.message}`);
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] Yakalanmamış promise hatası:`, reason);
});

process.on("uncaughtException", (error) => {
  console.error(`[${new Date().toISOString()}] Kritik süreç hatası; görev yöneticisi yeniden başlatacak:`, error?.stack ?? error);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 3_000).unref();
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`Hedef Önce: http://127.0.0.1:${port}`);
  Promise.all([refresh(), refreshContext()]).then(refreshPredictions).catch(() => {});
  setInterval(() => refresh().then(refreshPredictions).catch(() => {}), COLLECTION_INTERVAL_MS).unref();
  setInterval(() => refreshContext().then(refreshPredictions).catch(() => {}), CONTEXT_INTERVAL_MS).unref();
});
