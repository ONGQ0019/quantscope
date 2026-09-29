import type { NextRequest } from "next/server";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";
import { getStockSummary } from "@/lib/server/stock";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]">) {
  const T = (await ctx.params).ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  return handle(() => getStockSummary(T));
}
