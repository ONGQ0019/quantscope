"use client";

import clsx from "clsx";
import { useRef } from "react";
import { fmtDate, fmtPct } from "@/lib/format";
import { useInViewTimeline } from "@/lib/client/gsap";
import type { RollingStats } from "@/lib/quant/story";
import { AnimatedNumber } from "../ui/AnimatedNumber";

/** "Does timing matter?" — every possible start day, held for the same length of time. */
export function TimingLuck({ stats, name, historyYears }: { stats: RollingStats; name: string; historyYears: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const horizon = stats.horizonDays >= 360 ? "1 year" : `${Math.round(stats.horizonDays / 30)} months`;
  const maxCount = Math.max(...stats.bins.map((b) => b.count), 1);

  useInViewTimeline(
    ref,
    (tl) => {
      tl.from("[data-bin]", { scaleY: 0, transformOrigin: "bottom", duration: 0.7, stagger: 0.035, ease: "power3.out" });
    },
    [stats.windows, stats.median],
  );

  const zeroIdx = stats.bins.findIndex((b) => b.from >= 0);
  return (
    <section data-reveal className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">Does timing matter?</h2>
      <p className="mt-0.5 text-xs text-muted">
        We tried all {stats.windows.toLocaleString()} days you could have bought {name} in the last {historyYears} years, holding each for {horizon}.
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        <AnimatedNumber
          onView
          value={stats.positiveShare * 100}
          format={(n) => `${Math.round(n)}%`}
          className={clsx("num text-3xl font-semibold tracking-tight", stats.positiveShare >= 0.5 ? "text-up" : "text-down")}
        />
        <span className="text-sm text-muted">of the time you would have made money.</span>
      </div>

      <div ref={ref} className="mt-5">
        <div className="flex h-28 items-end gap-[3px]">
          {stats.bins.map((b, i) => (
            <div key={i} className="flex h-full flex-1 items-end" title={`${fmtPct(b.from, 0)} to ${fmtPct(b.to, 0)}: ${b.count} start days`}>
              <div
                data-bin
                className={clsx("w-full rounded-t-sm", b.from >= 0 ? "bg-up" : "bg-down", b.count === 0 && "opacity-0")}
                style={{ height: `${Math.max(3, (b.count / maxCount) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="relative mt-1.5 h-4 text-[11px] text-faint">
          <span className="absolute left-0">{fmtPct(stats.bins[0].from, 0)}</span>
          {zeroIdx > 0 && zeroIdx < stats.bins.length && (
            <span className="absolute -translate-x-1/2" style={{ left: `${(zeroIdx / stats.bins.length) * 100}%` }}>
              0%
            </span>
          )}
          <span className="absolute right-0">{fmtPct(stats.bins[stats.bins.length - 1].to, 0)}</span>
        </div>
        <p className="mt-1 text-center text-[11px] text-faint">Return after {horizon}, by start day</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
        <div>
          <p className="text-xs text-muted">Typical result</p>
          <p className={clsx("num mt-1 font-semibold", stats.median >= 0 ? "text-up" : "text-down")}>{fmtPct(stats.median, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Luckiest start</p>
          <p className="num mt-1 font-semibold text-up">{fmtPct(stats.best.ret, 0)}</p>
          <p className="text-[11px] text-faint">{fmtDate(stats.best.start, { month: "short", day: "numeric", year: "2-digit" })}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Unluckiest start</p>
          <p className={clsx("num mt-1 font-semibold", stats.worst.ret >= 0 ? "text-up" : "text-down")}>{fmtPct(stats.worst.ret, 0)}</p>
          <p className="text-[11px] text-faint">{fmtDate(stats.worst.start, { month: "short", day: "numeric", year: "2-digit" })}</p>
        </div>
      </div>
    </section>
  );
}
