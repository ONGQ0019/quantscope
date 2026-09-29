import { describe, expect, it } from "vitest";
import { simulateInvestment, splitFactorAfter } from "./simulate";
import { maxDrawdown, xirr } from "./stats";

function days(start: string, closes: number[]) {
  const out = [];
  const d = new Date(start + "T00:00:00Z");
  for (const close of closes) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    out.push({ date: d.toISOString().slice(0, 10), close });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("stats", () => {
  it("xirr of +10% in one year is 10%", () => {
    expect(xirr([{ t: 0, amount: -100 }, { t: 1, amount: 110 }])).toBeCloseTo(0.1, 8);
  });
  it("max drawdown finds the deepest trough", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117]).drawdown).toBeCloseTo(-0.25);
  });
});

describe("splitFactorAfter", () => {
  it("compounds every split after the date", () => {
    const splits = [
      { date: "2014-06-09", ratio: 7 },
      { date: "2020-08-31", ratio: 4 },
    ];
    expect(splitFactorAfter("2012-01-01", splits)).toBe(28);
    expect(splitFactorAfter("2019-01-01", splits)).toBe(4);
    expect(splitFactorAfter("2021-01-01", splits)).toBe(1);
  });
});

describe("simulateInvestment", () => {
  it("doubles a lump sum when the price doubles", () => {
    const bars = days("2024-01-02", [10, 12, 15, 20]);
    const r = simulateInvestment(bars, [], [], { initial: 1000, monthly: 0, startDate: "2024-01-01", reinvestDividends: true })!;
    expect(r.finalValue).toBeCloseTo(2000);
    expect(r.totalReturn).toBeCloseTo(1);
    expect(r.shares).toBeCloseTo(100);
  });

  it("reinvests split-adjusted dividends", () => {
    // $4 dividend declared before a 4:1 split is $1 per post-split share.
    const bars = days("2024-01-02", [100, 100, 100]);
    const divs = [{ exDate: bars[1].date, amount: 4 }];
    const splits = [{ date: "2025-01-01", ratio: 4 }];
    const r = simulateInvestment(bars, divs, splits, { initial: 10_000, monthly: 0, startDate: "2024-01-01", reinvestDividends: true })!;
    expect(r.dividendsReceived).toBeCloseTo(100); // 100 shares × $1
    expect(r.shares).toBeCloseTo(101);
    expect(r.finalValue).toBeCloseTo(10_100);
    expect(r.assetTotalReturn).toBeCloseTo(0.01);
  });

  it("holds dividends as cash when not reinvesting", () => {
    const bars = days("2024-01-02", [50, 50, 50]);
    const r = simulateInvestment(bars, [{ exDate: bars[2].date, amount: 1 }], [], {
      initial: 5000,
      monthly: 0,
      startDate: "2024-01-01",
      reinvestDividends: false,
    })!;
    expect(r.cash).toBeCloseTo(100);
    expect(r.shares).toBeCloseTo(100);
    expect(r.finalValue).toBeCloseTo(5100);
  });

  it("adds a contribution on the first trading day of each new month", () => {
    const bars = [
      { date: "2024-01-30", close: 10 },
      { date: "2024-01-31", close: 10 },
      { date: "2024-02-01", close: 10 },
      { date: "2024-02-02", close: 10 },
      { date: "2024-03-01", close: 10 },
    ];
    const r = simulateInvestment(bars, [], [], { initial: 100, monthly: 50, startDate: "2024-01-01", reinvestDividends: true })!;
    expect(r.totalInvested).toBe(200);
    expect(r.contributions).toBe(2);
    expect(r.annualReturnKind).toBe("irr");
    expect(r.annualReturn).toBeCloseTo(0, 6);
  });

  it("reports drawdown and calendar-year returns", () => {
    const bars = [
      { date: "2023-12-28", close: 100 },
      { date: "2023-12-29", close: 110 },
      { date: "2024-01-02", close: 88 },
      { date: "2024-01-03", close: 121 },
    ];
    const r = simulateInvestment(bars, [], [], { initial: 1000, monthly: 0, startDate: "2023-01-01", reinvestDividends: true })!;
    expect(r.maxDrawdown).toBeCloseTo(-0.2);
    expect(r.yearly).toEqual([
      { year: 2023, ret: expect.closeTo(0.1) },
      { year: 2024, ret: expect.closeTo(0.1) },
    ]);
  });
});
