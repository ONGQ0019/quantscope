"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/client/gsap";

/**
 * Animates every [data-reveal] descendant into view: staggered rise + fade,
 * batched on scroll so below-the-fold content animates as it arrives.
 * Re-runs when `deps` change (e.g. data finished loading).
 */
export function Reveal({ children, className, deps = [] }: { children: ReactNode; className?: string; deps?: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>("[data-reveal]:not([data-revealed])", ref.current);
      if (!els.length) return;
      els.forEach((el) => el.setAttribute("data-revealed", ""));
      if (prefersReducedMotion()) return;
      gsap.set(els, { opacity: 0, y: 28, filter: "blur(6px)" });
      ScrollTrigger.batch(els, {
        start: "top 95%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.07, ease: "expo.out", clearProps: "filter" }),
      });
    },
    { scope: ref, dependencies: deps },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
