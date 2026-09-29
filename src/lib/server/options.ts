import "server-only";
import {
  getDailyBars,
  getDividends,
  getOptionChainSnapshot,
  getOptionContracts,
  getPrevDay,
  type OptionSnapshot,
} from "../massive/api";
import { isRateLimited, massiveGet, MassiveError } from "../massive/client";
import { addDays, daysBetween, isoDate } from "../dates";
import { bsGreeks, expectedMove, impliedVol, type OptionType } from "../quant/options";
import { historicalVol } from "../quant/stats";

const LIVE_MODE = (process.env.MASSIVE_OPTIONS_LIVE ?? "auto").toLowerCase();

export async function getRiskFreeRate(): Promise<{ rate: number; source: string }> {
  try {
    const res = await massiveGet<{ results?: { date: string; yield_3_month?: number }[] }>(
      "/fed/v1/treasury-yields?limit=1&sort=date.desc",
      { ttl: 12 * 3600 },
    );
    const y = res.results?.[0]?.yield_3_month;
    if (y != null) return { rate: y / 100, source: `3-month T-bill (${res.results![0].date})` };
  } catch (err) {
    if (!(err instanceof MassiveError)) throw err;
  }
  return { rate: 0.04, source: "default 4%" };
}

async function underlyingContext(ticker: string) {
  const bars = await getDailyBars(ticker);
  const last = bars.at(-1);
  if (!last) throw new MassiveError("NOT_FOUND", `No price history for ${ticker}`, 404);
  const closes = bars.map((b) => b.c);
  let divTtm = 0;
  try {
    const cutoff = addDays(isoDate(last.t), -365);
    divTtm = (await getDividends(ticker)).filter((d) => d.ex_dividend_date > cutoff).reduce((s, d) => s + d.cash_amount, 0);
  } catch {}
  return {
    spot: last.c,
    asOf: isoDate(last.t),
    hv30: historicalVol(closes, 30) ?? historicalVol(closes, 10) ?? 0.3,
    q: last.c > 0 ? divTtm / last.c : 0,
    bars,
  };
}

export async function getExpirations(ticker: string) {
  const T = ticker.toUpperCase();
  const { spot, asOf } = await underlyingContext(T);
  const band = Math.max(spot * 0.03, 2.6);
  const contracts = await getOptionContracts({
    underlying_ticker: T,
    contract_type: "call",
    expired: false,
    "strike_price.gte": +(spot - band).toFixed(2),
    "strike_price.lte": +(spot + band).toFixed(2),
    sort: "expiration_date",
    order: "asc",
  });
  const dates = [...new Set(contracts.map((c) => c.expiration_date))].filter((d) => d >= asOf).sort();
  return {
    ticker: T,
    spot,
    asOf,
    expirations: dates.map((date) => ({ date, dte: daysBetween(asOf, date) })),
  };
}

export interface ChainSide {
  contract: string;
  price: number | null;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  probITM: number | null;
  openInterest: number | null;
  volume: number | null;
  breakeven: number | null;
}

export interface ChainRow {
  strike: number;
  call: ChainSide | null;
  put: ChainSide | null;
}

function modelSide(contract: string, type: OptionType, S: number, K: number, T: number, r: number, q: number, sigma: number): ChainSide {
  const g = bsGreeks({ S, K, T, r, q, sigma, type });
  return {
    contract,
    price: g.price,
    bid: null,
    ask: null,
    iv: sigma,
    delta: g.delta,
    gamma: g.gamma,
    theta: g.theta,
    vega: g.vega,
    probITM: g.probITM,
    openInterest: null,
    volume: null,
    breakeven: type === "call" ? K + g.price : K - g.price,
  };
}

function liveSide(s: OptionSnapshot, S: number, T: number, r: number, q: number): ChainSide {
  const type = s.details.contract_type;
  const K = s.details.strike_price;
  const bid = s.last_quote?.bid ?? null;
  const ask = s.last_quote?.ask ?? null;
  const mid = bid != null && ask != null && ask > 0 ? (bid + ask) / 2 : null;
  const price = mid ?? s.last_trade?.price ?? s.day?.close ?? null;
  const iv = s.implied_volatility ?? (price ? impliedVol(price, { S, K, T, r, q, type }) : null);
  const fallback = iv ? bsGreeks({ S, K, T, r, q, sigma: iv, type }) : null;
  return {
    contract: s.details.ticker,
    price,
    bid,
    ask,
    iv,
    delta: s.greeks?.delta ?? fallback?.delta ?? null,
    gamma: s.greeks?.gamma ?? fallback?.gamma ?? null,
    theta: s.greeks?.theta ?? fallback?.theta ?? null,
    vega: s.greeks?.vega ?? fallback?.vega ?? null,
    probITM: fallback?.probITM ?? null,
    openInterest: s.open_interest ?? null,
    volume: s.day?.volume ?? null,
    breakeven: s.break_even_price ?? (price != null ? (type === "call" ? K + price : K - price) : null),
  };
}

