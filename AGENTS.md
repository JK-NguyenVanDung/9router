# Repository Guidelines

9Router is a Next.js 16 dashboard and OpenAI-compatible proxy that routes requests across AI coding providers. Use this guide to stay consistent with the existing architecture and conventions.

## Project Structure & Module Organization

- `src/app/` — Next.js App Router UI (`dashboard/`, `landing/`) and HTTP endpoints under `api/` (e.g. `v1/chat/completions/route.js`). Use the `@/` alias for imports.
- `src/sse/` — Shared SSE handlers and services reused by routes.
- `open-sse/` — Local package of translators, executors, transformers, and handlers; imported as `open-sse/*`.
- `cloud/` — Cloudflare Worker sources (`wrangler.toml`, `src/handlers/`).
- `tests/unit/` — Vitest unit tests with their own `package.json` and `vitest.config.js`.
- `public/`, `i18n/`, `images/`, `docs/`, `scripts/` — Static assets, localization, documentation, and tooling.

## Build, Test, and Development Commands

- `npm install && cp .env.example .env` — Initial setup.
- `PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev` — Local dev server at `:20128`.
- `npm run build` / `npm run start` — Production build and serve (`NODE_ENV=production`).
- `npm run dev:bun` / `build:bun` / `start:bun` — Bun-powered variants.
- `cd tests && npm test` — Run the Vitest suite (see `tests/README.md` for the `/tmp/node_modules` bootstrap).
- `npx eslint .` — Lint with the Next core-web-vitals config.

## Coding Style & Naming Conventions

- JavaScript (ESM), React 19, 2-space indentation, double quotes, semicolons; match surrounding files.
- React components in PascalCase (`HeaderMenu.js`); hooks/utilities in camelCase; route handlers stay `route.js`.
- Prefer the `@/` alias over deep relative paths; keep files focused and colocate component styles via Tailwind v4 utilities.
- Run ESLint (`eslint-config-next`) before pushing; no Prettier config — preserve existing formatting.

## Testing Guidelines

- Framework: Vitest (`environment: node`, globals enabled) scoped to `tests/unit/*.test.js`.
- Name tests `<feature>.test.js` and mirror the module under test (e.g. `embeddingsCore.test.js`).
- Cover new handlers, translators, and auth flows; add regression tests for bug fixes referenced in commits (`closes #NNN`).

## Commit & Pull Request Guidelines

- Follow the prevailing Conventional-Commit style: `fix:`, `feat:`, `docs:`, optional scope (`fix(codex): ...`), and `(closes #123)` when applicable.
- Keep commits focused; bump `package.json` version and update `CHANGELOG.md` for user-visible changes.
- PRs should describe intent, link issues, list test evidence (`npm test`, manual dashboard checks), and include screenshots for UI changes.

## Security & Configuration Tips

- Never commit secrets; rely on `.env` (`JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT`, `INITIAL_PASSWORD`).
- Treat OAuth token stores under `DATA_DIR` as sensitive; avoid logging raw headers or refresh tokens.
