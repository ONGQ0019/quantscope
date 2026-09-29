# Quantscope

A fast, clean US stock & options research app: search any ticker, read option chains with greeks, build multi-leg strategies, scan the whole market, and simulate what an investment would be worth today.

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, GSAP 3 and TradingView Lightweight Charts, on top of [Massive](https://massive.com) market data.

## Features

| | |
|---|---|
| **Light & dark themes** | Clean, neutral design that follows your system setting, with a toggle in the header. |
| **⌘K command palette** | Instant fuzzy search over 11,000+ US stocks & ETFs (local index — no API call per keystroke). Start typing a ticker anywhere. `⇧↵` jumps to the option chain, `⌥↵` to the simulator. |
| **Markets** | Index cards with sparklines, top gainers / losers / most active and market breadth, computed from every US listing. |
| **Stock pages** | Area/candle chart with SMA 20/50/200 and volume, key stats, 52-week range, historical volatility and expected move, TTM financials with quarterly bars, dividends & splits, news with per-ticker AI sentiment. |
| **Option chains** | Every expiration and strike with price, IV, Δ Γ Θ V, probability ITM and breakevens. Live mode (bid/ask, volume, OI, max pain, put/call) on a Massive Options plan; a clearly-labelled Black-Scholes model chain otherwise. |
| **Strategy builder** | Click contracts or use presets (straddle, strangle, spreads, iron condor, cash-secured put). Payoff at expiry / today / halfway, breakevens, max profit & loss, probability of profit, position greeks. |
| **Simulator** | An animated replay of your money's journey (hover or drag to travel through time) with the key moments marked: worst drop, recovery, doubling. Compares the same dollars in an index fund, a savings account (historical T-bill rates) and cash, adjusts for inflation, explains everything in plain English, and shows how much the start date mattered. Lump sum or monthly, dividends reinvested, split-adjusted, shareable URLs. |
| **Scanner** | Filter the entire market by price, % change, gap, volume, dollar volume (and RVOL / 5D / 20D on paid plans). Presets for gainers, losers, gaps, penny runners, unusual volume. |

## Quick start

```bash
npm install
cp .env.example .env.local   # then paste your MASSIVE_API_KEY
npm run dev                  # http://localhost:3000
```

Optional: `npm run sync:tickers` refreshes the bundled ticker index (`src/data/tickers.json`).

| Script | |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (pricing, IV, strategy analytics, simulator) |
| `npm run typecheck` / `npm run lint` | Type checking / ESLint |

## Data plans

The app detects what your Massive plan allows and degrades gracefully:

| | Free (Basic) | Paid |
|---|---|---|
| Rate limit | 5 calls/min — requests are queued and every response is cached (memory + disk), so each ticker costs its calls once | Unlimited — set `MASSIVE_RATE_LIMIT_PER_MIN=0` |
| Price history / simulator range | 2 years | 5 / 10 / 20+ years — set `MASSIVE_HISTORY_YEARS` |
| Quotes | End-of-day close | 15-min delayed or real-time snapshots |
| Option chains | Real contract list, Black-Scholes model prices/greeks (30-day HV, 3-month T-bill), "Use last trade" pulls each contract's real last close and its implied vol | Live bid/ask, IV, greeks, volume, open interest, max pain |
| Scanner | Today vs yesterday across all ~12k listings | Adds RVOL, 5D and 20D change |

## Architecture

```
Browser ──► Next.js route handlers (/api/*) ──► Massive client ──► api.massive.com
            (API key stays server-side)          rate limiter · mem+disk cache · entitlement memory
```

```
src/
  app/                 pages + /api route handlers
  components/          UI (shell, home, stock, options, simulate, scanner, ui primitives)
  lib/massive/         server-only API client and typed endpoints
  lib/server/          services: stock summary, market scan, option chains, simulation
  lib/quant/           pure math: Black-Scholes, IV solver, CRR binomial, strategy analytics, simulator (unit tested)
  lib/client/          GSAP setup, hooks, fetcher
  data/tickers.json    ticker index for search
```

Notes on correctness:

- Prices are split-adjusted. Massive reports dividends as declared, so the simulator adjusts each dividend by every split after its ex-date.
- Returns are total returns (dividends credited on the ex-date). DCA uses money-weighted IRR; lump sums use CAGR.
- Option greeks use Black-Scholes-Merton with a continuous dividend yield. US equity options are American, and a CRR binomial pricer is included for early-exercise values.

## Roadmap

- Watchlist page and price / IV / volume alerts
- Implied-volatility smile, term structure and 3D volatility surface (live options plan)
- Unusual options activity feed
- Portfolio backtester (multi-asset, rebalancing), rolling-return distributions, Monte Carlo
- AI copilot: natural-language screener and "why is this moving?"

*For information only — not investment advice.*
