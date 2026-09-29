import "server-only";
import raw from "@/data/tickers.json";

export interface TickerRow {
  ticker: string;
  name: string;
  type: string;
  exchange: string;
}

const EXCHANGES: Record<string, string> = {
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  ARCX: "NYSE Arca",
  BATS: "Cboe BZX",
  XASE: "NYSE American",
  IEXG: "IEX",
};

export const TYPE_LABEL: Record<string, string> = {
  CS: "Stock",
  ETF: "ETF",
  ADRC: "ADR",
  ETN: "ETN",
  ETV: "ETV",
  ETS: "ETS",
  FUND: "Fund",
};

const rows: TickerRow[] = (raw as unknown as { rows: [string, string, string, string][] }).rows.map(([ticker, name, type, ex]) => ({
  ticker,
  name,
  type,
  exchange: EXCHANGES[ex] ?? ex,
}));

const byTicker = new Map(rows.map((r) => [r.ticker, r]));

export function lookupTicker(ticker: string): TickerRow | undefined {
  return byTicker.get(ticker.toUpperCase());
}

export function allTickers() {
  return rows;
}

// Popular symbols get a ranking boost so "a" → AAPL/AMZN before obscure tickers.
const POPULAR = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "AVGO", "BRK.B", "JPM", "V", "LLY", "UNH", "XOM",
  "MA", "COST", "HD", "PG", "JNJ", "NFLX", "WMT", "ABBV", "BAC", "CRM", "AMD", "ORCL", "KO", "PEP", "ADBE", "CVX",
  "MRK", "TMO", "CSCO", "ACN", "MCD", "INTC", "QCOM", "IBM", "DIS", "PLTR", "UBER", "SHOP", "COIN", "MSTR", "SMCI",
  "ARM", "SNOW", "PYPL", "SQ", "SOFI", "RIVN", "NIO", "BABA", "TSM", "ASML", "MU", "BA", "GE", "F", "GM", "NKE",
  "SBUX", "T", "VZ", "PFE", "GS", "MS", "C", "WFC", "SCHW", "BLK", "SPY", "QQQ", "DIA", "IWM", "VOO", "VTI", "TLT",
  "GLD", "SLV", "ARKK", "XLF", "XLE", "XLK", "SMH", "SOXL", "TQQQ", "SQQQ", "HOOD", "RDDT", "CRWD", "PANW", "NOW",
];
const popularity = new Map(POPULAR.map((t, i) => [t, POPULAR.length - i]));

function score(r: TickerRow, q: string): number {
  const t = r.ticker;
  const name = r.name.toUpperCase();
  const pop = popularity.get(t) ?? 0;
  const typeBoost = r.type === "CS" ? 3 : r.type === "ETF" ? 2 : r.type === "ADRC" ? 1 : 0;
  if (t === q) return 10_000 + pop;
  if (t.startsWith(q)) return 5_000 + pop * 10 + typeBoost * 5 - t.length * 20;
  if (name.startsWith(q)) return 3_000 + pop * 10 + typeBoost * 5 - name.length;
  const idx = name.indexOf(" " + q);
  if (idx >= 0) return 2_000 + pop * 10 + typeBoost * 5 - idx;
  if (name.includes(q)) return 1_000 + pop * 10 + typeBoost;
  return 0;
}

export function searchTickers(query: string, limit = 12): TickerRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return POPULAR.slice(0, limit).map((t) => byTicker.get(t)).filter(Boolean) as TickerRow[];
  const scored: { r: TickerRow; s: number }[] = [];
  for (const r of rows) {
    const s = score(r, q);
    if (s > 0) scored.push({ r, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.r);
}
