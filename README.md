# Mock API

[![CI](https://github.com/leandro-jm/generative-mock-api/actions/workflows/ci.yml/badge.svg)](https://github.com/leandro-jm/generative-mock-api/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Node ≥ 24](https://img.shields.io/badge/node-%E2%89%A524-339933)

**English** · [Português](README.pt-BR.md)

Fake-data APIs that follow **OpenAPI 3.1**, with authentication, Swagger docs and a web panel to configure everything. Built for tests, demos and front-end prototypes.

> The web panel and the generated sample data are in Brazilian Portuguese (pt-BR). Panel labels are quoted below in Portuguese, with a translation the first time they appear.

- **3 ready-made modules**: HR/labor (RH Trabalhista), Movies (Filmes, with posters and backdrops) and Books (Livros, with covers). Consistent, seeded data with valid Brazilian documents (CPF, CNPJ, PIS) and ISBNs.
- **Generate with AI**: describe a domain ("veterinary clinic with owners, pets and appointments") and the AI designs resources, fields, charts, diagrams and actions. The server generates the data and publishes CRUD, views and OpenAPI right away. Works with Anthropic (Claude) or any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Ollama).
- **7 views for the front end**, with the same shape in every module: `table`, `card`, `form`, `plan` (action with confirmation), `map` (GeoJSON), `chart` and `diagram`.
- **Swagger UI** at `/docs`, and the spec at `/openapi.json` / `/openapi.yaml` (everything) or `/openapi/<module>.json`.
- **Settings in the panel**: everything that would be an environment variable lives in **Configurações** (Settings) and applies immediately (precedence: panel > env > default).
- **Login created on first access**, plus user management (admin, editor, viewer) in the panel.
- **Single-container deploy** (Docker, Dokploy) with SQLite on a volume.

## Run locally

Requirements: Node 24+ and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # server on :4310 and panel (Vite) on :5173
```

Open http://localhost:5173, create the admin and you're done. Data lives in `apps/server/data` (SQLite); to put it elsewhere, set `DATA_DIR` in a `.env` at the repo root (see `.env.example`).

Or with Docker:

```bash
docker compose up --build   # http://localhost:4310
```

Tests: `pnpm test` (Vitest: calculations, query, auth, CRUD, the 7 views, plans, valid OpenAPI, AI with a fake provider). Types: `pnpm typecheck`.

## Using the APIs

Create a key in **API Keys** and send it in a header, or exchange it for a JWT:

```bash
curl -H "X-API-Key: mk_..." "http://localhost:4310/api/v1/filmes/filmes?limit=5&sort=-ano"

curl -X POST http://localhost:4310/api/v1/auth/token \
  -H "content-type: application/json" -d '{"apiKey":"mk_..."}'
# → { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

`{ "email", "password" }` of a panel user also works. Keys have scopes: `*`, `*:read`, `<module>:read`, `<module>:write`.

### Listing

`GET /api/v1/<module>/<resource>` accepts:

| Parameter | Example |
| --- | --- |
| `page`, `limit` | `?page=2&limit=50` (total in `X-Total-Count`, links in `Link`) |
| `sort` | `?sort=-preco,titulo` |
| `q` | `?q=farol` (accent- and case-insensitive) |
| filters | `?status=Ativo`, `?preco[gte]=50`, `?generos=Fantasia`, `?uf[in]=SP,RJ`, `?nome[like]=silva` |
| `fields` | `?fields=titulo,ano` |
| `expand` | `?expand=diretor_id,elenco_ids` (embeds the referenced records) |

Errors follow `application/problem+json` (RFC 9457), with per-field `errors[]` when the body does not match the schema.

### Views

| View | Endpoint | Shape |
| --- | --- | --- |
| table | `GET …/<resource>/_views/table` | columns + a page of data with reference labels |
| card | `GET …/<resource>/_views/card[?id=]` | `{ title, subtitle, image, badges, description, fields }` |
| form | `GET …/<resource>/_views/form?mode=create\|edit&id=` | JSON Schema + uiSchema (widgets, masks, options, steps) + initial values |
| plan | `POST …/<module>/plans` → `POST …/plans/{id}/confirm` | impact (delete, update, unlink, create, with diff) + confirmation |
| map | `GET …/<resource>/_views/map` | GeoJSON `FeatureCollection` (Point, LineString, Polygon) |
| chart | `GET …/<module>/_views/charts/<name>` or `…/<resource>/_views/chart?groupBy=&metric=` | `{ type, labels, series[] }` |
| diagram | `GET …/<module>/_views/diagrams/<name>` | `{ kind: tree\|graph\|flow, nodes, edges }` |

The panel's **Galeria de views** (view gallery) renders each of them from these endpoints.

**Plan** is the action that asks the user to confirm: nothing changes until `confirm`. Deletes compute the cascade through references (cascade, unlink or restrict; restrict blocks). There are batch actions (price or salary adjustment with a per-record diff) and domain actions (in HR: dismissing an employee, which computes the severance, creates the eSocial S-2299 event, ends benefits and cancels shifts). Serious actions require a phrase (`EXCLUIR 12 REGISTROS`, `CONFIRMAR`). Confirm answers 409 if the data changed after the plan and 410 if it expired. With **Exigir plano para excluir** (require a plan to delete) on, a direct `DELETE` answers 428 with the plan; repeat it with `X-Confirm-Plan: <id>`.

### Images

Posters, backdrops, covers and photos are drawn by the server, deterministic per record: `…/filmes/filmes/1/poster.svg`, `…/livros/livros/1/capa.png?w=300`. By default they are served without authentication (so they work in `<img>`); turn that off in Configurações → Autenticação.

### Simulation

On any call: `X-Mock-Delay: 1500` (delay in ms) and `X-Mock-Status: 503` (forces the error). In Configurações → Comportamento do mock (mock behavior): minimum and maximum latency, random error rate and requests-per-minute limit.

## Ready-made modules

| Module | Resources | Highlights |
| --- | --- | --- |
| **RH Trabalhista** (`/api/v1/rh`) | companies, departments, positions, work sites, employees, shifts, time punches, patrols, payslips, vacations, leaves, benefits, terminations, eSocial events | Org chart (tree), work sites with geofences (Polygon), geolocated time punches inside or outside the fence, patrols (LineString), payslips with INSS and IRRF, turnover; calculations at `POST /calculos/{inss,irrf,ferias,rescisao}`; plans: dismiss employee, delete department reallocating people, approve vacation, salary adjustment |
| **Filmes** (`/api/v1/filmes`) | genres, people, movies, reviews, rentals, theaters | Generated posters, backdrops and photos; fictional titles; filming locations and theaters on the map; cast and director graph; box office by year and genre |
| **Livros** (`/api/v1/livros`) | publishers, authors, series, books, reviews, bookstores, sales | Generated covers; valid ISBN-10/13 (`GET /livros/isbn/{isbn}`); bookstores and libraries on the map; sales by month and channel; author, book and publisher graph; batch price adjustment |

Resource and field names are in Portuguese (`colaboradores`, `filmes`, `livros`, …). The INSS and IRRF tables live in Configurações → RH Trabalhista. The values are illustrative and meant for testing, not for real payroll calculations.

## Generate with AI

1. In **Configurações → IA generativa** (generative AI), choose the provider and enter the key (stored encrypted in the database). Use **Testar conexão** (test connection) to check it.
   - **Anthropic**: default model `claude-opus-5-5`, with configurable effort and automatic fallback on refusal.
   - **OpenAI-compatible**: free base URL and model. If the provider does not accept `json_schema`, turn off "Saída estruturada" (structured output).
2. In **Gerar com IA** (generate with AI), describe the domain. The preview shows the resources, which of the 7 views the module covers (with a button asking the AI to cover the missing ones), a data sample and the JSON definition, which you can edit.
3. **Refine** in natural language as many times as you like and click **Salvar e publicar** (save and publish). The endpoints go live and into the docs immediately.

The AI only designs the structure (fields, types, generation hints); records are generated on the server, so you can ask for thousands at no extra cost. If the definition comes back inconsistent (for example, a reference to a resource that does not exist), the server sends the errors back to the AI and asks for one fix before showing the preview.

You can also create or edit a module by pasting its JSON definition (**Definição** button on the module).

## Configuration

Only these need to be environment variables (they exist before the app starts):

| Variable | Default | What |
| --- | --- | --- |
| `APP_SECRET` | generated and saved in `DATA_DIR/.app-secret` | Signs sessions and JWTs and encrypts stored secrets. **Set it in production.** Changing it logs everyone out and invalidates saved AI keys. |
| `PORT` | `4310` | HTTP port. |
| `DATA_DIR` | `./data` (in Docker, `/app/data`) | Where the SQLite database and the generated secret live. |
| `SETUP_TOKEN` | — | If set, first access requires this token. |
| `TRUST_PROXY` | `1` | How many proxies to trust (Traefik = 1; with Cloudflare in front, 2). |
| `LOG_LEVEL` | `info` | Log level. |

Everything else (app name, public URL, CORS, require authentication, JWT and session lifetime, latency, error rate, rate limit, pagination, data locale and seed, AI provider, key and model, INSS and IRRF tables…) is in **Configurações**. Each item shows where its value comes from (panel, env or default). Any of them also accepts an env var as an initial value (for example `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `MOCK_LATENCY_MAX_MS`); the **Exportar .env** button generates the file with the names.

## Deploy

### Docker

The image runs the server and serves the built panel from a single container. Mount a volume at `/app/data` and set `APP_SECRET`:

```bash
docker build -t mock-api .
docker run -d -p 4310:4310 -v mock-api-data:/app/data \
  -e APP_SECRET="$(openssl rand -base64 48)" mock-api
```

### Dokploy

`docker-compose.dokploy.yml` runs a single service with SQLite on the `appdata` volume. Dokploy's Traefik handles the domain and HTTPS; the app joins the `dokploy-network` network so it can be reached.

1. **Create the service**: in the project, *Create Service → Compose*. Under *Provider*, point to the repository and branch. Under *Compose Path*, use `./docker-compose.dokploy.yml`.
2. **Environment**:

   | Variable | Required | What |
   | --- | --- | --- |
   | `APP_SECRET` | yes | Generate with `openssl rand -base64 48`. |
   | `SETUP_TOKEN` | no | Protects the creation of the first admin. Recommended if the domain is public. |
   | `PUBLIC_URL` | no | `https://your-domain`. Can be set later in the panel. |
   | `TRUST_PROXY` | no | `1` (default). With Cloudflare in proxy mode, `2`. |
   | `ANTHROPIC_API_KEY`, `OPENAI_*`, `AI_PROVIDER` | no | Initial AI values; also configurable in the panel. |

3. **Domains**: service `app`, port `4310`, path `/`, HTTPS with Let's Encrypt.
4. **Deploy**. Open the domain and create the admin (with the `SETUP_TOKEN`, if set).

It also works as an *Application* with build type *Dockerfile*: same env, port 4310 and a volume mounted at `/app/data`.

**Backup**: the database is the file `/app/data/mock-api.db` (WAL mode). Turn on Dokploy's *Volume Backups* for the `appdata` volume with an S3 destination. The ready-made modules can always be recreated with **Resetar dados** (reset data); what matters to keep is users, keys, settings and generated modules.

## Project structure

```
apps/server   Fastify + TypeScript (runs directly on Node 24, no build step), native SQLite (node:sqlite)
  src/engine    generic engine: definitions → CRUD, query, validation (ajv), views, plans
  src/modules   rh, filmes, livros (definition, seed, custom routes and plans)
  src/openapi   OpenAPI 3.1 spec built from the definitions + Swagger UI
  src/ai        providers (Anthropic, OpenAI-compatible), prompt, structured output
  src/images    SVG posters, backdrops, covers and avatars; PNG via resvg
  src/settings  panel settings catalog, precedence and encryption
apps/web      React + Vite + Tailwind + TanStack Query (panel), Leaflet, Recharts, React Flow
```

Every module, ready-made or generated, is a set of resource definitions (typed fields + view hints). The same engine derives CRUD, validation, views and OpenAPI from them. That is why AI-generated modules have the same quality as the ready-made ones without new code.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues must **not** be reported in public issues: see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Third-party components distributed in the build are listed in [NOTICE](NOTICE). Generated data is fictitious; any resemblance to real people, companies or works is coincidental.
