import type { NextRequest } from "next/server";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";
import { getExpirations } from "@/lib/server/options";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/options/[ticker]/expirations">) {
  const T = (await ctx.params).ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  return handle(() => getExpirations(T));
}
