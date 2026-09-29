import type { NextRequest } from "next/server";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";
import { getChain } from "@/lib/server/options";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/options/[ticker]/chain">) {
  const T = (await ctx.params).ticker.toUpperCase();
  const exp = req.nextUrl.searchParams.get("exp") ?? "";
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return badRequest("exp must be YYYY-MM-DD");
  return handle(() => getChain(T, exp));
}
