/**
 * Option pricing: Black-Scholes-Merton (continuous dividend yield), greeks,
 * implied volatility, and a CRR binomial tree for American exercise.
 * Pure functions — shared by the server (chain building) and the browser (payoff charts).
 */

export type OptionType = "call" | "put";

export interface PricingInput {
  S: number; // spot
  K: number; // strike
  T: number; // years to expiry
  r: number; // risk-free rate (continuous, e.g. 0.042)
  q: number; // dividend yield (continuous)
  sigma: number; // volatility (e.g. 0.25)
  type: OptionType;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** per calendar day */
  theta: number;
  /** per 1 vol point (0.01) */
  vega: number;
  /** per 1% rate move */
  rho: number;
  /** risk-neutral probability of finishing in the money */
  probITM: number;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/** Cumulative normal (Hart 1968 via West 2005), ~1e-14 accuracy. */
export function normCdf(x: number): number {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

export function intrinsic(S: number, K: number, type: OptionType) {
  return type === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
}

export function bsGreeks({ S, K, T, r, q, sigma, type }: PricingInput): Greeks {
  if (T <= 0 || sigma <= 0) {
    const itm = type === "call" ? S > K : S < K;
    return {
      price: intrinsic(S, K, type),
      delta: itm ? (type === "call" ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      probITM: itm ? 1 : 0,
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = (dq * pdf) / (S * sigma * sqrtT);
  const vega = (S * dq * pdf * sqrtT) / 100;
  const decay = (-S * dq * pdf * sigma) / (2 * sqrtT);

  if (type === "call") {
    const Nd1 = normCdf(d1);
    const Nd2 = normCdf(d2);
    return {
      price: S * dq * Nd1 - K * dr * Nd2,
      delta: dq * Nd1,
      gamma,
      theta: (decay - r * K * dr * Nd2 + q * S * dq * Nd1) / 365,
      vega,
      rho: (K * T * dr * Nd2) / 100,
      probITM: Nd2,
    };
  }
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);
  return {
    price: K * dr * Nmd2 - S * dq * Nmd1,
    delta: -dq * Nmd1,
    gamma,
    theta: (decay + r * K * dr * Nmd2 - q * S * dq * Nmd1) / 365,
    vega,
    rho: (-K * T * dr * Nmd2) / 100,
    probITM: Nmd2,
  };
}

export function bsPrice(input: PricingInput): number {
  return bsGreeks(input).price;
}

/**
 * Implied volatility from an option price. Newton-Raphson with a bisection
 * fallback. Returns null when the price violates no-arbitrage bounds.
 */
export function impliedVol(price: number, input: Omit<PricingInput, "sigma">): number | null {
  const { S, K, T, r, q, type } = input;
  if (!(price > 0) || !(T > 0)) return null;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const lower = type === "call" ? Math.max(0, S * dq - K * dr) : Math.max(0, K * dr - S * dq);
  const upper = type === "call" ? S * dq : K * dr;
  if (price <= lower + 1e-9 || price >= upper) return null;

  const f = (sigma: number) => bsPrice({ ...input, sigma }) - price;

  let sigma = Math.min(3, Math.max(0.05, (Math.sqrt((2 * Math.PI) / T) * price) / S));
  for (let i = 0; i < 40; i++) {
    const g = bsGreeks({ ...input, sigma });
    const diff = g.price - price;
    if (Math.abs(diff) < 1e-8) return sigma;
    const v = g.vega * 100;
    if (v < 1e-10) break;
    const next = sigma - diff / v;
    if (!(next > 1e-4 && next < 8)) break;
    sigma = next;
  }

  let lo = 1e-4;
  let hi = 8;
  if (f(lo) > 0 || f(hi) < 0) return null;
  for (let i = 0; i < 120; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-9) break;
  }
  return 0.5 * (lo + hi);
}

/** Cox-Ross-Rubinstein binomial price with early exercise (US equity options are American). */
export function americanPrice({ S, K, T, r, q, sigma, type }: PricingInput, steps = 200): number {
  if (T <= 0 || sigma <= 0) return intrinsic(S, K, type);
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const disc = Math.exp(-r * dt);
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  if (!(p > 0 && p < 1)) return bsPrice({ S, K, T, r, q, sigma, type });

  const values = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    values[i] = intrinsic(S * u ** (steps - i) * d ** i, K, type);
  }
  for (let step = steps - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const cont = disc * (p * values[i] + (1 - p) * values[i + 1]);
      const spot = S * u ** (step - i) * d ** i;
      values[i] = Math.max(cont, intrinsic(spot, K, type));
    }
  }
  return values[0];
}

export interface Leg {
  type: OptionType;
  strike: number;
  /** +1 long, -1 short (per contract) */
  qty: number;
  /** premium paid (long) or received (short), per share */
  premium: number;
  multiplier?: number;
}

/** Profit/loss of a set of legs at expiry for a given underlying price (per position, in $). */
export function payoffAtExpiry(legs: Leg[], S: number): number {
  return legs.reduce((sum, l) => sum + l.qty * (intrinsic(S, l.strike, l.type) - l.premium) * (l.multiplier ?? 100), 0);
}

/** Mark-to-model P&L before expiry (Black-Scholes). */
export function payoffBeforeExpiry(
  legs: Leg[],
  S: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  return legs.reduce(
    (sum, l) =>
      sum + l.qty * (bsPrice({ S, K: l.strike, T, r, q, sigma, type: l.type }) - l.premium) * (l.multiplier ?? 100),
    0,
  );
}

/** Expected ±1σ move of the underlying over T years. */
export function expectedMove(S: number, sigma: number, T: number) {
  return S * sigma * Math.sqrt(Math.max(T, 0));
}
