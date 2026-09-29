"use client";

import clsx from "clsx";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { durationLabel, fmtDate, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import type { SimPoint } from "@/lib/quant/simulate";
import { findMilestones, type Milestone } from "@/lib/quant/story";

type Props = {
  name: string;
  /** name as it reads mid-sentence, e.g. "the S&P 500" */
  subject: string;
  benchLabel: string | null;
  points: SimPoint[];
  bench: SimPoint[] | null;
  initial: number;
  monthly: number;
  /** Changing this replays the animation from the start; other changes just redraw. */
  replayKey: string;
  loading: boolean;
};

const PAD = { l: 4, r: 60, t: 28, b: 26 };
const DAY = 86_400_000;

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Value at time t, linearly interpolated so the playhead dot sits exactly on the drawn line. */
function sample(times: number[], vals: number[], t: number) {
  const n = times.length;
  if (t <= times[0]) return { v: vals[0], i: 0 };
  if (t >= times[n - 1]) return { v: vals[n - 1], i: n - 1 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - times[lo]) / (times[hi] - times[lo]);
  return { v: vals[lo] + (vals[hi] - vals[lo]) * f, i: lo };
}

function multipleWord(m: number) {
  if (m === 2) return "doubled";
  if (m === 3) return "tripled";
  return `grew ${m}×`;
}

function momentText(m: Milestone, points: SimPoint[]): { title: string; body: string; tone: "up" | "down" | "neutral" } {
  const last = points[points.length - 1];
  switch (m.kind) {
    case "drop":
      return {
        title: `Worst drop: ${fmtPct(m.pct, 1)}`,
        body: `From its high on ${fmtDate(m.peakDate)} to ${fmtDate(m.date)}. Your investment was worth ${fmtUsd(m.value, 0)} at the bottom.`,
        tone: "down",
      };
    case "recover":
      return {
        title: "Fully recovered",
        body: `Back to its old high on ${fmtDate(m.date)}, ${durationLabel(m.days)} after the bottom.`,
        tone: "up",
      };
    case "gain":
      return {
        title: `Your money ${multipleWord(m.multiple)}`,
        body: `By ${fmtDate(m.date)} it was worth ${fmtUsd(m.value, 0)}, ${m.multiple}× what you'd put in.`,
        tone: "up",
      };
    case "peak":
      return {
        title: `Highest point: ${fmtUsd(m.value, 0)}`,
        body: `On ${fmtDate(m.date)}. Today it's ${fmtPct(last.value / m.value - 1, 1)} below that.`,
        tone: "neutral",
      };
    case "loss":
      return {
        title: "Dipped below what you put in",
        body: `On ${fmtDate(m.date)} it was worth ${fmtUsd(m.value, 0)}, more than 10% under the money invested.`,
        tone: "down",
      };
  }
}

export function Journey({ name, subject, benchLabel, points, bench, initial, monthly, replayKey, loading }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const height = width && width < 640 ? 240 : 300;

  const clipRect = useRef<SVGRectElement>(null);
  const headLine = useRef<SVGLineElement>(null);
  const headDot = useRef<SVGCircleElement>(null);
  const benchDot = useRef<SVGCircleElement>(null);
  const headDate = useRef<HTMLDivElement>(null);
  const bigNum = useRef<HTMLSpanElement>(null);
  const gainChip = useRef<HTMLSpanElement>(null);
  const whenLabel = useRef<HTMLParagraphElement>(null);
  const benchVal = useRef<HTMLSpanElement>(null);
  const sAmount = useRef<HTMLSpanElement>(null);
  const sInvested = useRef<HTMLSpanElement>(null);
  const sPerDollar = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const markerEls = useRef<(SVGGElement | null)[]>([]);
  const momentEls = useRef<(HTMLDivElement | null)[]>([]);
  const shown = useRef<boolean[]>([]);

  const pos = useRef({ p: 1 });
  const rest = useRef(1);
  const tween = useRef<gsap.core.Tween | null>(null);
  const lastKey = useRef<string | null>(null);
  const [status, setStatus] = useState<"playing" | "paused" | "done">("done");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const milestones = useMemo(() => findMilestones(points), [points]);

  const geo = useMemo(() => {
    if (!width || points.length < 2) return null;
    const H = height;
    const times = points.map((p) => Date.parse(p.date + "T00:00:00Z"));
    const values = points.map((p) => p.value);
    const invested = points.map((p) => p.invested);
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const b = bench?.filter((p) => {
      const t = Date.parse(p.date + "T00:00:00Z");
      return t >= t0 && t <= t1;
    });
    const bTimes = b?.map((p) => Date.parse(p.date + "T00:00:00Z")) ?? [];
    const bValues = b?.map((p) => p.value) ?? [];
    const all = [...values, ...invested, ...bValues];
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || hi * 0.05;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const X = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (width - PAD.l - PAD.r);
    const Y = (v: number) => PAD.t + ((hi - v) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
    const line = (ts: number[], vs: number[]) => ts.map((t, i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(vs[i]).toFixed(1)}`).join("");
    const mainPath = line(times, values);
    let investedPath = `M${X(t0).toFixed(1)},${Y(invested[0]).toFixed(1)}`;
    for (let i = 1; i < times.length; i++) investedPath += `H${X(times[i]).toFixed(1)}V${Y(invested[i]).toFixed(1)}`;
    const step = niceStep((hi - lo) / 4);
    const yTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
    const span = (t1 - t0) / DAY;
    const nX = width < 640 ? 3 : 5;
    const xTicks = Array.from({ length: nX }, (_, k) => t0 + ((t1 - t0) * (k + 0.5)) / nX);
    return {
      H,
      times,
      values,
      invested,
      bTimes,
      bValues,
      t0,
      t1,
      X,
      Y,
      mainPath,
      areaPath: `${mainPath}L${X(t1).toFixed(1)},${H - PAD.b}L${X(t0).toFixed(1)},${H - PAD.b}Z`,
      benchPath: bTimes.length > 1 ? line(bTimes, bValues) : null,
      investedPath,
      yTicks,
      xTicks,
      xFormat: (t: number) =>
        new Date(t).toLocaleDateString("en-US", span > 500 ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" }),
      // Moments a few days apart would draw on top of each other: stack their badges.
      markers: milestones.reduce<{ x: number; y: number; t: number; lift: number }[]>((acc, m) => {
        const x = X(times[m.index]);
        const y = Y(values[m.index]);
        const prev = acc[acc.length - 1];
        const lift = prev && Math.abs(prev.x - x) < 22 && Math.abs(prev.y - prev.lift - (y - 0)) < 26 ? prev.lift + 22 : 0;
        acc.push({ x, y, t: times[m.index], lift });
        return acc;
      }, []),
      up: values[values.length - 1] >= invested[invested.length - 1],
    };
  }, [width, height, points, bench, milestones]);

  const geoRef = useRef(geo);
  useLayoutEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  /** Paint the whole scene for playhead position p ∈ [0, 1] (imperative: runs every animation frame). */
  const draw = useCallback(
    (p: number) => {
      const g = geoRef.current;
      if (!g) return;
      const t = g.t0 + p * (g.t1 - g.t0);
      const m = sample(g.times, g.values, t);
      const inv = g.invested[p >= 0.9999 ? g.invested.length - 1 : m.i];
      const x = g.X(t);
      const y = g.Y(m.v);
      clipRect.current?.setAttribute("width", String(Math.max(0, x + 1)));
      headLine.current?.setAttribute("x1", String(x));
      headLine.current?.setAttribute("x2", String(x));
      headDot.current?.setAttribute("cx", String(x));
      headDot.current?.setAttribute("cy", String(y));
      if (g.bTimes.length && benchDot.current) {
        const b = sample(g.bTimes, g.bValues, t);
        benchDot.current.setAttribute("cx", String(x));
        benchDot.current.setAttribute("cy", String(g.Y(b.v)));
        if (benchVal.current) benchVal.current.textContent = fmtUsd(b.v, 0);
      }
      const done = p >= 0.9999;
      const dateText = fmtDate(new Date(t).toISOString().slice(0, 10));
      if (headDate.current) {
        headDate.current.textContent = dateText;
        const w = headDate.current.offsetWidth;
        headDate.current.style.transform = `translateX(${Math.min(Math.max(x - w / 2, 0), width - w)}px)`;
      }
      if (bigNum.current) bigNum.current.textContent = fmtUsd(m.v, 0);
      if (whenLabel.current) whenLabel.current.textContent = done ? "you would have today" : `it was worth on ${dateText}`;
      if (gainChip.current) {
        const gain = m.v - inv;
        gainChip.current.textContent = `${gain >= 0 ? "+" : "−"}${fmtUsd(Math.abs(gain), 0)}  ${fmtPct(m.v / inv - 1, 1)}`;
        gainChip.current.classList.toggle("pill-up", gain >= 0);
        gainChip.current.classList.toggle("pill-down", gain < 0);
        if (sAmount.current) {
          sAmount.current.textContent = `${fmtUsd(Math.abs(gain), 0)} ${gain >= 0 ? "more" : "less"}`;
          sAmount.current.classList.toggle("text-up", gain >= 0);
          sAmount.current.classList.toggle("text-down", gain < 0);
        }
        if (sInvested.current) sInvested.current.textContent = fmtUsd(inv, 0);
        if (sPerDollar.current) sPerDollar.current.textContent = `$${(m.v / inv).toFixed(2)}`;
      }
      if (fill.current) fill.current.style.width = `${p * 100}%`;
      if (thumb.current) thumb.current.style.left = `${p * 100}%`;

      g.markers.forEach((mk, k) => {
        const on = mk.t <= t + DAY / 2;
        if (shown.current[k] === on) return;
        shown.current[k] = on;
        const el = markerEls.current[k];
        if (el) {
          // Animate attributes, not transforms, so markers stay put when the chart resizes.
          gsap.to(el, { opacity: on ? 1 : 0, duration: on ? 0.2 : 0.15 });
          gsap.to(el.querySelector("circle"), { attr: { r: on ? 9 : 0 }, duration: on ? 0.45 : 0.15, ease: on ? "back.out(2.6)" : "power2.in" });
        }
        momentEls.current[k]?.setAttribute("data-on", String(on));
      });
    },
    [width],
  );

  const duration = Math.min(7, Math.max(3.2, 2.2 + ((geo?.t1 ?? 0) - (geo?.t0 ?? 0)) / DAY / 365 * 1.1));

  const play = useCallback(
    (from?: number) => {
      tween.current?.kill();
      if (from != null) pos.current.p = from;
      if (pos.current.p >= 0.9999) pos.current.p = 0;
      const fresh = pos.current.p === 0;
      setStatus("playing");
      tween.current = gsap.to(pos.current, {
        p: 1,
        duration: duration * (1 - pos.current.p),
        ease: fresh ? "power1.inOut" : "none",
        onUpdate: () => {
          rest.current = pos.current.p;
          draw(pos.current.p);
        },
        onComplete: () => setStatus("done"),
      });
    },
    [draw, duration],
  );

  const pause = useCallback(() => {
    tween.current?.kill();
    setStatus("paused");
  }, []);

  // New geometry: reset markers, then either replay (new scenario) or redraw in place (resize, amount tweak).
  useEffect(() => {
    if (!geo) return;
    shown.current = geo.markers.map(() => false);
    markerEls.current.forEach((el) => {
      if (!el) return;
      gsap.set(el, { opacity: 0 });
      gsap.set(el.querySelector("circle"), { attr: { r: 0 } });
    });
    momentEls.current.forEach((el) => el?.setAttribute("data-on", "false"));
    if (lastKey.current !== replayKey) {
      lastKey.current = replayKey;
      if (prefersReducedMotion()) {
        pos.current.p = rest.current = 1;
        draw(1);
      } else {
        draw(0);
        const d = gsap.delayedCall(0.35, () => play(0));
        return () => {
          d.kill();
        };
      }
    } else {
      draw(pos.current.p);
    }
  }, [geo, replayKey, draw, play]);

  useEffect(() => () => void tween.current?.kill(), []);

  // Hover to travel through time; press and drag to scrub.
  const pFromChart = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r)));
  };
  const dragging = useRef(false);
  const onChartMove = (e: React.PointerEvent) => {
    if (status === "playing" && !dragging.current) return;
    const p = pFromChart(e.clientX);
    pos.current.p = p;
    if (dragging.current) rest.current = p;
    draw(p);
  };
  const onChartLeave = () => {
    if (status === "playing" || dragging.current) return;
    pos.current.p = rest.current;
    draw(rest.current);
  };
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pause();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    pos.current.p = rest.current = p;
    draw(p);
  };
  const onTrackMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    pos.current.p = rest.current = p;
    draw(p);
  };
  const onTrackUp = () => {
    dragging.current = false;
    if (rest.current >= 0.9999) setStatus("done");
  };

  const last = points[points.length - 1];
  const invested = last?.invested ?? 0;
  const gain = (last?.value ?? 0) - invested;
  const perDollar = invested > 0 ? last.value / invested : 0;
  const start = points[0]?.date;
  const upColor = geo?.up ? "var(--up)" : "var(--down)";

  return (
    <section className={clsx("card overflow-hidden transition-opacity duration-300", loading && "opacity-60")}>
      <div className="p-5 sm:p-7">
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted sm:text-base">
          {monthly > 0 ? (
            initial > 0 ? (
              <>
                If you had invested <b className="font-semibold text-ink">{fmtUsd(initial, 0)}</b> in <b className="font-semibold text-ink">{subject}</b> on{" "}
                {fmtDate(start)} and added <b className="font-semibold text-ink">{fmtUsd(monthly, 0)}</b> every month,
              </>
            ) : (
              <>
                If you had put <b className="font-semibold text-ink">{fmtUsd(monthly, 0)}</b> into <b className="font-semibold text-ink">{subject}</b> every month since{" "}
                {fmtDate(start)},
              </>
            )
          ) : (
            <>
              If you had invested <b className="font-semibold text-ink">{fmtUsd(initial, 0)}</b> in <b className="font-semibold text-ink">{subject}</b> on {fmtDate(start)},
            </>
          )}
        </p>
        <p ref={whenLabel} className="mt-4 text-sm text-muted">
          you would have today
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span ref={bigNum} className="num text-5xl font-semibold tracking-[-0.035em] sm:text-6xl">
            {fmtUsd(last?.value, 0)}
          </span>
          <span ref={gainChip} className={clsx("chip num h-8 px-2.5 text-sm whitespace-pre", gain >= 0 ? "pill-up" : "pill-down")}>
            {`${gain >= 0 ? "+" : "−"}${fmtUsd(Math.abs(gain), 0)}  ${fmtPct(perDollar - 1, 1)}`}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          That&apos;s{" "}
          <span ref={sAmount} className={clsx("font-medium", gain >= 0 ? "text-up" : "text-down")}>
            {fmtUsd(Math.abs(gain), 0)} {gain >= 0 ? "more" : "less"}
          </span>{" "}
          than the <span ref={sInvested}>{fmtUsd(invested, 0)}</span> you put in. Every $1 became{" "}
          <span ref={sPerDollar} className="font-medium text-ink">
            ${perDollar.toFixed(2)}
          </span>
          .
        </p>
      </div>

      <div className="px-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded" style={{ background: upColor }} /> {name}
          </span>
          {benchLabel && geo?.benchPath && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded bg-accent" /> {benchLabel} <span ref={benchVal} className="num text-ink" />
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed border-faint" /> Money you put in
          </span>
        </div>

        <div ref={wrap} className="relative mt-2 cursor-crosshair touch-none select-none" style={{ height }} onPointerMove={onChartMove} onPointerLeave={onChartLeave}>
          {geo && (
            <>
              <svg width={width} height={geo.H} className="block overflow-visible">
                <defs>
                  <clipPath id="journey-reveal">
                    <rect ref={clipRect} x="0" y="0" width="0" height={geo.H} />
                  </clipPath>
                  <linearGradient id="journey-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" style={{ stopColor: upColor, stopOpacity: 0.14 }} />
                    <stop offset="1" style={{ stopColor: upColor, stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                {geo.yTicks.map((v) => (
                  <g key={v}>
                    <line x1={PAD.l} x2={width - PAD.r + 6} y1={geo.Y(v)} y2={geo.Y(v)} style={{ stroke: "var(--line)" }} />
                    <text x={width - PAD.r + 12} y={geo.Y(v) + 4} className="fill-faint text-[11px]">
                      {fmtUsdCompact(v)}
                    </text>
                  </g>
                ))}
                {geo.xTicks.map((t) => (
                  <text key={t} x={geo.X(t)} y={geo.H - 6} textAnchor="middle" className="fill-faint text-[11px]">
                    {geo.xFormat(t)}
                  </text>
                ))}

                <g clipPath="url(#journey-reveal)">
                  <path d={geo.areaPath} fill="url(#journey-fill)" />
                  <path d={geo.investedPath} fill="none" strokeWidth="1.25" strokeDasharray="4 4" style={{ stroke: "var(--faint)" }} />
                  {geo.benchPath && <path d={geo.benchPath} fill="none" strokeWidth="1.75" strokeLinejoin="round" style={{ stroke: "var(--accent)" }} />}
                  <path d={geo.mainPath} fill="none" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: upColor }} />
                </g>

                <line ref={headLine} y1={PAD.t - 6} y2={geo.H - PAD.b} style={{ stroke: "var(--line-strong)" }} />
                {geo.benchPath && <circle ref={benchDot} r="3.5" style={{ fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} />}
                <circle ref={headDot} r="5" style={{ fill: upColor, stroke: "var(--surface)", strokeWidth: 2.5 }} />

                {geo.markers.map((mk, k) => (
                  <g
                    key={k}
                    ref={(el) => {
                      markerEls.current[k] = el;
                    }}
                    style={{ opacity: 0 }}
                  >
                    <circle cx={mk.x} cy={mk.y - 16 - mk.lift} r="9" style={{ fill: "var(--ink)" }} />
                    <text x={mk.x} y={mk.y - 12.5 - mk.lift} textAnchor="middle" className="text-[10px] font-semibold" style={{ fill: "var(--surface)" }}>
                      {k + 1}
                    </text>
                    <line x1={mk.x} x2={mk.x} y1={mk.y - 7 - mk.lift} y2={mk.y - 2} style={{ stroke: "var(--ink)" }} />
                  </g>
                ))}
              </svg>
              <div ref={headDate} className="pointer-events-none absolute top-0 left-0 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-bg" />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 px-2 pt-3 pb-5">
          <button
            onClick={() => (status === "playing" ? pause() : play(status === "done" ? 0 : undefined))}
            className="btn h-9 w-[104px] justify-center"
            aria-label={status === "playing" ? "Pause" : status === "done" ? "Replay" : "Play"}
          >
            {status === "playing" ? <Pause className="size-4" /> : status === "done" ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
            {status === "playing" ? "Pause" : status === "done" ? "Replay" : "Play"}
          </button>
          <div
            className="relative h-9 flex-1 cursor-pointer touch-none"
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerCancel={onTrackUp}
            aria-label="Timeline: press and drag to scrub"
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-subtle">
              <div ref={fill} className="h-full rounded-full bg-ink" style={{ width: "100%" }} />
            </div>
            <div ref={thumb} className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow" style={{ left: "100%" }} />
          </div>
          <span className="hidden text-xs text-faint sm:block">Hover the chart to travel through time</span>
        </div>
      </div>

      {milestones.length > 0 && (
        <div className="border-t border-line bg-subtle/50 px-5 py-5 sm:px-7">
          <p className="mb-3 text-sm font-medium">Moments along the way</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {milestones.map((m, k) => {
              const t = momentText(m, points);
              return (
                <div
                  key={`${m.kind}-${m.index}`}
                  ref={(el) => {
                    momentEls.current[k] = el;
                  }}
                  data-on="true"
                  className="flex gap-3 rounded-lg border border-line bg-surface p-3 opacity-35 transition-all duration-500 data-[on=true]:opacity-100"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg">{k + 1}</span>
                  <div className="min-w-0">
                    <p className={clsx("text-sm font-semibold", t.tone === "up" ? "text-up" : t.tone === "down" ? "text-down" : "text-ink")}>{t.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
