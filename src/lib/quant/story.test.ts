import { describe, expect, it } from "vitest";
import { simulateInvestment, type SimPoint } from "./simulate";
import { bumpiness, findMilestones, inflationBreakEven, rollingReturns, savingsSeries } from "./story";

function pts(values: number[], invested = 100, start = "2024-01-01"): SimPoint[] {
  let peak = -Infinity;
  return values.map((value, i) => {
    peak = Math.max(peak, value);
    const d = new Date(start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i * 7);
    return { date: d.toISOString().slice(0, 10), value, invested, price: value, drawdown: value / peak - 1 };
  });
}

describe("savingsSeries", () => {
  it("compounds the T-bill rate over calendar days", () => {
    const s = savingsSeries(["2024-01-01", "2025-01-01"], [{ date: "2023-12-01", rate: 0.05 }]);
    expect(s[1].close).toBeCloseTo(1 + 0.05 * (366 / 365), 10);
  });

  it("drives the simulator like any other asset", () => {
    const dates = ["2024-01-02", "2024-02-01", "2024-03-01"];
    const s = savingsSeries(dates, [{ date: "2024-01-01", rate: 0.0365 }]);
    const r = simulateInvestment(s, [], [], { initial: 1000, monthly: 0, startDate: "2024-01-01", reinvestDividends: true })!;
    expect(r.finalValue).toBeGreaterThan(1000);
    expect(r.finalValue).toBeCloseTo(1000 * (1 + 0.0365 * 30 / 365) * (1 + 0.0365 * 29 / 365), 6);
  });
});

describe("inflationBreakEven", () => {
  it("grows each contribution by CPI from its own month", () => {
    const points: SimPoint[] = [
      { date: "2024-01-05", value: 100, invested: 100, price: 1, drawdown: 0 },
      { date: "2024-06-03", value: 210, invested: 200, price: 1, drawdown: 0 },
    ];
    const cpi = [
      { month: "2024-01", value: 100 },
      { month: "2024-06", value: 110 },
      { month: "2025-01", value: 121 },
    ];
    const r = inflationBreakEven(points, cpi)!;
    expect(r.breakEven).toBeCloseTo(100 * 1.21 + 100 * 1.1);
    expect(r.factor).toBeCloseTo(1.21);
  });
});

describe("findMilestones", () => {
  it("finds the worst drop, its recovery and growth milestones", () => {
    const m = findMilestones(pts([100, 110, 130, 90, 80, 100, 135, 160, 210]));
    const kinds = m.map((x) => x.kind);
    expect(kinds).toContain("drop");
    expect(kinds).toContain("recover");
    const drop = m.find((x) => x.kind === "drop")!;
    expect(drop.kind === "drop" && drop.pct).toBeCloseTo(80 / 130 - 1);
    const gains = m.filter((x) => x.kind === "gain");
    expect(gains.map((g) => g.kind === "gain" && g.multiple)).toEqual([1.5, 2]);
    expect(m.map((x) => x.index)).toEqual([...m.map((x) => x.index)].sort((a, b) => a - b));
  });

  it("flags a loss and a missed peak", () => {
    const m = findMilestones(pts([100, 120, 140, 110, 85, 80]));
    expect(m.some((x) => x.kind === "peak")).toBe(true);
    expect(m.some((x) => x.kind === "loss")).toBe(true);
  });
});

describe("bumpiness", () => {
  it("maps volatility to plain words", () => {
    expect(bumpiness(0.1).label).toBe("Calm");
    expect(bumpiness(0.3).label).toBe("Bumpy");
    expect(bumpiness(0.8).level).toBe(5);
  });
});

describe("rollingReturns", () => {
  it("measures every start date over the horizon", () => {
    const series = Array.from({ length: 800 }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 1 + i));
      return { date: d.toISOString().slice(0, 10), value: 100 * 1.001 ** i };
    });
    const r = rollingReturns(series, 365)!;
    expect(r.windows).toBe(800 - 365);
    expect(r.positiveShare).toBe(1);
    expect(r.median).toBeCloseTo(1.001 ** 365 - 1, 6);
    expect(r.bins.reduce((s, b) => s + b.count, 0)).toBe(r.windows);
  });

  it("puts 0% on a bin edge", () => {
    const series = Array.from({ length: 400 }, (_, i) => ({
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      value: 100 + 20 * Math.sin(i / 20),
    }));
    const r = rollingReturns(series, 30)!;
    expect(r.bins.some((b) => Math.abs(b.from) < 1e-12)).toBe(true);
    expect(r.bins.every((b) => b.from >= 0 || b.to <= 1e-12)).toBe(true);
  });
});
