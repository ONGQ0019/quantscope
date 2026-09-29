"use client";

import clsx from "clsx";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { fmtCompact, fmtPct, fmtPrice } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import type { Chain, ChainRow, ChainSide } from "@/lib/server/options";

export type ChainView = "greeks" | "market" | "prob";

type Col = { key: string; label: string; title?: string; render: (s: ChainSide, ctx: { maxOi: number; maxVol: number }) => React.ReactNode };

const price = (s: ChainSide) => fmtPrice(s.price, 2);
const COLS: Record<ChainView, Col[]> = {
  greeks: [
    { key: "price", label: "Price", render: price },
    { key: "iv", label: "IV", title: "Implied volatility", render: (s) => fmtPct(s.iv, 1, false) },
    { key: "delta", label: "Δ", title: "Delta", render: (s) => (s.delta == null ? "—" : s.delta.toFixed(3)) },
    { key: "gamma", label: "Γ", title: "Gamma", render: (s) => (s.gamma == null ? "—" : s.gamma.toFixed(4)) },
    { key: "theta", label: "Θ", title: "Theta ($/share/day)", render: (s) => (s.theta == null ? "—" : s.theta.toFixed(3)) },
    { key: "vega", label: "V", title: "Vega ($/share per vol pt)", render: (s) => (s.vega == null ? "—" : s.vega.toFixed(3)) },
  ],
  market: [
    { key: "bid", label: "Bid", render: (s) => fmtPrice(s.bid, 2) },
    { key: "ask", label: "Ask", render: (s) => fmtPrice(s.ask, 2) },
    { key: "price", label: "Mark", render: price },
    {
      key: "vol",
      label: "Volume",
      render: (s, c) => <Bar value={s.volume} max={c.maxVol} tone="accent" />,
    },
    {
      key: "oi",
      label: "Open int.",
      render: (s, c) => <Bar value={s.openInterest} max={c.maxOi} tone="accent2" />,
    },
    { key: "iv", label: "IV", render: (s) => fmtPct(s.iv, 1, false) },
  ],
  prob: [
    { key: "price", label: "Price", render: price },
    { key: "pitm", label: "P(ITM)", title: "Risk-neutral probability of expiring in the money", render: (s) => fmtPct(s.probITM, 1, false) },
    { key: "be", label: "Breakeven", render: (s) => fmtPrice(s.breakeven, 2) },
    { key: "delta", label: "Δ", render: (s) => (s.delta == null ? "—" : s.delta.toFixed(2)) },
  ],
};

function Bar({ value, max, tone }: { value: number | null; max: number; tone: "accent" | "accent2" }) {
  if (value == null) return <>—</>;
  return (
    <span className="relative inline-flex w-full items-center justify-end">
      <span
        className={clsx("absolute inset-y-[-3px] right-0 rounded-sm", tone === "accent" ? "bg-accent/12" : "bg-muted/15")}
        style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }}
      />
      <span className="relative">{fmtCompact(value)}</span>
    </span>
  );
}

