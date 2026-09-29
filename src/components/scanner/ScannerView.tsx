"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtUsdCompact } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import type { ScanRow } from "@/lib/server/market";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { TickerLogo } from "../ui/TickerLogo";

type Filters = {
  q: string;
  types: string[];
  minPrice: string;
  maxPrice: string;
  minChange: string;
  maxChange: string;
  minGap: string;
  maxGap: string;
  minVolume: string;
  minDollarVolume: string;
  minRvol: string;
  sort: keyof ScanRow;
  dir: "asc" | "desc";
};

const DEFAULTS: Filters = {
  q: "",
  types: ["CS", "ETF", "ADRC"],
  minPrice: "1",
  maxPrice: "",
  minChange: "",
  maxChange: "",
  minGap: "",
  maxGap: "",
  minVolume: "",
  minDollarVolume: "1000000",
  minRvol: "",
  sort: "dollarVolume",
  dir: "desc",
};

const PRESETS: { name: string; f: Partial<Filters>; needsHistory?: boolean }[] = [
  { name: "Top gainers", f: { sort: "changePct", dir: "desc", minPrice: "2", minDollarVolume: "5000000" } },
  { name: "Top losers", f: { sort: "changePct", dir: "asc", minPrice: "2", minDollarVolume: "5000000" } },
  { name: "Gap ups", f: { sort: "gapPct", dir: "desc", minGap: "3", minDollarVolume: "2000000" } },
  { name: "Gap downs", f: { sort: "gapPct", dir: "asc", maxGap: "-3", minDollarVolume: "2000000" } },
  { name: "Most active $", f: { sort: "dollarVolume", dir: "desc" } },
  { name: "Penny runners", f: { sort: "changePct", dir: "desc", minPrice: "0.5", maxPrice: "5", minChange: "10", minVolume: "1000000", minDollarVolume: "" } },
  { name: "Unusual volume", f: { sort: "rvol", dir: "desc", minRvol: "2", minDollarVolume: "2000000" }, needsHistory: true },
];

type ScanResponse = { date: string; lookbackDays: number; universe: number; total: number; rows: ScanRow[] };

