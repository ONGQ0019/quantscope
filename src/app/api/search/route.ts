import type { NextRequest } from "next/server";
import { searchTickers } from "@/lib/server/tickers";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 12) || 12, 50);
  return Response.json({ results: searchTickers(q, limit) });
}
