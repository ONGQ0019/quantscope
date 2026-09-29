import "server-only";
import { MassiveError } from "../massive/client";

const STATUS: Record<string, number> = {
  NO_KEY: 500,
  NOT_ENTITLED: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 503,
  HTTP: 502,
};

/** Runs a handler and maps data-layer errors to JSON responses the UI understands. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof MassiveError) {
      return Response.json({ error: err.message, code: err.code }, { status: STATUS[err.code] ?? 500 });
    }
    console.error(err);
    return Response.json({ error: "Unexpected server error", code: "INTERNAL" }, { status: 500 });
  }
}

export function num(v: string | null): number | undefined {
  if (v == null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function badRequest(message: string) {
  return Response.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}

export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
