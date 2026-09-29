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

/** Segmented control; the selected background slides between options. */
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
      gsap.to(pill.current, { ...props, duration: 0.3, ease: "power3.out" });
    }
  }, [value, options.length]);

  return (
    <div ref={wrap} role="tablist" className={clsx("relative inline-flex rounded-lg bg-subtle p-0.5", className)}>
      <div ref={pill} className="absolute top-0.5 bottom-0.5 left-0 rounded-md border border-line bg-surface opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.06)]" />
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
            "relative z-10 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            o.value === value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
