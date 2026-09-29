import type { NextRequest } from "next/server";
import { badRequest, handle, num, TICKER_RE } from "@/lib/server/http";
import { runSimulation } from "@/lib/server/simulate";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ticker = (p.get("ticker") ?? "").toUpperCase();
  const benchmark = (p.get("benchmark") ?? "SPY").toUpperCase();
  const start = p.get("start") ?? "";
  const initial = num(p.get("initial")) ?? 10_000;
  const monthly = num(p.get("monthly")) ?? 0;
  if (!TICKER_RE.test(ticker)) return badRequest("Invalid ticker");
  if (benchmark !== "NONE" && !TICKER_RE.test(benchmark)) return badRequest("Invalid benchmark");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return badRequest("start must be YYYY-MM-DD");
  if (initial < 0 || monthly < 0 || initial + monthly <= 0 || initial > 1e10 || monthly > 1e9) {
    return badRequest("Enter a positive investment amount");
  }
  return handle(() =>
    runSimulation(
      ticker,
      { initial, monthly, startDate: start, reinvestDividends: p.get("reinvest") !== "0" },
      benchmark === "NONE" ? null : benchmark,
    ),
  );
}
