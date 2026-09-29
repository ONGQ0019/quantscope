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
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { isoDate } from "@/lib/dates";
import { fmtCompact, fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import { alpha, tokens, useTheme } from "@/lib/client/theme";
import { Segmented } from "../ui/Segmented";

type BarTuple = readonly [number, number, number, number, number, number];
type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
type Mode = "area" | "candles";

const SMA_TOKEN: Record<number, "warn" | "accent" | "muted"> = { 20: "warn", 50: "accent", 200: "muted" };

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
  const { theme } = useTheme();
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
    const t = tokens();
    const color = positive ? t.up : t.down;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: t.faint,
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.22 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: t.lineStrong, width: 1, style: LineStyle.Solid, labelBackgroundColor: t.muted },
        horzLine: { color: t.lineStrong, width: 1, style: LineStyle.Dashed, labelBackgroundColor: t.muted },
      },
      handleScroll: false,
      handleScale: false,
    });

    let main: ISeriesApi<SeriesType>;
    if (mode === "area") {
      main = chart.addSeries(AreaSeries, {
        lineColor: color,
        lineWidth: 2,
        topColor: alpha(color, theme === "dark" ? 0.16 : 0.12),
        bottomColor: alpha(color, 0),
        priceLineVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: t.surface,
        crosshairMarkerBackgroundColor: color,
      });
      main.setData(visible.map((b) => ({ time: b.date as Time, value: b.c })));
    } else {
      main = chart.addSeries(CandlestickSeries, {
        upColor: t.up,
        downColor: t.down,
        borderVisible: false,
        wickUpColor: t.up,
        wickDownColor: t.down,
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
        color: alpha((i === 0 ? b.c >= b.o : b.c >= visible[i - 1].c) ? t.up : t.down, 0.28),
      })),
    );

    for (const n of smas) {
      const line = chart.addSeries(LineSeries, {
        color: t[SMA_TOKEN[n]] || t.muted,
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
      gsap.fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power2.inOut" });
    }
    return () => chart.remove();
  }, [visible, mode, smas, positive, smaSeries, startIdx, theme]);

  const shown = hover ?? (last ? { date: last.date, o: last.o, h: last.h, l: last.l, c: last.c, v: last.v } : null);
  const ranges: { value: Range; label: string }[] = [
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
              <span className="font-medium text-ink">{fmtDate(shown.date)}</span>
              {(["o", "h", "l", "c"] as const).map((k) => (
                <span key={k} className="text-faint">
                  {k.toUpperCase()} <span className="num text-muted">{fmtPrice(shown[k])}</span>
                </span>
              ))}
              <span className="text-faint">
                Vol <span className="num text-muted">{fmtCompact(shown.v)}</span>
              </span>
            </>
          )}
        </div>
        <span className={clsx("num text-sm font-medium", positive ? "text-up" : "text-down")}>
          {fmtPct(rangeRet)} <span className="text-xs font-normal text-faint">{range === "ALL" ? "all" : range}</span>
        </span>
      </div>

      <div ref={holder} className="relative mt-3 h-[340px] w-full sm:h-[400px]" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Range> value={range} onChange={setRange} options={ranges} />
        <div className="flex items-center gap-1.5">
          {[20, 50, 200].map((n) => {
            const on = smas.includes(n);
            return (
              <button
                key={n}
                onClick={() => setSmas((s) => (on ? s.filter((x) => x !== n) : [...s, n]))}
                className={clsx("chip transition-colors", on ? "border-line-strong text-ink" : "hover:text-ink")}
              >
                <span className={clsx("size-1.5 rounded-full", on ? { 20: "bg-warn", 50: "bg-accent", 200: "bg-muted" }[n] : "bg-line-strong")} />
                SMA {n}
              </button>
            );
          })}
          <Segmented<Mode>
            className="ml-1"
            value={mode}
            onChange={setMode}
            options={[
              { value: "area", label: "Line" },
              { value: "candles", label: "Candles" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
