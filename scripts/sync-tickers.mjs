// Downloads every active US-listed stock/ETF from Massive into src/data/tickers.json.
// This powers instant, offline fuzzy search in the command palette (no API call per keystroke).
// Usage: npm run sync:tickers   (respects MASSIVE_RATE_LIMIT_PER_MIN, default 5)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const KEY = process.env.MASSIVE_API_KEY;
if (!KEY) {
  console.error("MASSIVE_API_KEY is not set (put it in .env.local)");
  process.exit(1);
}
const perMin = Number(process.env.MASSIVE_RATE_LIMIT_PER_MIN ?? 5);
const gapMs = perMin > 0 ? Math.ceil(60_000 / perMin) + 250 : 0;
const KEEP = new Set(["CS", "ETF", "ADRC", "ETN", "ETV", "ETS", "FUND"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let url = "https://api.massive.com/v3/reference/tickers?market=stocks&active=true&order=asc&sort=ticker&limit=1000";
const rows = [];
let page = 0;
while (url) {
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}apiKey=${KEY}`);
  if (res.status === 429) {
    console.log("rate limited, waiting 60s…");
    await sleep(60_000);
    continue;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  for (const t of json.results ?? []) {
    if (!KEEP.has(t.type)) continue;
    rows.push([t.ticker, t.name ?? "", t.type, t.primary_exchange ?? ""]);
  }
  page++;
  console.log(`page ${page}: ${rows.length} tickers so far`);
  url = json.next_url ?? null;
  if (url) await sleep(gapMs);
}
writeFileSync("src/data/tickers.json", JSON.stringify({ updated: new Date().toISOString(), rows }));
console.log(`wrote ${rows.length} tickers to src/data/tickers.json`);
