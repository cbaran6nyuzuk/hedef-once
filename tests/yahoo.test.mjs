import test from "node:test";
import assert from "node:assert/strict";
import { fetchYahooChart } from "../lib/yahoo.mjs";

test("tarihsel yükleyici range yerine seçilen günün period sınırlarını gönderir", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return { ok: true, json: async () => ({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{}] } }] } }) };
  };
  try {
    await fetchYahooChart("MU", { interval: "1m", period1: new Date("2026-10-09T00:00:00Z"), period2: new Date("2026-10-10T00:00:00Z") });
    assert.equal(requestedUrl.searchParams.get("period1"), "1791504000");
    assert.equal(requestedUrl.searchParams.get("period2"), "1791590400");
    assert.equal(requestedUrl.searchParams.get("range"), null);
    assert.equal(requestedUrl.searchParams.get("interval"), "1m");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
