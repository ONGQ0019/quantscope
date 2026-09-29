"use client";

import clsx from "clsx";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { isoDate } from "@/lib/dates";
import { fmtCompact, fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import { Segmented } from "../ui/Segmented";

type BarTuple = readonly [number, number, number, number, number, number];
type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
type Mode = "area" | "candles";

const UP = "#34d399";
const DOWN = "#fb7185";
const SMA_COLORS: Record<number, string> = { 20: "#fbbf24", 50: "#38e1ff", 200: "#f472b6" };

function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  });
  return out;
}

function rangeStart(range: Range, lastDate: string): string | null {
  const d = new Date(lastDate + "T00:00:00Z");
  if (range === "ALL") return null;
  if (range === "YTD") return `${lastDate.slice(0, 4)}-01-01`;
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[range];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function PriceChart({ bars, historyYears }: { bars: BarTuple[]; historyYears: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<Range>("1Y");
  const [mode, setMode] = useState<Mode>("area");
  const [smas, setSmas] = useState<number[]>([50]);
  const [hover, setHover] = useState<{ date: string; o: number; h: number; l: number; c: number; v: number } | null>(null);

  const all = useMemo(() => bars.map(([t, o, h, l, c, v]) => ({ date: isoDate(t), o, h, l, c, v })), [bars]);
  const smaSeries = useMemo(() => {
    const closes = all.map((b) => b.c);
    return Object.fromEntries([20, 50, 200].map((n) => [n, sma(closes, n)])) as Record<number, (number | null)[]>;
  }, [all]);

  const startIdx = useMemo(() => {
    if (!all.length) return 0;
    const start = rangeStart(range, all[all.length - 1].date);
    if (!start) return 0;
    const i = all.findIndex((b) => b.date >= start);
    return i < 0 ? 0 : i;
  }, [all, range]);
  const visible = useMemo(() => all.slice(startIdx), [all, startIdx]);
  const first = visible[0];
  const last = visible[visible.length - 1];
  const rangeRet = first && last ? last.c / first.c - 1 : null;
  const positive = (rangeRet ?? 0) >= 0;

  useEffect(() => {
    const el = holder.current;
    if (!el || !visible.length) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8d93a6",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(139,123,255,0.5)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a2550" },
        horzLine: { color: "rgba(139,123,255,0.35)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a2550" },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const color = positive ? UP : DOWN;

    let main: ISeriesApi<SeriesType>;
    if (mode === "area") {
      main = chart.addSeries(AreaSeries, {
        lineColor: color,
        lineWidth: 2,
        topColor: positive ? "rgba(52,211,153,0.28)" : "rgba(251,113,133,0.28)",
        bottomColor: "rgba(0,0,0,0)",
        priceLineVisible: false,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: "#05060a",
        crosshairMarkerBackgroundColor: color,
      });
      main.setData(visible.map((b) => ({ time: b.date as Time, value: b.c })));
    } else {
      main = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceLineVisible: false,
      });
      main.setData(visible.map((b) => ({ time: b.date as Time, open: b.o, high: b.h, low: b.l, close: b.c })));
    }

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vol.setData(
      visible.map((b, i) => ({
        time: b.date as Time,
        value: b.v,
        color: (i === 0 ? b.c >= b.o : b.c >= visible[i - 1].c) ? "rgba(52,211,153,0.28)" : "rgba(251,113,133,0.28)",
      })),
    );

    for (const n of smas) {
      const line = chart.addSeries(LineSeries, {
        color: SMA_COLORS[n],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(
        visible.flatMap((b, i) => {
          const v = smaSeries[n][startIdx + i];
          return v == null ? [] : [{ time: b.date as Time, value: v }];
        }),
      );
    }

    chart.timeScale().fitContent();
    const byDate = new Map(visible.map((b) => [b.date, b]));
    chart.subscribeCrosshairMove((p) => {
      const b = p.time ? byDate.get(p.time as string) : undefined;
      setHover(b ? { date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } : null);
    });

    if (!prefersReducedMotion()) {
      gsap.fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.inOut" });
    }

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [visible, mode, smas, positive, smaSeries, startIdx]);

  const shown = hover ?? (last ? { date: last.date, o: last.o, h: last.h, l: last.l, c: last.c, v: last.v } : null);
  const ranges: { value: Range; label: string; disabled?: boolean }[] = [
    { value: "1M", label: "1M" },
    { value: "3M", label: "3M" },
    { value: "6M", label: "6M" },
    { value: "YTD", label: "YTD" },
    { value: "1Y", label: "1Y" },
    { value: "ALL", label: historyYears >= 1 ? `${historyYears}Y` : "All" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {shown && (
            <>
              <span className="text-muted">{fmtDate(shown.date)}</span>
              {(["o", "h", "l", "c"] as const).map((k) => (
                <span key={k} className="text-faint">
                  {k.toUpperCase()} <span className="num text-ink">{fmtPrice(shown[k])}</span>
                </span>
              ))}
              <span className="text-faint">
                Vol <span className="num text-ink">{fmtCompact(shown.v)}</span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx("num text-sm font-medium", positive ? "text-up" : "text-down")}>
            {fmtPct(rangeRet)} <span className="text-xs font-normal text-faint">{range === "ALL" ? "all" : range}</span>
          </span>
        </div>
      </div>

      <div ref={holder} className="relative mt-3 h-[360px] w-full sm:h-[420px]" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Range> value={range} onChange={setRange} options={ranges} />
        <div className="flex items-center gap-2">
          {[20, 50, 200].map((n) => (
            <button
              key={n}
              onClick={() => setSmas((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}
              className={clsx("chip transition-colors", smas.includes(n) ? "text-ink" : "opacity-60 hover:opacity-100")}
              style={smas.includes(n) ? { borderColor: SMA_COLORS[n] + "66", color: SMA_COLORS[n] } : undefined}
            >
              SMA {n}
            </button>
          ))}
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "area", label: "Area" },
              { value: "candles", label: "Candles" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
