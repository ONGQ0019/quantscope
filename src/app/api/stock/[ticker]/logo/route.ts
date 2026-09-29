import type { NextRequest } from "next/server";
import { getTickerDetails, type TickerDetails } from "@/lib/massive/api";
import { isRateLimited, massiveGetBinary, massivePeek, MassiveError } from "@/lib/massive/client";
import { TICKER_RE } from "@/lib/server/http";

// Proxies the company icon so the API key never reaches the browser.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]/logo">) {
  const T = (await ctx.params).ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return new Response(null, { status: 400 });
  try {
    // On the rate-limited free plan, never spend a call just to find a logo URL.
    const details = isRateLimited()
      ? (await massivePeek<{ results: TickerDetails }>(`/v3/reference/tickers/${encodeURIComponent(T)}`))?.results
      : await getTickerDetails(T);
    if (!details) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const url = details.branding?.icon_url ?? details.branding?.logo_url;
    if (!url) return new Response(null, { status: 404 });
    const img = await massiveGetBinary(url, 30 * 86400);
    if (!img) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(img.bytes), {
      headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=604800, immutable" },
    });
  } catch (err) {
    if (err instanceof MassiveError) return new Response(null, { status: 404 });
    throw err;
  }
}
