import { handle } from "@/lib/server/http";
import { getMovers } from "@/lib/server/market";

export async function GET() {
  return handle(getMovers);
}
