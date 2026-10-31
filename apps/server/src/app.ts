import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./env.ts";
import type { AppContext } from "./context.ts";
import { openDb, type Db } from "./db/index.ts";
import { SettingsService } from "./settings/service.ts";
import { UsersService } from "./auth/users.ts";
import { SessionsService } from "./auth/sessions.ts";
import { ApiKeysService } from "./auth/api-keys.ts";
import { JwtService } from "./auth/jwt.ts";
import { Store } from "./engine/store.ts";
import { ModuleRegistry } from "./engine/registry.ts";
import { PlansService } from "./engine/plans.ts";
import { makeFaker } from "./engine/datagen.ts";
import type { EngineContext } from "./engine/types.ts";
import { engineRoutes } from "./engine/routes.ts";
import { openapiRoutes } from "./openapi/routes.ts";
import { adminRoutes } from "./admin/routes.ts";
import { AiService } from "./ai/service.ts";
import { BUILTIN_MODULES } from "./modules/registry.ts";
import { HttpError, problem, statusTitle } from "./lib/errors.ts";

export function createContext(env: Env, db: Db = openDb(env.dataDir), envSource: NodeJS.ProcessEnv = process.env): AppContext {
  const settings = new SettingsService(db, env.appSecret, envSource);
  const store = new Store(db);
  const engine: EngineContext = { store, settings, faker: (seed) => makeFaker(settings.str("data.locale"), seed ?? settings.num("data.seed")) };
  const registry = new ModuleRegistry(db, engine, BUILTIN_MODULES);
  registry.init();
  return {
    env,
    db,
    settings,
    users: new UsersService(db),
    sessions: new SessionsService(db),
    apiKeys: new ApiKeysService(db),
    jwt: new JwtService(env.appSecret),
    store,
    registry,
    plans: new PlansService(db, engine),
    engine,
    ai: new AiService(settings),
  };
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const { env, settings } = ctx;
  const app = Fastify({
    logger: opts.logger ?? { level: env.logLevel },
    // Número = quantos proxies confiar (o tipo do Fastify não declara, mas o proxy-addr aceita).
    trustProxy: env.trustProxy as unknown as boolean,
    bodyLimit: 2 * 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).type("application/problem+json").send(problem(err.status, err.title, err.message, req.url, err.extra));
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    const detail = status >= 500 ? "Erro inesperado no servidor." : err.message;
    return reply.code(status).type("application/problem+json").send(problem(status, statusTitle(status), detail, req.url));
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/admin-api/") || req.url.startsWith("/openapi")) {
      return reply.code(404).type("application/problem+json").send(problem(404, "Não encontrado", `Rota ${req.method} ${req.url.split("?")[0]} não existe. Veja /docs.`, req.url));
    }
    // SPA: qualquer outra rota devolve o index.html do painel.
    const index = join(env.webDist, "index.html");
    if (req.method === "GET" && existsSync(index)) return reply.type("text/html; charset=utf-8").sendFile("index.html", env.webDist);
    return reply.code(404).send("Painel não construído. Rode pnpm build ou use o Vite em dev.");
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        // O HTTPS fica a cargo do proxy (Traefik); forçar upgrade quebraria o acesso por http local.
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    credentials: true,
    exposedHeaders: ["Link", "X-Total-Count", "Location", "X-Mock-Delay-Applied"],
    origin: (origin, cb) => {
      const allowed = settings.str("general.corsOrigins").split(",").map((s) => s.trim()).filter(Boolean);
      if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, origin ?? true);
      cb(null, false);
    },
  });
  await app.register(cookie);
  // Rate limit só onde a rota pedir (login/setup); as APIs mockadas têm o próprio, configurável.
  await app.register(rateLimit, { global: false });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health", async (_req, reply) => {
    try {
      ctx.db.prepare("SELECT 1").get();
      return { status: "ok", modules: ctx.registry.enabled().length, uptime: Math.round(process.uptime()) };
    } catch {
      return reply.code(503).send({ status: "error" });
    }
  });

  await app.register((api, _o, done) => void engineRoutes(api, ctx).then(() => done(), done), { prefix: "/api/v1" });
  await app.register((admin, _o, done) => void adminRoutes(admin, ctx).then(() => done(), done), { prefix: "/admin-api" });
  await app.register((docs, _o, done) => void openapiRoutes(docs, ctx).then(() => done(), done));

  if (existsSync(env.webDist)) {
    await app.register(fastifyStatic, { root: env.webDist, prefix: "/", wildcard: false, maxAge: "1h", decorateReply: true });
  } else {
    app.decorateReply("sendFile", function () {
      return this.code(404).send("Painel não construído.");
    });
  }
  return app as unknown as FastifyInstance;
}
