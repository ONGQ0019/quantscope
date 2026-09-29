"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";

export function AmbientBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray<HTMLElement>(".blob", ref.current).forEach((blob, i) => {
        gsap.to(blob, {
          x: "random(-160, 160)",
          y: "random(-90, 90)",
          scale: "random(0.85, 1.25)",
          duration: "random(12, 20)",
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          delay: i * -3,
        });
      });
      const layer = ref.current?.querySelector<HTMLElement>("[data-parallax]");
      if (!layer) return;
      const xTo = gsap.quickTo(layer, "x", { duration: 2.2, ease: "power3.out" });
      const yTo = gsap.quickTo(layer, "y", { duration: 2.2, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        xTo((e.clientX / window.innerWidth - 0.5) * -40);
        yTo((e.clientY / window.innerHeight - 0.5) * -30);
      };
      window.addEventListener("pointermove", onMove);
      return () => window.removeEventListener("pointermove", onMove);
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="ambient noise" aria-hidden>
      <div data-parallax className="absolute -inset-20">
        <div className="blob left-[8%] top-[-6%] h-[520px] w-[520px] bg-[#6d5dfc]" />
        <div className="blob right-[4%] top-[10%] h-[420px] w-[420px] bg-[#0ea5e9] opacity-40" />
        <div className="blob left-[38%] top-[48%] h-[380px] w-[380px] bg-[#db2777] opacity-[0.18]" />
      </div>
      <div className="grid-bg absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-[40vh] bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}
