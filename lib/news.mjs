import { REQUEST_TIMEOUT_MS } from "./config.mjs";

const POSITIVE_TERMS = [
  "beats estimates", "beat estimates", "raises guidance", "raised guidance", "record revenue",
  "upgrade", "upgraded", "strong demand", "demand surge", "price increase", "prices rise",
  "supply tight", "partnership", "wins contract", "revenue growth", "profit rises"
];
const NEGATIVE_TERMS = [
  "misses estimates", "missed estimates", "cuts guidance", "cut guidance", "downgrade", "downgraded",
  "weak demand", "demand falls", "price decline", "prices fall", "investigation", "lawsuit", "recall",
  "revenue decline", "profit falls", "delay", "export restriction"
];

export function classifyNewsHeadline(title = "") {
  const normalized = title.toLocaleLowerCase("en-US");
  const positiveMatches = POSITIVE_TERMS.filter((term) => normalized.includes(term));
  const negativeMatches = NEGATIVE_TERMS.filter((term) => normalized.includes(term));
  const direction = positiveMatches.length > negativeMatches.length ? "POSITIVE"
    : negativeMatches.length > positiveMatches.length ? "NEGATIVE" : "UNKNOWN";
  return { direction, positiveMatches, negativeMatches, method: "TRANSPARENT_HEADLINE_LEXICON_V1" };
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

export function parseRss(xml, topic, observedAt) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const published = tag(item, "pubDate");
    const publishedAt = published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null;
    const title = tag(item, "title");
    return {
      topic,
      title,
      link: tag(item, "link"),
      sourceName: tag(item, "source"),
      publishedAt,
      firstSeenAt: observedAt,
      availableAt: observedAt,
      availabilityBasis: "FIRST_SEEN_LIVE",
      source: "google_news_rss",
      sentiment: classifyNewsHeadline(title)
    };
  }).filter((item) => item.title && item.link);
}

export async function fetchNewsFeed(topic, query, observedAt = new Date().toISOString()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const params = new URLSearchParams({ q: `${query} when:2d`, hl: "en-US", gl: "US", ceid: "US:en" });
  try {
    const response = await fetch(`https://news.google.com/rss/search?${params}`, {
      headers: { "User-Agent": "HedefOnce/0.1 local-research" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`News RSS HTTP ${response.status}`);
    return parseRss(await response.text(), topic, observedAt).slice(0, 12);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHistoricalNewsFeed(topic, query, date) {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const nextDate = end.toISOString().slice(0, 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const params = new URLSearchParams({ q: `${query} after:${date} before:${nextDate}`, hl: "en-US", gl: "US", ceid: "US:en" });
  try {
    const response = await fetch(`https://news.google.com/rss/search?${params}`, {
      headers: { "User-Agent": "HedefOnce/0.1 local-research" }, signal: controller.signal
    });
    if (!response.ok) throw new Error(`Historical news RSS HTTP ${response.status}`);
    return parseRss(await response.text(), topic, end.toISOString()).map((item) => ({
      ...item,
      firstSeenAt: null,
      availableAt: item.publishedAt,
      availabilityBasis: "PUBLISHED_AT_RECONSTRUCTION"
    })).filter((item) => item.publishedAt);
  } finally {
    clearTimeout(timeout);
  }
}