export function ScannerView() {
  const [f, setF] = useState<Filters>({ ...DEFAULTS, ...PRESETS[0].f });
  const [preset, setPreset] = useState<string | null>(PRESETS[0].name);
  const [showFilters, setShowFilters] = useState(true);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (k === "types") p.set("types", (v as string[]).join(","));
      else if (v !== "" && v != null) p.set(k, String(v));
    }
    p.set("limit", "200");
    return `/api/market/scan?${p}`;
  }, [f]);
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error, isLoading } = useSWR<ScanResponse>(debounced, { keepPreviousData: true });
  const hasHistory = (data?.lookbackDays ?? 0) >= 6;

  const set = (patch: Partial<Filters>) => {
    setPreset(null);
    setF((x) => ({ ...x, ...patch }));
  };
  const sortBy = (key: keyof ScanRow) =>
    setF((x) => ({ ...x, sort: key, dir: x.sort === key ? (x.dir === "desc" ? "asc" : "desc") : key === "ticker" ? "asc" : "desc" }));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Scanner</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-[40px]">
            Scan the entire market
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            {data ? (
              <>
                {data.universe.toLocaleString()} US stocks &amp; ETFs from the {fmtDate(data.date)} session. Every filter runs instantly on the server.
              </>
            ) : (
              "Loading every US listing…"
            )}
          </p>
        </div>
        <button onClick={() => setShowFilters((s) => !s)} className="btn lg:hidden">
          <SlidersHorizontal className="size-4" /> Filters
        </button>
      </div>

      <Reveal className="space-y-4" deps={[Boolean(data)]}>
        <div data-reveal className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const disabled = p.needsHistory && !hasHistory;
            return (
              <button
                key={p.name}
                disabled={disabled}
                title={disabled ? "Needs 20 days of history — available on paid Massive plans (set MASSIVE_RATE_LIMIT_PER_MIN=0)" : undefined}
                onClick={() => {
                  setPreset(p.name);
                  setF({ ...DEFAULTS, ...p.f });
                }}
                className={clsx(
                  "h-8 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  preset === p.name
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel title="Filters" className={clsx("lg:sticky lg:top-24 lg:self-start", !showFilters && "hidden lg:block")} action={
            <button onClick={() => { setPreset(null); setF(DEFAULTS); }} className="flex items-center gap-1 text-[11px] text-faint hover:text-ink">
              <RotateCcw className="size-3" /> Reset
            </button>
          }>
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
                <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Ticker or name" className="input !pl-8" />
              </div>
              <div>
                <p className="label mb-2">Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["CS", "Stocks"],
                    ["ETF", "ETFs"],
                    ["ADRC", "ADRs"],
                    ["FUND", "Funds"],
                  ].map(([v, label]) => {
                    const on = f.types.includes(v);
                    return (
                      <button
                        key={v}
                        onClick={() => set({ types: on ? f.types.filter((t) => t !== v) : [...f.types, v] })}
                        className={clsx("chip transition-colors", on ? "border-line-strong bg-subtle text-ink" : "hover:text-ink")}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Range label="Price ($)" min={f.minPrice} max={f.maxPrice} onMin={(v) => set({ minPrice: v })} onMax={(v) => set({ maxPrice: v })} />
              <Range label="Change (%)" min={f.minChange} max={f.maxChange} onMin={(v) => set({ minChange: v })} onMax={(v) => set({ maxChange: v })} />
              <Range label="Gap (%)" min={f.minGap} max={f.maxGap} onMin={(v) => set({ minGap: v })} onMax={(v) => set({ maxGap: v })} />
              <Single label="Min volume" value={f.minVolume} onChange={(v) => set({ minVolume: v })} placeholder="e.g. 1000000" />
              <Single label="Min $ volume" value={f.minDollarVolume} onChange={(v) => set({ minDollarVolume: v })} placeholder="e.g. 5000000" />
              <Single
                label="Min relative volume"
                value={f.minRvol}
                onChange={(v) => set({ minRvol: v })}
                placeholder={hasHistory ? "e.g. 2" : "needs paid plan"}
                disabled={!hasHistory}
              />
            </div>
          </Panel>

          <Panel
            className="min-w-0 !p-0"
            reveal
            title={
              <span className="flex items-center gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
                Results
                {data && <span className="chip num">{data.total.toLocaleString()} matches</span>}
                {isLoading && data && <span className="text-[11px] font-normal text-faint">updating…</span>}
              </span>
            }
          >
            {error ? (
              <div className="p-5">
                <ErrorState error={error} what="the market scan" />
              </div>
            ) : !data ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ResultsTable rows={data.rows} sort={f.sort} dir={f.dir} onSort={sortBy} history={hasHistory} total={data.total} />
            )}
          </Panel>
        </div>
      </Reveal>
    </div>
  );
}

function Range({ label, min, max, onMin, onMax }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <input value={min} onChange={(e) => onMin(e.target.value)} placeholder="min" inputMode="decimal" className="input num !py-1.5 !text-sm" />
        <span className="text-faint">–</span>
        <input value={max} onChange={(e) => onMax(e.target.value)} placeholder="max" inputMode="decimal" className="input num !py-1.5 !text-sm" />
      </div>
    </div>
  );
}

function Single({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal" className="input num !py-1.5 !text-sm disabled:opacity-40" />
    </div>
  );
}

type Col = { key: keyof ScanRow; label: string; className?: string; render: (r: ScanRow) => React.ReactNode; history?: boolean };

function heat(v: number) {
  const a = Math.min(0.22, 0.04 + Math.abs(v) * 1.4);
  return { backgroundColor: `color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${Math.round(a * 100)}%, transparent)` };
}

const COLUMNS: Col[] = [
  { key: "price", label: "Price", render: (r) => fmtPrice(r.price) },
  {
    key: "changePct",
    label: "Change",
    render: (r) => (
      <span className={clsx("rounded-md px-1.5 py-0.5", r.changePct >= 0 ? "text-up" : "text-down")} style={heat(r.changePct)}>
        {fmtPct(r.changePct)}
      </span>
    ),
  },
  { key: "gapPct", label: "Gap", render: (r) => <span className={r.gapPct >= 0 ? "text-up/80" : "text-down/80"}>{fmtPct(r.gapPct)}</span> },
  { key: "volume", label: "Volume", render: (r) => fmtCompact(r.volume) },
  { key: "dollarVolume", label: "$ Volume", render: (r) => fmtUsdCompact(r.dollarVolume) },
  { key: "rvol", label: "RVOL", history: true, render: (r) => (r.rvol != null ? <span className={r.rvol >= 2 ? "text-warn" : ""}>{r.rvol.toFixed(2)}×</span> : "—") },
  { key: "rangePct", label: "Range", render: (r) => fmtPct(r.rangePct, 1, false) },
  {
    key: "closeLocation",
    label: "Close in range",
    render: (r) => (
      <span className="inline-flex w-16 items-center">
        <span className="relative h-1 w-full rounded-full bg-line">
          <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${r.closeLocation * 100}%` }} />
        </span>
      </span>
    ),
  },
  { key: "change5d", label: "5D", history: true, render: (r) => <span className={(r.change5d ?? 0) >= 0 ? "text-up/80" : "text-down/80"}>{fmtPct(r.change5d, 1)}</span> },
  { key: "change20d", label: "20D", history: true, render: (r) => <span className={(r.change20d ?? 0) >= 0 ? "text-up/80" : "text-down/80"}>{fmtPct(r.change20d, 1)}</span> },
];

function ResultsTable({
  rows,
  sort,
  dir,
  onSort,
  history,
  total,
}: {
  rows: ScanRow[];
  sort: keyof ScanRow;
  dir: "asc" | "desc";
  onSort: (k: keyof ScanRow) => void;
  history: boolean;
  total: number;
}) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const cols = COLUMNS.filter((c) => !c.history || history);
  const sig = rows
    .slice(0, 5)
    .map((r) => r.ticker)
    .join();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const trs = ref.current?.querySelectorAll("tr");
      if (trs?.length) gsap.fromTo([...trs].slice(0, 30), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.015, ease: "power3.out" });
    },
    { dependencies: [sig, sort, dir] },
  );

  if (!rows.length) return <p className="px-6 py-16 text-center text-sm text-muted">Nothing matches these filters. Try loosening them.</p>;

  const head = (k: keyof ScanRow, label: string, left = false) => (
    <th key={k} className={clsx("sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 font-medium", left ? "text-left" : "text-right")}>
      <button onClick={() => onSort(k)} className={clsx("inline-flex items-center gap-1 transition-colors hover:text-ink", sort === k && "text-ink")}>
        {label}
        {sort === k && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );

  return (
    <div className="mt-4">
      <div className="max-h-[70vh] overflow-auto border-t border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {head("ticker", "Symbol", true)}
              {cols.map((c) => head(c.key, c.label))}
            </tr>
          </thead>
          <tbody ref={ref}>
            {rows.map((r) => (
              <tr key={r.ticker} className="row-hover border-t border-line/70">
                <td className="px-3 py-2">
                  <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="group flex items-center gap-2.5">
                    <TickerLogo ticker={r.ticker} size={28} tryLogo={false} />
                    <div className="min-w-0">
                      <p className="font-semibold group-hover:underline">{r.ticker}</p>
                      <p className="max-w-[220px] truncate text-[11px] text-faint">{r.name}</p>
                    </div>
                  </Link>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="num px-3 py-2 text-right whitespace-nowrap text-muted">
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
        Showing {rows.length} of {total.toLocaleString()} · end-of-day data · RVOL and multi-day change need ≥20 days of history (paid plan).
      </p>
    </div>
  );
}
