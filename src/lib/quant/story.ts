import { daysBetween } from "../dates";
import type { DailyClose, SimPoint } from "./simulate";

/**
 * Helpers that turn a simulation into a plain-language story:
 * savings-account and inflation comparisons, notable moments, "how bumpy",
 * and how much the start date mattered.
 */

/**
 * A synthetic "price" for cash in a savings account that earns the 3-month
 * T-bill rate. Feeding it to simulateInvestment reuses the exact same
 * contribution schedule as the stock.
 * `rates` are annual yields in decimal, sorted by date.
 */
export function savingsSeries(dates: string[], rates: { date: string; rate: number }[]): DailyClose[] {
  if (!dates.length) return [];
  const out: DailyClose[] = [{ date: dates[0], close: 1 }];
  let r = 0;
  let k = 0;
  const rateOn = (d: string) => {
    while (k < rates.length && rates[k].date <= d) {
      r = rates[k].rate;
      k++;
    }
    return r;
  };
  let level = 1;
  rateOn(dates[0]);
  for (let i = 1; i < dates.length; i++) {
    const days = daysBetween(dates[i - 1], dates[i]);
    level *= 1 + rateOn(dates[i - 1]) * (days / 365);
    out.push({ date: dates[i], close: level });
  }
  return out;
}

/**
 * How much money you'd need today just to keep the buying power of every
 * dollar you put in (each contribution grown by CPI from its month to the latest).
 */
export function inflationBreakEven(points: SimPoint[], cpi: { month: string; value: number }[]): { breakEven: number; factor: number } | null {
  if (!points.length || cpi.length < 2) return null;
  const sorted = [...cpi].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  const cpiFor = (date: string) => {
    const month = date.slice(0, 7);
    let hit = sorted[0];
    for (const c of sorted) {
      if (c.month <= month) hit = c;
      else break;
    }
    return hit.value;
  };
  let breakEven = 0;
  let prev = 0;
  for (const p of points) {
    const added = p.invested - prev;
    if (added > 1e-9) breakEven += added * (latest.value / cpiFor(p.date));
    prev = p.invested;
  }
  return { breakEven, factor: latest.value / cpiFor(points[0].date) };
}

export type Milestone =
  | { kind: "drop"; index: number; date: string; pct: number; value: number; peakDate: string }
  | { kind: "recover"; index: number; date: string; days: number }
  | { kind: "gain"; index: number; date: string; multiple: number; value: number }
  | { kind: "peak"; index: number; date: string; value: number }
  | { kind: "loss"; index: number; date: string; value: number };

const MULTIPLES = [1.25, 1.5, 2, 3, 5, 10, 20];

/** The handful of moments worth pointing out on the chart, in date order. */
export function findMilestones(points: SimPoint[], maxCount = 5): Milestone[] {
  const n = points.length;
  if (n < 3) return [];
  const picked: Milestone[] = [];

  // Worst drop (total-return drawdown) and its recovery.
  let t = 0;
  for (let i = 1; i < n; i++) if (points[i].drawdown < points[t].drawdown) t = i;
  if (points[t].drawdown <= -0.08) {
    let p = t;
    while (p > 0 && points[p].drawdown < -1e-9) p--;
    picked.push({ kind: "drop", index: t, date: points[t].date, pct: points[t].drawdown, value: points[t].value, peakDate: points[p].date });
    for (let i = t + 1; i < n; i++) {
      if (points[i].drawdown >= -1e-9) {
        picked.push({ kind: "recover", index: i, date: points[i].date, days: daysBetween(points[t].date, points[i].date) });
        break;
      }
    }
  }

  // Growth milestones: first time the value reached 1.25x, 1.5x, 2x… of the money put in.
  const gains: Milestone[] = [];
  for (const m of MULTIPLES) {
    const i = points.findIndex((pt) => pt.invested > 0 && pt.value / pt.invested >= m);
    if (i > 0) gains.push({ kind: "gain", index: i, date: points[i].date, multiple: m, value: points[i].value });
  }
  picked.push(...gains.slice(-2));

  // Peak value, when the ending value is meaningfully below it.
  let pk = 0;
  for (let i = 1; i < n; i++) if (points[i].value > points[pk].value) pk = i;
  if (pk < n - 1 && points[n - 1].value < points[pk].value * 0.95) {
    picked.push({ kind: "peak", index: pk, date: points[pk].date, value: points[pk].value });
  }

  // First time it sank more than 10% below the money put in.
  const li = points.findIndex((pt) => pt.invested > 0 && pt.value / pt.invested <= 0.9);
  if (li > 0) picked.push({ kind: "loss", index: li, date: points[li].date, value: points[li].value });

  // When two moments land on the same day, keep the more informative one.
  const collision: Milestone["kind"][] = ["drop", "peak", "recover", "loss", "gain"];
  const unique = [...picked]
    .sort((a, b) => collision.indexOf(a.kind) - collision.indexOf(b.kind))
    .filter((m, i, arr) => arr.findIndex((x) => x.index === m.index) === i);
  const priority: Milestone["kind"][] = ["drop", "gain", "recover", "peak", "loss"];
  return unique
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))
    .slice(0, maxCount)
    .sort((a, b) => a.index - b.index);
}

/** Plain-language label for annualized volatility. */
export function bumpiness(vol: number | null): { label: string; level: number } {
  if (vol == null) return { label: "Unknown", level: 0 };
  if (vol < 0.12) return { label: "Calm", level: 1 };
  if (vol < 0.22) return { label: "Moderate", level: 2 };
  if (vol < 0.35) return { label: "Bumpy", level: 3 };
  if (vol < 0.55) return { label: "Very bumpy", level: 4 };
  return { label: "Wild", level: 5 };
}

export interface RollingStats {
  horizonDays: number;
  windows: number;
  positiveShare: number;
  median: number;
  best: { ret: number; start: string };
  worst: { ret: number; start: string };
  bins: { from: number; to: number; count: number }[];
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Outcome of buying on every possible day and holding `horizonDays`. */
export function rollingReturns(series: { date: string; value: number }[], horizonDays: number, targetBins = 14): RollingStats | null {
  const rets: { ret: number; start: string }[] = [];
  let j = 0;
  for (let i = 0; i < series.length; i++) {
    if (j < i) j = i;
    while (j < series.length && daysBetween(series[i].date, series[j].date) < horizonDays) j++;
    if (j >= series.length) break;
    rets.push({ ret: series[j].value / series[i].value - 1, start: series[i].date });
  }
  if (rets.length < 20) return null;
  const sorted = rets.map((r) => r.ret).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  let best = rets[0];
  let worst = rets[0];
  for (const r of rets) {
    if (r.ret > best.ret) best = r;
    if (r.ret < worst.ret) worst = r;
  }
  // Bin edges fall on a "nice" step so 0% is always an edge (bins are all-gain or all-loss).
  const step = niceStep(Math.max((best.ret - worst.ret) / targetBins, 0.005));
  const lo = Math.floor(worst.ret / step) * step;
  const count = Math.max(1, Math.ceil((best.ret - lo) / step + 1e-9));
  const bins = Array.from({ length: count }, (_, k) => ({ from: lo + k * step, to: lo + (k + 1) * step, count: 0 }));
  for (const r of sorted) bins[Math.min(count - 1, Math.floor((r - lo) / step + 1e-9))].count++;
  return {
    horizonDays,
    windows: rets.length,
    positiveShare: rets.filter((r) => r.ret > 0).length / rets.length,
    median,
    best,
    worst,
    bins,
  };
}
