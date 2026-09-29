import clsx from "clsx";
import type { ReactNode } from "react";

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
  return (
    <section data-reveal={reveal ? "" : undefined} className={clsx("card p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
