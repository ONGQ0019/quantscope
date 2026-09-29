<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Quantscope notes

- Market data comes only through `src/lib/massive/client.ts` (rate limiter + cache). Never call api.massive.com elsewhere or expose `MASSIVE_API_KEY` to client code.
- Keep math in `src/lib/quant/` pure and unit-tested (`npm test`).
- Custom CSS classes live in `@layer components` in `globals.css` so Tailwind utilities can override them.
- Before finishing: `npm run typecheck && npm run lint && npm test && npm run build`.
