import { HISTORY_YEARS } from "@/lib/massive/api";
import { isEntitled, limiterStatus } from "@/lib/massive/client";
import { marketSession } from "@/lib/dates";

export async function GET() {
  const limiter = limiterStatus();
  return Response.json({
    hasKey: Boolean(process.env.MASSIVE_API_KEY),
    plan: limiter.rateLimitPerMin ? "basic" : "paid",
    ...limiter,
    historyYears: HISTORY_YEARS,
    optionsLive: limiter.rateLimitPerMin ? false : isEntitled("/v3/snapshot/options"),
    session: marketSession(),
  });
}
