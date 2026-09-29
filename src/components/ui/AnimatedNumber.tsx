"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/client/gsap";

/** Tweens from the previous value to the new one, rendering via `format` (no React re-renders per frame). */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 1.4,
  from,
}: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  /** starting value for the first animation (defaults to 0) */
  from?: number;
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
    if (!state.current) state.current = { v: from ?? 0 };
    if (prefersReducedMotion()) {
      state.current.v = value;
      el.textContent = fmt.current(value);
      return;
    }
    const tween = gsap.to(state.current, {
      v: value,
      duration,
      ease: "expo.out",
      onUpdate: () => {
        el.textContent = fmt.current(state.current!.v);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value, duration, from]);

  return (
    <span ref={ref} className={className}>
      {value == null || !Number.isFinite(value) ? "—" : format(from ?? 0)}
    </span>
  );
}
