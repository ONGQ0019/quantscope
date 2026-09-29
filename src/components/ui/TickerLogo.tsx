"use client";

import clsx from "clsx";
import { useState } from "react";

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Company icon via our proxy, falling back to a gradient monogram. */
export function TickerLogo({ ticker, size = 40, className, tryLogo = true }: { ticker: string; size?: number; className?: string; tryLogo?: boolean }) {
  // Track failures per ticker so switching tickers retries and never shows a stale image.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === ticker;
  const h = hue(ticker);
  const letters = ticker.replace(/[^A-Z]/g, "");
  const label = letters.length <= 4 ? letters : letters.slice(0, 2);
  return (
    <div
      className={clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-[30%] border border-white/10", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${h} 70% 55% / 0.35), hsl(${(h + 60) % 360} 70% 45% / 0.15))`,
      }}
    >
      <span className="font-semibold tracking-tight text-white/90" style={{ fontSize: size * (label.length >= 4 ? 0.27 : 0.33) }}>
        {label}
      </span>
      {tryLogo && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, already cached/optimized upstream
        <img
          key={ticker}
          src={`/api/stock/${encodeURIComponent(ticker)}/logo`}
          alt=""
          className="absolute inset-0 size-full bg-white object-contain p-[14%] opacity-0 transition-opacity duration-500"
          onLoad={(e) => (e.currentTarget.style.opacity = "1")}
          onError={() => setFailedFor(ticker)}
        />
      )}
    </div>
  );
}
