"use client";

import clsx from "clsx";
import { Star } from "lucide-react";
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
      gsap.from("[data-h]", { opacity: 0, y: 6, stagger: 0.05, duration: 0.45, ease: "power2.out" });
    },
    { scope: ref, dependencies: [ticker] },
  );

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="card p-6">
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
  const up = (q?.change ?? 0) >= 0;
  return (
    <div ref={ref}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div data-h>
            <TickerLogo ticker={ticker} size={52} tryLogo={data?.hasLogo ?? false} className="rounded-xl" />
          </div>
          <div className="min-w-0">
            <div data-h className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{data?.name ?? ticker}</h1>
            </div>
            <div data-h className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="font-medium text-ink">{ticker}</span>
              {data?.exchange && <span>· {data.exchange}</span>}
              {data?.typeLabel && <span>· {data.typeLabel}</span>}
              {data?.industry && <span className="hidden sm:inline">· {data.industry}</span>}
              <button
                onClick={() => setWatch((w) => (watching ? w.filter((t) => t !== ticker) : [ticker, ...w]))}
                className={clsx("chip ml-1 transition-colors", watching ? "text-ink" : "hover:text-ink")}
                aria-pressed={watching}
              >
                <Star className={clsx("size-3", watching && "fill-warn text-warn")} />
                {watching ? "Watching" : "Watch"}
              </button>
            </div>
          </div>
        </div>

        <div data-h>
          {q ? (
            <div className="lg:text-right">
              <AnimatedNumber
                value={q.price}
                from={q.prevClose ?? q.price}
                duration={0.9}
                format={(n) => `$${fmtPrice(n)}`}
                className="num block text-3xl font-semibold tracking-tight sm:text-4xl"
              />
              <div className="mt-1.5 flex items-center gap-2 lg:justify-end">
                <span className={clsx("num text-sm font-medium", up ? "text-up" : "text-down")}>
                  {q.change != null ? `${q.change >= 0 ? "+" : ""}${fmtPrice(q.change)}` : ""}
                </span>
                <ChangePill value={q.changePct} />
                <span className="text-xs text-faint">
                  {q.delayed === "eod" ? `At close, ${fmtDate(q.date, { month: "short", day: "numeric" })}` : "15-min delayed"}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-5 w-36 lg:ml-auto" />
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
    { href: base, label: "Overview" },
    { href: `${base}/options`, label: "Options" },
    { href: `${base}/simulate`, label: "Simulate" },
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
    } else gsap.to(bar.current, { ...props, duration: 0.35, ease: "power3.out" });
  }, [active]);

  return (
    <div ref={wrap} className="relative flex gap-6 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          data-tab={t.href}
          scroll={false}
          className={clsx("pb-3 text-sm transition-colors", active === t.href ? "font-medium text-ink" : "text-muted hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
      <div ref={bar} className="absolute -bottom-px left-0 h-0.5 bg-ink" />
    </div>
  );
}
