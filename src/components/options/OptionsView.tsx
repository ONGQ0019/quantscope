"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { gsap } from "@/lib/client/gsap";
import type { Chain, ChainRow } from "@/lib/server/options";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Panel } from "../ui/Panel";
import { Reveal } from "../ui/Reveal";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";
import { ChainTable, type ChainView } from "./ChainTable";
import { legFromSide, StrategyPanel, type LegState } from "./StrategyPanel";

type Expirations = { ticker: string; spot: number; asOf: string; expirations: { date: string; dte: number }[] };

export function OptionsView({ ticker }: { ticker: string }) {
  const T = encodeURIComponent(ticker);
  const { data: exps, error: expErr } = useSWR<Expirations>(`/api/options/${T}/expirations`);
  const [exp, setExp] = useState<string | null>(null);
  const [view, setView] = useState<ChainView>("greeks");
  const [strikeWindow, setStrikeWindow] = useState(12);
  const [legs, setLegs] = useState<LegState[]>([]);

  const selectedExp = exp ?? exps?.expirations.find((e) => e.dte >= 7)?.date ?? exps?.expirations[0]?.date ?? null;
  const { data: chain, error: chainErr, isLoading } = useSWR<Chain>(selectedExp ? `/api/options/${T}/chain?exp=${selectedExp}` : null, {
    keepPreviousData: true,
  });
  const live = chain?.mode === "live";

  const pickExp = (d: string) => {
    setExp(d);
    setLegs([]); // legs share one expiration
  };

  const selected = useMemo(() => new Set(legs.map((l) => l.contract)), [legs]);
  const onPick = (type: "call" | "put", row: ChainRow) => {
    const side = row[type];
    if (!chain || !side) return;
    setLegs((ls) => (ls.some((l) => l.contract === side.contract) ? ls.filter((l) => l.contract !== side.contract) : [...ls, legFromSide(type, row, side, 1, chain)]));
  };

  if (expErr) return <ErrorState error={expErr} what="option expirations" />;

  return (
    <Reveal className="space-y-4" deps={[Boolean(exps), Boolean(chain)]}>
      {chain && chain.mode === "model" && (
        <div data-reveal className="flex items-start gap-3 rounded-2xl border border-warn/20 bg-warn/[0.05] px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-muted">
            <span className="font-medium text-ink">Model chain.</span> Your Massive plan includes the full contract list but not live option quotes, so prices
            and greeks are Black-Scholes values using {ticker}&apos;s 30-day historical volatility ({fmtPct(chain.hv30, 1, false)}) and the{" "}
            {chain.rSource}. Use <span className="text-ink">“Use last trade”</span> on any leg for its real last close. An Options plan unlocks live bid/ask,
            IV, greeks and open interest automatically.
          </p>
        </div>
      )}

      <div data-reveal className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Underlying" value={chain ? <AnimatedNumber value={chain.spot} format={(n) => `$${fmtPrice(n)}`} from={chain.spot * 0.99} /> : null} sub={chain ? `close ${fmtDate(chain.asOf, { month: "short", day: "numeric" })}` : undefined} />
        <Kpi
          label="Expected move"
          value={chain ? <AnimatedNumber value={chain.expectedMove} format={(n) => `±$${fmtPrice(n)}`} /> : null}
          sub={chain ? `±${fmtPct(chain.expectedMove / chain.spot, 1, false)} by expiry` : undefined}
        />
        <Kpi
          label={live ? "ATM implied vol" : "Model vol (HV30)"}
          value={chain ? <AnimatedNumber value={(chain.atmIv ?? chain.hv30) * 100} format={(n) => `${n.toFixed(1)}%`} /> : null}
          sub={chain ? `HV30 ${fmtPct(chain.hv30, 1, false)}` : undefined}
        />
        <Kpi label="Days to expiry" value={chain ? <AnimatedNumber value={chain.dte} format={(n) => `${Math.round(n)}d`} /> : null} sub={chain ? fmtDate(chain.expiration) : undefined} />
        <Kpi label="Risk-free rate" value={chain ? fmtPct(chain.r, 2, false) : null} sub={chain ? chain.rSource.replace(/ \(.*\)/, "") : undefined} />
        {live ? (
          <Kpi label="Max pain · P/C OI" value={chain?.maxPain ? `$${fmtPrice(chain.maxPain, 0)}` : "—"} sub={chain?.putCallOi != null ? `put/call OI ${chain.putCallOi.toFixed(2)}` : undefined} />
        ) : (
          <Kpi label="Dividend yield" value={chain ? fmtPct(chain.q, 2, false) : null} sub="used in pricing" />
        )}
      </div>

      <div data-reveal>
        {exps ? <ExpirationStrip expirations={exps.expirations} value={selectedExp} onChange={pickExp} /> : <Skeleton className="h-[62px] w-full !rounded-2xl" />}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel
          className="min-w-0 !p-3 sm:!p-4"
          title={
            <span className="flex items-center gap-2">
              Option chain
              <span className={clsx("chip !py-0 !text-[10px]", live ? "pill-up" : "border-warn/25 text-warn/90")}>
                <span className={clsx("size-1.5 rounded-full", live ? "bg-up" : "bg-warn")} />
                {live ? "Live" : "Model"}
              </span>
              {isLoading && chain && <span className="text-[11px] font-normal text-faint">updating…</span>}
            </span>
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Segmented<ChainView>
                value={view}
                onChange={setView}
                options={[
                  { value: "greeks", label: "Greeks" },
                  { value: "prob", label: "Probability" },
                  { value: "market", label: "Market", disabled: !live, title: live ? undefined : "Live bid/ask, volume & open interest need a Massive Options plan" },
                ]}
              />
              <Segmented<string>
                value={String(strikeWindow)}
                onChange={(v) => setStrikeWindow(Number(v))}
                options={[
                  { value: "8", label: "±8" },
                  { value: "12", label: "±12" },
                  { value: "25", label: "±25" },
                  { value: "0", label: "All" },
                ]}
              />
            </div>
          }
        >
          {chainErr ? (
            <ErrorState error={chainErr} what="the option chain" />
          ) : chain ? (
            <ChainTable chain={chain} view={view} strikeWindow={strikeWindow} selected={selected} onPick={onPick} />
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-faint">Click any call or put to add it to the strategy builder. Shaded cells are in the money.</p>
        </Panel>

        <Panel title="Strategy builder" subtitle="Payoff, breakevens and probability of profit" className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          {chain ? <StrategyPanel chain={chain} legs={legs} setLegs={setLegs} /> : <Skeleton className="h-80 w-full" />}
        </Panel>
      </div>
    </Reveal>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="glass !rounded-2xl px-4 py-3">
      <p className="label">{label}</p>
      <div className="num mt-1.5 text-lg font-semibold">{value ?? <Skeleton className="h-6 w-20" />}</div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function ExpirationStrip({
  expirations,
  value,
  onChange,
}: {
  expirations: { date: string; dte: number }[];
  value: string | null;
  onChange: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = value ? scroller.current?.querySelector<HTMLElement>(`[data-exp="${value}"]`) : null;
    if (!el || !pill.current) return;
    const props = { x: el.offsetLeft, width: el.offsetWidth, opacity: 1 };
    if (first.current) {
      gsap.set(pill.current, props);
      first.current = false;
    } else gsap.to(pill.current, { ...props, duration: 0.55, ease: "expo.out" });
  }, [value, expirations.length]);

  useEffect(() => {
    const sc = scroller.current;
    const el = value ? sc?.querySelector<HTMLElement>(`[data-exp="${value}"]`) : null;
    if (sc && el) gsap.to(sc, { scrollLeft: el.offsetLeft - sc.clientWidth / 2 + el.offsetWidth / 2, duration: 0.8, ease: "expo.out" });
  }, [value]);

  const nudge = (dir: 1 | -1) => {
    const sc = scroller.current;
    if (sc) gsap.to(sc, { scrollLeft: sc.scrollLeft + dir * sc.clientWidth * 0.7, duration: 0.7, ease: "expo.out" });
  };

  if (!expirations.length) return <p className="glass px-4 py-4 text-sm text-muted">No listed options for this ticker.</p>;

  return (
    <div className="glass flex items-center gap-1 !rounded-2xl p-1.5">
      <button onClick={() => nudge(-1)} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-ink" aria-label="Earlier">
        <ChevronLeft className="size-4" />
      </button>
      <div ref={scroller} className="no-scrollbar relative flex-1 overflow-x-auto">
        <div className="relative flex w-max gap-1">
          <div ref={pill} className="absolute inset-y-0 left-0 rounded-xl border border-accent/40 bg-gradient-to-b from-accent/25 to-accent/10 opacity-0 shadow-[0_0_24px_-6px_rgb(139_123_255/0.7)]" />
          {expirations.map((e, i) => {
            const newMonth = i > 0 && e.date.slice(0, 7) !== expirations[i - 1].date.slice(0, 7);
            return (
              <button
                key={e.date}
                data-exp={e.date}
                onClick={() => onChange(e.date)}
                className={clsx(
                  "relative z-10 flex min-w-[64px] flex-col items-center rounded-xl px-3 py-1.5 transition-colors",
                  e.date === value ? "text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink",
                  newMonth && "ml-2",
                )}
              >
                <span className="text-[10px] tracking-wider text-faint uppercase">{fmtDate(e.date, { month: "short" })}</span>
                <span className="num text-sm font-semibold">{Number(e.date.slice(8, 10))}</span>
                <span className="num text-[10px] text-faint">{e.dte}d</span>
              </button>
            );
          })}
        </div>
      </div>
      <button onClick={() => nudge(1)} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-ink" aria-label="Later">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
