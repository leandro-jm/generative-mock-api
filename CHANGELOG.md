# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). All packages share one version.

## [Unreleased]

### Added
- Open source release under the Apache License 2.0: `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request templates, Dependabot and a CI workflow (typecheck, tests, panel build and Docker image build).
- README in English, with the Portuguese version kept as `README.pt-BR.md`, and a plain `docker run` deploy section.
- Login screen with an animated mini landing page: a terminal that types real `curl` calls and streams the JSON response, animated previews of the 7 views, the "how it works with AI" steps and a feature list. Respects `prefers-reduced-motion`.
- Theme selector (System / Light / Dark) in the sidebar, the mobile header, the login and the setup screens. The choice is stored in the browser and applied before the first paint.

### Changed
- Panel restyled with a dark-first, neutral (zinc) theme with a monochrome accent: semantic theme tokens replace the slate/indigo palette, the Geist Sans and Geist Mono fonts are bundled, and charts, maps and diagrams follow the active theme.
- Monochrome favicon and logo.

## 0.1.0 - 2026-10-30

### Added
- Fake-data APIs that follow OpenAPI 3.1, with CRUD, filters, sorting, pagination, `fields` and `expand`, and `application/problem+json` errors.
- Ready-made modules: RH Trabalhista, Filmes and Livros, with seeded, consistent data and generated images.
- Seven views with a fixed shape in every module: `table`, `card`, `form`, `plan` (confirmation flow), `map`, `chart` and `diagram`.
- Module generation with AI (Anthropic or any OpenAI-compatible API), with preview, refinement and automatic repair of inconsistent definitions.
- Swagger UI, API keys with scopes, JWT exchange, panel users with roles, settings managed in the panel, mock latency, error rate and rate limit.
- Single-container Docker image and a Dokploy compose file.
