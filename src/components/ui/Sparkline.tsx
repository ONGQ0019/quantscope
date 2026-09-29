"use client";

import { useId, useMemo, useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/client/gsap";

export function Sparkline({
  data,
  width = 160,
  height = 48,
  positive,
  className,
  strokeWidth = 1.6,
}: {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  className?: string;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const up = positive ?? (data.length > 1 ? data[data.length - 1] >= data[0] : true);
  const color = up ? "var(--color-up)" : "var(--color-down)";

  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pad = strokeWidth;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * width,
      pad + (1 - (v - min) / span) * (height - pad * 2),
    ]);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
    return { line, area: `${line}L${width},${height}L0,${height}Z` };
  }, [data, width, height, strokeWidth]);

  useGSAP(
    () => {
      const path = ref.current?.querySelector<SVGPathElement>("[data-line]");
      const fill = ref.current?.querySelector<SVGPathElement>("[data-area]");
      if (!path || !line || prefersReducedMotion()) return;
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.6, ease: "power3.inOut" });
      if (fill) gsap.fromTo(fill, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.5, ease: "power2.out" });
    },
    { scope: ref, dependencies: [line] },
  );

  if (!line) return <div className={className} style={{ width, height }} />;
  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path data-area d={area} fill={`url(#g${id})`} />
      <path data-line d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
