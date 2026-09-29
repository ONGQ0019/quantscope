import type { NextRequest } from "next/server";
import { badRequest, handle } from "@/lib/server/http";
import { getContractEod } from "@/lib/server/options";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/options/contract/[contract]">) {
  const contract = decodeURIComponent((await ctx.params).contract).toUpperCase();
  if (!/^O:[A-Z.]+\d{6}[CP]\d{8}$/.test(contract)) return badRequest("Invalid option symbol");
  return handle(() => getContractEod(contract));
}
