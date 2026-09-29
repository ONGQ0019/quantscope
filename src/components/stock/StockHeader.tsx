"use client";

import clsx from "clsx";
import { Calculator, LayoutDashboard, Layers, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import useSWR from "swr";
import { fmtDate, fmtPrice } from "@/lib/format";
import { ApiError } from "@/lib/client/fetcher";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { useLocalStorage } from "@/lib/client/hooks";
import type { StockSummary } from "@/lib/server/stock";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { ChangePill } from "../ui/ChangePill";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { TickerLogo } from "../ui/TickerLogo";

export function useStock(ticker: string) {
  return useSWR<StockSummary>(`/api/stock/${encodeURIComponent(ticker)}`);
}

export function StockHeader({ ticker }: { ticker: string }) {
  const { data, error } = useStock(ticker);
  const ref = useRef<HTMLDivElement>(null);
  const [watch, setWatch] = useLocalStorage<string[]>("qs:watchlist", []);
  const watching = watch.includes(ticker);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-h]", { opacity: 0, y: 18, filter: "blur(6px)", stagger: 0.06, duration: 1, ease: "expo.out", clearProps: "filter" });
    },
    { scope: ref, dependencies: [ticker] },
  );

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="glass p-6">
        {notFound ? (
          <div>
            <p className="text-lg font-semibold">We couldn&apos;t find “{ticker}”.</p>
            <p className="mt-1 text-sm text-muted">Press ⌘K to search by company name.</p>
          </div>
        ) : (
          <ErrorState error={error} what={`${ticker} data`} />
        )}
      </div>
    );
  }

  const q = data?.quote;
  return (
    <div ref={ref}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div data-h>
            <TickerLogo ticker={ticker} size={60} tryLogo={data?.hasLogo ?? false} className="shadow-[0_10px_40px_-10px_rgb(139_123_255/0.5)]" />
          </div>
          <div className="min-w-0">
            <div data-h className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{ticker}</h1>
              {data?.typeLabel && <span className="chip">{data.typeLabel}</span>}
              {data?.exchange && <span className="chip">{data.exchange}</span>}
              <button
                onClick={() => setWatch((w) => (watching ? w.filter((t) => t !== ticker) : [ticker, ...w]))}
                className={clsx("chip transition-colors", watching ? "border-warn/30 text-warn" : "hover:text-ink")}
                aria-pressed={watching}
              >
                <Star className={clsx("size-3", watching && "fill-current")} />
                {watching ? "Watching" : "Watch"}
              </button>
            </div>
            <div data-h className="mt-1 truncate text-sm text-muted">
              {data ? data.name : <Skeleton className="h-4 w-56" />}
              {data?.industry && <span className="text-faint"> · {data.industry}</span>}
            </div>
          </div>
        </div>

        <div data-h className="flex items-end gap-4">
          {q ? (
            <div className="text-left lg:text-right">
              <div className="flex items-baseline gap-3 lg:justify-end">
                <AnimatedNumber value={q.price} from={q.prevClose ?? q.price * 0.98} format={(n) => `$${fmtPrice(n)}`} className="num text-4xl font-semibold tracking-tight sm:text-5xl" />
              </div>
              <div className="mt-2 flex items-center gap-2 lg:justify-end">
                <span className={clsx("num text-sm", (q.change ?? 0) >= 0 ? "text-up" : "text-down")}>
                  {q.change != null ? `${q.change >= 0 ? "+" : ""}${fmtPrice(q.change)}` : ""}
                </span>
                <ChangePill value={q.changePct} />
                <span className="text-xs text-faint">
                  {q.delayed === "eod" ? `Close · ${fmtDate(q.date, { month: "short", day: "numeric" })}` : "15-min delayed"}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-12 w-48" />
              <Skeleton className="ml-auto h-5 w-36" />
            </div>
          )}
        </div>
      </div>
      <div data-h className="mt-6">
        <StockTabs ticker={ticker} />
      </div>
    </div>
  );
}

function StockTabs({ ticker }: { ticker: string }) {
  const pathname = usePathname();
  const base = `/stock/${encodeURIComponent(ticker)}`;
  const tabs = [
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/options`, label: "Options", icon: Layers },
    { href: `${base}/simulate`, label: "Simulate", icon: Calculator },
  ];
  const active = [...tabs].reverse().find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.href ?? base;
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!el || !bar.current) return;
    const props = { x: el.offsetLeft, width: el.offsetWidth };
    if (first.current) {
      gsap.set(bar.current, props);
      first.current = false;
    } else gsap.to(bar.current, { ...props, duration: 0.6, ease: "expo.out" });
  }, [active]);

  return (
    <div ref={wrap} className="relative flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          data-tab={t.href}
          scroll={false}
          className={clsx(
            "flex items-center gap-2 px-4 pt-1 pb-3 text-sm transition-colors",
            active === t.href ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          <t.icon className="size-4" />
          {t.label}
        </Link>
      ))}
      <div ref={bar} className="absolute -bottom-px left-0 h-[2px] rounded-full bg-gradient-to-r from-accent to-accent-2 shadow-[0_0_12px_rgb(139_123_255/0.8)]" />
    </div>
  );
}
