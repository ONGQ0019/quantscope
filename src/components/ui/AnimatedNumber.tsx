"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "@/lib/client/gsap";

/**
 * Tweens from the previous value to the new one, rendering via `format`
 * (writes textContent directly, no React re-render per frame).
 * With `onView`, the first count-up waits until the number scrolls into view.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.9,
  from,
  onView = false,
}: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  /** starting value for the first animation (defaults to 0) */
  from?: number;
  onView?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useRef<{ v: number } | null>(null);
  const fmt = useRef(format);
  useLayoutEffect(() => {
    fmt.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || value == null || !Number.isFinite(value)) return;
    const first = !state.current;
    if (first) state.current = { v: from ?? 0 };
    const s = state.current!;
    if (prefersReducedMotion()) {
      s.v = value;
      el.textContent = fmt.current(value);
      return;
    }
    let tween: gsap.core.Tween | null = null;
    const run = () => {
      tween = gsap.to(s, {
        v: value,
        duration,
        ease: "power3.out",
        onUpdate: () => {
          el.textContent = fmt.current(s.v);
        },
      });
    };
    if (first && onView) {
      const st = ScrollTrigger.create({ trigger: el, start: "top 92%", once: true, onEnter: run });
      return () => {
        st.kill();
        tween?.kill();
      };
    }
    run();
    return () => {
      tween?.kill();
    };
  }, [value, duration, from, onView]);

  return (
    <span ref={ref} className={className}>
      {value == null || !Number.isFinite(value) ? "—" : format(from ?? 0)}
    </span>
  );
}