function maxPain(rows: ChainRow[]): number | null {
  if (!rows.some((r) => r.call?.openInterest || r.put?.openInterest)) return null;
  let best: { strike: number; pain: number } | null = null;
  for (const { strike: settle } of rows) {
    let pain = 0;
    for (const r of rows) {
      pain += (r.call?.openInterest ?? 0) * Math.max(0, settle - r.strike);
      pain += (r.put?.openInterest ?? 0) * Math.max(0, r.strike - settle);
    }
    if (!best || pain < best.pain) best = { strike: settle, pain };
  }
  return best?.strike ?? null;
}

export async function getChain(ticker: string, expiration: string) {
  const T0 = ticker.toUpperCase();
  const [ctx, rf] = await Promise.all([underlyingContext(T0), getRiskFreeRate()]);
  const dte = Math.max(daysBetween(ctx.asOf, expiration), 0);
  const T = Math.max(dte, 0.25) / 365;
  const r = rf.rate;
  const q = ctx.q;

  let mode: "live" | "model" = "model";
  let spot = ctx.spot;
  const byStrike = new Map<number, ChainRow>();
  const row = (k: number) => {
    let x = byStrike.get(k);
    if (!x) byStrike.set(k, (x = { strike: k, call: null, put: null }));
    return x;
  };

  const tryLive = LIVE_MODE === "on" || (LIVE_MODE === "auto" && !isRateLimited());
  if (tryLive) {
    try {
      const snaps = await getOptionChainSnapshot(T0, expiration);
      if (snaps.length) {
        mode = "live";
        spot = snaps.find((s) => s.underlying_asset?.price)?.underlying_asset?.price ?? spot;
        for (const s of snaps) row(s.details.strike_price)[s.details.contract_type] = liveSide(s, spot, T, r, q);
      }
    } catch (err) {
      if (!(err instanceof MassiveError)) throw err;
    }
  }

  if (mode === "model") {
    const contracts = await getOptionContracts({ underlying_ticker: T0, expiration_date: expiration }, 2);
    for (const c of contracts) {
      row(c.strike_price)[c.contract_type] = modelSide(c.ticker, c.contract_type, spot, c.strike_price, T, r, q, ctx.hv30);
    }
  }

  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const atm = rows.reduce<ChainRow | null>((best, x) => (!best || Math.abs(x.strike - spot) < Math.abs(best.strike - spot) ? x : best), null);
  const atmIv =
    mode === "live" && atm ? ([atm.call?.iv, atm.put?.iv].filter((x): x is number => x != null).reduce((a, b, _, arr) => a + b / arr.length, 0) || null) : null;
  const sigma = atmIv ?? ctx.hv30;
  const sum = (f: (r: ChainRow) => number | null | undefined) => rows.reduce((s, x) => s + (f(x) ?? 0), 0);
  const callOi = sum((x) => x.call?.openInterest);
  const putOi = sum((x) => x.put?.openInterest);
  const callVol = sum((x) => x.call?.volume);
  const putVol = sum((x) => x.put?.volume);

  return {
    ticker: T0,
    expiration,
    mode,
    spot,
    asOf: ctx.asOf,
    dte,
    T,
    r,
    rSource: rf.source,
    q,
    hv30: ctx.hv30,
    atmIv,
    expectedMove: expectedMove(spot, sigma, T),
    maxPain: maxPain(rows),
    putCallOi: callOi > 0 ? putOi / callOi : null,
    putCallVolume: callVol > 0 ? putVol / callVol : null,
    rows,
  };
}

export type Chain = Awaited<ReturnType<typeof getChain>>;

/** Last end-of-day trade for a single contract, with the IV implied by that close. */
export async function getContractEod(contract: string) {
  const m = contract.match(/^O:([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  if (!m) throw new MassiveError("NOT_FOUND", "Invalid option symbol", 404);
  const [, underlying, yymmdd, cp, strikeRaw] = m;
  const expiration = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  const strike = Number(strikeRaw) / 1000;
  const type: OptionType = cp === "C" ? "call" : "put";

  const [bar, ctx, rf] = await Promise.all([getPrevDay(contract), underlyingContext(underlying), getRiskFreeRate()]);
  if (!bar) return { contract, found: false as const };
  const date = isoDate(bar.t);
  const underlyingBar = ctx.bars.find((b) => isoDate(b.t) === date) ?? ctx.bars.at(-1)!;
  const T = Math.max(daysBetween(date, expiration), 0.25) / 365;
  const iv = impliedVol(bar.c, { S: underlyingBar.c, K: strike, T, r: rf.rate, q: ctx.q, type });
  return {
    contract,
    found: true as const,
    date,
    close: bar.c,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    volume: bar.v,
    vwap: bar.vw ?? null,
    underlyingClose: underlyingBar.c,
    iv,
    greeks: iv ? bsGreeks({ S: underlyingBar.c, K: strike, T, r: rf.rate, q: ctx.q, sigma: iv, type }) : null,
  };
}
