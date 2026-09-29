"use client";

import clsx from "clsx";
import { useState } from "react";

/** Company icon via our proxy, falling back to a neutral monogram. */
export function TickerLogo({ ticker, size = 40, className, tryLogo = true }: { ticker: string; size?: number; className?: string; tryLogo?: boolean }) {
  // Track failures per ticker so switching tickers retries and never shows a stale image.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === ticker;
  const letters = ticker.replace(/[^A-Z]/g, "");
  const label = letters.length <= 4 ? letters : letters.slice(0, 2);
  return (
    <div
      className={clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-subtle", className)}
      style={{ width: size, height: size }}
    >
      <span className="font-semibold tracking-tight text-muted" style={{ fontSize: size * (label.length >= 4 ? 0.26 : 0.32) }}>
        {label}
      </span>
      {tryLogo && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied and cached server-side
        <img
          key={ticker}
          src={`/api/stock/${encodeURIComponent(ticker)}/logo`}
          alt=""
          className="absolute inset-0 size-full bg-white object-contain p-[14%] opacity-0 transition-opacity duration-300"
          onLoad={(e) => (e.currentTarget.style.opacity = "1")}
          onError={() => setFailedFor(ticker)}
        />
      )}
    </div>
  );
}
