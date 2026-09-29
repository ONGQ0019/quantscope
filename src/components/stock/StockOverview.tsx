"use client";

import clsx from "clsx";
import { ArrowUpRight, Building2, Calendar, ExternalLink, Globe, Layers, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtUsd, fmtUsdCompact, timeAgo } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { PriceChart } from "./PriceChart";
import { useStock } from "./StockHeader";

type Financials = {
  periodEnd: string | null;
  ttm: {
    revenue: number | null;
    grossProfit: number | null;
    operatingIncome: number | null;
    netIncome: number | null;
    eps: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    operatingCashFlow: number | null;
    pe: number | null;
    roe: number | null;
    debtToEquity: number | null;
  };
  quarters: { label: string; end: string; revenue: number | null; netIncome: number | null; eps: number | null }[];
};
type Dividends = {
  ttmPerShare: number;
  yield: number | null;
  frequency: number | null;
  history: { exDate: string; payDate: string | null; amount: number; type: string | null }[];
  splits: { date: string; from: number; to: number }[];
};
type News = {
  items: {
    id: string;
    title: string;
    url: string;
    image: string | null;
    publisher: string;
    published: string;
    description: string | null;
    sentiment: "positive" | "negative" | "neutral" | null;
    sentimentReason: string | null;
  }[];
};

