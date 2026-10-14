import { round } from "./metrics.mjs";

export function decisionCadenceMinutes(strategy) {
  const value = Number(strategy.decisionCadenceMinutes);
  return Number.isFinite(value) && value >= 1 ? value : 15;
}

export function decisionCadenceMs(strategy) {
  return decisionCadenceMinutes(strategy) * 60_000;
}

export function createReplaySandbox({ mode, strategy, startedAt }) {
  const cadenceMinutes = decisionCadenceMinutes(strategy);
  const cadenceMs = decisionCadenceMs(strategy);
  const sandboxStartedAt = new Date(startedAt);
  const firstThoughtAt = new Date(sandboxStartedAt.getTime() + cadenceMs).toISOString();
  const decisionBuckets = new Set();
  const seenBarsBySymbol = {};
  const lastBarAtBySymbol = {};
  let observedSteps = 0;
  let lastObservedAt = null;

  return {
    observe({ observedAt, charts = [] }) {
      observedSteps += 1;
      lastObservedAt = observedAt;
      for (const chart of charts) {
        const bars = chart.bars ?? [];
        seenBarsBySymbol[chart.symbol] = Math.max(seenBarsBySymbol[chart.symbol] ?? 0, bars.length);
        const lastBar = bars.at(-1);
        if (lastBar?.timestamp) lastBarAtBySymbol[chart.symbol] = new Date(lastBar.timestamp * 1000).toISOString();
      }
    },
    shouldThink(observedAt) {
      const observedTime = new Date(observedAt).getTime();
      if (!Number.isFinite(observedTime) || observedTime < new Date(firstThoughtAt).getTime()) return null;
      const bucket = Math.floor(observedTime / cadenceMs) * cadenceMs;
      if (decisionBuckets.has(bucket)) return null;
      decisionBuckets.add(bucket);
      return {
        mode,
        sandboxStartedAt: sandboxStartedAt.toISOString(),
        firstThoughtAt,
        decisionCadenceMinutes: cadenceMinutes,
        decisionBucketAt: new Date(bucket).toISOString(),
        observedStepsBeforeDecision: observedSteps,
        lastObservedAt,
        seenBarsBySymbol: { ...seenBarsBySymbol },
        lastBarAtBySymbol: { ...lastBarAtBySymbol },
        memoryPolicy: "Bu test koşusu kendi sandbox hafızasında ilerler; kararlar arasında gördüğü mum sayısı ve zaman izi korunur."
      };
    },
    summary() {
      return {
        mode,
        sandboxStartedAt: sandboxStartedAt.toISOString(),
        firstThoughtAt,
        decisionCadenceMinutes: cadenceMinutes,
        observedSteps,
        decisionThoughts: decisionBuckets.size,
        seenBarsBySymbol: { ...seenBarsBySymbol },
        lastBarAtBySymbol: { ...lastBarAtBySymbol },
        averageObservedStepsPerThought: decisionBuckets.size ? round(observedSteps / decisionBuckets.size, 2) : null
      };
    }
  };
}
