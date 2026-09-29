"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { fmtDate } from "@/lib/format";
import { nyToday } from "@/lib/dates";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";
import { usePalette } from "../shell/CommandPalette";

const QUICK = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "SPY"];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { open } = usePalette();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-hero]", { opacity: 0, y: 8, duration: 0.5, stagger: 0.06, ease: "power2.out" });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="pt-12 pb-10 sm:pt-16">
      <p data-hero className="text-sm text-muted" suppressHydrationWarning>
        {fmtDate(nyToday(), { weekday: "long", month: "long", day: "numeric" })}
      </p>
      <h1 data-hero className="mt-2 max-w-3xl text-[clamp(2rem,4.2vw,3rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">
        Research any US stock or option.
      </h1>
      <p data-hero className="mt-3 max-w-2xl text-[15px] text-muted">
        Quotes, option chains with greeks, market-wide scans and investment simulations, in one place.
      </p>

      <div data-hero className="mt-7 flex max-w-2xl flex-col gap-3">
        <button
          onClick={() => open()}
          className="flex h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left shadow-[var(--shadow)] transition-colors hover:border-line-strong"
        >
          <Search className="size-[18px] text-faint" />
          <span className="flex-1 text-[15px] text-faint">Search by ticker or company name</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-faint">Popular</span>
          {QUICK.map((t) => (
            <Link key={t} href={`/stock/${t}`} className="chip transition-colors hover:border-line-strong hover:text-ink">
              {t}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
