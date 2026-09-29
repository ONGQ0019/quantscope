"use client";

import clsx from "clsx";
import { Lock, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { addDays, addMonths, nyToday } from "@/lib/dates";
import { fmtDate, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import type { SimulationResponse } from "@/lib/server/simulate";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { TickerLogo } from "../ui/TickerLogo";
import { DrawdownChart, GrowthChart } from "./SimCharts";

type Status = { historyYears: number };
const PERIODS = [
  { value: "6M", months: 6 },
  { value: "1Y", months: 12 },
  { value: "2Y", months: 24 },
  { value: "5Y", months: 60 },
  { value: "10Y", months: 120 },
  { value: "20Y", months: 240 },
] as const;

function readParams() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  return p.has("t") ? p : null;
}

export function SimulatorView({ initialTicker, embedded = false }: { initialTicker: string; embedded?: boolean }) {
  const { data: status } = useSWR<Status>("/api/status");
  const historyYears = status?.historyYears ?? 2;

  const [ticker, setTicker] = useState(initialTicker);
  const [initial, setInitial] = useState(10_000);
  const [monthly, setMonthly] = useState(0);
  const [period, setPeriod] = useState<string>("2Y");
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [reinvest, setReinvest] = useState(true);
  const [benchmark, setBenchmark] = useState("SPY");

  // Hydrate from a shared URL once, before we start writing the URL back.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    const p = readParams();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from the URL */
    if (p) {
      if (!embedded && p.get("t")) setTicker(p.get("t")!.toUpperCase());
      if (p.get("amt")) setInitial(Number(p.get("amt")) || 0);
      if (p.get("m")) setMonthly(Number(p.get("m")) || 0);
      if (p.get("start")) setCustomStart(p.get("start"));
      if (p.get("div")) setReinvest(p.get("div") !== "0");
      if (p.get("b")) setBenchmark(p.get("b") === "NONE" ? "" : p.get("b")!.toUpperCase());
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [embedded, hydrated]);

  const start = useMemo(() => {
    if (customStart) return customStart;
    const months = PERIODS.find((p) => p.value === period)?.months ?? 24;
    return addDays(addMonths(nyToday(), -months), 1);
  }, [customStart, period]);

  const query = useMemo(() => {
    const q = new URLSearchParams({
      ticker,
      initial: String(initial),
      monthly: String(monthly),
      start,
      reinvest: reinvest ? "1" : "0",
      benchmark: benchmark || "NONE",
    });
    return `/api/simulate?${q}`;
  }, [ticker, initial, monthly, start, reinvest, benchmark]);

  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error, isLoading } = useSWR<SimulationResponse>(hydrated && initial + monthly > 0 ? debounced : null, { keepPreviousData: true });

  // Shareable URL
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams({ t: ticker, amt: String(initial), m: String(monthly), start, div: reinvest ? "1" : "0", b: benchmark || "NONE" });
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }, [hydrated, ticker, initial, monthly, start, reinvest, benchmark]);

  const r = data?.result ?? null;
  const b = data?.benchmarkResult ?? null;

  return (
    <div>
      {!embedded && (
        <div className="mb-8">
          <p className="label">Simulator</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-[40px]">
            What if you had invested?
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            Replay any stock or ETF with real prices, split-adjusted dividends and optional monthly contributions — then compare against the market.
          </p>
        </div>
      )}

      <Reveal className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]" deps={[Boolean(r)]}>
        <Panel title="Scenario" className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-5">
            {!embedded && <TickerPicker value={ticker} onChange={setTicker} />}

            <Field label="Initial investment">
              <MoneyInput value={initial} onChange={setInitial} />
              <div className="mt-2 flex gap-1.5">
                {[1_000, 10_000, 100_000].map((v) => (
                  <button key={v} onClick={() => setInitial(v)} className={clsx("chip transition-colors hover:text-ink", initial === v && "border-line-strong text-ink")}>
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Monthly contribution">
              <Segmented<string>
                value={monthly > 0 ? "dca" : "lump"}
                onChange={(v) => setMonthly(v === "dca" ? monthly || 500 : 0)}
                options={[
                  { value: "lump", label: "Lump sum" },
                  { value: "dca", label: "Monthly DCA" },
                ]}
                className="mb-2 w-full [&>button]:flex-1"
              />
              {monthly > 0 && <MoneyInput value={monthly} onChange={setMonthly} suffix="/ month" />}
            </Field>

            <Field label="Start">
              <div className="grid grid-cols-3 gap-1.5">
                {PERIODS.map((p) => {
                  const locked = p.months / 12 > historyYears + 0.01;
                  const active = !customStart && period === p.value;
                  return (
                    <button
                      key={p.value}
                      disabled={locked}
                      title={locked ? `Your data plan includes ${historyYears} years of history` : undefined}
                      onClick={() => {
                        setCustomStart(null);
                        setPeriod(p.value);
                      }}
                      className={clsx(
                        "flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition-colors",
                        active ? "border-ink bg-ink text-bg" : "border-line text-muted hover:bg-subtle hover:text-ink",
                        locked && "cursor-not-allowed opacity-40 hover:text-muted",
                      )}
                    >
                      {locked && <Lock className="size-3" />}
                      {p.value} ago
                    </button>
                  );
                })}
              </div>
              <input
                type="date"
                value={start}
                min={addDays(nyToday(), -Math.round(historyYears * 365.25) + 3)}
                max={addDays(nyToday(), -7)}
                onChange={(e) => e.target.value && setCustomStart(e.target.value)}
                className="input num mt-2"
              />
            </Field>

            <Field label="Dividends">
              <Segmented<string>
                value={reinvest ? "1" : "0"}
                onChange={(v) => setReinvest(v === "1")}
                options={[
                  { value: "1", label: "Reinvest" },
                  { value: "0", label: "Take as cash" },
                ]}
                className="w-full [&>button]:flex-1"
              />
            </Field>

            <Field label="Compare against">
              <Segmented<string>
                value={benchmark || "NONE"}
                onChange={(v) => setBenchmark(v === "NONE" ? "" : v)}
                options={[
                  { value: "SPY", label: "S&P 500" },
                  { value: "QQQ", label: "Nasdaq" },
                  { value: "NONE", label: "None" },
                ]}
                className="w-full [&>button]:flex-1"
              />
            </Field>
            {data && data.earliest && (
              <p className="text-[11px] leading-relaxed text-faint">
                History available from {fmtDate(data.earliest)} on your data plan ({data.historyYears}y).
                {data.historyYears < 5 && " Upgrading Massive to Starter unlocks 5 years; Advanced unlocks 20+."}
              </p>
            )}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          {error ? (
            <Panel>
              <ErrorState error={error} what={`price history for ${ticker}`} />
            </Panel>
          ) : !r ? (
            <Panel>{data && !r ? <p className="text-sm text-muted">Not enough history in that window. Try a later start date.</p> : <ResultsSkeleton />}</Panel>
          ) : (
            <>
              <Headline data={data!} loading={isLoading} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Total invested" value={r.totalInvested} fmt={(n) => fmtUsd(n, 0)} />
                <Kpi label={r.annualReturnKind === "cagr" ? "CAGR" : "Annualized (IRR)"} value={r.annualReturn != null ? r.annualReturn * 100 : null} fmt={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`} tone={r.annualReturn} sub={r.years < 1 ? "annualized from <1y" : undefined} />
                <Kpi label="Max drawdown" value={r.maxDrawdown * 100} fmt={(n) => `${n.toFixed(1)}%`} tone={-1} sub={r.maxDrawdownTrough ? `bottom ${fmtDate(r.maxDrawdownTrough, { month: "short", year: "numeric" })}` : undefined} />
                <Kpi label="Volatility" value={r.volatility != null ? r.volatility * 100 : null} fmt={(n) => `${n.toFixed(1)}%`} sub={r.sharpe != null ? `Sharpe ${r.sharpe.toFixed(2)}` : undefined} />
                <Kpi label="Dividends received" value={r.dividendsReceived} fmt={(n) => fmtUsd(n, 0)} sub={reinvest ? "reinvested" : "held as cash"} />
                <Kpi label="Shares owned" value={r.shares} fmt={(n) => n.toFixed(n >= 100 ? 1 : 3)} sub={`@ $${fmtPrice(r.endPrice)}`} />
                <Kpi label="Best day" value={r.bestDay ? r.bestDay.ret * 100 : null} fmt={(n) => `+${n.toFixed(2)}%`} tone={1} sub={r.bestDay ? fmtDate(r.bestDay.date) : undefined} />
                <Kpi label="Worst day" value={r.worstDay ? r.worstDay.ret * 100 : null} fmt={(n) => `${n.toFixed(2)}%`} tone={-1} sub={r.worstDay ? fmtDate(r.worstDay.date) : undefined} />
              </div>

              {b && <VersusBenchmark data={data!} />}

              <Panel title="Portfolio value" subtitle={`${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}`}>
                <GrowthChart points={r.points} benchmark={b?.points ?? null} ticker={data!.ticker} benchmarkTicker={data!.benchmark} />
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Drawdowns" subtitle="Distance below the previous peak (total return)">
                  <DrawdownChart points={r.points} />
                </Panel>
                <Panel title="Calendar-year returns" subtitle="Total return incl. dividends">
                  <YearlyReturns main={r.yearly} bench={b?.yearly ?? null} ticker={data!.ticker} benchTicker={data!.benchmark} />
                </Panel>
              </div>
              <p className="text-[11px] text-faint">
                Hypothetical results using end-of-day closes, fractional shares, dividends credited on ex-date, no taxes or fees. Past performance does not
                predict future returns.
              </p>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function Headline({ data, loading }: { data: SimulationResponse; loading: boolean }) {
  const r = data.result!;
  const ref = useRef<HTMLDivElement>(null);
  const up = r.profit >= 0;
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-hl]", { opacity: 0, y: 6, stagger: 0.06, duration: 0.5, ease: "power2.out" });
    },
    { scope: ref, dependencies: [data.ticker] },
  );
  return (
    <section ref={ref} className="card p-6 sm:p-7">
      <div className={clsx("relative transition-opacity", loading && "opacity-60")}>
        <div data-hl className="flex items-center gap-3">
          <TickerLogo ticker={data.ticker} size={40} />
          <p className="text-sm text-muted">
            {r.contributions > 0 ? (
              <>
                Investing a total of {fmtUsd(r.totalInvested, 0)} in <span className="text-ink">{data.name}</span> since {fmtDate(r.startDate)} (with{" "}
                {r.contributions} monthly contributions) would be worth
              </>
            ) : (
              <>
                {fmtUsd(r.totalInvested, 0)} invested in <span className="text-ink">{data.name}</span> on {fmtDate(r.startDate)} would be worth
              </>
            )}
          </p>
        </div>
        <div data-hl className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
          <AnimatedNumber value={r.finalValue} from={r.totalInvested} duration={1.8} format={(n) => fmtUsd(n, 0)} className="num text-5xl font-semibold tracking-tight sm:text-6xl" />
          <div className="pb-2">
            <span className={clsx("num text-xl font-medium", up ? "text-up" : "text-down")}>
              {up ? "+" : ""}
              {fmtUsd(r.profit, 0)}
            </span>
            <span className={clsx("chip num ml-2 h-7 px-2 text-sm", up ? "pill-up" : "pill-down")}>
              {fmtPct(r.totalReturn)}
            </span>
          </div>
        </div>
        <p data-hl className="mt-3 text-xs text-faint">
          as of {fmtDate(r.endDate)} · {r.years.toFixed(1)} years · share price {fmtPct(r.priceReturn)} · total return incl. dividends {fmtPct(r.assetTotalReturn)}
        </p>
      </div>
    </section>
  );
}

function VersusBenchmark({ data }: { data: SimulationResponse }) {
  const r = data.result!;
  const b = data.benchmarkResult!;
  const ref = useRef<HTMLDivElement>(null);
  const diff = r.totalReturn - b.totalReturn;
  const max = Math.max(r.finalValue, b.finalValue, 1);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-vs]", { scaleX: 0, transformOrigin: "left", duration: 0.8, stagger: 0.08, ease: "power3.out" });
    },
    { scope: ref, dependencies: [r.finalValue, b.finalValue] },
  );
  return (
    <Panel
      title={
        <span>
          {diff >= 0 ? "Beat" : "Trailed"} {data.benchmark} by <span className={clsx("num", diff >= 0 ? "text-up" : "text-down")}>{fmtPct(Math.abs(diff), 1, false)}</span>
        </span>
      }
      subtitle={`Same dollars, same dates, invested in ${data.benchmarkName}`}
    >
      <div ref={ref} className="space-y-3">
        {[
          { t: data.ticker, v: r.finalValue, ret: r.totalReturn, cls: r.profit >= 0 ? "bg-up" : "bg-down" },
          { t: data.benchmark!, v: b.finalValue, ret: b.totalReturn, cls: "bg-accent" },
        ].map((x) => (
          <div key={x.t}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">{x.t}</span>
              <span className="num text-muted">
                {fmtUsd(x.v, 0)} <span className={x.ret >= 0 ? "text-up" : "text-down"}>({fmtPct(x.ret)})</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-subtle">
              <div data-vs className={clsx("h-full rounded-full", x.cls)} style={{ width: `${(x.v / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function YearlyReturns({
  main,
  bench,
  ticker,
  benchTicker,
}: {
  main: { year: number; ret: number }[];
  bench: { year: number; ret: number }[] | null;
  ticker: string;
  benchTicker: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const benchBy = new Map(bench?.map((y) => [y.year, y.ret]));
  const max = Math.max(0.05, ...main.map((y) => Math.abs(y.ret)), ...(bench ?? []).map((y) => Math.abs(y.ret)));
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-yr]", { scaleX: 0, duration: 0.7, stagger: 0.03, ease: "power3.out" });
    },
    { scope: ref, dependencies: [main.length, ticker] },
  );
  return (
    <div ref={ref} className="space-y-3">
      {main.map((y) => {
        const bv = benchBy.get(y.year);
        return (
          <div key={y.year} className="grid grid-cols-[44px_1fr] items-center gap-3">
            <span className="num text-xs text-muted">{y.year}</span>
            <div className="space-y-1">
              <BarRow value={y.ret} max={max} label={ticker} strong />
              {bv != null && <BarRow value={bv} max={max} label={benchTicker ?? ""} />}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-up" /> {ticker}
        </span>
        {benchTicker && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent" /> {benchTicker}
          </span>
        )}
        <span className="text-faint">Partial years run from the start date or to the latest close.</span>
      </div>
    </div>
  );
}

function BarRow({ value, max, label, strong }: { value: number; max: number; label: string; strong?: boolean }) {
  const w = (Math.abs(value) / max) * 38; // leave room for the label
  return (
    <div className="relative flex h-4 items-center" title={`${label}: ${fmtPct(value)}`}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div
        data-yr
        className={clsx("absolute h-2 rounded-sm", strong ? (value >= 0 ? "bg-up" : "bg-down") : "bg-accent")}
        style={value >= 0 ? { left: "50%", width: `${w}%`, transformOrigin: "left" } : { right: "50%", width: `${w}%`, transformOrigin: "right" }}
      />
      <span className={clsx("num absolute text-[10px]", strong ? (value >= 0 ? "text-up" : "text-down") : "text-accent")} style={value >= 0 ? { left: `calc(50% + ${w}% + 6px)` } : { right: `calc(50% + ${w}% + 6px)` }}>
        {fmtPct(value, 1)}
      </span>
    </div>
  );
}

function Kpi({ label, value, fmt, tone, sub }: { label: string; value: number | null; fmt: (n: number) => string; tone?: number | null; sub?: string }) {
  return (
    <div data-reveal className="card px-4 py-3">
      <p className="label">{label}</p>
      <AnimatedNumber
        value={value}
        format={fmt}
        className={clsx("num mt-1.5 block text-lg font-semibold", tone == null ? "text-ink" : tone >= 0 ? "text-up" : "text-down")}
      />
      {sub && <p className="mt-0.5 truncate text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-16 w-1/2" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
      <input
        inputMode="decimal"
        value={value ? value.toLocaleString("en-US") : ""}
        onChange={(e) => onChange(Math.min(1e9, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0))}
        className="input num !pl-7"
        placeholder="0"
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-faint">{suffix}</span>}
    </div>
  );
}

type Hit = { ticker: string; name: string; type: string };

function TickerPicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { data } = useSWR<{ results: Hit[] }>(open ? `/api/search?q=${encodeURIComponent(q)}&limit=8` : null, { dedupingInterval: 1000 });
  const hits = data?.results ?? [];
  const pick = (t: string) => {
    onChange(t);
    setOpen(false);
    setQ("");
  };
  return (
    <Field label="Stock or ETF">
      <div className="relative">
        <div className="input flex items-center gap-2 !py-1.5">
          <TickerLogo ticker={value} size={26} tryLogo={false} />
          <Search className="size-3.5 text-faint" />
          <input
            value={open ? q : value}
            onFocus={() => {
              setOpen(true);
              setQ("");
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
              if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              if (e.key === "Enter" && hits[active]) pick(hits[active].ticker);
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Search ticker or company"
            className="num min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        {open && hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg">
            {hits.map((h, i) => (
              <button
                key={h.ticker}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h.ticker)}
                onMouseMove={() => setActive(i)}
                className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left", i === active && "bg-subtle")}
              >
                <span className="w-14 text-sm font-semibold">{h.ticker}</span>
                <span className="truncate text-xs text-muted">{h.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
