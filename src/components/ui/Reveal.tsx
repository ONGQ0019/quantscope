"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/client/gsap";

/**
 * Fades [data-reveal] descendants in with a short rise as they enter the viewport.
 * Re-runs when `deps` change (e.g. data finished loading) and only animates new elements.
 */
export function Reveal({ children, className, deps = [] }: { children: ReactNode; className?: string; deps?: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>("[data-reveal]:not([data-revealed])", ref.current);
      if (!els.length) return;
      els.forEach((el) => el.setAttribute("data-revealed", ""));
      if (prefersReducedMotion()) return;
      gsap.set(els, { opacity: 0, y: 10 });
      ScrollTrigger.batch(els, {
        start: "top 96%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: "power2.out", clearProps: "transform" }),
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
