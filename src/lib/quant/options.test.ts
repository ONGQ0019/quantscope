import { describe, expect, it } from "vitest";
import { americanPrice, bsGreeks, bsPrice, impliedVol, normCdf, payoffAtExpiry } from "./options";

const base = { S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 } as const;

describe("normCdf", () => {
  it("matches reference values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 10);
    expect(normCdf(-1.96)).toBeCloseTo(0.0249978951482205, 10);
    expect(normCdf(-40)).toBe(0);
  });
});

describe("Black-Scholes", () => {
  it("prices the textbook at-the-money case (Hull)", () => {
    expect(bsPrice({ ...base, type: "call" })).toBeCloseTo(10.4506, 4);
    expect(bsPrice({ ...base, type: "put" })).toBeCloseTo(5.5735, 4);
  });

  it("returns textbook greeks", () => {
    const g = bsGreeks({ ...base, type: "call" });
    expect(g.delta).toBeCloseTo(0.6368, 4);
    expect(g.gamma).toBeCloseTo(0.018762, 5);
    expect(g.vega).toBeCloseTo(0.37524, 4);
    expect(g.theta).toBeCloseTo(-6.414 / 365, 4);
  });

  it("satisfies put-call parity with a dividend yield", () => {
    const p = { S: 123, K: 110, T: 0.37, r: 0.043, q: 0.018, sigma: 0.31 };
    const c = bsPrice({ ...p, type: "call" });
    const put = bsPrice({ ...p, type: "put" });
    expect(c - put).toBeCloseTo(p.S * Math.exp(-p.q * p.T) - p.K * Math.exp(-p.r * p.T), 10);
  });

  it("collapses to intrinsic value at expiry", () => {
    expect(bsPrice({ ...base, S: 112, T: 0, type: "call" })).toBe(12);
    expect(bsGreeks({ ...base, S: 90, T: 0, type: "put" }).delta).toBe(-1);
  });
});

describe("impliedVol", () => {
  it("recovers the volatility used to price the option", () => {
    for (const sigma of [0.08, 0.25, 0.6, 1.4]) {
      for (const type of ["call", "put"] as const) {
        for (const K of [70, 100, 135]) {
          const p = { S: 100, K, T: 0.5, r: 0.04, q: 0.01, type };
          const price = bsPrice({ ...p, sigma });
          const lower = type === "call"
            ? Math.max(0, 100 * Math.exp(-0.01 * 0.5) - K * Math.exp(-0.04 * 0.5))
            : Math.max(0, K * Math.exp(-0.04 * 0.5) - 100 * Math.exp(-0.01 * 0.5));
          // No time value left → volatility isn't identifiable from the price.
          if (price - lower < 1e-4) continue;
          expect(impliedVol(price, p)).toBeCloseTo(sigma, 5);
        }
      }
    }
  });

  it("rejects prices below intrinsic value", () => {
    expect(impliedVol(5, { S: 120, K: 100, T: 0.5, r: 0.04, q: 0, type: "call" })).toBeNull();
  });
});

describe("americanPrice", () => {
  it("equals the European call when there are no dividends", () => {
    const eu = bsPrice({ ...base, type: "call" });
    expect(americanPrice({ ...base, type: "call" }, 500)).toBeCloseTo(eu, 1);
  });

  it("values the early-exercise premium of a put", () => {
    const eu = bsPrice({ ...base, type: "put" });
    const am = americanPrice({ ...base, type: "put" }, 500);
    expect(am).toBeGreaterThan(eu);
    expect(am).toBeCloseTo(6.09, 1);
  });
});

describe("payoffAtExpiry", () => {
  it("computes a bull call spread", () => {
    const legs = [
      { type: "call" as const, strike: 100, qty: 1, premium: 5 },
      { type: "call" as const, strike: 110, qty: -1, premium: 2 },
    ];
    expect(payoffAtExpiry(legs, 90)).toBeCloseTo(-300);
    expect(payoffAtExpiry(legs, 120)).toBeCloseTo(700);
    expect(payoffAtExpiry(legs, 103)).toBeCloseTo(0);
  });
});
