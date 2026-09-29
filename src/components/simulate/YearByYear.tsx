"use client";

import clsx from "clsx";
import { useRef } from "react";
import { fmtPct } from "@/lib/format";
import { useInViewTimeline } from "@/lib/client/gsap";

type Year = { year: number; ret: number };

export function YearByYear({ main, bench, name, benchLabel }: { main: Year[]; bench: Year[] | null; name: string; benchLabel: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const benchBy = new Map(bench?.map((y) => [y.year, y.ret]));
  const max = Math.max(0.05, ...main.map((y) => Math.abs(y.ret)), ...(bench ?? []).map((y) => Math.abs(y.ret)));
  const best = main.reduce((a, b) => (b.ret > a.ret ? b : a), main[0]);
  const worst = main.reduce((a, b) => (b.ret < a.ret ? b : a), main[0]);

  useInViewTimeline(
    ref,
    (tl) => {
      tl.from("[data-yr]", { scaleX: 0, duration: 0.8, stagger: 0.05, ease: "power3.out" });
    },
    [main.map((y) => y.ret.toFixed(4)).join(), name],
  );

  return (
    <section data-reveal className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">Year by year</h2>
      <p className="mt-0.5 text-xs text-muted">
        {main.length > 1 ? (
          <>
            Best year {best.year} ({fmtPct(best.ret, 1)}), worst year {worst.year} ({fmtPct(worst.ret, 1)}). Includes dividends.
          </>
        ) : (
          "Includes dividends."
        )}
      </p>
      <div ref={ref} className="mt-5 space-y-4">
        {main.map((y) => {
          const bv = benchBy.get(y.year);
          return (
            <div key={y.year} className="grid grid-cols-[40px_1fr] items-center gap-3">
              <span className="num text-sm text-muted">{y.year}</span>
              <div className="space-y-1.5">
                <BarRow value={y.ret} max={max} strong />
                {bv != null && <BarRow value={bv} max={max} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-up" /> {name}
        </span>
        {benchLabel && bench && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent" /> {benchLabel}
          </span>
        )}
        <span className="text-faint">First and last years may be partial.</span>
      </div>
    </section>
  );
}

function BarRow({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  const w = (Math.abs(value) / max) * 38;
  return (
    <div className="relative flex h-4 items-center">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div
        data-yr
        className={clsx("absolute h-2.5 rounded-sm", strong ? (value >= 0 ? "bg-up" : "bg-down") : "bg-accent")}
        style={value >= 0 ? { left: "50%", width: `${w}%`, transformOrigin: "left" } : { right: "50%", width: `${w}%`, transformOrigin: "right" }}
      />
      <span
        className={clsx("num absolute text-[11px]", strong ? (value >= 0 ? "text-up" : "text-down") : "text-accent")}
        style={value >= 0 ? { left: `calc(50% + ${w}% + 6px)` } : { right: `calc(50% + ${w}% + 6px)` }}
      >
        {fmtPct(value, 1)}
      </span>
    </div>
  );
}
