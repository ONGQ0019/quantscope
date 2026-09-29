import type { NextRequest } from "next/server";
import { handle, num } from "@/lib/server/http";
import { filterScan, getScanTable, type ScanRow } from "@/lib/server/market";

const SORTABLE = new Set<keyof ScanRow>([
  "ticker", "price", "change", "changePct", "gapPct", "volume", "dollarVolume", "avgVolume", "rvol", "rangePct",
  "closeLocation", "change5d", "change20d",
]);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const pct = (k: string) => {
    const v = num(p.get(k));
    return v == null ? undefined : v / 100;
  };
  const sort = p.get("sort") as keyof ScanRow | null;
  return handle(async () => {
    const table = await getScanTable();
    const { total, rows } = filterScan(table.rows, {
      q: p.get("q") ?? undefined,
      types: p.get("types")?.split(",").filter(Boolean),
      minPrice: num(p.get("minPrice")),
      maxPrice: num(p.get("maxPrice")),
      minChangePct: pct("minChange"),
      maxChangePct: pct("maxChange"),
      minGapPct: pct("minGap"),
      maxGapPct: pct("maxGap"),
      minVolume: num(p.get("minVolume")),
      minDollarVolume: num(p.get("minDollarVolume")),
      minRvol: num(p.get("minRvol")),
      sort: sort && SORTABLE.has(sort) ? sort : "dollarVolume",
      dir: p.get("dir") === "asc" ? "asc" : "desc",
      limit: Math.min(num(p.get("limit")) ?? 150, 500),
    });
    return {
      date: table.dates.at(-1),
      lookbackDays: table.dates.length,
      universe: table.rows.length,
      total,
      rows,
    };
  });
}
