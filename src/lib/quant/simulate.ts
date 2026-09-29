import { yearsBetween } from "../dates";
import { annualizedVol, cagr, drawdownSeries, maxDrawdown, sharpe, simpleReturns, xirr } from "./stats";

/**
 * "What if I had invested…" engine.
 *
 * Prices are split-adjusted closes (today's share basis). Dividends arrive as
 * originally declared, so each is converted to today's share basis by dividing
 * by every split that happened after its ex-date. Dividends are credited on the
 * ex-date and either reinvested at that day's close or held as cash.
 */

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number; // split-adjusted
}

export interface CashDividend {
  exDate: string;
  amount: number; // per share, as declared (not split-adjusted)
}

export interface StockSplit {
  date: string;
  /** new shares per old share, e.g. 4 for a 4-for-1 */
  ratio: number;
}

export interface SimParams {
  initial: number;
  /** contribution on the first trading day of each following month */
  monthly: number;
  startDate: string;
  endDate?: string;
  reinvestDividends: boolean;
}

export interface SimPoint {
  date: string;
  value: number;
  invested: number;
  price: number;
  drawdown: number;
}

export interface SimResult {
  startDate: string;
  endDate: string;
  years: number;
  startPrice: number;
  endPrice: number;
  totalInvested: number;
  finalValue: number;
  profit: number;
  totalReturn: number; // profit / invested
  /** CAGR for lump sums, money-weighted (XIRR) when there are contributions */
  annualReturn: number | null;
  annualReturnKind: "cagr" | "irr";
  /** time-weighted total return of the asset itself (price + dividends) */
  assetTotalReturn: number;
  priceReturn: number;
  maxDrawdown: number;
  maxDrawdownPeak: string | null;
  maxDrawdownTrough: string | null;
  volatility: number | null;
  sharpe: number | null;
  shares: number;
  cash: number;
  dividendsReceived: number;
  contributions: number;
  bestDay: { date: string; ret: number } | null;
  worstDay: { date: string; ret: number } | null;
  yearly: { year: number; ret: number }[];
  points: SimPoint[];
}

export function splitFactorAfter(date: string, splits: StockSplit[]): number {
  return splits.reduce((f, s) => (s.date > date ? f * s.ratio : f), 1);
}

export function simulateInvestment(
  closes: DailyClose[],
  dividends: CashDividend[],
  splits: StockSplit[],
  params: SimParams,
  riskFree = 0,
): SimResult | null {
  const bars = closes.filter((b) => b.date >= params.startDate && (!params.endDate || b.date <= params.endDate));
  if (bars.length < 2) return null;

  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    const adj = d.amount / splitFactorAfter(d.exDate, splits);
    divByDate.set(d.exDate, (divByDate.get(d.exDate) ?? 0) + adj);
  }
  // Dividends whose ex-date falls on a non-trading day are credited on the next bar.
  const sortedDivDates = [...divByDate.keys()].sort();

  let shares = 0;
  let cash = 0;
  let invested = 0;
  let dividendsReceived = 0;
  let contributions = 0;
  let divCursor = sortedDivDates.findIndex((d) => d > bars[0].date);
  if (divCursor === -1) divCursor = sortedDivDates.length;

  const flows: { date: string; amount: number }[] = [];
  const points: SimPoint[] = [];
  const tri: number[] = []; // total-return index of the asset
  let lastMonth = bars[0].date.slice(0, 7);

  const buy = (amount: number, price: number, date: string) => {
    if (amount <= 0) return;
    shares += amount / price;
    invested += amount;
    flows.push({ date, amount: -amount });
  };

  buy(params.initial, bars[0].close, bars[0].date);
  tri.push(1);

  for (let i = 0; i < bars.length; i++) {
    const { date, close } = bars[i];

    if (i > 0) {
      let divToday = 0;
      while (divCursor < sortedDivDates.length && sortedDivDates[divCursor] <= date) {
        divToday += divByDate.get(sortedDivDates[divCursor])!;
        divCursor++;
      }
      if (divToday > 0) {
        const payout = shares * divToday;
        dividendsReceived += payout;
        if (params.reinvestDividends) shares += payout / close;
        else cash += payout;
      }
      tri.push(tri[i - 1] * ((close + divToday) / bars[i - 1].close));

      const month = date.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        if (params.monthly > 0) {
          buy(params.monthly, close, date);
          contributions++;
        }
      }
    }

    points.push({ date, value: shares * close + cash, invested, price: close, drawdown: 0 });
  }

  const first = bars[0];
  const last = bars[bars.length - 1];
  const finalValue = shares * last.close + cash;
  const years = yearsBetween(first.date, last.date);

  const dd = drawdownSeries(tri);
  points.forEach((p, i) => (p.drawdown = dd[i]));
  const mdd = maxDrawdown(tri);
  const dailyRets = simpleReturns(tri);

  let best: SimResult["bestDay"] = null;
  let worst: SimResult["worstDay"] = null;
  dailyRets.forEach((ret, i) => {
    const date = bars[i + 1].date;
    if (!best || ret > best.ret) best = { date, ret };
    if (!worst || ret < worst.ret) worst = { date, ret };
  });

  // Calendar-year total returns of the asset.
  const yearly: { year: number; ret: number }[] = [];
  let yearStartIdx = 0;
  for (let i = 1; i <= bars.length; i++) {
    const y = i < bars.length ? bars[i].date.slice(0, 4) : null;
    if (y !== bars[yearStartIdx].date.slice(0, 4)) {
      const base = yearStartIdx === 0 ? tri[0] : tri[yearStartIdx - 1];
      yearly.push({ year: Number(bars[yearStartIdx].date.slice(0, 4)), ret: tri[i - 1] / base - 1 });
      yearStartIdx = i;
    }
  }

  const lumpSum = params.monthly <= 0;
  const annualReturn = lumpSum
    ? cagr(invested, finalValue, years)
    : xirr([
        ...flows.map((f) => ({ t: yearsBetween(first.date, f.date), amount: f.amount })),
        { t: years, amount: finalValue },
      ]);

  return {
    startDate: first.date,
    endDate: last.date,
    years,
    startPrice: first.close,
    endPrice: last.close,
    totalInvested: invested,
    finalValue,
    profit: finalValue - invested,
    totalReturn: invested > 0 ? finalValue / invested - 1 : 0,
    annualReturn,
    annualReturnKind: lumpSum ? "cagr" : "irr",
    assetTotalReturn: tri[tri.length - 1] - 1,
    priceReturn: last.close / first.close - 1,
    maxDrawdown: mdd.drawdown,
    maxDrawdownPeak: mdd.drawdown < 0 ? bars[mdd.peak].date : null,
    maxDrawdownTrough: mdd.drawdown < 0 ? bars[mdd.trough].date : null,
    volatility: annualizedVol(dailyRets),
    sharpe: sharpe(dailyRets, riskFree),
    shares,
    cash,
    dividendsReceived,
    contributions,
    bestDay: best,
    worstDay: worst,
    yearly,
    points,
  };
}
