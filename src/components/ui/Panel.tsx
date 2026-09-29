"use client";

import clsx from "clsx";
import { useRef, type ReactNode } from "react";
import { useSpotlight } from "@/lib/client/hooks";

export function Panel({
  children,
  className,
  title,
  subtitle,
  action,
  reveal = true,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  reveal?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useSpotlight(ref);
  return (
    <section ref={ref} data-reveal={reveal ? "" : undefined} className={clsx("glass spotlight p-5 sm:p-6", className)}>
      {(title || action) && (
        <header className="relative mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}
