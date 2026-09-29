"use client";

import clsx from "clsx";
import { Download, Minus, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { fmtDate, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { analyzeStrategy, type Market } from "@/lib/quant/strategy";
import type { Chain, ChainRow, ChainSide } from "@/lib/server/options";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { PayoffChart } from "./PayoffChart";

export interface LegState {
  id: string;
  contract: string;
  type: "call" | "put";
  strike: number;
  qty: number;
  premium: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  source: "live" | "model" | "eod";
}

export function legFromSide(type: "call" | "put", row: ChainRow, side: ChainSide, qty: number, chain: Chain): LegState {
  return {
    id: `${side.contract}-${Math.random().toString(36).slice(2, 7)}`,
    contract: side.contract,
    type,
    strike: row.strike,
    qty,
    premium: side.price ?? 0,
    iv: side.iv ?? chain.hv30,
    delta: side.delta ?? 0,
    gamma: side.gamma ?? 0,
    theta: side.theta ?? 0,
    vega: side.vega ?? 0,
    source: chain.mode,
  };
}

type Preset = { name: string; build: (c: Chain) => LegState[] | null; hint: string };

function byDelta(c: Chain, type: "call" | "put", target: number) {
  let best: { row: ChainRow; side: ChainSide } | null = null;
  for (const row of c.rows) {
    const side = row[type];
    if (!side?.delta || !side.price) continue;
    if (!best || Math.abs(Math.abs(side.delta) - target) < Math.abs(Math.abs(best.side.delta!) - target)) best = { row, side };
  }
  return best;
}

function leg(c: Chain, type: "call" | "put", target: number, qty: number) {
  const hit = byDelta(c, type, target);
  return hit ? legFromSide(type, hit.row, hit.side, qty, c) : null;
}

function all(...legs: (LegState | null)[]) {
  return legs.every(Boolean) ? (legs as LegState[]) : null;
}

const PRESETS: Preset[] = [
  { name: "Long call", hint: "Bullish, defined risk", build: (c) => all(leg(c, "call", 0.5, 1)) },
  { name: "Long put", hint: "Bearish, defined risk", build: (c) => all(leg(c, "put", 0.5, 1)) },
  { name: "Straddle", hint: "Big move either way", build: (c) => all(leg(c, "call", 0.5, 1), leg(c, "put", 0.5, 1)) },
  { name: "Strangle", hint: "Cheaper big-move bet", build: (c) => all(leg(c, "call", 0.25, 1), leg(c, "put", 0.25, 1)) },
  { name: "Bull call spread", hint: "Moderately bullish", build: (c) => all(leg(c, "call", 0.5, 1), leg(c, "call", 0.3, -1)) },
  { name: "Bear put spread", hint: "Moderately bearish", build: (c) => all(leg(c, "put", 0.5, 1), leg(c, "put", 0.3, -1)) },
  {
    name: "Iron condor",
    hint: "Range-bound, collect premium",
    build: (c) => all(leg(c, "put", 0.1, 1), leg(c, "put", 0.2, -1), leg(c, "call", 0.2, -1), leg(c, "call", 0.1, 1)),
  },
  { name: "Cash-secured put", hint: "Get paid to buy lower", build: (c) => all(leg(c, "put", 0.3, -1)) },
];

export function StrategyPanel({
  chain,
  legs,
  setLegs,
}: {
  chain: Chain;
  legs: LegState[];
  setLegs: React.Dispatch<React.SetStateAction<LegState[]>>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const market: Market = useMemo(
    () => ({ spot: chain.spot, r: chain.r, q: chain.q, T: chain.T, sigma: chain.atmIv ?? chain.hv30 }),
    [chain.spot, chain.r, chain.q, chain.T, chain.atmIv, chain.hv30],
  );
  const stratLegs = useMemo(() => legs.map((l) => ({ type: l.type, strike: l.strike, qty: l.qty, premium: l.premium, iv: l.iv })), [legs]);
  const stats = useMemo(() => analyzeStrategy(stratLegs, market), [stratLegs, market]);
  const greeks = useMemo(
    () =>
      legs.reduce(
        (g, l) => ({
          delta: g.delta + l.qty * l.delta * 100,
          gamma: g.gamma + l.qty * l.gamma * 100,
          theta: g.theta + l.qty * l.theta * 100,
          vega: g.vega + l.qty * l.vega * 100,
        }),
        { delta: 0, gamma: 0, theta: 0, vega: 0 },
      ),
    [legs],
  );

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-leg]:not([data-in])", {
        opacity: 0,
        x: 8,
        duration: 0.35,
        stagger: 0.04,
        ease: "power2.out",
        onStart() {
          ref.current?.querySelectorAll("[data-leg]").forEach((el) => el.setAttribute("data-in", ""));
        },
      });
    },
    { scope: ref, dependencies: [legs.length] },
  );

  const update = (id: string, patch: Partial<LegState>) => setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const loadLastTrade = async (l: LegState) => {
    setLoading(l.id);
    setFailed(null);
    try {
      const res = await fetch(`/api/options/contract/${encodeURIComponent(l.contract)}`);
      const data = await res.json();
      if (!res.ok || !data.found) {
        setFailed(l.id);
        return;
      }
      {
        update(l.id, {
          premium: data.close,
          iv: data.iv ?? l.iv,
          delta: data.greeks?.delta ?? l.delta,
          gamma: data.greeks?.gamma ?? l.gamma,
          theta: data.greeks?.theta ?? l.theta,
          vega: data.greeks?.vega ?? l.vega,
          source: "eod",
        });
      }
    } catch {
      setFailed(l.id);
    } finally {
      setLoading(null);
    }
  };

  const debit = stats.netPremium > 0;

  return (
    <div ref={ref} className="space-y-5">
      <div>
        <p className="label mb-2">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              title={p.hint}
              onClick={() => {
                const built = p.build(chain);
                if (built) setLegs(built);
              }}
              className="chip transition-colors hover:border-line-strong hover:text-ink"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {legs.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-medium">Build a position</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Click any call or put in the chain to add it as a leg, or start from a preset above.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="label">
                Legs · {fmtDate(chain.expiration, { month: "short", day: "numeric", year: "2-digit" })}
              </p>
              <button onClick={() => setLegs([])} className="flex items-center gap-1 text-[11px] text-faint hover:text-down">
                <Trash2 className="size-3" /> Clear
              </button>
            </div>
            {legs.map((l) => (
              <div key={l.id} data-leg className="rounded-lg border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => update(l.id, { qty: -l.qty })}
                    className={clsx(
                      "w-12 rounded-md py-1 text-[11px] font-semibold transition-colors",
                      l.qty > 0 ? "bg-up/10 text-up hover:bg-up/15" : "bg-down/10 text-down hover:bg-down/15",
                    )}
                    title="Toggle buy / sell"
                  >
                    {l.qty > 0 ? "BUY" : "SELL"}
                  </button>
                  <div className="flex items-center rounded-md border border-line">
                    <button className="px-1.5 py-1 text-muted hover:text-ink" onClick={() => update(l.id, { qty: Math.sign(l.qty) * Math.max(1, Math.abs(l.qty) - 1) })}>
                      <Minus className="size-3" />
                    </button>
                    <span className="num w-6 text-center text-xs">{Math.abs(l.qty)}</span>
                    <button className="px-1.5 py-1 text-muted hover:text-ink" onClick={() => update(l.id, { qty: Math.sign(l.qty) * Math.min(999, Math.abs(l.qty) + 1) })}>
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <p className="num flex-1 text-sm font-medium">
                    {fmtPrice(l.strike, l.strike % 1 ? 2 : 0)} <span className={l.type === "call" ? "text-up" : "text-down"}>{l.type === "call" ? "Call" : "Put"}</span>
                  </p>
                  <button onClick={() => setLegs((ls) => ls.filter((x) => x.id !== l.id))} className="text-faint hover:text-ink" aria-label="Remove leg">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
                  <label className="flex items-center gap-1">
                    @ $
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={Number(l.premium.toFixed(2))}
                      onChange={(e) => update(l.id, { premium: Math.max(0, Number(e.target.value) || 0) })}
                      className="num w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent"
                    />
                  </label>
                  <span>IV {fmtPct(l.iv, 1, false)}</span>
                  <span className="chip h-5 px-1.5 text-[10px]">
                    {l.source === "model" ? "model" : l.source === "eod" ? "last close" : "live"}
                  </span>
                  {chain.mode === "model" && (
                    <button onClick={() => loadLastTrade(l)} disabled={loading === l.id} className="ml-auto flex items-center gap-1 text-accent hover:underline disabled:opacity-50">
                      <Download className="size-3" />
                      {loading === l.id ? "Loading…" : failed === l.id ? "No trade found — retry" : "Use last trade"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric label={debit ? "Net debit" : "Net credit"} value={<AnimatedNumber value={Math.abs(stats.netPremium)} format={(n) => fmtUsd(n, 0)} />} />
            <Metric label="Prob. of profit" value={<AnimatedNumber value={stats.probProfit != null ? stats.probProfit * 100 : null} format={(n) => `${n.toFixed(1)}%`} />} />
            <Metric label="Max profit" tone="up" value={stats.maxProfit == null ? "Unlimited" : fmtUsd(stats.maxProfit, 0)} />
            <Metric label="Max loss" tone="down" value={stats.maxLoss == null ? "Unlimited" : fmtUsd(stats.maxLoss, 0)} />
          </div>
          <p className="text-xs text-muted">
            Breakeven{stats.breakevens.length > 1 ? "s" : ""} at expiry:{" "}
            <span className="num font-medium text-ink">{stats.breakevens.length ? stats.breakevens.map((b) => `$${fmtPrice(b)}`).join(" · ") : "none"}</span>
          </p>

          <PayoffChart legs={stratLegs} market={market} breakevens={stats.breakevens} />

          <div className="grid grid-cols-4 gap-2 rounded-lg bg-subtle p-3 text-center">
            {(
              [
                ["Δ Delta", greeks.delta, 1],
                ["Γ Gamma", greeks.gamma, 2],
                ["Θ Theta/day", greeks.theta, 2],
                ["V Vega", greeks.vega, 2],
              ] as const
            ).map(([label, v, d]) => (
              <div key={label}>
                <p className="text-[10px] text-faint">{label}</p>
                <p className={clsx("num mt-0.5 text-sm", v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted")}>{v.toFixed(d)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            Position greeks are per 100-share contract. Probability of profit assumes a lognormal price at expiry with{" "}
            {chain.atmIv ? "at-the-money implied" : "30-day historical"} volatility of {fmtPct(market.sigma, 1, false)}. US equity options are American-style;
            curves use Black-Scholes marks.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("num mt-1 text-lg font-semibold", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink")}>{value}</p>
    </div>
  );
}
