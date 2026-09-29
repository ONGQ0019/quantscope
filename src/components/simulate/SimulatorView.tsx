"use client";

import clsx from "clsx";
import { ChevronDown, Link2, Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { addDays, addMonths, nyToday } from "@/lib/dates";
import { fmtDate, fmtPct, fmtPrice, fmtUsd, friendlyName, sentenceName } from "@/lib/format";
import type { SimResult } from "@/lib/quant/simulate";
import type { SimulationResponse } from "@/lib/server/simulate";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { TickerLogo } from "../ui/TickerLogo";
import { Journey } from "./Journey";
import { HardestMoment, PlainStats } from "./PlainStats";
import { DrawdownChart } from "./SimCharts";
import { Stackup } from "./Stackup";
import { TimingLuck } from "./TimingLuck";
import { YearByYear } from "./YearByYear";

type Status = { historyYears: number };
const PERIODS = [
  { value: "6M", months: 6, label: "6 months" },
  { value: "1Y", months: 12, label: "1 year" },
  { value: "2Y", months: 24, label: "2 years" },
  { value: "5Y", months: 60, label: "5 years" },
  { value: "10Y", months: 120, label: "10 years" },
  { value: "20Y", months: 240, label: "20 years" },
] as const;

const EXAMPLES = [
  { label: "$10,000 in Nvidia", t: "NVDA", initial: 10_000, monthly: 0, period: "2Y" },
  { label: "$1,000 in Apple", t: "AAPL", initial: 1_000, monthly: 0, period: "2Y" },
  { label: "$200 a month in the S&P 500", t: "SPY", initial: 0, monthly: 200, period: "2Y" },
  { label: "$5,000 in Tesla a year ago", t: "TSLA", initial: 5_000, monthly: 0, period: "1Y" },
];

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
  const [copied, setCopied] = useState(false);

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
  const name = data ? friendlyName(data.ticker, data.name) : ticker;
  const subject = data ? sentenceName(data.ticker, data.name) : ticker;
  const benchLabel = data?.benchmark ? friendlyName(data.benchmark, data.benchmarkName) : null;
  const replayKey = data && r ? `${data.ticker}|${r.startDate}|${r.contributions > 0}|${data.benchmark}` : "";

  const applyExample = (e: (typeof EXAMPLES)[number]) => {
    setTicker(e.t);
    setInitial(e.initial);
    setMonthly(e.monthly);
    setCustomStart(null);
    setPeriod(e.period);
    setBenchmark(e.t === "SPY" ? "QQQ" : "SPY");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div>
      {!embedded && (
        <div className="mb-8">
          <p className="label">Simulator</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-[40px]">What if you had invested?</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Pick a stock, an amount and a start date. We&apos;ll replay what would have happened to your money, day by day, using real prices and dividends.
          </p>
        </div>
      )}

      <Reveal className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]" deps={[Boolean(r), Boolean(data?.timing)]}>
        <Panel title="Your scenario" className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-5">
            {!embedded && (
              <div>
                <p className="label mb-2">Try an example</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((e) => (
                    <button key={e.label} onClick={() => applyExample(e)} className="chip transition-colors hover:border-line-strong hover:text-ink">
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!embedded && <TickerPicker value={ticker} onChange={setTicker} />}

            <Field label="Starting amount">
              <MoneyInput value={initial} onChange={setInitial} />
              <div className="mt-2 flex gap-1.5">
                {[1_000, 10_000, 100_000].map((v) => (
                  <button key={v} onClick={() => setInitial(v)} className={clsx("chip transition-colors hover:text-ink", initial === v && "border-line-strong text-ink")}>
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Add money every month?">
              <Segmented<string>
                value={monthly > 0 ? "dca" : "once"}
                onChange={(v) => setMonthly(v === "dca" ? monthly || 500 : 0)}
                options={[
                  { value: "once", label: "No, one time" },
                  { value: "dca", label: "Yes, monthly" },
                ]}
                className="w-full [&>button]:flex-1"
              />
              {monthly > 0 && (
                <div className="mt-2">
                  <MoneyInput value={monthly} onChange={setMonthly} suffix="per month" />
                </div>
              )}
            </Field>

            <Field label="Starting from">
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
                        "flex h-8 items-center justify-center gap-1 rounded-lg border text-xs transition-colors",
                        active ? "border-ink bg-ink text-bg" : "border-line text-muted hover:bg-subtle hover:text-ink",
                        locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted",
                      )}
                    >
                      {locked && <Lock className="size-3" />}
                      {p.label} ago
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
                aria-label="Custom start date"
              />
            </Field>

            <Field label="Dividends" hint="Some companies pay part of their profit to shareholders. Reinvesting uses it to buy more shares.">
              <Segmented<string>
                value={reinvest ? "1" : "0"}
                onChange={(v) => setReinvest(v === "1")}
                options={[
                  { value: "1", label: "Reinvest" },
                  { value: "0", label: "Keep as cash" },
                ]}
                className="w-full [&>button]:flex-1"
              />
            </Field>

            <Field label="Compare with">
              <Segmented<string>
                value={benchmark || "NONE"}
                onChange={(v) => setBenchmark(v === "NONE" ? "" : v)}
                options={[
                  { value: "SPY", label: "S&P 500" },
                  { value: "QQQ", label: "Nasdaq 100" },
                  { value: "NONE", label: "Nothing" },
                ]}
                className="w-full [&>button]:flex-1"
              />
            </Field>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <button onClick={copyLink} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
                <Link2 className="size-3.5" /> {copied ? "Link copied" : "Copy link to this scenario"}
              </button>
            </div>
            {data?.earliest && data.historyYears < 5 && (
              <p className="-mt-2 text-[11px] leading-relaxed text-faint">
                Your data plan covers {data.historyYears} years (from {fmtDate(data.earliest)}). Massive Starter unlocks 5 years; Advanced unlocks 20+.
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
              <Journey
                name={name}
                subject={subject}
                benchLabel={benchLabel}
                points={r.points}
                bench={b?.points ?? null}
                initial={initial}
                monthly={monthly}
                replayKey={replayKey}
                loading={isLoading}
              />
              <Stackup data={data!} name={name} subject={subject} benchLabel={benchLabel} />
              <PlainStats r={r} name={name} reinvest={reinvest} />
              <HardestMoment r={r} />
              <div className="grid gap-4 xl:grid-cols-2">
                <YearByYear main={r.yearly} bench={b?.yearly ?? null} name={name} benchLabel={benchLabel} />
                {data!.timing && <TimingLuck stats={data!.timing} name={name} historyYears={data!.historyYears} />}
              </div>
              <Advanced r={r} riskFree={data!.riskFree} />
              <p className="px-1 text-[11px] leading-relaxed text-faint">
                Hypothetical results using daily closing prices, fractional shares and dividends credited on the ex-date. No taxes or fees. The savings
                account uses historical 3-month US Treasury bill rates. Past performance doesn&apos;t predict future returns.
              </p>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function Advanced({ r, riskFree }: { r: SimResult; riskFree: number }) {
  const [open, setOpen] = useState(false);
  const items: [string, string, string?][] = [
    ["Share price change", fmtPct(r.priceReturn, 1), `${fmtUsd(r.startPrice)} → ${fmtUsd(r.endPrice)}`],
    ["Total return incl. dividends", fmtPct(r.assetTotalReturn, 1)],
    [r.annualReturnKind === "cagr" ? "Compound annual growth (CAGR)" : "Money-weighted return (IRR)", fmtPct(r.annualReturn, 2)],
    ["Volatility (annualized)", fmtPct(r.volatility, 1, false)],
    ["Sharpe ratio", r.sharpe != null ? r.sharpe.toFixed(2) : "—", `vs ${fmtPct(riskFree, 2, false)} risk-free`],
    ["Best day", fmtPct(r.bestDay?.ret, 2), r.bestDay ? fmtDate(r.bestDay.date) : undefined],
    ["Worst day", fmtPct(r.worstDay?.ret, 2), r.worstDay ? fmtDate(r.worstDay.date) : undefined],
    ["Dividends received", fmtUsd(r.dividendsReceived, 2)],
    ["Shares", r.shares.toFixed(4), `@ ${fmtPrice(r.endPrice)}`],
    ["Cash held", fmtUsd(r.cash, 2)],
  ];
  return (
    <section className="card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6" aria-expanded={open}>
        <span className="text-[15px] font-semibold tracking-tight">More statistics</span>
        <ChevronDown className={clsx("size-4 text-muted transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div className={clsx("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-line px-5 py-5 sm:px-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
              {items.map(([label, value, sub]) => (
                <div key={label}>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="num mt-1 text-sm font-medium">{value}</p>
                  {sub && <p className="text-[11px] text-faint">{sub}</p>}
                </div>
              ))}
            </div>
            <p className="mt-6 mb-2 text-sm font-medium">Distance below the previous high</p>
            {open && <DrawdownChart points={r.points} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-14 w-1/2" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{hint}</p>}
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
    <Field label="Invest in">
      <div className="relative">
        <div className="input flex items-center gap-2 !px-2">
          <TickerLogo ticker={value} size={26} tryLogo={false} className="rounded-md" />
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
            placeholder="Search a stock or ETF"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
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
                className={clsx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left", i === active && "bg-subtle")}
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
