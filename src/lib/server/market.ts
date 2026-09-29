import "server-only";
import { getDailyBars, getGroupedDaily, type GroupedBar } from "../massive/api";
import { isRateLimited } from "../massive/client";
import { isoDate } from "../dates";
import { lookupTicker, TYPE_LABEL } from "./tickers";

export const INDEX_ETFS = [
  { ticker: "SPY", label: "S&P 500" },
  { ticker: "QQQ", label: "Nasdaq 100" },
  { ticker: "DIA", label: "Dow Jones" },
  { ticker: "IWM", label: "Russell 2000" },
];

/** The most recent trading dates, newest last, derived from SPY's daily bars. */
export async function tradingDates(count: number): Promise<string[]> {
  const spy = await getDailyBars("SPY");
  return spy.slice(-count).map((b) => isoDate(b.t));
}

export async function getIndexCard(ticker: string) {
  const bars = await getDailyBars(ticker);
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last) return null;
  return {
    ticker,
    label: INDEX_ETFS.find((i) => i.ticker === ticker)?.label ?? ticker,
    price: last.c,
    change: prev ? last.c - prev.c : null,
    changePct: prev ? last.c / prev.c - 1 : null,
    date: isoDate(last.t),
    spark: bars.slice(-90).map((b) => b.c),
  };
}

export interface ScanRow {
  ticker: string;
  name: string;
  type: string;
  typeLabel: string;
  price: number;
  change: number;
  changePct: number;
  gapPct: number;
  volume: number;
  dollarVolume: number;
  avgVolume: number | null;
  rvol: number | null;
  rangePct: number;
  closeLocation: number;
  change5d: number | null;
  change20d: number | null;
}

const LOOKBACK = Number(process.env.SCANNER_LOOKBACK_DAYS ?? (isRateLimited() ? 2 : 21));

type ScanCache = { key: string; rows: ScanRow[]; dates: string[] };
const g = globalThis as unknown as { __scan?: ScanCache };

/** Builds the full-market table from grouped daily bars (one API call per trading day, cached). */
export async function getScanTable(): Promise<ScanCache> {
  const dates = await tradingDates(Math.max(2, LOOKBACK));
  const key = dates.join(",");
  if (g.__scan?.key === key) return g.__scan;

  // Newest first so partially-cached history still yields today's movers quickly.
  const days: Map<string, GroupedBar>[] = [];
  for (const date of [...dates].reverse()) {
    const bars = await getGroupedDaily(date);
    days.unshift(new Map(bars.map((b) => [b.T, b])));
  }

  const today = days.at(-1)!;
  const yesterday = days.at(-2)!;
  const rows: ScanRow[] = [];
  for (const [ticker, bar] of today) {
    const meta = lookupTicker(ticker);
    if (!meta) continue; // skips warrants, rights, units, preferreds, test symbols
    const prev = yesterday.get(ticker);
    if (!prev || !(prev.c > 0) || !(bar.c > 0)) continue;

    const priorVolumes = days
      .slice(0, -1)
      .map((d) => d.get(ticker)?.v)
      .filter((x): x is number => x != null);
    const avgVolume = priorVolumes.length >= 5 ? priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length : null;
    const closeN = (n: number) => (days.length > n ? days[days.length - 1 - n].get(ticker)?.c : undefined);
    const c5 = closeN(5);
    const c20 = closeN(20);
    const range = bar.h - bar.l;

    rows.push({
      ticker,
      name: meta.name,
      type: meta.type,
      typeLabel: TYPE_LABEL[meta.type] ?? meta.type,
      price: bar.c,
      change: bar.c - prev.c,
      changePct: bar.c / prev.c - 1,
      gapPct: bar.o / prev.c - 1,
      volume: bar.v,
      dollarVolume: bar.v * (bar.vw ?? bar.c),
      avgVolume,
      rvol: avgVolume ? bar.v / avgVolume : null,
      rangePct: range / prev.c,
      closeLocation: range > 0 ? (bar.c - bar.l) / range : 0.5,
      change5d: c5 ? bar.c / c5 - 1 : null,
      change20d: c20 ? bar.c / c20 - 1 : null,
    });
  }
  g.__scan = { key, rows, dates };
  return g.__scan;
}

export interface ScanFilter {
  q?: string;
  types?: string[];
  minPrice?: number;
  maxPrice?: number;
  minChangePct?: number;
  maxChangePct?: number;
  minGapPct?: number;
  maxGapPct?: number;
  minVolume?: number;
  minDollarVolume?: number;
  minRvol?: number;
  sort?: keyof ScanRow;
  dir?: "asc" | "desc";
  limit?: number;
}

export function filterScan(rows: ScanRow[], f: ScanFilter) {
  const q = f.q?.trim().toUpperCase();
  const types = f.types?.length ? new Set(f.types) : null;
  const out = rows.filter(
    (r) =>
      (!q || r.ticker.includes(q) || r.name.toUpperCase().includes(q)) &&
      (!types || types.has(r.type)) &&
      (f.minPrice == null || r.price >= f.minPrice) &&
      (f.maxPrice == null || r.price <= f.maxPrice) &&
      (f.minChangePct == null || r.changePct >= f.minChangePct) &&
      (f.maxChangePct == null || r.changePct <= f.maxChangePct) &&
      (f.minGapPct == null || r.gapPct >= f.minGapPct) &&
      (f.maxGapPct == null || r.gapPct <= f.maxGapPct) &&
      (f.minVolume == null || r.volume >= f.minVolume) &&
      (f.minDollarVolume == null || r.dollarVolume >= f.minDollarVolume) &&
      (f.minRvol == null || (r.rvol ?? 0) >= f.minRvol),
  );
  const key = f.sort ?? "dollarVolume";
  const dir = f.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const av = a[key] ?? -Infinity;
    const bv = b[key] ?? -Infinity;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  });
  return { total: out.length, rows: out.slice(0, f.limit ?? 200) };
}

export async function getMovers() {
  const { rows, dates } = await getScanTable();
  const liquid = rows.filter(
    (r) => r.price >= 2 && r.dollarVolume >= 5_000_000 && (r.type === "CS" || r.type === "ADRC" || r.type === "ETF"),
  );
  const top = (sort: keyof ScanRow, dir: "asc" | "desc") => filterScan(liquid, { sort, dir, limit: 8 }).rows;
  const adv = rows.filter((r) => r.changePct > 0).length;
  const dec = rows.filter((r) => r.changePct < 0).length;
  return {
    date: dates.at(-1),
    gainers: top("changePct", "desc"),
    losers: top("changePct", "asc"),
    active: top("dollarVolume", "desc"),
    breadth: { advancers: adv, decliners: dec, unchanged: rows.length - adv - dec },
  };
}
