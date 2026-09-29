import "server-only";
import { getDailyBars, getDividends, getSplits, HISTORY_YEARS } from "../massive/api";
import { isoDate } from "../dates";
import { simulateInvestment, type SimParams, type SimResult } from "../quant/simulate";
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
  const [main, bench, rf] = await Promise.all([loadSeries(T), B ? loadSeries(B) : null, getRiskFreeRate()]);
  const earliest = main.closes[0]?.date ?? null;
  const result = simulateInvestment(main.closes, main.dividends, main.splits, params, rf.rate);
  const benchResult =
    bench && result
      ? simulateInvestment(bench.closes, bench.dividends, bench.splits, { ...params, startDate: result.startDate }, rf.rate)
      : null;
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
  };
}

export type SimulationResponse = Awaited<ReturnType<typeof runSimulation>>;
