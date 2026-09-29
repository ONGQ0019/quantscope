"use client";

import clsx from "clsx";
import { ArrowRight, Calculator, Layers, Radar } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtUsdCompact } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import type { ScanRow } from "@/lib/server/market";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { ChangePill } from "../ui/ChangePill";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { Sparkline } from "../ui/Sparkline";
import { ErrorState } from "../ui/States";
import { TickerLogo } from "../ui/TickerLogo";
import { Hero } from "./Hero";

type IndexCard = { ticker: string; label: string; price: number; change: number | null; changePct: number | null; date: string; spark: number[] };
type Movers = {
  date: string;
  gainers: ScanRow[];
  losers: ScanRow[];
  active: ScanRow[];
  breadth: { advancers: number; decliners: number; unchanged: number };
};

const INDICES = [
  { ticker: "SPY", label: "S&P 500" },
  { ticker: "QQQ", label: "Nasdaq 100" },
  { ticker: "DIA", label: "Dow Jones" },
  { ticker: "IWM", label: "Russell 2000" },
];

export function HomeView() {
  const { data: movers, error: moversError } = useSWR<Movers>("/api/market/movers");
  return (
    <>
      <Hero />
      <Reveal className="space-y-4" deps={[Boolean(movers)]}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {INDICES.map((i) => (
            <IndexTile key={i.ticker} ticker={i.ticker} label={i.label} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <MoversPanel movers={movers} error={moversError} />
          <BreadthPanel movers={movers} />
        </div>
        <Tools />
      </Reveal>
    </>
  );
}

function IndexTile({ ticker, label }: { ticker: string; label: string }) {
  const { data, error } = useSWR<IndexCard>(`/api/market/index/${ticker}`);
  const up = (data?.changePct ?? 0) >= 0;
  return (
    <Link href={`/stock/${ticker}`} data-reveal className="card block p-4 transition-colors hover:border-line-strong">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-faint">{ticker}</p>
      </div>
      {data ? (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <AnimatedNumber value={data.price} format={(n) => fmtPrice(n)} from={data.price * 0.995} duration={0.9} className="num text-xl font-semibold tracking-tight" />
            <span className={clsx("num text-sm font-medium", up ? "text-up" : "text-down")}>{fmtPct(data.changePct)}</span>
          </div>
          <Sparkline data={data.spark} width={300} height={44} className="mt-3 h-11 w-full" />
          <p className="mt-2 text-[11px] text-faint">3 months · close {fmtDate(data.date, { month: "short", day: "numeric" })}</p>
        </>
      ) : error ? (
        <p className="mt-6 text-xs text-muted">Unavailable</p>
      ) : (
        <>
          <Skeleton className="mt-2 h-7 w-28" />
          <Skeleton className="mt-3 h-11 w-full" />
          <Skeleton className="mt-2 h-3 w-24" />
        </>
      )}
    </Link>
  );
}

type Tab = "gainers" | "losers" | "active";

function MoversPanel({ movers, error }: { movers?: Movers; error?: unknown }) {
  const [tab, setTab] = useState<Tab>("gainers");
  const list = useRef<HTMLDivElement>(null);
  const rows = movers?.[tab] ?? [];

  useGSAP(
    () => {
      if (!rows.length || prefersReducedMotion()) return;
      gsap.fromTo("[data-mover]", { opacity: 0 }, { opacity: 1, stagger: 0.025, duration: 0.35, ease: "none" });
    },
    { scope: list, dependencies: [tab, rows.length] },
  );

  return (
    <Panel
      title="Movers"
      subtitle={movers ? `Stocks and ETFs over $5M traded · ${fmtDate(movers.date)}` : "Scanning every US listing"}
      action={
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "gainers", label: "Gainers" },
            { value: "losers", label: "Losers" },
            { value: "active", label: "Most active" },
          ]}
        />
      }
    >
      <div ref={list} className="-mx-2">
        {error ? (
          <div className="px-2">
            <ErrorState error={error} what="market movers" />
          </div>
        ) : !movers ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2.5">
              <Skeleton className="size-8" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center gap-3 px-2 pb-1.5 text-xs text-faint">
              <span className="flex-1">Symbol</span>
              <span className="hidden w-20 text-right sm:block">$ Volume</span>
              <span className="w-20 text-right">Price</span>
              <span className="w-[76px] text-right">Change</span>
            </div>
            {rows.map((r) => (
            <Link key={r.ticker} data-mover href={`/stock/${r.ticker}`} className="row-hover flex items-center gap-3 rounded-lg px-2 py-2">
              <TickerLogo ticker={r.ticker} size={32} tryLogo={false} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.ticker}</p>
                <p className="truncate text-xs text-muted">{r.name}</p>
              </div>
              <p className="num hidden w-20 text-right text-xs text-muted sm:block">{fmtUsdCompact(r.dollarVolume)}</p>
              <p className="num w-20 text-right text-sm">{fmtPrice(r.price)}</p>
              <ChangePill value={r.changePct} className="w-[76px] justify-end" />
            </Link>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

function BreadthPanel({ movers }: { movers?: Movers }) {
  const ref = useRef<HTMLDivElement>(null);
  const b = movers?.breadth;
  const total = b ? b.advancers + b.decliners + b.unchanged : 0;
  const advPct = b && total ? b.advancers / total : 0;
  const decPct = b && total ? b.decliners / total : 0;

  useGSAP(
    () => {
      if (!b || prefersReducedMotion()) return;
      gsap.from("[data-grow]", { scaleX: 0, duration: 0.9, ease: "power3.out", stagger: 0.04 });
    },
    { scope: ref, dependencies: [b?.advancers] },
  );

  const top = movers?.active.slice(0, 6) ?? [];
  const maxDv = Math.max(1, ...top.map((r) => r.dollarVolume));

  return (
    <Panel title="Breadth" subtitle="Every US listing, last session">
      <div ref={ref}>
        {b ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="num text-2xl font-semibold text-up">{fmtCompact(b.advancers)}</p>
                <p className="text-xs text-muted">Advancing</p>
              </div>
              <div className="text-right">
                <p className="num text-2xl font-semibold text-down">{fmtCompact(b.decliners)}</p>
                <p className="text-xs text-muted">Declining</p>
              </div>
            </div>
            <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
              <div data-grow className="h-full origin-left bg-up" style={{ width: `${advPct * 100}%` }} />
              <div className="h-full flex-1 bg-subtle" />
              <div data-grow className="h-full origin-right bg-down" style={{ width: `${decPct * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              <span className="num text-ink">{fmtPct(advPct, 1, false)}</span> of {total.toLocaleString()} listings closed higher.
            </p>

            <div className="mt-6 border-t border-line pt-4">
              <p className="label mb-3">Most traded by dollar volume</p>
              <div className="space-y-3">
                {top.map((r) => (
                  <Link key={r.ticker} href={`/stock/${r.ticker}`} className="group block">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium group-hover:underline">{r.ticker}</span>
                      <span className="num text-muted">{fmtUsdCompact(r.dollarVolume)}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-subtle">
                      <div data-grow className="h-full origin-left rounded-full bg-accent/70" style={{ width: `${(r.dollarVolume / maxDv) * 100}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-6 h-32 w-full" />
          </div>
        )}
      </div>
    </Panel>
  );
}

const TOOLS = [
  {
    href: "/stock/AAPL/options",
    icon: Layers,
    title: "Option chains",
    body: "Every strike and expiry with greeks, probability ITM and a strategy builder.",
  },
  {
    href: "/simulate",
    icon: Calculator,
    title: "Investment simulator",
    body: "Lump sum or monthly, dividends reinvested, compared with the S&P 500.",
  },
  {
    href: "/scanner",
    icon: Radar,
    title: "Market scanner",
    body: "Filter every US stock and ETF by price, change, gaps and volume.",
  },
];

function Tools() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {TOOLS.map(({ href, icon: Icon, title, body }) => (
        <Link key={href} href={href} data-reveal className="card group flex items-start gap-4 p-5 transition-colors hover:border-line-strong">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-subtle text-muted">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {title}
              <ArrowRight className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
