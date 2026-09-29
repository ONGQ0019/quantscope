const NY = "America/New_York";
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD of a timestamp, in New York time (the market's clock). */
export function isoDate(ms: number): string {
  return ymd.format(new Date(ms));
}

export function nyToday(): string {
  return isoDate(Date.now());
}

/** Calendar arithmetic on YYYY-MM-DD strings (UTC-safe). */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function yearsBetween(a: string, b: string): number {
  return daysBetween(a, b) / 365.25;
}

/** Rough US equity session check (ignores exchange holidays). */
export function marketSession(now = new Date()): "pre" | "open" | "after" | "closed" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return "closed";
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "open";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after";
  return "closed";
}
