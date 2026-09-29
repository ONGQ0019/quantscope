"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";

export function LogoMark({ size = 30 }: { size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const paths = gsap.utils.toArray<SVGPathElement>("[data-draw]", ref.current);
      paths.forEach((p) => {
        const len = p.getTotalLength();
        gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.8, ease: "power3.inOut", delay: 0.15 });
      });
      gsap.from("[data-dot]", { scale: 0, transformOrigin: "center", duration: 0.8, ease: "back.out(3)", delay: 1.2 });
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="qs-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b7bff" />
          <stop offset="1" stopColor="#38e1ff" />
        </linearGradient>
      </defs>
      <path data-draw d="M16 3.5a12.5 12.5 0 1 0 8.84 21.34" stroke="url(#qs-g)" strokeWidth="3" strokeLinecap="round" />
      <path data-draw d="M9 19.5l4.5-5 3.5 3 6-7" stroke="url(#qs-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle data-dot cx="26.2" cy="26.4" r="2.6" fill="#38e1ff" />
    </svg>
  );
}
