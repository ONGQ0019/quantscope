"use client";

import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "@/lib/client/gsap";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Segmented control with a GSAP-driven sliding highlight. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (!btn || !pill.current) return;
    const props = { x: btn.offsetLeft, width: btn.offsetWidth, opacity: 1 };
    if (first.current) {
      gsap.set(pill.current, props);
      first.current = false;
    } else {
      gsap.to(pill.current, { ...props, duration: 0.55, ease: "expo.out" });
    }
  }, [value, options.length]);

  return (
    <div ref={wrap} role="tablist" className={clsx("relative inline-flex rounded-xl border border-line bg-black/20 p-1", className)}>
      <div ref={pill} className="absolute top-1 bottom-1 left-0 rounded-[9px] bg-white/[0.09] opacity-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]" />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          data-value={o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative z-10 rounded-[9px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35",
            size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            o.value === value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
