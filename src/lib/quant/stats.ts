export const TRADING_DAYS = 252;

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Sample standard deviation. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function simpleReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i] / values[i - 1] - 1);
  return out;
}

export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(Math.log(values[i] / values[i - 1]));
  return out;
}

/** Annualized close-to-close historical volatility over the last `window` returns. */
export function historicalVol(closes: number[], window = 30): number | null {
  if (closes.length < window + 1) return null;
  const r = logReturns(closes.slice(-(window + 1)));
  const sd = stdev(r);
  return Number.isFinite(sd) ? sd * Math.sqrt(TRADING_DAYS) : null;
}

export function annualizedVol(dailyReturns: number[]): number | null {
  const sd = stdev(dailyReturns);
  return Number.isFinite(sd) ? sd * Math.sqrt(TRADING_DAYS) : null;
}

/** Largest peak-to-trough decline, as a negative fraction (e.g. -0.34). */
export function maxDrawdown(values: number[]): { drawdown: number; peak: number; trough: number } {
  let peakIdx = 0;
  let best = { drawdown: 0, peak: 0, trough: 0 };
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[peakIdx]) peakIdx = i;
    const dd = values[i] / values[peakIdx] - 1;
    if (dd < best.drawdown) best = { drawdown: dd, peak: peakIdx, trough: i };
  }
  return best;
}

/** Drawdown series (0 at highs, negative below). */
export function drawdownSeries(values: number[]): number[] {
  let peak = -Infinity;
  return values.map((v) => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

export function cagr(start: number, end: number, years: number): number | null {
  if (!(start > 0) || !(years > 0)) return null;
  return (end / start) ** (1 / years) - 1;
}

/**
 * Money-weighted annual return for irregular cash flows (like Excel's XIRR).
 * Contributions are negative, the final value positive. `t` is in years from the first flow.
 */
export function xirr(flows: { t: number; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const npv = (rate: number) => flows.reduce((s, f) => s + f.amount / (1 + rate) ** f.t, 0);
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-9) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/** Sharpe ratio from daily returns and an annual risk-free rate. */
export function sharpe(dailyReturns: number[], riskFree = 0): number | null {
  const sd = stdev(dailyReturns);
  if (!Number.isFinite(sd) || sd === 0) return null;
  const excess = mean(dailyReturns) - riskFree / TRADING_DAYS;
  return (excess / sd) * Math.sqrt(TRADING_DAYS);
}
