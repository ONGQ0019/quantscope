"use client";

import clsx from "clsx";
import { useMemo, useRef } from "react";
import { daysBetween } from "@/lib/dates";
import { durationLabel, fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { useInViewTimeline } from "@/lib/client/gsap";
import type { SimResult } from "@/lib/quant/simulate";
import { bumpiness } from "@/lib/quant/story";
import { AnimatedNumber } from "../ui/AnimatedNumber";

/** Four answers a non-expert actually wants, in plain words. */
export function PlainStats({ r, name, reinvest }: { r: SimResult; name: string; reinvest: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const bump = bumpiness(r.volatility);

  const recovery = useMemo(() => {
    const t = r.points.findIndex((p) => p.date === r.maxDrawdownTrough);
    if (t < 0) return null;
    const rec = r.points.slice(t + 1).find((p) => p.drawdown >= -1e-9);
    return rec ? daysBetween(r.points[t].date, rec.date) : -1;
  }, [r]);

  useInViewTimeline(
    ref,
    (tl) => {
      tl.from("[data-seg]", { scaleY: 0.2, opacity: 0.2, transformOrigin: "bottom", stagger: 0.08, duration: 0.5, ease: "power2.out" });
    },
    [bump.level],
  );

  const avgCost = r.shares > 0 ? r.totalInvested / r.shares : null;
  const daily = r.volatility != null ? r.volatility / Math.sqrt(252) : null;
  const monthly = r.volatility != null ? r.volatility / Math.sqrt(12) : null;

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-2">
      <Card title="Average growth per year">
        <AnimatedNumber
          onView
          value={r.annualReturn != null ? r.annualReturn * 100 : null}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          className={clsx("num text-3xl font-semibold tracking-tight", (r.annualReturn ?? 0) >= 0 ? "text-up" : "text-down")}
        />
        <p className="mt-2 text-sm text-muted">
          {r.annualReturnKind === "cagr"
            ? "Growing by exactly this much every single year would have given you the same result."
            : "Your money's average yearly growth, counting when each monthly deposit went in."}
          {r.years < 1 && " This covers less than a year, so treat the yearly figure with caution."}
        </p>
      </Card>

      <Card title="Worst drop along the way">
        <AnimatedNumber
          onView
          value={r.maxDrawdown * 100}
          format={(n) => `${n.toFixed(1)}%`}
          className={clsx("num text-3xl font-semibold tracking-tight", r.maxDrawdown < -0.001 ? "text-down" : "text-ink")}
        />
        <p className="mt-2 text-sm text-muted">
          {r.maxDrawdown > -0.005 ? (
            "It barely dipped. A smooth ride."
          ) : (
            <>
              From its high on {fmtDate(r.maxDrawdownPeak)} to its low on {fmtDate(r.maxDrawdownTrough)}.{" "}
              {recovery == null ? "" : recovery < 0 ? "It hasn't fully recovered yet." : `It took ${durationLabel(recovery)} to climb back.`}
            </>
          )}
        </p>
      </Card>

      <Card title="How bumpy was the ride?">
        <div className="flex items-end gap-3">
          <p className="text-3xl font-semibold tracking-tight">{bump.label}</p>
          <div className="mb-1.5 flex items-end gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <span
                key={lvl}
                data-seg
                className={clsx("w-2 rounded-sm", lvl <= bump.level ? (bump.level >= 4 ? "bg-down" : bump.level === 3 ? "bg-warn" : "bg-up") : "bg-subtle")}
                style={{ height: 6 + lvl * 4 }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">
          {daily != null && monthly != null ? (
            <>
              On a typical day {name} moved about <span className="text-ink">±{fmtPct(daily, 1, false)}</span>, and in a typical month about{" "}
              <span className="text-ink">±{fmtPct(monthly, 1, false)}</span>.
            </>
          ) : (
            "Not enough data to measure."
          )}
        </p>
      </Card>

      <Card title="What you'd own">
        <AnimatedNumber
          onView
          value={r.shares}
          format={(n) => `${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 1 : 2 })} shares`}
          className="num text-3xl font-semibold tracking-tight"
        />
        <p className="mt-2 text-sm text-muted">
          Worth {fmtUsd(r.endPrice)} each today{avgCost ? `, and you paid ${fmtUsd(avgCost)} each on average` : ""}.
          {r.dividendsReceived > 0.5 &&
            (reinvest
              ? ` Dividends added ${fmtUsd(r.dividendsReceived, 0)}, which bought extra shares.`
              : ` ${name} also paid you ${fmtUsd(r.dividendsReceived, 0)} in cash dividends.`)}
        </p>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div data-reveal className="card p-5">
      <p className="mb-2 text-sm text-muted">{title}</p>
      {children}
    </div>
  );
}

/** The panic-sell moment: what selling at the bottom would have cost. */
export function HardestMoment({ r }: { r: SimResult }) {
  const ref = useRef<SVGSVGElement>(null);
  const t = r.points.findIndex((p) => p.date === r.maxDrawdownTrough);
  const W = 320;
  const H = 110;

  const geo = useMemo(() => {
    const vs = r.points.map((p) => p.value);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const X = (i: number) => 6 + (i / (vs.length - 1)) * (W - 12);
    const Y = (v: number) => 10 + ((hi - v) / (hi - lo || 1)) * (H - 20);
    return { path: vs.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(""), X, Y, vs };
  }, [r.points]);

  useInViewTimeline(
    ref,
    (tl) => {
      const path = ref.current?.querySelector<SVGPathElement>("[data-line]");
      if (!path) return;
      const len = path.getTotalLength();
      tl.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" });
      tl.from("[data-low]", { scale: 0, transformOrigin: "50% 50%", duration: 0.4, ease: "back.out(3)" }, 0.6);
      tl.from("[data-end]", { scale: 0, transformOrigin: "50% 50%", duration: 0.4, ease: "back.out(3)" }, 1.3);
    },
    [geo.path],
  );

  if (t < 0 || r.maxDrawdown > -0.15) return null;
  const low = r.points[t];
  const lastIdx = r.points.length - 1;

  return (
    <section data-reveal className="card grid gap-5 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">The hardest moment</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          On <span className="text-ink">{fmtDate(low.date)}</span> the price was down <span className="font-medium text-down">{fmtPct(-low.drawdown, 1, false)}</span> from
          its high, and your investment was worth <span className="font-medium text-ink">{fmtUsd(low.value, 0)}</span>. Moments like this are when many
          people sell.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-subtle p-3">
            <p className="text-xs text-muted">If you had sold then</p>
            <p className="num mt-1 text-xl font-semibold text-down">{fmtUsd(low.value, 0)}</p>
          </div>
          <div className="rounded-lg bg-subtle p-3">
            <p className="text-xs text-muted">{r.contributions > 0 ? "If you kept investing" : "If you held on"}</p>
            <p className={clsx("num mt-1 text-xl font-semibold", r.finalValue >= r.totalInvested ? "text-up" : "text-ink")}>{fmtUsd(r.finalValue, 0)}</p>
          </div>
        </div>
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[360px]" aria-hidden>
        <path data-line d={geo.path} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: "var(--muted)" }} />
        <g data-low>
          <circle cx={geo.X(t)} cy={geo.Y(geo.vs[t])} r="5" style={{ fill: "var(--down)", stroke: "var(--surface)", strokeWidth: 2 }} />
        </g>
        <g data-end>
          <circle cx={geo.X(lastIdx)} cy={geo.Y(geo.vs[lastIdx])} r="5" style={{ fill: "var(--up)", stroke: "var(--surface)", strokeWidth: 2 }} />
        </g>
      </svg>
    </section>
  );
}
