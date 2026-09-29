"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type React from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  gsap.defaults({ ease: "power3.out", duration: 0.6 });
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, ScrollTrigger, useGSAP };

/**
 * Builds a paused timeline and plays it once when `scope` scrolls into view.
 * Re-running (deps change) reverts the previous animation first, so "from"
 * tweens always capture the element's real end state.
 */
export function useInViewTimeline(
  scope: React.RefObject<HTMLElement | SVGElement | null>,
  build: (tl: gsap.core.Timeline) => void,
  deps: unknown[],
  start = "top 88%",
) {
  useGSAP(
    () => {
      const el = scope.current;
      if (!el || prefersReducedMotion()) return;
      const tl = gsap.timeline({ paused: true });
      build(tl);
      ScrollTrigger.create({ trigger: el, start, once: true, onEnter: () => tl.play() });
    },
    { scope, dependencies: deps, revertOnUpdate: true },
  );
}
