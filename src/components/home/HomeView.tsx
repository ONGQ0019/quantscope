"use client";

import clsx from "clsx";
import { ArrowUpRight, Calculator, Layers, Radar } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtUsdCompact } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { useSpotlight } from "@/lib/client/hooks";
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
      {movers && <TickerTape rows={[...movers.active, ...movers.gainers, ...movers.losers]} />}
      <Reveal className="mt-8 space-y-6" deps={[Boolean(movers)]}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {INDICES.map((i) => (
            <IndexTile key={i.ticker} ticker={i.ticker} label={i.label} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <MoversPanel movers={movers} error={moversError} />
          <BreadthPanel movers={movers} />
        </div>
        <Features />
      </Reveal>
    </>
  );
}

function IndexTile({ ticker, label }: { ticker: string; label: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useSpotlight(ref);
  const { data, error } = useSWR<IndexCard>(`/api/market/index/${ticker}`);
  const up = (data?.changePct ?? 0) >= 0;
  return (
    <Link ref={ref} href={`/stock/${ticker}`} data-reveal className="glass spotlight group block overflow-hidden p-4 sm:p-5">
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-0.5 text-sm font-semibold tracking-tight">{ticker}</p>
        </div>
        <ArrowUpRight className="size-4 text-faint transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      {data ? (
        <>
          <div className="relative mt-3 flex items-end justify-between gap-2">
            <AnimatedNumber value={data.price} format={(n) => fmtPrice(n)} from={data.price * 0.97} className="num text-xl font-semibold sm:text-2xl" />
            <span className={clsx("num text-xs font-medium sm:text-sm", up ? "text-up" : "text-down")}>{fmtPct(data.changePct)}</span>
          </div>
          <Sparkline data={data.spark} width={300} height={54} className="relative mt-3 h-[54px] w-full" />
          <p className="relative mt-2 text-[11px] text-faint">90 days · close {fmtDate(data.date, { month: "short", day: "numeric" })}</p>
        </>
      ) : error ? (
        <p className="mt-6 text-xs text-down">Unavailable</p>
      ) : (
        <>
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-3 h-[54px] w-full" />
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
      gsap.fromTo("[data-mover]", { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.7, ease: "expo.out" });
    },
    { scope: list, dependencies: [tab, rows.length] },
  );

  return (
    <Panel
      title="Market movers"
      subtitle={movers ? `Liquid US stocks & ETFs · session of ${fmtDate(movers.date)}` : "Scanning every US listing…"}
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
              <Skeleton className="size-9 !rounded-[30%]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))
        ) : (
          rows.map((r) => (
            <Link key={r.ticker} data-mover href={`/stock/${r.ticker}`} className="row-hover flex items-center gap-3 rounded-xl px-2 py-2.5">
              <TickerLogo ticker={r.ticker} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">{r.ticker}</p>
                <p className="truncate text-xs text-muted">{r.name}</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="num text-xs text-muted">{fmtUsdCompact(r.dollarVolume)}</p>
                <p className="text-[10px] text-faint">$ volume</p>
              </div>
              <p className="num w-20 text-right text-sm">${fmtPrice(r.price)}</p>
              <ChangePill value={r.changePct} className="w-[88px] justify-center" />
            </Link>
          ))
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

  useGSAP(
    () => {
      if (!b) return;
      gsap.fromTo("[data-adv]", { width: "0%" }, { width: `${advPct * 100}%`, duration: 1.6, ease: "expo.out", delay: 0.2 });
      gsap.fromTo("[data-dec]", { width: "0%" }, { width: `${(b.decliners / total) * 100}%`, duration: 1.6, ease: "expo.out", delay: 0.2 });
    },
    { scope: ref, dependencies: [b?.advancers] },
  );

  const top = movers?.active.slice(0, 5) ?? [];
  const maxDv = Math.max(1, ...top.map((r) => r.dollarVolume));

  return (
    <Panel title="Market breadth" subtitle="Advancers vs decliners across every listing">
      <div ref={ref}>
        {b ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <AnimatedNumber value={b.advancers} format={(n) => fmtCompact(Math.round(n))} className="num text-3xl font-semibold text-up" />
                <p className="text-xs text-muted">advancing</p>
              </div>
              <div className="text-right">
                <AnimatedNumber value={b.decliners} format={(n) => fmtCompact(Math.round(n))} className="num text-3xl font-semibold text-down" />
                <p className="text-xs text-muted">declining</p>
              </div>
            </div>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/5">
              <div data-adv className="h-full rounded-l-full bg-gradient-to-r from-emerald-500 to-up" />
              <div className="flex-1" />
              <div data-dec className="h-full rounded-r-full bg-gradient-to-l from-rose-500 to-down" />
            </div>
            <p className="mt-2 text-xs text-muted">
              <span className="num text-ink">{fmtPct(advPct, 1, false)}</span> of {fmtCompact(total)} names closed higher
            </p>

            <div className="hairline my-5" />
            <p className="label mb-3">Where the money traded</p>
            <div className="space-y-2.5">
              {top.map((r) => (
                <Link key={r.ticker} href={`/stock/${r.ticker}`} className="group block">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium group-hover:text-accent-2">{r.ticker}</span>
                    <span className="num text-muted">{fmtUsdCompact(r.dollarVolume)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                      style={{ width: `${(r.dollarVolume / maxDv) * 100}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-6 h-32 w-full" />
          </div>
        )}
      </div>
    </Panel>
  );
}

function TickerTape({ rows }: { rows: ScanRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const unique = [...new Map(rows.map((r) => [r.ticker, r])).values()];

  useGSAP(
    () => {
      const track = ref.current?.querySelector<HTMLElement>("[data-track]");
      if (!track || prefersReducedMotion()) return;
      gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: 1.2 });
      const tween = gsap.to(track, { xPercent: -50, duration: unique.length * 2.6, ease: "none", repeat: -1 });
      const el = ref.current!;
      const slow = () => gsap.to(tween, { timeScale: 0.15, duration: 0.6 });
      const fast = () => gsap.to(tween, { timeScale: 1, duration: 0.6 });
      el.addEventListener("mouseenter", slow);
      el.addEventListener("mouseleave", fast);
      return () => {
        el.removeEventListener("mouseenter", slow);
        el.removeEventListener("mouseleave", fast);
      };
    },
    { scope: ref, dependencies: [unique.length] },
  );

  const items = unique.map((r) => (
    <Link key={r.ticker} href={`/stock/${r.ticker}`} className="flex shrink-0 items-center gap-2 px-5 text-sm hover:text-ink">
      <span className="font-semibold text-ink">{r.ticker}</span>
      <span className="num text-muted">{fmtPrice(r.price)}</span>
      <span className={clsx("num", r.changePct >= 0 ? "text-up" : "text-down")}>{fmtPct(r.changePct)}</span>
    </Link>
  ));

  return (
    <div
      ref={ref}
      className="relative -mx-3 overflow-hidden border-y border-line bg-white/[0.015] py-3 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] sm:-mx-5"
    >
      <div data-track className="flex w-max">
        <div className="flex">{items}</div>
        <div className="flex" aria-hidden>
          {items}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    href: "/stock/AAPL/options",
    icon: Layers,
    title: "Option chains, decoded",
    body: "Every strike and expiry with delta, gamma, theta, vega, IV and probability ITM. Click any contract for a live payoff diagram.",
    cta: "Open AAPL chain",
    accent: "from-accent/30",
  },
  {
    href: "/simulate",
    icon: Calculator,
    title: "What if I had invested?",
    body: "Lump sum or monthly DCA, dividends reinvested, split-adjusted, benchmarked against the S&P 500 — with drawdowns and IRR.",
    cta: "Run a simulation",
    accent: "from-accent-2/30",
  },
  {
    href: "/scanner",
    icon: Radar,
    title: "Scan the whole market",
    body: "Filter 10,000+ stocks and ETFs by price, % change, gaps, volume and dollar volume. Sort anything, instantly.",
    cta: "Open scanner",
    accent: "from-accent-3/30",
  },
];

function Features() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {FEATURES.map((f) => (
        <FeatureCard key={f.href} {...f} />
      ))}
    </div>
  );
}

function FeatureCard({ href, icon: Icon, title, body, cta, accent }: (typeof FEATURES)[number]) {
  const ref = useRef<HTMLAnchorElement>(null);
  useSpotlight(ref);
  return (
    <Link ref={ref} href={href} data-reveal className="glass spotlight group block overflow-hidden p-6">
      <div className={clsx("absolute -top-24 -right-16 size-56 rounded-full bg-gradient-to-br to-transparent blur-3xl transition-opacity duration-700 group-hover:opacity-100 opacity-60", accent)} />
      <div className="relative">
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-white/[0.05] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-6deg]">
          <Icon className="size-5 text-ink" />
        </span>
        <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-2">
          {cta}
          <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  );
}
