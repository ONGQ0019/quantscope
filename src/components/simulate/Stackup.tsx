"use client";

import clsx from "clsx";
import { useRef } from "react";
import { capitalize, fmtPct, fmtUsd } from "@/lib/format";
import { useInViewTimeline } from "@/lib/client/gsap";
import type { SimulationResponse } from "@/lib/server/simulate";

type Row = { key: string; label: string; sub: string; value: number; bar: string; you?: boolean };

/** "How your money stacks up": the same dollars on the same dates in four places. */
export function Stackup({ data, name, subject, benchLabel }: { data: SimulationResponse; name: string; subject: string; benchLabel: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = data.result!;
  const invested = r.totalInvested;
  const infl = data.inflation;

  const rows: Row[] = [
    { key: "you", label: name, sub: "Your pick", value: r.finalValue, bar: r.profit >= 0 ? "bg-up" : "bg-down", you: true },
  ];
  if (data.benchmarkResult && benchLabel) {
    rows.push({ key: "bench", label: benchLabel, sub: "A simple index fund", value: data.benchmarkResult.finalValue, bar: "bg-accent" });
  }
  if (data.savings) {
    rows.push({
      key: "savings",
      label: "Savings account",
      sub: `Earning about ${fmtPct(data.savings.avgRate, 1, false)} a year`,
      value: data.savings.finalValue,
      bar: "bg-muted/60",
    });
  }
  rows.push({
    key: "cash",
    label: "Cash under the mattress",
    sub: infl ? `Buys ${fmtPct(1 - 1 / infl.factor, 1, false)} less than when you started` : "Doesn't grow",
    value: invested,
    bar: "bg-line-strong",
  });
  rows.sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((x) => x.value), 1);
  const you = rows.find((x) => x.you)!;
  const winner = rows[0];
  const others = rows.filter((x) => !x.you && x.key !== "cash");

  useInViewTimeline(
    ref,
    (tl) => {
      tl.from("[data-bar]", { scaleX: 0, transformOrigin: "left center", duration: 1.1, stagger: 0.14, ease: "power3.out" });
      ref.current!.querySelectorAll<HTMLElement>("[data-count]").forEach((el, i) => {
        const target = Number(el.dataset.count);
        const o = { v: 0 };
        el.textContent = fmtUsd(0, 0);
        tl.to(o, { v: target, duration: 1.1, ease: "power3.out", onUpdate: () => (el.textContent = fmtUsd(o.v, 0)) }, i * 0.14);
      });
      tl.from("[data-marker]", { opacity: 0, duration: 0.4 }, 0.6);
    },
    [rows.map((x) => Math.round(x.value)).join()],
  );

  let verdict: string;
  if (winner.you) {
    const parts = others.map((o) => `${fmtUsd(you.value - o.value, 0)} more than ${o.key === "savings" ? "a savings account" : `the ${o.label}`}`);
    verdict = `${capitalize(subject)} came out on top${parts.length ? `: ${parts.join(" and ")}.` : "."}`;
  } else {
    verdict = `${winner.key === "savings" ? "A savings account" : winner.key === "cash" ? "Keeping the cash" : `The ${winner.label}`} would have done better than ${subject}, by ${fmtUsd(winner.value - you.value, 0)}.`;
  }

  return (
    <section data-reveal className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">How your money stacks up</h2>
      <p className="mt-0.5 text-xs text-muted">The same dollars on the same dates, put somewhere else instead.</p>
      <p className="mt-4 text-sm">{verdict}</p>

      <div ref={ref} className="mt-5 space-y-4">
        {rows.map((x, i) => (
          <div key={x.key} className="sm:grid sm:grid-cols-[minmax(0,13rem)_1fr_6.5rem] sm:items-center sm:gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={clsx("truncate text-sm", x.you ? "font-semibold" : "font-medium")}>{x.label}</p>
                <p className="text-xs leading-snug text-muted">{x.sub}</p>
              </div>
              <span data-count={x.value} className={clsx("num text-sm sm:hidden", x.you ? "font-semibold" : "text-muted")}>
                {fmtUsd(x.value, 0)}
              </span>
            </div>
            <div className="relative mt-2 h-6 sm:mt-0 sm:h-7">
              <div className="absolute inset-y-0 left-0 w-full rounded-md bg-subtle" />
              <div data-bar className={clsx("absolute inset-y-0 left-0 rounded-md", x.bar)} style={{ width: `${(x.value / max) * 100}%` }} />
              <div data-marker className="absolute -inset-y-1 w-0 border-l border-dashed border-ink/50" style={{ left: `${(invested / max) * 100}%` }}>
                {i === 0 && (
                  <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 text-[10px] whitespace-nowrap text-muted sm:block">
                    You put in {fmtUsd(invested, 0)}
                  </span>
                )}
              </div>
            </div>
            <span data-count={x.value} className={clsx("num hidden text-right text-sm sm:block", x.you ? "font-semibold" : "text-muted")}>
              {fmtUsd(x.value, 0)}
            </span>
          </div>
        ))}
        <p className="flex items-center gap-1.5 text-[11px] text-muted sm:hidden">
          <span className="h-3 border-l border-dashed border-ink/50" /> Dashed line: the {fmtUsd(invested, 0)} you put in
        </p>
      </div>

      {infl && (
        <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
          Prices rose <span className="font-medium text-ink">{fmtPct(infl.factor - 1, 1, false)}</span> while you were invested, so you&apos;d need{" "}
          <span className="font-medium text-ink">{fmtUsd(infl.breakEven, 0)}</span> today just to buy what your {fmtUsd(invested, 0)} bought back then.{" "}
          {r.finalValue >= infl.breakEven ? (
            <>
              You beat inflation by <span className="font-medium text-up">{fmtUsd(r.finalValue - infl.breakEven, 0)}</span>.
            </>
          ) : (
            <>
              You fell <span className="font-medium text-down">{fmtUsd(infl.breakEven - r.finalValue, 0)}</span> short of keeping up with inflation.
            </>
          )}
        </p>
      )}
    </section>
  );
}