export function ChainTable({
  chain,
  view,
  strikeWindow,
  selected,
  onPick,
}: {
  chain: Chain;
  view: ChainView;
  strikeWindow: number;
  selected: Set<string>;
  onPick: (type: "call" | "put", row: ChainRow) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const cols = COLS[view];
  const callCols = [...cols].reverse();

  const { rows, spotIndex } = useMemo(() => {
    const all = chain.rows;
    let atm = 0;
    all.forEach((r, i) => {
      if (Math.abs(r.strike - chain.spot) < Math.abs(all[atm].strike - chain.spot)) atm = i;
    });
    const from = strikeWindow > 0 ? Math.max(0, atm - strikeWindow) : 0;
    const to = strikeWindow > 0 ? Math.min(all.length, atm + strikeWindow + 1) : all.length;
    const rows = all.slice(from, to);
    // insert the spot divider before the first strike above spot
    let spotIndex = rows.findIndex((r) => r.strike > chain.spot);
    if (spotIndex === -1) spotIndex = rows.length;
    return { rows, spotIndex };
  }, [chain, strikeWindow]);

  const ctx = useMemo(
    () => ({
      maxOi: Math.max(1, ...rows.flatMap((r) => [r.call?.openInterest ?? 0, r.put?.openInterest ?? 0])),
      maxVol: Math.max(1, ...rows.flatMap((r) => [r.call?.volume ?? 0, r.put?.volume ?? 0])),
    }),
    [rows],
  );

  // Glide to the money and stagger rows in whenever the expiration changes.
  useEffect(() => {
    const sc = scroller.current;
    const spot = sc?.querySelector<HTMLElement>("[data-spot]");
    if (sc && spot) {
      const target = spot.offsetTop - sc.clientHeight / 2 + spot.offsetHeight / 2;
      if (prefersReducedMotion()) sc.scrollTop = target;
      else gsap.to(sc, { scrollTop: target, duration: 0.6, ease: "power3.out" });
    }
    if (!prefersReducedMotion() && body.current) {
      gsap.fromTo(body.current.querySelectorAll("tr"), { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.008, ease: "none" });
    }
  }, [chain.expiration, chain.ticker, strikeWindow]);

  const cell = (type: "call" | "put", row: ChainRow, col: Col, first: boolean) => {
    const side = row[type];
    const itm = type === "call" ? row.strike < chain.spot : row.strike > chain.spot;
    const isSel = side ? selected.has(side.contract) : false;
    return (
      <td
        key={`${type}-${col.key}`}
        onClick={() => side && onPick(type, row)}
        className={clsx(
          "num cursor-pointer px-2.5 py-2 text-right text-[12.5px] whitespace-nowrap transition-colors",
          itm && "bg-subtle",
          isSel && "!bg-accent/12 font-semibold !text-accent",
          col.key === "price" ? "font-medium text-ink" : "text-muted",
          first && "pl-4",
        )}
      >
        {side ? col.render(side, ctx) : "—"}
      </td>
    );
  };

  return (
    <div ref={scroller} className="relative max-h-[68vh] overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="sticky top-0 z-20 bg-surface">
          <tr className="text-xs">
            <th colSpan={cols.length} className="border-b border-line py-2 text-center font-medium text-ink">
              Calls
            </th>
            <th className="border-b border-line px-3 py-2" />
            <th colSpan={cols.length} className="border-b border-line py-2 text-center font-medium text-ink">
              Puts
            </th>
          </tr>
          <tr className="text-[11px] text-faint">
            {callCols.map((c) => (
              <th key={`hc-${c.key}`} title={c.title} className="border-b border-line px-2.5 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
            <th className="border-b border-line bg-subtle px-3 py-2 text-center font-medium text-muted">Strike</th>
            {cols.map((c) => (
              <th key={`hp-${c.key}`} title={c.title} className="border-b border-line px-2.5 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((row, i) => (
            <Fragment key={row.strike}>
              {i === spotIndex && <SpotRow spot={chain.spot} colSpan={cols.length * 2 + 1} />}
              <tr className="row-hover border-b border-line/70">
                {callCols.map((c, j) => cell("call", row, c, j === 0))}
                <td className="num bg-subtle px-3 py-2 text-center text-[13px] font-semibold text-ink">{fmtPrice(row.strike, row.strike % 1 ? 2 : 0)}</td>
                {cols.map((c) => cell("put", row, c, false))}
              </tr>
            </Fragment>
          ))}
          {spotIndex === rows.length && <SpotRow spot={chain.spot} colSpan={cols.length * 2 + 1} />}
        </tbody>
      </table>
    </div>
  );
}

function SpotRow({ spot, colSpan }: { spot: number; colSpan: number }) {
  return (
    <tr data-spot>
      <td colSpan={colSpan} className="p-0">
        <div className="relative flex h-7 items-center justify-center">
          <div className="absolute inset-x-0 top-1/2 h-px bg-accent" />
          <span className="num relative rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-surface">
            Spot ${fmtPrice(spot)}
          </span>
        </div>
      </td>
    </tr>
  );
}
