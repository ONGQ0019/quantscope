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
  type DeepPartial,
  type ChartOptions,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import { alpha, tokens, useTheme } from "@/lib/client/theme";
import type { SimPoint } from "@/lib/quant/simulate";

function baseOptions(t: ReturnType<typeof tokens>): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: t.faint,
      fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui",
      fontSize: 11,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: t.lineStrong, style: LineStyle.Solid, labelBackgroundColor: t.muted },
      horzLine: { color: t.lineStrong, style: LineStyle.Dashed, labelBackgroundColor: t.muted },
    },
    handleScroll: false,
    handleScale: false,
  };
}

function reveal(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  gsap.fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power2.inOut" });
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
  const { theme } = useTheme();
  const [hover, setHover] = useState<{ date: string; value: number; invested: number; bench: number | null } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) return;
    const t = tokens();
    const chart = createChart(el, { ...baseOptions(t), rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } } });
    const last = points[points.length - 1];
    const color = last.value >= last.invested ? t.up : t.down;
    const main = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: alpha(color, theme === "dark" ? 0.16 : 0.12),
      bottomColor: alpha(color, 0),
      priceLineVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    main.setData(points.map((p) => ({ time: p.date as Time, value: p.value })));

    const invested = chart.addSeries(LineSeries, {
      color: t.faint,
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
      const b = chart.addSeries(LineSeries, { color: t.accent, lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 3 });
      b.setData(benchmark.map((p) => ({ time: p.date as Time, value: p.value })));
      benchmark.forEach((p) => benchByDate.set(p.date, p.value));
    }
    chart.timeScale().fitContent();
    const byDate = new Map(points.map((p) => [p.date, p]));
    chart.subscribeCrosshairMove((p) => {
      const pt = p.time ? byDate.get(p.time as string) : undefined;
      setHover(pt ? { date: pt.date, value: pt.value, invested: pt.invested, bench: benchByDate.get(pt.date) ?? null } : null);
    });
    reveal(el);
    return () => chart.remove();
  }, [points, benchmark, theme]);

  const last = points[points.length - 1];
  const shown = hover ?? (last ? { date: last.date, value: last.value, invested: last.invested, bench: benchmark?.at(-1)?.value ?? null } : null);
  const up = last ? last.value >= last.invested : true;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {shown && <span className="font-medium text-ink">{fmtDate(shown.date)}</span>}
        <span className="flex items-center gap-1.5 text-muted">
          <span className={up ? "h-0.5 w-3 rounded bg-up" : "h-0.5 w-3 rounded bg-down"} /> {ticker} <span className="num text-ink">{fmtUsd(shown?.value, 0)}</span>
        </span>
        {benchmarkTicker && (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-0.5 w-3 rounded bg-accent" /> {benchmarkTicker} <span className="num text-ink">{fmtUsd(shown?.bench, 0)}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5 text-muted">
          <span className="w-3 border-t border-dashed border-faint" /> Invested <span className="num text-ink">{fmtUsd(shown?.invested, 0)}</span>
        </span>
      </div>
      <div ref={ref} className="mt-3 h-[320px] w-full" />
    </div>
  );
}

export function DrawdownChart({ points }: { points: SimPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) return;
    const t = tokens();
    const chart = createChart(el, { ...baseOptions(t), rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.05 } } });
    const s = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: "rgba(0,0,0,0)",
      topFillColor1: "rgba(0,0,0,0)",
      topFillColor2: "rgba(0,0,0,0)",
      bottomLineColor: t.down,
      bottomFillColor1: alpha(t.down, 0.04),
      bottomFillColor2: alpha(t.down, theme === "dark" ? 0.28 : 0.2),
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "custom", formatter: (v: number) => fmtPct(v / 100, 0) },
    });
    s.setData(points.map((p) => ({ time: p.date as Time, value: p.drawdown * 100 })));
    chart.timeScale().fitContent();
    reveal(el);
    return () => chart.remove();
  }, [points, theme]);
  return <div ref={ref} className="h-[180px] w-full" />;
}
