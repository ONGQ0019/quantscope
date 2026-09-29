"use client";

import { useId, useMemo, useRef, useState } from "react";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { pnlAt, pnlAtExpiry, type Market, type StrategyLeg } from "@/lib/quant/strategy";

const W = 640;
const H = 300;
const PAD = { l: 8, r: 8, t: 18, b: 30 };

export function PayoffChart({ legs, market, breakevens }: { legs: StrategyLeg[]; market: Market; breakevens: number[] }) {
  const uid = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const model = useMemo(() => {
    const spread = Math.max(market.sigma * Math.sqrt(Math.max(market.T, 7 / 365)) * 2.6, 0.12);
    const strikes = legs.map((l) => l.strike);
    const lo = Math.max(0.01, Math.min(market.spot * (1 - spread), ...strikes.map((k) => k * 0.95)));
    const hi = Math.max(market.spot * (1 + spread), ...strikes.map((k) => k * 1.05));
    const N = 180;
    const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
    const exp = xs.map((x) => pnlAtExpiry(legs, x));
    const now = xs.map((x) => pnlAt(legs, x, market.T, market));
    const half = xs.map((x) => pnlAt(legs, x, market.T / 2, market));
    const all = [...exp, ...now, 0];
    let yMin = Math.min(...all);
    let yMax = Math.max(...all);
    const pad = (yMax - yMin || 100) * 0.12;
    yMin -= pad;
    yMax += pad;
    const sx = (x: number) => PAD.l + ((x - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
    const sy = (y: number) => PAD.t + ((yMax - y) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join("");
    const y0 = sy(0);
    return {
      lo,
      hi,
      xs,
      exp,
      now,
      sx,
      sy,
      y0,
      expPath: path(exp),
      expArea: `${path(exp)}L${sx(hi)},${y0}L${sx(lo)},${y0}Z`,
      nowPath: path(now),
      halfPath: path(half),
      ticks: Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 5),
    };
  }, [legs, market]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const line = svg.current?.querySelector<SVGPathElement>("[data-exp]");
      if (line) {
        const len = line.getTotalLength();
        gsap.fromTo(svg.current!.querySelectorAll("[data-exp]"), { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" });
      }
      gsap.fromTo(svg.current!.querySelectorAll("[data-area], [data-now]"), { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.3 });
    },
    { scope: svg, dependencies: [model.expPath] },
  );

  const idx = hoverX == null ? null : Math.round(((hoverX - model.lo) / (model.hi - model.lo)) * (model.xs.length - 1));
  const hi = idx != null && idx >= 0 && idx < model.xs.length ? idx : null;

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHoverX(model.lo + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (model.hi - model.lo));
  };

  const mono = { fontFamily: "var(--font-geist-sans)" };
  return (
    <div className="relative">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHoverX(null)}>
        <defs>
          <clipPath id={`up${uid}`}>
            <rect x="0" y="0" width={W} height={Math.max(0, model.y0)} />
          </clipPath>
          <clipPath id={`dn${uid}`}>
            <rect x="0" y={model.y0} width={W} height={Math.max(0, H - model.y0)} />
          </clipPath>
        </defs>

        {model.ticks.map((t) => (
          <g key={t}>
            <line x1={model.sx(t)} x2={model.sx(t)} y1={PAD.t} y2={H - PAD.b} style={{ stroke: "var(--line)" }} />
            <text x={model.sx(t)} y={H - 8} textAnchor="middle" className="fill-faint text-[13px]" style={mono}>
              {fmtPrice(t, t >= 100 ? 0 : 2)}
            </text>
          </g>
        ))}

        <path data-area d={model.expArea} style={{ fill: "var(--up)", fillOpacity: 0.08 }} clipPath={`url(#up${uid})`} />
        <path data-area d={model.expArea} style={{ fill: "var(--down)", fillOpacity: 0.08 }} clipPath={`url(#dn${uid})`} />
        <line x1={PAD.l} x2={W - PAD.r} y1={model.y0} y2={model.y0} style={{ stroke: "var(--line-strong)" }} />

        <path data-now d={model.halfPath} fill="none" strokeWidth="1.2" strokeDasharray="2 4" style={{ stroke: "var(--faint)" }} />
        <path data-now d={model.nowPath} fill="none" strokeWidth="1.5" strokeDasharray="5 4" style={{ stroke: "var(--accent)" }} />
        <path data-exp d={model.expPath} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: "var(--up)" }} clipPath={`url(#up${uid})`} />
        <path data-exp d={model.expPath} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: "var(--down)" }} clipPath={`url(#dn${uid})`} />

        <line x1={model.sx(market.spot)} x2={model.sx(market.spot)} y1={PAD.t} y2={H - PAD.b} strokeDasharray="3 3" style={{ stroke: "var(--muted)" }} />
        <text x={model.sx(market.spot) + 6} y={PAD.t + 10} className="fill-muted text-[13px]" style={mono}>
          Spot {fmtPrice(market.spot)}
        </text>

        {breakevens
          .filter((b) => b > model.lo && b < model.hi)
          .map((b) => (
            <circle key={b} cx={model.sx(b)} cy={model.y0} r="4" strokeWidth="2" style={{ fill: "var(--surface)", stroke: "var(--ink)" }} />
          ))}

        {hi != null && (
          <g pointerEvents="none">
            <line x1={model.sx(model.xs[hi])} x2={model.sx(model.xs[hi])} y1={PAD.t} y2={H - PAD.b} style={{ stroke: "var(--line-strong)" }} />
            <circle cx={model.sx(model.xs[hi])} cy={model.sy(model.exp[hi])} r="4" style={{ fill: model.exp[hi] >= 0 ? "var(--up)" : "var(--down)" }} />
            <circle cx={model.sx(model.xs[hi])} cy={model.sy(model.now[hi])} r="3.5" style={{ fill: "var(--accent)" }} />
          </g>
        )}
      </svg>

      {hi != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: `clamp(8px, calc(${(model.sx(model.xs[hi]) / W) * 100}% + 12px), calc(100% - 170px))` }}
        >
          <p className="text-muted">
            Underlying <span className="num font-medium text-ink">${fmtPrice(model.xs[hi])}</span>
          </p>
          <p className="text-muted">
            At expiry <span className={`num font-medium ${model.exp[hi] >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(model.exp[hi], 0)}</span>
          </p>
          <p className="text-muted">
            Today <span className="num font-medium text-accent">{fmtUsd(model.now[hi], 0)}</span>
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-up" /> At expiry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-accent" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dotted border-faint" /> Halfway
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border-2 border-ink" /> Breakeven
        </span>
      </div>
    </div>
  );
}
