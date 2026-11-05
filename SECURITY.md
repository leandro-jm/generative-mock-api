# Security Policy

mock-api serves fake data, but a deployed instance still holds real secrets: panel users and passwords, API keys, the `APP_SECRET` that signs sessions and JWTs, and the AI provider keys stored (encrypted) in the database. Security reports are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for security problems.**

Report privately through [GitHub Security Advisories](https://github.com/leandro-jm/generative-mock-api/security/advisories/new). Include:
- affected version or commit;
- a description of the issue and its impact (for example authentication or scope bypass, privilege escalation between roles, leak of stored AI keys or `APP_SECRET`, injection through a module definition or an AI-generated definition, SSRF through the AI provider base URL);
- steps to reproduce or a proof of concept;
- any suggested fix.

You should get an acknowledgement within 5 business days. Once the issue is confirmed, a fix and an advisory are prepared together with you, and you are credited unless you prefer otherwise.

## Hardening reminders

- **Set `APP_SECRET`** in production (`openssl rand -base64 48`). Without it the server generates one and stores it in the data volume, which is fine for local use only.
- **Set `SETUP_TOKEN`** when the instance is reachable from the internet before the first admin exists; otherwise whoever opens the panel first becomes admin.
- Run behind HTTPS (the Dokploy setup in the README uses Traefik with Let's Encrypt) and set `TRUST_PROXY` to the real number of proxies in front of the app, so rate limits see the client IP.
- Review the defaults in **Configurações** for public deployments:
  - `CORS_ORIGINS` is `*`; restrict it to the front ends that call the APIs.
  - `PUBLIC_IMAGES` and `PUBLIC_DOCS` are on, so generated images, `/docs` and `/openapi.json` open without login.
  - `AUTH_REQUIRED` is on; turning it off makes every mocked API answer without a key.
- Give API keys the narrowest scope that works (`<module>:read` instead of `*`), and revoke keys you no longer use.
- Back up the data volume: it holds the database (`mock-api.db`) and, if generated, `.app-secret`. Changing `APP_SECRET` logs everyone out and invalidates the stored AI keys.

## Out of scope

- The generated data is fictitious by design. Valid-looking documents (CPF, CNPJ, PIS, ISBN) are computed from a seed and do not identify real people or companies.
- `X-Mock-Delay`, `X-Mock-Status`, the random error rate and latency are intended features for testing clients, not denial-of-service issues. The per-key/IP rate limit (`MOCK_RATE_LIMIT`) and the login/setup limits remain in place.
