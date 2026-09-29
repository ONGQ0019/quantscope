import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Server-only gateway to the Massive (formerly Polygon.io) REST API.
 *
 * - The API key never leaves the server (sent as a Bearer header, not a query param).
 * - A sliding-window rate limiter keeps us under the plan's calls/minute
 *   (free "Basic" plan = 5/min). Set MASSIVE_RATE_LIMIT_PER_MIN=0 on paid plans.
 * - Responses are cached in memory and on disk, so restarts and repeat visits are free.
 * - 403 "not entitled" answers are remembered per endpoint family, so we stop
 *   spending calls on data the plan doesn't include and fall back instead.
 */

const BASE = "https://api.massive.com";
const RATE_LIMIT = Number(process.env.MASSIVE_RATE_LIMIT_PER_MIN ?? "5");
const CACHE_DIR = process.env.QS_CACHE_DIR ?? path.join(process.cwd(), ".cache", "massive");
const DENIED_TTL_MS = 6 * 60 * 60 * 1000;

export type MassiveErrorCode = "NO_KEY" | "NOT_ENTITLED" | "RATE_LIMITED" | "NOT_FOUND" | "HTTP";

export class MassiveError extends Error {
  constructor(
    public code: MassiveErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "MassiveError";
  }
}

type CacheEntry = { expires: number; data: unknown };

type State = {
  stamps: number[];
  chain: Promise<void>;
  waiting: number;
  mem: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  denied: Map<string, number>;
  calls: number;
};

