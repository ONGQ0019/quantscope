import "server-only";
import { getCpi, getDailyBars, getDividends, getSplits, getTreasuryHistory, HISTORY_YEARS } from "../massive/api";
import { daysBetween, isoDate } from "../dates";
import { simulateInvestment, type SimParams, type SimResult } from "../quant/simulate";
import { inflationBreakEven, rollingReturns, savingsSeries } from "../quant/story";
import { getRiskFreeRate } from "./options";
import { lookupTicker } from "./tickers";

async function loadSeries(ticker: string) {
  const [bars, divs, splits] = await Promise.all([getDailyBars(ticker), getDividends(ticker), getSplits(ticker)]);
  return {
    closes: bars.map((b) => ({ date: isoDate(b.t), close: b.c })),
    dividends: divs.map((d) => ({ exDate: d.ex_dividend_date, amount: d.cash_amount })),
    splits: splits.map((s) => ({ date: s.execution_date, ratio: s.split_to / s.split_from })),
  };
}

function thin(result: SimResult, max = 1200): SimResult {
  const n = result.points.length;
  if (n <= max) return result;
  const step = Math.ceil(n / max);
  return { ...result, points: result.points.filter((_, i) => i % step === 0 || i === n - 1) };
}

export async function runSimulation(ticker: string, params: SimParams, benchmark: string | null) {
  const T = ticker.toUpperCase();
  const B = benchmark && benchmark.toUpperCase() !== T ? benchmark.toUpperCase() : null;
  const [main, bench, rf, rates, cpi] = await Promise.all([
    loadSeries(T),
    B ? loadSeries(B) : null,
    getRiskFreeRate(),
    getTreasuryHistory().catch(() => []),
    getCpi().catch(() => []),
  ]);
  const earliest = main.closes[0]?.date ?? null;
  const result = simulateInvestment(main.closes, main.dividends, main.splits, params, rf.rate);
  const benchResult =
    bench && result
      ? simulateInvestment(bench.closes, bench.dividends, bench.splits, { ...params, startDate: result.startDate }, rf.rate)
      : null;

  // Same dollars, same dates, parked in a savings account earning the 3-month T-bill rate.
  let savings: { finalValue: number; totalReturn: number; annualReturn: number | null; avgRate: number } | null = null;
  if (result) {
    const dates = result.points.map((p) => p.date);
    const series = savingsSeries(dates, rates.length ? rates : [{ date: dates[0], rate: rf.rate }]);
    const s = simulateInvestment(series, [], [], { ...params, startDate: result.startDate, endDate: undefined });
    if (s) {
      const inWindow = rates.filter((r) => r.date >= result.startDate && r.date <= result.endDate);
      const avgRate = inWindow.length ? inWindow.reduce((a, r) => a + r.rate, 0) / inWindow.length : rf.rate;
      savings = { finalValue: s.finalValue, totalReturn: s.totalReturn, annualReturn: s.annualReturn, avgRate };
    }
  }

  const infl = result ? inflationBreakEven(result.points, cpi) : null;
  const latestCpi = cpi.length ? [...cpi].sort((a, b) => b.month.localeCompare(a.month))[0].month : null;

  // How much the start date mattered: every possible entry over the available history.
  let timing = null;
  if (main.closes.length > 60) {
    const full = simulateInvestment(main.closes, main.dividends, main.splits, {
      initial: 1,
      monthly: 0,
      startDate: main.closes[0].date,
      reinvestDividends: true,
    });
    const span = daysBetween(main.closes[0].date, main.closes[main.closes.length - 1].date);
    const horizon = span >= 365 * 1.4 ? 365 : span >= 240 ? 91 : null;
    if (full && horizon) timing = rollingReturns(full.points.map((p) => ({ date: p.date, value: p.value })), horizon);
  }

  return {
    ticker: T,
    name: lookupTicker(T)?.name ?? T,
    benchmark: B,
    benchmarkName: B ? (lookupTicker(B)?.name ?? B) : null,
    earliest,
    historyYears: HISTORY_YEARS,
    riskFree: rf.rate,
    result: result ? thin(result) : null,
    benchmarkResult: benchResult ? thin(benchResult) : null,
    savings,
    inflation: infl && latestCpi ? { ...infl, latestMonth: latestCpi } : null,
    timing,
  };
}

export type SimulationResponse = Awaited<ReturnType<typeof runSimulation>>;
