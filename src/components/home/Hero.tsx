"use client";

import { Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/client/gsap";
import { useMagnetic } from "@/lib/client/hooks";
import { usePalette } from "../shell/CommandPalette";

const EXAMPLES = ["NVDA", "Apple", "SPY options", "Tesla", "Microsoft", "QQQ", "Palantir", "AMD"];
const QUICK = ["AAPL", "NVDA", "TSLA", "MSFT", "SPY", "AMZN"];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const { open } = usePalette();
  useMagnetic(searchRef, 0.08);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      const line1 = ref.current!.querySelector<HTMLElement>("[data-line1]")!;

      if (!reduce) {
        const split = SplitText.create(line1, { type: "words,chars", charsClass: "inline-block" });
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from("[data-eyebrow]", { opacity: 0, y: 12, duration: 0.8 })
          .from(split.chars, { opacity: 0, yPercent: 110, rotateX: -80, filter: "blur(8px)", stagger: 0.022, duration: 1.2 }, 0.1)
          .from(
            "[data-line2]",
            { clipPath: "inset(0% 100% 0% 0%)", opacity: 0.2, filter: "blur(10px)", duration: 1.6, ease: "expo.inOut", clearProps: "filter" },
            0.35,
          )
          .from("[data-sub]", { opacity: 0, y: 16, duration: 1 }, 0.55)
          .from("[data-search]", { opacity: 0, y: 24, scale: 0.97, duration: 1.1 }, 0.7)
          .from("[data-quick] > *", { opacity: 0, y: 10, stagger: 0.05, duration: 0.7 }, 0.95);
      }

      // Typewriter placeholder cycling through example searches
      const typed = ref.current!.querySelector<HTMLElement>("[data-typed]");
      if (!typed) return;
      if (reduce) {
        typed.textContent = "NVDA";
        return;
      }
      const master = gsap.timeline({ repeat: -1, delay: 1.4 });
      EXAMPLES.forEach((word) => {
        const state = { n: 0 };
        master
          .to(state, {
            n: word.length,
            duration: word.length * 0.07,
            ease: "none",
            onUpdate: () => {
              typed.textContent = word.slice(0, Math.round(state.n));
            },
          })
          .to({}, { duration: 1.3 })
          .to(state, {
            n: 0,
            duration: word.length * 0.035,
            ease: "none",
            onUpdate: () => {
              typed.textContent = word.slice(0, Math.round(state.n));
            },
          });
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="relative pt-14 pb-10 text-center sm:pt-24 sm:pb-14">
      <div data-eyebrow className="chip mx-auto mb-7 border-accent/25 bg-accent/[0.08] text-[#c9c2ff]">
        <Sparkles className="size-3.5" />
        US stocks · ETFs · Options · Simulations
      </div>
      <h1
        data-title
        className="mx-auto max-w-5xl text-[clamp(2.4rem,6.4vw,5.4rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance [perspective:600px]"
      >
        <span data-line1 className="block text-ink">
          See the market
        </span>
        <span data-line2 className="text-gradient block pb-[0.08em]" style={{ clipPath: "inset(0% 0% 0% 0%)" }}>
          in high definition.
        </span>
      </h1>
      <p data-sub className="mx-auto mt-6 max-w-2xl text-base text-balance text-muted sm:text-lg">
        Search 11,000+ US tickers, read option chains with live greeks, scan the whole market, and replay exactly what your money
        would have done.
      </p>

      <button
        ref={searchRef}
        data-search
        onClick={() => open()}
        className="glass group mx-auto mt-10 flex h-16 w-full max-w-2xl items-center gap-4 !rounded-2xl px-5 text-left transition-[border-color,box-shadow] duration-500 hover:border-accent/40 hover:shadow-[0_0_0_6px_rgb(139_123_255/0.08),0_30px_80px_-30px_rgb(139_123_255/0.5)]"
      >
        <Search className="size-5 text-accent" />
        <span className="flex-1 text-[17px] text-muted">
          Try <span data-typed className="font-medium text-ink" />
          <span className="ml-0.5 inline-block h-5 w-px translate-y-1 animate-pulse bg-accent-2" />
        </span>
        <kbd className="!text-xs">⌘K</kbd>
      </button>

      <div data-quick className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK.map((t) => (
          <Link key={t} href={`/stock/${t}`} className="chip transition-colors hover:border-line-strong hover:text-ink">
            {t}
          </Link>
        ))}
      </div>
    </section>
  );
}