// Survive Next.js dev hot-reloads: one limiter/cache per process.
const g = globalThis as unknown as { __massive?: State };
const state: State = (g.__massive ??= {
  stamps: [],
  chain: Promise.resolve(),
  waiting: 0,
  mem: new Map(),
  inflight: new Map(),
  denied: new Map(),
  calls: 0,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function acquireSlot(): Promise<void> {
  if (!(RATE_LIMIT > 0)) return Promise.resolve();
  state.waiting++;
  const slot = state.chain.then(async () => {
    for (;;) {
      const now = Date.now();
      state.stamps = state.stamps.filter((t) => now - t < 60_000);
      if (state.stamps.length < RATE_LIMIT) {
        state.stamps.push(now);
        return;
      }
      await sleep(60_000 - (now - state.stamps[0]) + 300);
    }
  });
  state.chain = slot.catch(() => undefined);
  return slot.finally(() => {
    state.waiting--;
  });
}

/** Endpoint family used for entitlement memory, e.g. "/v3/snapshot/options". */
function familyOf(p: string) {
  return p.split("?")[0].split("/").slice(0, 4).join("/");
}

function diskPath(key: string) {
  return path.join(CACHE_DIR, createHash("sha1").update(key).digest("hex") + ".json");
}

async function readDisk(key: string): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await readFile(diskPath(key), "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeDisk(key: string, entry: CacheEntry) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(diskPath(key), JSON.stringify(entry));
  } catch {
    // Read-only filesystems (e.g. serverless) just skip the disk layer.
  }
}

async function rawFetch(url: string): Promise<unknown> {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new MassiveError("NO_KEY", "MASSIVE_API_KEY is not set. Add it to .env.local.");

  for (let attempt = 0; ; attempt++) {
    await acquireSlot();
    state.calls++;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(15_000 * (attempt + 1));
      continue;
    }
    if (res.ok) return res.json();

    let message = `Massive HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {}
    if (res.status === 403) throw new MassiveError("NOT_ENTITLED", message, 403);
    if (res.status === 404) throw new MassiveError("NOT_FOUND", message, 404);
    if (res.status === 429) throw new MassiveError("RATE_LIMITED", message, 429);
    throw new MassiveError("HTTP", message, res.status);
  }
}

export type FetchOptions = {
  /** Seconds the response stays fresh. */
  ttl: number;
};

/**
 * GET a Massive endpoint (path + query, e.g. "/v3/reference/tickers/AAPL").
 * Fresh cache → returned immediately. On failure, a stale cached copy is
 * preferred over an error (important when rate limited).
 */
export async function massiveGet<T>(pathAndQuery: string, { ttl }: FetchOptions): Promise<T> {
  const url = pathAndQuery.startsWith("http") ? pathAndQuery : BASE + pathAndQuery;
  const cacheKey = url.replace(/([?&])apiKey=[^&]*/g, "$1");
  const now = Date.now();

  const mem = state.mem.get(cacheKey);
  if (mem && mem.expires > now) return mem.data as T;

  const disk = mem ?? (await readDisk(cacheKey));
  if (disk && disk.expires > now) {
    state.mem.set(cacheKey, disk);
    return disk.data as T;
  }

  const family = familyOf(new URL(url).pathname);
  const deniedAt = state.denied.get(family);
  if (deniedAt && now - deniedAt < DENIED_TTL_MS) {
    throw new MassiveError("NOT_ENTITLED", "Your Massive plan does not include this data.", 403);
  }

  const pending = state.inflight.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    try {
      const data = await rawFetch(url);
      const entry = { expires: Date.now() + ttl * 1000, data };
      state.mem.set(cacheKey, entry);
      void writeDisk(cacheKey, entry);
      return data as T;
    } catch (err) {
      if (err instanceof MassiveError && err.code === "NOT_ENTITLED") state.denied.set(family, Date.now());
      if (disk && !(err instanceof MassiveError && err.code === "NOT_ENTITLED")) return disk.data as T;
      throw err;
    } finally {
      state.inflight.delete(cacheKey);
    }
  })();
  state.inflight.set(cacheKey, p);
  return p;
}

/** Returns cached data (fresh or stale) without spending an API call, or null. */
export async function massivePeek<T>(pathAndQuery: string): Promise<T | null> {
  const url = pathAndQuery.startsWith("http") ? pathAndQuery : BASE + pathAndQuery;
  const hit = state.mem.get(url) ?? (await readDisk(url));
  return hit ? (hit.data as T) : null;
}

/** Follows `next_url` pagination, concatenating `results`. */
export async function massiveGetAll<T>(
  pathAndQuery: string,
  opts: FetchOptions & { maxPages?: number },
): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = pathAndQuery;
  for (let page = 0; next && page < (opts.maxPages ?? 10); page++) {
    const res: { results?: T[]; next_url?: string } = await massiveGet(next, opts);
    out.push(...(res.results ?? []));
    next = res.next_url;
  }
  return out;
}

/**
 * Binary fetch (logos). Low priority: on rate-limited plans it only spends a call
 * when the limiter is idle, otherwise returns null and the UI shows a monogram.
 */
export async function massiveGetBinary(url: string, ttl: number): Promise<{ type: string; bytes: Buffer } | null> {
  const cacheKey = "bin:" + url;
  const cached = await readDisk(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const d = cached.data as { type: string; b64: string };
    return { type: d.type, bytes: Buffer.from(d.b64, "base64") };
  }
  const key = process.env.MASSIVE_API_KEY;
  if (!key) return null;
  if (RATE_LIMIT > 0) {
    const now = Date.now();
    const recent = state.stamps.filter((t) => now - t < 60_000).length;
    if (state.waiting > 0 || recent >= RATE_LIMIT - 1) return null;
  }
  await acquireSlot();
  state.calls++;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "image/png";
  void writeDisk(cacheKey, { expires: Date.now() + ttl * 1000, data: { type, b64: bytes.toString("base64") } });
  return { type, bytes };
}

export function isEntitled(pathPrefix: string): boolean | null {
  const deniedAt = state.denied.get(familyOf(pathPrefix));
  if (deniedAt && Date.now() - deniedAt < DENIED_TTL_MS) return false;
  return null;
}

export function isRateLimited() {
  return RATE_LIMIT > 0;
}

export function limiterStatus() {
  return {
    rateLimitPerMin: RATE_LIMIT > 0 ? RATE_LIMIT : null,
    queued: state.waiting,
    callsThisProcess: state.calls,
  };
}
