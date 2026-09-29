import type { NextRequest } from "next/server";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";
import { getIndexCard } from "@/lib/server/market";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/market/index/[ticker]">) {
  const { ticker } = await ctx.params;
  const T = ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  return handle(() => getIndexCard(T));
}
