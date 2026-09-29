import type { NextRequest } from "next/server";
import { getNews } from "@/lib/massive/api";
import { badRequest, handle, TICKER_RE } from "@/lib/server/http";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]/news">) {
  const T = (await ctx.params).ticker.toUpperCase();
  if (!TICKER_RE.test(T)) return badRequest("Invalid ticker");
  return handle(async () => {
    const items = await getNews(T, 20);
    return {
      items: items.map((n) => {
        const insight = n.insights?.find((i) => i.ticker === T);
        return {
          id: n.id,
          title: n.title,
          url: n.article_url,
          image: n.image_url ?? null,
          publisher: n.publisher?.name ?? "",
          publisherIcon: n.publisher?.favicon_url ?? null,
          published: n.published_utc,
          description: n.description ?? null,
          sentiment: insight?.sentiment ?? null,
          sentimentReason: insight?.sentiment_reasoning ?? null,
          tickers: (n.tickers ?? []).slice(0, 6),
        };
      }),
    };
  });
}