export function StockOverview({ ticker }: { ticker: string }) {
  const T = encodeURIComponent(ticker);
  const { data: s, error } = useStock(ticker);
  const { data: fin, error: finErr } = useSWR<Financials>(s ? `/api/stock/${T}/financials` : null);
  const { data: div, error: divErr } = useSWR<Dividends>(s ? `/api/stock/${T}/dividends` : null);
  const { data: news, error: newsErr } = useSWR<News>(s ? `/api/stock/${T}/news` : null);

  if (error) return null; // header renders the error
  const q = s?.quote;
  const isFund = s?.type === "ETF" || s?.type === "ETN" || s?.type === "ETV" || s?.type === "FUND";

  return (
    <Reveal className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]" deps={[Boolean(s), Boolean(fin), Boolean(div), Boolean(news)]}>
      <div className="min-w-0 space-y-4">
        <Panel className="!p-4 sm:!p-5">{s ? <PriceChart bars={s.bars} historyYears={s.historyYears} /> : <Skeleton className="h-[460px] w-full" />}</Panel>

        <Panel title="Key statistics">
          {s ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Open" value={fmtPrice(q?.open)} />
              <Stat label="Day range" value={q ? `${fmtPrice(q.low)} – ${fmtPrice(q.high)}` : "—"} />
              <Stat label="Prev close" value={fmtPrice(q?.prevClose)} />
              <Stat label="Volume" value={fmtCompact(q?.volume)} />
              <Stat label="Avg volume (30d)" value={fmtCompact(s.stats.avgVolume30)} />
              <Stat label="Market cap" value={fmtUsdCompact(s.marketCap)} />
              <Stat label="Shares out" value={fmtCompact(s.sharesOutstanding)} />
              <Stat label="P/E (TTM)" value={fin?.ttm.pe ? fin.ttm.pe.toFixed(1) : isFund ? "n/a" : fin ? "—" : "…"} />
              <Stat label="EPS (TTM)" value={fin?.ttm.eps != null ? fmtUsd(fin.ttm.eps) : isFund ? "n/a" : fin ? "—" : "…"} />
              <Stat label="Dividend yield" value={div ? (div.yield ? fmtPct(div.yield, 2, false) : "None") : "…"} />
              <Stat label="1Y return" value={fmtPct(s.stats.return1y)} tone={s.stats.return1y} />
              <Stat label="YTD return" value={fmtPct(s.stats.returnYtd)} tone={s.stats.returnYtd} />
            </div>
          ) : (
            <StatSkeleton />
          )}
        </Panel>

        {!isFund && (
          <Panel title="Financials" subtitle={fin?.periodEnd ? `Trailing twelve months to ${fmtDate(fin.periodEnd)}` : "From SEC filings"}>
            {finErr ? <ErrorState error={finErr} what="financials" /> : fin ? <FinancialsBody fin={fin} /> : <StatSkeleton />}
          </Panel>
        )}

        <Panel title="Latest news" subtitle="With AI sentiment for this ticker">
          {newsErr ? <ErrorState error={newsErr} what="news" /> : news ? <NewsList items={news.items} /> : <NewsSkeleton />}
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel title="52-week range">{s ? <RangeBar low={s.stats.low52} high={s.stats.high52} price={q?.price ?? null} /> : <Skeleton className="h-16 w-full" />}</Panel>

        <Panel
          title="Volatility"
          subtitle="Historical, annualized"
          action={
            <Link href={`/stock/${T}/options`} className="chip hover:text-ink">
              <Layers className="size-3" /> Options
            </Link>
          }
        >
          {s ? <VolBody hv30={s.stats.hv30} hv90={s.stats.hv90} price={q?.price ?? null} /> : <Skeleton className="h-24 w-full" />}
        </Panel>

        <Panel title="About">{s ? <About s={s} /> : <Skeleton className="h-40 w-full" />}</Panel>

        <Panel title="Dividends & splits">
          {divErr ? <ErrorState error={divErr} what="dividends" /> : div ? <DividendsBody div={div} /> : <Skeleton className="h-32 w-full" />}
        </Panel>
      </div>
    </Reveal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={clsx("num mt-1 text-[15px]", tone == null ? "text-ink" : tone >= 0 ? "text-up" : "text-down")}>{value}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function RangeBar({ low, high, price }: { low: number | null; high: number | null; price: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = low != null && high != null && price != null && high > low ? (price - low) / (high - low) : null;
  useGSAP(
    () => {
      if (pct == null) return;
      const to = { left: `${pct * 100}%` };
      if (prefersReducedMotion()) gsap.set("[data-marker]", to);
      else gsap.fromTo("[data-marker]", { left: "0%" }, { ...to, duration: 1.8, ease: "expo.out", delay: 0.2 });
      gsap.fromTo("[data-fill]", { width: "0%" }, { width: `${pct * 100}%`, duration: 1.8, ease: "expo.out", delay: 0.2 });
    },
    { scope: ref, dependencies: [pct] },
  );
  return (
    <div ref={ref}>
      <div className="relative mt-6 h-2 rounded-full bg-white/[0.06]">
        <div data-fill className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-down/70 via-warn/70 to-up/80" />
        <div data-marker className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="size-4 rounded-full border-2 border-bg bg-white shadow-[0_0_0_4px_rgb(255_255_255/0.12),0_0_20px_rgb(255_255_255/0.5)]" />
        </div>
      </div>
      <div className="mt-3 flex justify-between text-xs">
        <div>
          <p className="text-faint">Low</p>
          <p className="num text-ink">{fmtPrice(low)}</p>
        </div>
        <div className="text-center">
          <p className="text-faint">From high</p>
          <p className="num text-ink">{price && high ? fmtPct(price / high - 1) : "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-faint">High</p>
          <p className="num text-ink">{fmtPrice(high)}</p>
        </div>
      </div>
    </div>
  );
}

function VolBody({ hv30, hv90, price }: { hv30: number | null; hv90: number | null; price: number | null }) {
  const move = price && hv30 ? price * hv30 * Math.sqrt(21 / 252) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="label">30-day</p>
          <AnimatedNumber value={hv30 != null ? hv30 * 100 : null} format={(n) => `${n.toFixed(1)}%`} className="num mt-1 block text-2xl font-semibold" />
        </div>
        <div>
          <p className="label">90-day</p>
          <AnimatedNumber value={hv90 != null ? hv90 * 100 : null} format={(n) => `${n.toFixed(1)}%`} className="num mt-1 block text-2xl font-semibold text-muted" />
        </div>
      </div>
      {move != null && price != null && (
        <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-muted">
          1-month ±1σ range from 30-day vol:{" "}
          <span className="num text-ink">
            ${fmtPrice(price - move)} – ${fmtPrice(price + move)}
          </span>{" "}
          <span className="text-faint">(±{fmtPct(move / price, 1, false)})</span>
        </div>
      )}
    </div>
  );
}

function About({ s }: { s: NonNullable<ReturnType<typeof useStock>["data"]> }) {
  const [more, setMore] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      {s.description && (
        <div>
          <p className={clsx("leading-relaxed text-muted", !more && "line-clamp-5")}>{s.description}</p>
          {s.description.length > 280 && (
            <button onClick={() => setMore((m) => !m)} className="mt-1 text-xs text-accent-2 hover:underline">
              {more ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
      <div className="space-y-2.5 text-xs">
        {s.industry && <Meta icon={Building2} label={s.industry} />}
        {s.hq && <Meta icon={MapPin} label={s.hq} />}
        {s.employees != null && <Meta icon={Users} label={`${s.employees.toLocaleString()} employees`} />}
        {s.listDate && <Meta icon={Calendar} label={`Listed ${fmtDate(s.listDate)}`} />}
        {s.homepage && (
          <a href={s.homepage} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-accent-2 hover:underline">
            <Globe className="size-3.5" />
            {s.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
  return (
    <p className="flex items-center gap-2.5 text-muted">
      <Icon className="size-3.5 text-faint" />
      {label}
    </p>
  );
}

function FinancialsBody({ fin }: { fin: Financials }) {
  const ref = useRef<HTMLDivElement>(null);
  const qs = fin.quarters.filter((q) => q.revenue != null);
  const max = Math.max(1, ...qs.map((q) => Math.abs(q.revenue ?? 0)));

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-bar]", { scaleY: 0, transformOrigin: "bottom", stagger: 0.05, duration: 1.2, ease: "expo.out" });
      gsap.from("[data-margin]", { width: 0, stagger: 0.1, duration: 1.4, ease: "expo.out" });
    },
    { scope: ref, dependencies: [qs.length] },
  );

  const margins = [
    { label: "Gross margin", v: fin.ttm.grossMargin },
    { label: "Operating margin", v: fin.ttm.operatingMargin },
    { label: "Net margin", v: fin.ttm.netMargin },
  ];

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Revenue" value={fmtUsdCompact(fin.ttm.revenue)} />
          <Stat label="Net income" value={fmtUsdCompact(fin.ttm.netIncome)} tone={fin.ttm.netIncome} />
          <Stat label="Operating cash flow" value={fmtUsdCompact(fin.ttm.operatingCashFlow)} />
          <Stat label="Return on equity" value={fmtPct(fin.ttm.roe, 1, false)} />
        </div>
        <div className="space-y-3">
          {margins.map((m) => (
            <div key={m.label}>
              <div className="flex justify-between text-xs">
                <span className="text-muted">{m.label}</span>
                <span className="num text-ink">{fmtPct(m.v, 1, false)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  data-margin
                  className={clsx("h-full rounded-full", (m.v ?? 0) >= 0 ? "bg-gradient-to-r from-accent to-accent-2" : "bg-down")}
                  style={{ width: `${Math.min(100, Math.abs(m.v ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="label mb-3">Quarterly revenue &amp; net income</p>
        {qs.length ? (
          <div className="flex h-44 items-end gap-2">
            {qs.map((q) => (
              <div key={q.end} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${q.label}: revenue ${fmtUsdCompact(q.revenue)}, net income ${fmtUsdCompact(q.netIncome)}`}>
                <span className="num text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">{fmtUsdCompact(q.revenue)}</span>
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div data-bar className="w-full max-w-[30px] rounded-t-md bg-gradient-to-t from-accent/40 to-accent-2/80" style={{ height: `${(Math.abs(q.revenue ?? 0) / max) * 100}%` }} />
                  <div
                    data-bar
                    className={clsx("absolute bottom-0 w-[45%] max-w-[14px] rounded-t-sm", (q.netIncome ?? 0) >= 0 ? "bg-up/90" : "bg-down/90")}
                    style={{ height: `${(Math.abs(q.netIncome ?? 0) / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] whitespace-nowrap text-faint">{q.label.replace(/ (\d{2})(\d{2})$/, " '$2")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No quarterly filings available.</p>
        )}
      </div>
    </div>
  );
}

const SENTIMENT = {
  positive: "pill-up",
  negative: "pill-down",
  neutral: "",
} as const;

function NewsList({ items }: { items: News["items"] }) {
  if (!items.length) return <p className="text-sm text-muted">No recent news.</p>;
  return (
    <div className="-mx-2 divide-y divide-line">
      {items.slice(0, 10).map((n) => (
        <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="group flex gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-white/[0.03]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-faint">
              <span className="font-medium text-muted">{n.publisher}</span>·<span>{timeAgo(n.published)}</span>
              {n.sentiment && (
                <span className={clsx("chip !py-0 !text-[10px] capitalize", SENTIMENT[n.sentiment])} title={n.sentimentReason ?? undefined}>
                  {n.sentiment}
                </span>
              )}
            </div>
            <p className="mt-1 leading-snug font-medium text-ink/90 group-hover:text-ink">{n.title}</p>
            {n.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{n.description}</p>}
          </div>
          {n.image && (
            // eslint-disable-next-line @next/next/no-img-element -- third-party publisher images
            <img src={n.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} className="hidden h-20 w-28 shrink-0 rounded-lg border border-line object-cover opacity-80 transition-opacity group-hover:opacity-100 sm:block" />
          )}
          <ArrowUpRight className="size-4 shrink-0 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink sm:hidden" />
        </a>
      ))}
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="hidden h-20 w-28 sm:block" />
        </div>
      ))}
    </div>
  );
}

const FREQ: Record<number, string> = { 1: "Annual", 2: "Semi-annual", 4: "Quarterly", 12: "Monthly", 0: "One-time" };

function DividendsBody({ div }: { div: Dividends }) {
  if (!div.history.length && !div.splits.length) return <p className="text-sm text-muted">No dividends or splits on record.</p>;
  return (
    <div className="space-y-4">
      {div.history.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Yield" value={div.yield ? fmtPct(div.yield, 2, false) : "—"} />
          <Stat label="TTM / share" value={fmtUsd(div.ttmPerShare, 3)} />
          <Stat label="Frequency" value={div.frequency != null ? (FREQ[div.frequency] ?? `${div.frequency}×/yr`) : "—"} />
        </div>
      )}
      {div.history.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0d0f18] text-faint">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ex-date</th>
                <th className="px-3 py-2 text-left font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {div.history.map((d) => (
                <tr key={d.exDate + d.amount} className="row-hover border-t border-line">
                  <td className="px-3 py-2 text-muted">{fmtDate(d.exDate)}</td>
                  <td className="px-3 py-2 text-faint">{d.payDate ? fmtDate(d.payDate, { month: "short", day: "numeric" }) : "—"}</td>
                  <td className="num px-3 py-2 text-right">{fmtUsd(d.amount, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {div.splits.length > 0 && (
        <div>
          <p className="label mb-2">Splits</p>
          <div className="flex flex-wrap gap-2">
            {div.splits.map((sp) => (
              <span key={sp.date} className="chip">
                <span className="num text-ink">
                  {sp.to}:{sp.from}
                </span>
                {fmtDate(sp.date)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
