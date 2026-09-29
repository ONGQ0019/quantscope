import { describe, expect, it } from "vitest";
import { analyzeStrategy, pnlAtExpiry, type StrategyLeg } from "./strategy";

const m = { spot: 100, r: 0.04, q: 0, T: 30 / 365, sigma: 0.3 };
const leg = (type: "call" | "put", strike: number, qty: number, premium: number): StrategyLeg => ({ type, strike, qty, premium, iv: 0.3 });

describe("analyzeStrategy", () => {
  it("long call: loss capped at premium, unlimited upside, one breakeven", () => {
    const s = analyzeStrategy([leg("call", 100, 1, 4)], m);
    expect(s.maxLoss).toBeCloseTo(-400);
    expect(s.maxProfit).toBeNull();
    expect(s.breakevens).toHaveLength(1);
    expect(s.breakevens[0]).toBeCloseTo(104, 1);
    expect(s.probProfit!).toBeGreaterThan(0.2);
    expect(s.probProfit!).toBeLessThan(0.45);
  });

  it("short call has unlimited loss", () => {
    const s = analyzeStrategy([leg("call", 100, -1, 4)], m);
    expect(s.maxLoss).toBeNull();
    expect(s.maxProfit).toBeCloseTo(400);
  });

  it("iron condor: defined risk, two breakevens", () => {
    const legs = [leg("put", 90, 1, 0.5), leg("put", 95, -1, 1.5), leg("call", 105, -1, 1.5), leg("call", 110, 1, 0.5)];
    const s = analyzeStrategy(legs, m);
    expect(s.maxProfit).toBeCloseTo(200);
    expect(s.maxLoss).toBeCloseTo(-300);
    expect(s.breakevens.map((b) => +b.toFixed(1))).toEqual([93, 107]);
    expect(s.netPremium).toBeCloseTo(-200);
    expect(pnlAtExpiry(legs, 100)).toBeCloseTo(200);
  });
});
