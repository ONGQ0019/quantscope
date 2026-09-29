"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import { gsap } from "@/lib/client/gsap";
import { usePalette } from "./CommandPalette";
import { LogoMark } from "./Logo";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/scanner", label: "Scanner" },
  { href: "/simulate", label: "Simulator" },
];

type Status = {
  plan: "basic" | "paid";
  rateLimitPerMin: number | null;
  queued: number;
  historyYears: number;
  session: "pre" | "open" | "after" | "closed";
  hasKey: boolean;
};

const SESSION_LABEL = { pre: "Pre-market", open: "Market open", after: "After hours", closed: "Market closed" };

export function TopNav() {
  const pathname = usePathname();
  const { open } = usePalette();
  const [scrolled, setScrolled] = useState(false);
  const { data: status } = useSWR<Status>("/api/status", { refreshInterval: 15_000, dedupingInterval: 5000 });
  const navRef = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);

  const activeHref = LINKS.find((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)))?.href;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const movePill = (href: string | undefined, animate = true) => {
    const el = href ? navRef.current?.querySelector<HTMLElement>(`[data-href="${href}"]`) : null;
    if (!pill.current) return;
    if (!el) {
      gsap.to(pill.current, { opacity: 0, duration: 0.3 });
      return;
    }
    const props = { x: el.offsetLeft, width: el.offsetWidth, opacity: 1 };
    if (animate) gsap.to(pill.current, { ...props, duration: 0.6, ease: "expo.out" });
    else gsap.set(pill.current, props);
  };

  useLayoutEffect(() => {
    movePill(activeHref, false);
  }, [activeHref]);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={clsx(
          "mx-auto flex h-14 max-w-[1400px] items-center gap-3 rounded-2xl border px-3 transition-all duration-500 sm:px-4",
          scrolled ? "border-line bg-[#090a12]/75 shadow-[0_10px_40px_-20px_black] backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 pr-2" aria-label="Quantscope home">
          <LogoMark />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">
            Quant<span className="text-gradient-accent">scope</span>
          </span>
        </Link>

        <nav ref={navRef} className="relative hidden items-center md:flex" onMouseLeave={() => movePill(activeHref)}>
          <div ref={pill} className="absolute top-0 bottom-0 left-0 rounded-lg bg-white/[0.07] opacity-0" />
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              data-href={l.href}
              onMouseEnter={() => movePill(l.href)}
              className={clsx(
                "relative z-10 rounded-lg px-3.5 py-1.5 text-sm transition-colors",
                activeHref === l.href ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => open()}
          className="group ml-auto flex h-9 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-white/[0.03] px-3 text-sm text-muted transition-colors hover:border-line-strong hover:bg-white/[0.06] md:w-[320px]"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden truncate md:inline">Search any ticker…</span>
          <kbd className="ml-auto hidden md:inline">⌘K</kbd>
        </button>

        {status && (
          <div className="hidden items-center gap-2 lg:flex">
            <span className="chip" title="Approximate — exchange holidays are not accounted for">
              <span className="relative flex size-1.5">
                {status.session === "open" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-75" />}
                <span className={clsx("relative inline-flex size-1.5 rounded-full", status.session === "open" ? "bg-up" : status.session === "closed" ? "bg-faint" : "bg-warn")} />
              </span>
              {SESSION_LABEL[status.session]}
            </span>
            <span
              className={clsx("chip", status.plan === "basic" && "border-warn/25 text-warn/90")}
              title={
                status.plan === "basic"
                  ? `Massive free plan: ${status.rateLimitPerMin} calls/min, ${status.historyYears}y history, end-of-day data. Responses are cached so each ticker only costs calls once.`
                  : "Massive paid plan"
              }
            >
              {status.plan === "basic" ? "Free data plan" : "Pro data"}
              {status.queued > 0 && <span className="num text-[10px] text-muted">· {status.queued} queued</span>}
            </span>
          </div>
        )}
      </div>

      <nav className="mx-auto mt-2 flex max-w-[1400px] gap-1 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={clsx("flex-1 rounded-lg px-2 py-1.5 text-center text-xs", activeHref === l.href ? "bg-white/[0.07] text-ink" : "text-muted")}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
