"use client";

import {
  BaselineSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type DeepPartial,
  type ChartOptions,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { fmtPct } from "@/lib/format";
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
