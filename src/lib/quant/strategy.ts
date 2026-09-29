import { bsPrice, intrinsic, normCdf, type OptionType } from "./options";

export interface StrategyLeg {
  type: OptionType;
  strike: number;
  /** positive = long, negative = short (contracts) */
  qty: number;
  /** entry price per share */
  premium: number;
  /** implied vol used to mark the leg before expiry */
  iv: number;
}

export interface Market {
  spot: number;
  r: number;
  q: number;
  /** years to expiry */
  T: number;
  /** vol used for the terminal price distribution */
  sigma: number;
}

const MULT = 100;

export function pnlAtExpiry(legs: StrategyLeg[], S: number): number {
  return legs.reduce((s, l) => s + l.qty * (intrinsic(S, l.strike, l.type) - l.premium) * MULT, 0);
}

/** Mark-to-model P&L with `tRemaining` years left (Black-Scholes, each leg at its own IV). */
export function pnlAt(legs: StrategyLeg[], S: number, tRemaining: number, m: Pick<Market, "r" | "q">): number {
  return legs.reduce(
    (s, l) => s + l.qty * (bsPrice({ S, K: l.strike, T: tRemaining, r: m.r, q: m.q, sigma: l.iv, type: l.type }) - l.premium) * MULT,
    0,
  );
}

export function netPremium(legs: StrategyLeg[]): number {
  // positive = debit paid, negative = credit received
  return legs.reduce((s, l) => s + l.qty * l.premium * MULT, 0);
}

export interface StrategyStats {
  maxProfit: number | null; // null = unlimited
  maxLoss: number | null; // null = unlimited (reported as a negative number otherwise)
  breakevens: number[];
  probProfit: number | null;
  netPremium: number;
}

/**
 * Scans the expiry payoff on a fine grid: extremes, breakevens (zero crossings),
 * and probability of profit under a lognormal terminal distribution.
 */
export function analyzeStrategy(legs: StrategyLeg[], m: Market): StrategyStats {
  if (!legs.length) return { maxProfit: 0, maxLoss: 0, breakevens: [], probProfit: null, netPremium: 0 };
  const strikes = legs.map((l) => l.strike);
  const hi = Math.max(m.spot, ...strikes) * 3;
  const N = 3000;
  const xs = Array.from({ length: N + 1 }, (_, i) => (hi * i) / N);
  const ys = xs.map((x) => pnlAtExpiry(legs, x));

  // Slope beyond the last strike decides whether upside P&L is unbounded.
  const slopeHigh = legs.reduce((s, l) => s + (l.type === "call" ? l.qty : 0), 0);
  let maxProfit: number | null = Math.max(...ys);
  let maxLoss: number | null = Math.min(...ys);
  if (slopeHigh > 0) maxProfit = null;
  if (slopeHigh < 0) maxLoss = null;

  const breakevens: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const x = xs[i - 1] + ((0 - a) / (b - a)) * (xs[i] - xs[i - 1]);
      if (!breakevens.some((v) => Math.abs(v - x) < hi / N)) breakevens.push(x);
    }
  }

  let probProfit: number | null = null;
  if (m.T > 0 && m.sigma > 0 && m.spot > 0) {
    const sd = m.sigma * Math.sqrt(m.T);
    const mu = Math.log(m.spot) + (m.r - m.q - 0.5 * m.sigma * m.sigma) * m.T;
    const cdf = (x: number) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sd));
    let p = 0;
    for (let i = 1; i < xs.length; i++) {
      if (pnlAtExpiry(legs, (xs[i - 1] + xs[i]) / 2) > 0) p += cdf(xs[i]) - cdf(xs[i - 1]);
    }
    if (pnlAtExpiry(legs, hi * 1.5) > 0) p += 1 - cdf(hi);
    probProfit = Math.min(1, Math.max(0, p));
  }

  return { maxProfit, maxLoss, breakevens, probProfit, netPremium: netPremium(legs) };
}
