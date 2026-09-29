import type { NextRequest } from "next/server";
import { getDailyBars } from "@/lib/massive/api";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";
import { getFinancialSummary } from "@/lib/server/stock";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]/financials">) {
  const T = (await ctx.params).ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  return handle(async () => {
    const price = (await getDailyBars(T)).at(-1)?.c ?? null;
    return getFinancialSummary(T, price);
  });
}
