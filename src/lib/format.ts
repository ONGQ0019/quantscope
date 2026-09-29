const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function fmtPrice(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const d = digits ?? (Math.abs(n) >= 1 ? 2 : 4);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return compact.format(n);
}

export function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n < 0 ? "-$" : "$") + compact.format(Math.abs(n));
}

/** 0.1234 → "+12.34%" */
export function fmtPct(n: number | null | undefined, digits = 2, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = (n * 100).toFixed(digits);
  return `${signed && n > 0 ? "+" : ""}${s}%`;
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T12:00:00Z") : new Date(iso);
  return d.toLocaleDateString("en-US", { timeZone: iso.length === 10 ? "UTC" : undefined, ...opts });
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso, { month: "short", day: "numeric" });
}

export function signClass(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n === 0) return "text-muted";
  return n > 0 ? "text-up" : "text-down";
}
