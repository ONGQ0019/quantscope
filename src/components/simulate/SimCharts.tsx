"use client";

import {
  AreaSeries,
  BaselineSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import type { SimPoint } from "@/lib/quant/simulate";

const base = {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "#8d93a6",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: 11,
  },
  grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
  crosshair: {
    mode: CrosshairMode.Magnet,
    vertLine: { color: "rgba(139,123,255,0.5)", style: LineStyle.Dashed, labelBackgroundColor: "#2a2550" },
    horzLine: { color: "rgba(139,123,255,0.3)", style: LineStyle.Dashed, labelBackgroundColor: "#2a2550" },
  },
  handleScroll: false,
  handleScale: false,
} as const;

function wipe(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  gsap.fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut" });
}

export function GrowthChart({
  points,
  benchmark,
  ticker,
  benchmarkTicker,
}: {
  points: SimPoint[];
  benchmark: SimPoint[] | null;
  ticker: string;
  benchmarkTicker: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ date: string; value: number; invested: number; bench: number | null } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) return;
    const chart = createChart(el, { ...base, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } } });
    const up = points[points.length - 1].value >= points[points.length - 1].invested;
    const main = chart.addSeries(AreaSeries, {
      lineColor: up ? "#34d399" : "#fb7185",
      lineWidth: 2,
      topColor: up ? "rgba(52,211,153,0.3)" : "rgba(251,113,133,0.3)",
      bottomColor: "rgba(0,0,0,0)",
      priceLineVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    main.setData(points.map((p) => ({ time: p.date as Time, value: p.value })));

    const invested = chart.addSeries(LineSeries, {
      color: "rgba(255,255,255,0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineType: LineType.WithSteps,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    invested.setData(points.map((p) => ({ time: p.date as Time, value: p.invested })));

    const benchByDate = new Map<string, number>();
    if (benchmark?.length) {
      const b = chart.addSeries(LineSeries, { color: "#8b7bff", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
      b.setData(benchmark.map((p) => ({ time: p.date as Time, value: p.value })));
      benchmark.forEach((p) => benchByDate.set(p.date, p.value));
    }
    chart.timeScale().fitContent();
    const byDate = new Map(points.map((p) => [p.date, p]));
    chart.subscribeCrosshairMove((p) => {
      const pt = p.time ? byDate.get(p.time as string) : undefined;
      setHover(pt ? { date: pt.date, value: pt.value, invested: pt.invested, bench: benchByDate.get(pt.date) ?? null } : null);
    });
    wipe(el);
    return () => chart.remove();
  }, [points, benchmark]);

  const last = points[points.length - 1];
  const shown = hover ?? (last ? { date: last.date, value: last.value, invested: last.invested, bench: benchmark?.at(-1)?.value ?? null } : null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {shown && <span className="text-muted">{fmtDate(shown.date)}</span>}
        <span className="flex items-center gap-1.5 text-faint">
          <span className="h-0.5 w-3 rounded bg-up" /> {ticker} <span className="num text-ink">{fmtUsd(shown?.value, 0)}</span>
        </span>
        {benchmarkTicker && (
          <span className="flex items-center gap-1.5 text-faint">
            <span className="h-0.5 w-3 rounded bg-accent" /> {benchmarkTicker} <span className="num text-ink">{fmtUsd(shown?.bench, 0)}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5 text-faint">
          <span className="h-0 w-3 border-t border-dashed border-white/50" /> Invested <span className="num text-ink">{fmtUsd(shown?.invested, 0)}</span>
        </span>
      </div>
      <div ref={ref} className="mt-3 h-[340px] w-full" />
    </div>
  );
}

export function DrawdownChart({ points }: { points: SimPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) return;
    const chart = createChart(el, { ...base, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.05 } } });
    const s = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: "rgba(0,0,0,0)",
      topFillColor1: "rgba(0,0,0,0)",
      topFillColor2: "rgba(0,0,0,0)",
      bottomLineColor: "#fb7185",
      bottomFillColor1: "rgba(251,113,133,0.05)",
      bottomFillColor2: "rgba(251,113,133,0.35)",
      lineWidth: 1,
      priceLineVisible: false,
      priceFormat: { type: "custom", formatter: (v: number) => fmtPct(v / 100, 0) },
    });
    s.setData(points.map((p) => ({ time: p.date as Time, value: p.drawdown * 100 })));
    chart.timeScale().fitContent();
    wipe(el);
    return () => chart.remove();
  }, [points]);
  return <div ref={ref} className="h-[160px] w-full" />;
}
