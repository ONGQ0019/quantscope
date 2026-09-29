import "server-only";
import { massiveGet, massiveGetAll } from "./client";
import { addDays, isoDate, nyToday } from "../dates";

/** Years of daily history the plan allows (free Basic = 2, Starter = 5, Developer = 10, Advanced = 20+). */
export const HISTORY_YEARS = Number(process.env.MASSIVE_HISTORY_YEARS ?? "2");

export interface Bar {
  t: number; // ms epoch (bar open, NY midnight for daily)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
}

export interface TickerDetails {
  ticker: string;
  name: string;
  market: string;
  type?: string;
  active: boolean;
  primary_exchange?: string;
  currency_name?: string;
  cik?: string;
  market_cap?: number;
  description?: string;
  homepage_url?: string;
  phone_number?: string;
  total_employees?: number;
  list_date?: string;
  sic_description?: string;
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  address?: { address1?: string; city?: string; state?: string; postal_code?: string };
  branding?: { logo_url?: string; icon_url?: string };
}

export interface Dividend {
  ticker: string;
  cash_amount: number;
  ex_dividend_date: string;
  pay_date?: string;
  declaration_date?: string;
  frequency?: number;
  dividend_type?: string;
}

export interface Split {
  ticker: string;
  execution_date: string;
  split_from: number;
  split_to: number;
}

export interface NewsItem {
  id: string;
  title: string;
  author?: string;
  published_utc: string;
  article_url: string;
  image_url?: string;
  description?: string;
  tickers?: string[];
  publisher: { name: string; homepage_url?: string; logo_url?: string; favicon_url?: string };
  insights?: { ticker: string; sentiment: "positive" | "negative" | "neutral"; sentiment_reasoning?: string }[];
}

type FinValue = { value: number; unit?: string; label?: string };
export interface Financials {
  start_date?: string;
  end_date?: string;
  timeframe: "ttm" | "quarterly" | "annual";
  fiscal_period?: string;
  fiscal_year?: string;
  filing_date?: string;
  financials: {
    income_statement?: Record<string, FinValue>;
    balance_sheet?: Record<string, FinValue>;
    cash_flow_statement?: Record<string, FinValue>;
  };
}

export interface GroupedBar extends Bar {
  T: string;
}

export interface OptionContract {
  ticker: string;
  underlying_ticker: string;
  contract_type: "call" | "put";
  exercise_style?: string;
  expiration_date: string;
  strike_price: number;
  shares_per_contract?: number;
}

export interface OptionSnapshot {
  break_even_price?: number;
  implied_volatility?: number;
  open_interest?: number;
  day?: { close?: number; volume?: number; change_percent?: number; vwap?: number };
  details: OptionContract & { strike_price: number };
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  last_quote?: { bid?: number; ask?: number; midpoint?: number };
  last_trade?: { price?: number };
  underlying_asset?: { price?: number; ticker?: string };
}

const HOUR = 3600;
const DAY = 24 * HOUR;

const enc = encodeURIComponent;

export function getTickerDetails(ticker: string) {
  return massiveGet<{ results: TickerDetails }>(`/v3/reference/tickers/${enc(ticker)}`, { ttl: DAY }).then(
    (r) => r.results,
  );
}

/** Full plan-allowed daily history, split-adjusted. One call, cached per NY trading date. */
export async function getDailyBars(ticker: string): Promise<Bar[]> {
  const today = nyToday();
  // A couple of days of slack so we never ask for a window just outside the plan.
  const from = addDays(today, -Math.round(HISTORY_YEARS * 365.25) + 3);
  const res = await massiveGet<{ results?: Bar[] }>(
    `/v2/aggs/ticker/${enc(ticker)}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=50000`,
    { ttl: 4 * HOUR },
  );
  return (res.results ?? []).map(({ t, o, h, l, c, v, vw }) => ({ t, o, h, l, c, v, vw }));
}

export function getDividends(ticker: string) {
  return massiveGetAll<Dividend>(`/v3/reference/dividends?ticker=${enc(ticker)}&limit=1000&order=desc`, {
    ttl: DAY,
    maxPages: 2,
  });
}

export function getSplits(ticker: string) {
  return massiveGetAll<Split>(`/v3/reference/splits?ticker=${enc(ticker)}&limit=1000`, { ttl: DAY, maxPages: 1 });
}

export function getNews(ticker: string, limit = 20) {
  return massiveGet<{ results?: NewsItem[] }>(
    `/v2/reference/news?ticker=${enc(ticker)}&limit=${limit}&order=desc&sort=published_utc`,
    { ttl: 20 * 60 },
  ).then((r) => r.results ?? []);
}

export function getFinancials(ticker: string) {
  return massiveGet<{ results?: Financials[] }>(
    `/vX/reference/financials?ticker=${enc(ticker)}&limit=12&order=desc&sort=period_of_report_date`,
    { ttl: DAY },
  ).then((r) => r.results ?? []);
}

/** Every US stock's OHLCV for one trading day — 1 call for ~12k tickers. */
export async function getGroupedDaily(date: string): Promise<GroupedBar[]> {
  const isPast = date < nyToday();
  const res = await massiveGet<{ results?: GroupedBar[] }>(
    `/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true`,
    { ttl: isPast ? 30 * DAY : 30 * 60 },
  );
  return res.results ?? [];
}

export function getOptionContracts(params: Record<string, string | number | boolean>, maxPages = 3) {
  const q = new URLSearchParams({ limit: "1000", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return massiveGetAll<OptionContract>(`/v3/reference/options/contracts?${q}`, { ttl: 6 * HOUR, maxPages });
}

/** Live chain with greeks/IV/OI — requires a Massive Options plan. */
export function getOptionChainSnapshot(underlying: string, expiration: string) {
  return massiveGetAll<OptionSnapshot>(
    `/v3/snapshot/options/${enc(underlying)}?expiration_date=${expiration}&limit=250`,
    { ttl: 5 * 60, maxPages: 8 },
  );
}

/** Previous trading day OHLCV for one ticker (works for option contracts on the free plan). */
export function getPrevDay(ticker: string) {
  return massiveGet<{ results?: (Bar & { T: string })[] }>(`/v2/aggs/ticker/${enc(ticker)}/prev?adjusted=true`, {
    ttl: 4 * HOUR,
  }).then((r) => r.results?.[0] ?? null);
}

/** Daily 3-month T-bill yields (decimal) covering the plan's history window. */
export async function getTreasuryHistory(): Promise<{ date: string; rate: number }[]> {
  const from = addDays(nyToday(), -Math.round(HISTORY_YEARS * 365.25) - 30);
  const rows = await massiveGetAll<{ date: string; yield_3_month?: number }>(
    `/fed/v1/treasury-yields?date.gte=${from}&sort=date.asc&limit=5000`,
    { ttl: 12 * HOUR, maxPages: 6 },
  );
  return rows.filter((r) => r.yield_3_month != null).map((r) => ({ date: r.date, rate: r.yield_3_month! / 100 }));
}

/** Monthly CPI (all items). */
export async function getCpi(): Promise<{ month: string; value: number }[]> {
  const rows = await massiveGetAll<{ date: string; cpi?: number }>(`/fed/v1/inflation?sort=date.desc&limit=1000`, {
    ttl: DAY,
    maxPages: 1,
  });
  return rows.filter((r) => r.cpi != null).map((r) => ({ month: r.date.slice(0, 7), value: r.cpi! }));
}

export { isoDate };
