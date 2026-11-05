# Contributing to mock-api

Thanks for your interest! Bug reports, docs fixes, new ready-made modules and pull requests are welcome.

## Before you start
- For anything beyond a small fix, open an issue first so we can agree on the approach.
- Security issues: **do not open a public issue**. See [SECURITY.md](SECURITY.md).
- Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup
Requirements: Node.js ≥ 24 (see [.nvmrc](.nvmrc)) and pnpm 11 (`corepack enable`). Docker is optional.

```bash
pnpm install
pnpm dev          # server on :4310 (node --watch) and panel (Vite) on :5173
```

Open http://localhost:5173 and create the first admin. Data lives in `apps/server/data` (SQLite, git-ignored). Delete that folder to start from scratch. To configure the server, copy `.env.example` to `.env` at the repo root; everything else is set in the panel (**Configurações**).

To try the production image: `docker compose up --build` (http://localhost:4310).

## Checks
A PR is ready when these pass locally (CI runs the same):

```bash
pnpm typecheck  # server and web
pnpm test       # Vitest
pnpm build      # web panel bundle
```

UI changes should also be checked in the browser in both themes (dark and light) and at a mobile width.

## Project conventions
- **Engine first.** Every module, ready-made or AI-generated, is a set of resource definitions (`apps/server/src/engine`). Prefer extending the engine over module-specific code, so generated modules benefit too.
- **All 7 views.** A module should cover `table`, `card`, `form`, `plan`, `map`, `chart` and `diagram`; `plan` is the confirmation flow (nothing changes until `confirm`).
- **Deterministic data.** Data generators take the seed into account, so the same seed always yields the same records and images. Never commit real personal data; documents must be generated, not copied.
- **Language.** The panel, the generated data and the code comments are in Brazilian Portuguese (pt-BR). Repository docs (README, this file, SECURITY, templates) are in English, with [README.pt-BR.md](README.pt-BR.md) kept in sync.
- **Panel styling.** Use the semantic theme tokens from `apps/web/src/index.css` (`bg-surface`, `text-fg-2`, `border-line`, `bg-danger-dim`…) instead of raw Tailwind palette colors, so both themes keep working.
- **Settings.** A new configurable value goes into the settings registry (`apps/server/src/settings/registry.ts`) with a default and an optional env var. Only boot-time values (`APP_SECRET`, `PORT`, `DATA_DIR`, …) are environment-only.

## Commits and pull requests
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
- Keep PRs focused. Add or update tests, and add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Update both READMEs when you change commands, endpoints or configuration.
- By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).

## Using AI coding agents
You are responsible for reviewing any agent-generated code you submit, and for making sure it contains no secrets or real personal data.
