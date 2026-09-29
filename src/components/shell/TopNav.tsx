"use client";

import clsx from "clsx";
import { Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useTheme } from "@/lib/client/theme";
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
};

const SESSION = {
  pre: { label: "Pre-market", dot: "bg-warn" },
  open: { label: "Market open", dot: "bg-up" },
  after: { label: "After hours", dot: "bg-warn" },
  closed: { label: "Market closed", dot: "bg-faint" },
};

export function TopNav() {
  const pathname = usePathname();
  const { open } = usePalette();
  const { theme, setTheme } = useTheme();
  const { data: status } = useSWR<Status>("/api/status", { refreshInterval: 15_000, dedupingInterval: 5000 });
  const activeHref = LINKS.find((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)))?.href;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-4 flex items-center gap-2 text-ink" aria-label="Quantscope home">
          <LogoMark />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">Quantscope</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                activeHref === l.href ? "font-medium text-ink" : "text-muted hover:bg-subtle hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => open()}
          className="ml-auto flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-faint transition-colors hover:border-line-strong md:w-[300px]"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden md:inline">Search</span>
          <kbd className="ml-auto hidden md:inline">⌘K</kbd>
        </button>

        {status && (
          <div className="hidden items-center gap-3 pl-2 text-xs text-muted lg:flex">
            <span className="flex items-center gap-1.5" title="Approximate. Exchange holidays aren't accounted for.">
              <span className={clsx("size-1.5 rounded-full", SESSION[status.session].dot)} />
              {SESSION[status.session].label}
            </span>
            {status.plan === "basic" && (
              <span
                className="chip"
                title={`Massive free plan: ${status.rateLimitPerMin} calls/min, ${status.historyYears} years of history, end-of-day prices. Responses are cached, so each ticker only costs its calls once.`}
              >
                Free data{status.queued > 0 && <span className="num text-faint">· {status.queued} queued</span>}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>

      <nav className="mx-auto flex max-w-[1320px] gap-1 px-4 pb-2 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={clsx("flex-1 rounded-md py-1.5 text-center text-xs", activeHref === l.href ? "bg-subtle font-medium text-ink" : "text-muted")}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
