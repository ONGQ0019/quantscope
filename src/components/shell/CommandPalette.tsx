"use client";

import clsx from "clsx";
import { ArrowRight, BarChart3, Calculator, Clock, CornerDownLeft, Layers, Radar, Search, TrendingUp } from "lucide-react";
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
  { kind: "page", label: "Market overview", href: "/", icon: <TrendingUp className="size-4" />, hint: "Indices & movers" },
  { kind: "page", label: "Market scanner", href: "/scanner", icon: <Radar className="size-4" />, hint: "Filter 10k+ stocks" },
  { kind: "page", label: "Investment simulator", href: "/simulate", icon: <Calculator className="size-4" />, hint: "What if I invested…" },
];

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
        // Start typing a ticker anywhere to search, Bloomberg-style.
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

  // Open animation
  useEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline();
    tl.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
    tl.fromTo(panel.current, { opacity: 0, y: -18, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "expo.out" }, 0);
    return () => {
      tl.kill();
    };
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion()) return onClose();
    gsap
      .timeline({ onComplete: onClose })
      .to(panel.current, { opacity: 0, y: -10, scale: 0.98, duration: 0.18, ease: "power2.in" })
      .to(root.current, { opacity: 0, duration: 0.18 }, 0);
  }, [onClose]);

  // Search (local index on our server — no market-data API calls per keystroke)
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

  // Stagger results in when they change
  useEffect(() => {
    if (prefersReducedMotion() || !list.current) return;
    const rows = list.current.querySelectorAll("[data-row]");
    gsap.fromTo(rows, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.018, ease: "power3.out" });
  }, [items]);

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

  const sectionOf = (item: Item) => (item.kind === "page" ? "Pages" : item.recent ? "Recent" : query ? "Tickers" : "Popular");
  return (
    <div
      ref={root}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div ref={panel} className="glass w-full max-w-[640px] overflow-hidden !rounded-2xl !bg-[#0c0e17]/90" role="dialog" aria-label="Search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search any US stock or ETF — ticker or company name"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted">No matches for “{query}”.</p>}
          {items.map((item, i) => {
            const section = sectionOf(item);
            const header = i === 0 || sectionOf(items[i - 1]) !== section ? section : null;
            return (
              <div key={item.kind === "page" ? item.href : `${section}-${item.hit.ticker}`}>
                {header && <p className="label px-3 pt-3 pb-1.5">{header}</p>}
                <button
                  data-row
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={clsx(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    i === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                  )}
                >
                  {item.kind === "ticker" ? (
                    <>
                      <TickerLogo ticker={item.hit.ticker} size={34} tryLogo={false} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tracking-tight">{item.hit.ticker}</span>
                          {item.recent && <Clock className="size-3 text-faint" />}
                          <span className="chip !py-0 !text-[10px]">{item.hit.type === "CS" ? "Stock" : item.hit.type}</span>
                        </div>
                        <p className="truncate text-xs text-muted">{item.hit.name}</p>
                      </div>
                      <span className="hidden text-[11px] text-faint sm:block">{item.hit.exchange}</span>
                      {i === active && (
                        <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
                          <Layers className="size-3" /> ⇧↵
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="grid size-[34px] place-items-center rounded-[30%] border border-line bg-white/[0.04] text-accent">
                        {item.icon}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{item.label}</p>
                        <p className="text-xs text-muted">{item.hint}</p>
                      </div>
                      <ArrowRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="size-3" /> open
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="size-3" /> ⇧↵ options chain
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart3 className="size-3" /> ⌥↵ simulate
          </span>
          <span className="ml-auto">Tip: start typing a ticker anywhere</span>
        </div>
      </div>
    </div>
  );
}
