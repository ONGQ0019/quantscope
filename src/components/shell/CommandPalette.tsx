"use client";

import clsx from "clsx";
import { ArrowRight, Calculator, Clock, CornerDownLeft, Radar, Search, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";
import { useLocalStorage } from "@/lib/client/hooks";
import { TickerLogo } from "../ui/TickerLogo";

type TickerHit = { ticker: string; name: string; type: string; exchange: string };
type Item =
  | { kind: "ticker"; hit: TickerHit; recent?: boolean }
  | { kind: "page"; label: string; href: string; icon: ReactNode; hint: string };

const PaletteCtx = createContext<{ open: (initial?: string) => void }>({ open: () => {} });
export const usePalette = () => useContext(PaletteCtx);

const PAGES: Extract<Item, { kind: "page" }>[] = [
  { kind: "page", label: "Markets", href: "/", icon: <TrendingUp className="size-4" />, hint: "Indices and movers" },
  { kind: "page", label: "Scanner", href: "/scanner", icon: <Radar className="size-4" />, hint: "Filter every US listing" },
  { kind: "page", label: "Simulator", href: "/simulate", icon: <Calculator className="size-4" />, hint: "What if I had invested" },
];

const TYPE_LABEL: Record<string, string> = { CS: "Stock", ETF: "ETF", ADRC: "ADR", FUND: "Fund", ETN: "ETN", ETV: "ETV", ETS: "ETS" };

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const open = useCallback((initial = "") => {
    setSeed(initial);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSeed("");
        setOpen((o) => !o);
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        open();
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[a-zA-Z]$/.test(e.key) && !isOpen) {
        // Start typing a ticker anywhere to search.
        open(e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isOpen]);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <PaletteCtx.Provider value={value}>
      {children}
      {isOpen && <Palette seed={seed} onClose={() => setOpen(false)} />}
    </PaletteCtx.Provider>
  );
}

function Palette({ seed, onClose }: { seed: string; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState(seed);
  const [hits, setHits] = useState<TickerHit[]>([]);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useLocalStorage<TickerHit[]>("qs:recent", []);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline();
    tl.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none" });
    tl.fromTo(panel.current, { opacity: 0, y: -6, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.22 }, 0);
    return () => {
      tl.kill();
    };
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion()) return onClose();
    gsap.to([panel.current, root.current], { opacity: 0, duration: 0.12, ease: "none", onComplete: onClose });
  }, [onClose]);

  // Search runs against the local ticker index on our server — no market-data calls per keystroke.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${query ? 10 : 6}`, { signal: ctrl.signal });
        const data = (await res.json()) as { results: TickerHit[] };
        setHits(data.results);
        setActive(0);
      } catch {}
    }, 40);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const items: Item[] = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q));
      return [...hits.map((hit) => ({ kind: "ticker" as const, hit })), ...pages];
    }
    const recentSet = new Set(recent.map((r) => r.ticker));
    return [
      ...recent.slice(0, 5).map((hit) => ({ kind: "ticker" as const, hit, recent: true })),
      ...hits.filter((h) => !recentSet.has(h.ticker)).map((hit) => ({ kind: "ticker" as const, hit })),
      ...PAGES,
    ];
  }, [hits, query, recent]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined, mode: "overview" | "options" | "simulate" = "overview") => {
    if (!item) return;
    if (item.kind === "page") {
      router.push(item.href);
    } else {
      setRecent((r) => [item.hit, ...r.filter((x) => x.ticker !== item.hit.ticker)].slice(0, 8));
      const base = `/stock/${encodeURIComponent(item.hit.ticker)}`;
      router.push(mode === "options" ? `${base}/options` : mode === "simulate" ? `${base}/simulate` : base);
    }
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active], e.shiftKey ? "options" : e.altKey ? "simulate" : "overview");
    }
  };

  const sectionOf = (item: Item) => (item.kind === "page" ? "Pages" : item.recent ? "Recent" : query ? "Results" : "Popular");
  return (
    <div
      ref={root}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={panel}
        className="w-full max-w-[600px] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)]"
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search stocks and ETFs by ticker or name"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted">No matches for “{query}”.</p>}
          {items.map((item, i) => {
            const section = sectionOf(item);
            const header = i === 0 || sectionOf(items[i - 1]) !== section ? section : null;
            return (
              <div key={item.kind === "page" ? item.href : `${section}-${item.hit.ticker}`}>
                {header && <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-faint">{header}</p>}
                <button
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={clsx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", i === active && "bg-subtle")}
                >
                  {item.kind === "ticker" ? (
                    <>
                      <TickerLogo ticker={item.hit.ticker} size={30} tryLogo={false} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{item.hit.ticker}</span>
                          {item.recent && <Clock className="size-3 text-faint" />}
                        </div>
                        <p className="truncate text-xs text-muted">{item.hit.name}</p>
                      </div>
                      <span className="hidden text-xs text-faint sm:block">
                        {TYPE_LABEL[item.hit.type] ?? item.hit.type} · {item.hit.exchange}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="grid size-[30px] place-items-center rounded-md border border-line text-muted">{item.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted">{item.hint}</p>
                      </div>
                      <ArrowRight className="size-4 text-faint" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-subtle/60 px-4 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="size-3" /> Open
          </span>
          <span>⇧↵ Options chain</span>
          <span>⌥↵ Simulate</span>
          <span className="ml-auto hidden sm:inline">Start typing a ticker anywhere</span>
        </div>
      </div>
    </div>
  );
}
