import "server-only";
import {
  getDailyBars,
  getDividends,
  getFinancials,
  getSplits,
  getTickerDetails,
  HISTORY_YEARS,
  type Bar,
  type Financials,
} from "../massive/api";
import { isRateLimited, massiveGet, MassiveError } from "../massive/client";
import { addDays, isoDate } from "../dates";
import { historicalVol } from "../quant/stats";
import { lookupTicker, TYPE_LABEL } from "./tickers";

export interface Quote {
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number;
  high: number;
  low: number;
  volume: number;
  date: string;
  delayed: "eod" | "15min";
}

/** Latest price: 15-min delayed snapshot on paid plans, last daily close on the free plan. */
async function getQuote(ticker: string, bars: Bar[]): Promise<Quote | null> {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const eod: Quote | null = last
    ? {
        price: last.c,
        prevClose: prev?.c ?? null,
        change: prev ? last.c - prev.c : null,
        changePct: prev ? last.c / prev.c - 1 : null,
        open: last.o,
        high: last.h,
        low: last.l,
        volume: last.v,
        date: isoDate(last.t),
        delayed: "eod",
      }
    : null;

  // Rate-limited = free plan, which has no snapshots; don't burn a call finding out.
  if (isRateLimited()) return eod;
  try {
    const snap = await massiveGet<{
      ticker?: {
        day?: { o: number; h: number; l: number; c: number; v: number };
        prevDay?: { c: number };
        lastTrade?: { p: number; t: number };
        min?: { c: number; t: number };
        updated?: number;
      };
    }>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`, { ttl: 60 });
    const s = snap.ticker;
    const price = s?.lastTrade?.p ?? s?.min?.c ?? s?.day?.c;
    const prevClose = s?.prevDay?.c ?? null;
    if (s && price) {
      return {
        price,
        prevClose,
        change: prevClose ? price - prevClose : null,
        changePct: prevClose ? price / prevClose - 1 : null,
        open: s.day?.o ?? price,
        high: s.day?.h ?? price,
        low: s.day?.l ?? price,
        volume: s.day?.v ?? 0,
        date: isoDate(s.updated ? s.updated / 1e6 : Date.now()),
        delayed: "15min",
      };
    }
  } catch (err) {
    if (!(err instanceof MassiveError)) throw err;
  }
  return eod;
}

function titleCase(s: string | undefined | null) {
  if (!s) return null;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Inc|Etf|Reit|Usa)\b/g, (m) => m.toUpperCase());
}

export async function getStockSummary(ticker: string) {
  const T = ticker.toUpperCase();
  const [details, bars] = await Promise.all([getTickerDetails(T), getDailyBars(T)]);
  const quote = await getQuote(T, bars);
  const closes = bars.map((b) => b.c);
  const last = bars.at(-1);

  const yearAgo = last ? addDays(isoDate(last.t), -365) : null;
  const window52 = yearAgo ? bars.filter((b) => isoDate(b.t) >= yearAgo) : [];
  const ytdStart = last ? isoDate(last.t).slice(0, 4) + "-01-01" : null;
  const ytdBase = ytdStart ? [...bars].reverse().find((b) => isoDate(b.t) < ytdStart) : undefined;
  const yearBase = window52[0];
  const avgVol30 = bars.slice(-30).reduce((s, b) => s + b.v, 0) / Math.max(1, Math.min(30, bars.length));
  const price = quote?.price ?? last?.c ?? null;

  const local = lookupTicker(T);
  return {
    ticker: T,
    name: details.name,
    type: details.type ?? local?.type ?? "",
    typeLabel: TYPE_LABEL[details.type ?? local?.type ?? ""] ?? details.type ?? "",
    exchange: local?.exchange ?? details.primary_exchange ?? "",
    description: details.description ?? null,
    homepage: details.homepage_url ?? null,
    employees: details.total_employees ?? null,
    listDate: details.list_date ?? null,
    industry: titleCase(details.sic_description),
    hq: details.address ? [titleCase(details.address.city), details.address.state].filter(Boolean).join(", ") : null,
    marketCap: details.market_cap ?? null,
    sharesOutstanding: details.weighted_shares_outstanding ?? details.share_class_shares_outstanding ?? null,
    hasLogo: Boolean(details.branding?.icon_url || details.branding?.logo_url),
    quote,
    stats: {
      high52: window52.length ? Math.max(...window52.map((b) => b.h)) : null,
      low52: window52.length ? Math.min(...window52.map((b) => b.l)) : null,
      avgVolume30: bars.length ? avgVol30 : null,
      hv30: historicalVol(closes, 30),
      hv90: historicalVol(closes, 90),
      return1y: price && yearBase ? price / yearBase.c - 1 : null,
      returnYtd: price && ytdBase ? price / ytdBase.c - 1 : null,
    },
    historyYears: HISTORY_YEARS,
    bars: bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v] as const),
  };
}

export type StockSummary = Awaited<ReturnType<typeof getStockSummary>>;

function v(f: Financials | undefined, section: keyof Financials["financials"], key: string): number | null {
  return f?.financials?.[section]?.[key]?.value ?? null;
}

export async function getFinancialSummary(ticker: string, price: number | null) {
  const all = await getFinancials(ticker.toUpperCase());
  const ttm = all.find((f) => f.timeframe === "ttm");
  const quarters = all
    .filter((f) => f.timeframe === "quarterly")
    .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
    .slice(-8);
  const latestBalance = [...all].filter((f) => f.timeframe !== "ttm").sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];

  const revenue = v(ttm, "income_statement", "revenues");
  const gross = v(ttm, "income_statement", "gross_profit");
  const opInc = v(ttm, "income_statement", "operating_income_loss");
  const net = v(ttm, "income_statement", "net_income_loss_attributable_to_parent") ?? v(ttm, "income_statement", "net_income_loss");
  const eps = v(ttm, "income_statement", "diluted_earnings_per_share") ?? v(ttm, "income_statement", "basic_earnings_per_share");
  const equity = v(latestBalance, "balance_sheet", "equity_attributable_to_parent") ?? v(latestBalance, "balance_sheet", "equity");
  const liabilities = v(latestBalance, "balance_sheet", "liabilities");
  const ocf = v(ttm, "cash_flow_statement", "net_cash_flow_from_operating_activities");
  const capexProxy = v(ttm, "cash_flow_statement", "net_cash_flow_from_investing_activities");

  return {
    periodEnd: ttm?.end_date ?? null,
    ttm: {
      revenue,
      grossProfit: gross,
      operatingIncome: opInc,
      netIncome: net,
      eps,
      grossMargin: revenue && gross != null ? gross / revenue : null,
      operatingMargin: revenue && opInc != null ? opInc / revenue : null,
      netMargin: revenue && net != null ? net / revenue : null,
      operatingCashFlow: ocf,
      investingCashFlow: capexProxy,
      pe: price && eps && eps > 0 ? price / eps : null,
      roe: net != null && equity ? net / equity : null,
      debtToEquity: liabilities != null && equity ? liabilities / equity : null,
    },
    quarters: quarters.map((q) => ({
      label: `${q.fiscal_period ?? ""} ${q.fiscal_year ?? ""}`.trim(),
      end: q.end_date ?? "",
      revenue: v(q, "income_statement", "revenues"),
      netIncome: v(q, "income_statement", "net_income_loss_attributable_to_parent") ?? v(q, "income_statement", "net_income_loss"),
      eps: v(q, "income_statement", "diluted_earnings_per_share"),
    })),
  };
}

export async function getDividendSummary(ticker: string, price: number | null) {
  const [divs, splits] = await Promise.all([getDividends(ticker.toUpperCase()), getSplits(ticker.toUpperCase())]);
  const cash = [...divs].sort((a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date));
  const yearAgo = addDays(isoDate(Date.now()), -365);
  const splitAdj = (date: string) => splits.reduce((f, s) => (s.execution_date > date ? f * (s.split_to / s.split_from) : f), 1);
  const ttm = cash.filter((d) => d.ex_dividend_date > yearAgo).reduce((s, d) => s + d.cash_amount / splitAdj(d.ex_dividend_date), 0);
  return {
    ttmPerShare: ttm,
    yield: price && ttm ? ttm / price : null,
    frequency: cash[0]?.frequency ?? null,
    history: cash.slice(0, 24).map((d) => ({
      exDate: d.ex_dividend_date,
      payDate: d.pay_date ?? null,
      amount: d.cash_amount,
      type: d.dividend_type ?? null,
    })),
    splits: splits
      .sort((a, b) => b.execution_date.localeCompare(a.execution_date))
      .map((s) => ({ date: s.execution_date, from: s.split_from, to: s.split_to })),
  };
}
