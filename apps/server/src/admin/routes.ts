// API interna da tela (/admin-api): primeiro acesso, login, usuários, chaves, configurações, módulos e IA.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../context.ts";
import { requireUser } from "../auth/guard.ts";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { MIN_PASSWORD } from "../auth/users.ts";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { checkModuleDef } from "../engine/def-schema.ts";
import { slugify } from "../lib/util.ts";

const role = z.enum(["admin", "editor", "viewer"]);
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const out = schema.safeParse(body ?? {});
  if (!out.success) throw badRequest("Dados inválidos.", { errors: out.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
  return out.data;
};

export async function adminRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { users, sessions, settings, registry, apiKeys, ai } = ctx;

  const startSession = (req: FastifyRequest, reply: FastifyReply, userId: string) => {
    const ttl = settings.num("auth.sessionTtlHours");
    const { token, expiresAt } = sessions.create(userId, ttl);
    // Secure quando chega por HTTPS (atrás do Traefik vem de X-Forwarded-Proto); em http local o cookie ainda funciona.
    reply.setCookie(SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: req.protocol === "https", expires: expiresAt });
  };

  // ---------- Primeiro acesso ----------
  app.get("/setup/status", async () => ({ needsSetup: users.count() === 0, setupTokenRequired: Boolean(ctx.env.setupToken), appName: settings.str("general.appName") }));

  app.post("/setup", { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, reply) => {
    const body = parse(z.object({ name: z.string().min(2), email: z.email(), password: z.string().min(MIN_PASSWORD), setupToken: z.string().optional(), appName: z.string().optional() }), req.body);
    if (users.count() > 0) throw conflict("O primeiro acesso já foi feito. Entre com seu usuário.");
    if (ctx.env.setupToken) {
      const a = Buffer.from(body.setupToken ?? "");
      const b = Buffer.from(ctx.env.setupToken);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw forbidden("SETUP_TOKEN inválido.");
    }
    const user = await users.create({ name: body.name, email: body.email, password: body.password, role: "admin" });
    if (body.appName?.trim()) settings.set("general.appName", body.appName.trim(), user.id);
    startSession(req, reply, user.id);
    return { user };
  });

  // ---------- Sessão ----------
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, reply) => {
    const body = parse(z.object({ email: z.string(), password: z.string() }), req.body);
    const user = await users.authenticate(body.email, body.password);
    if (!user) throw new HttpError(401, "Não autenticado", "E-mail ou senha inválidos.");
    startSession(req, reply, user.id);
    return { user };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) sessions.destroy(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const p = await requireUser(req, ctx);
    return { user: users.get(p.userId), appName: settings.str("general.appName"), secretGenerated: ctx.env.appSecretGenerated };
  });

  app.patch("/me", async (req) => {
    const p = await requireUser(req, ctx);
    const body = parse(z.object({ name: z.string().min(2).optional(), currentPassword: z.string().optional(), password: z.string().min(MIN_PASSWORD).optional() }), req.body);
    if (body.password) {
      const me = users.get(p.userId)!;
      if (!(await users.authenticate(me.email, body.currentPassword ?? ""))) throw badRequest("Senha atual incorreta.");
    }
    return users.update(p.userId, { name: body.name, password: body.password });
  });

  // ---------- Painel ----------
  app.get("/stats", async (req) => {
    await requireUser(req, ctx);
    const modules = registry.list();
    return {
      modules: modules.length,
      enabledModules: modules.filter((m) => m.enabled).length,
      resources: modules.reduce((a, m) => a + m.resources.length, 0),
      records: modules.reduce((a, m) => a + m.resources.reduce((b, r) => b + r.count, 0), 0),
      users: users.count(),
      apiKeys: apiKeys.list().filter((k) => !k.revoked_at).length,
      ai: ai.status(),
      authRequired: settings.bool("auth.required"),
    };
  });

  // ---------- Usuários ----------
  app.get("/users", async (req) => {
    await requireUser(req, ctx, ["admin"]);
    return { data: users.list() };
  });
  app.post("/users", async (req, reply) => {
    await requireUser(req, ctx, ["admin"]);
    const body = parse(z.object({ name: z.string().min(2), email: z.email(), password: z.string().min(MIN_PASSWORD), role }), req.body);
    reply.code(201);
    return users.create(body);
  });
  app.patch<{ Params: { id: string } }>("/users/:id", async (req) => {
    const p = await requireUser(req, ctx, ["admin"]);
    const body = parse(z.object({ name: z.string().min(2).optional(), role: role.optional(), active: z.boolean().optional(), password: z.string().min(MIN_PASSWORD).optional() }), req.body);
    if (req.params.id === p.userId && (body.active === false || (body.role && body.role !== "admin"))) throw badRequest("Você não pode se desativar nem tirar seu próprio papel de admin.");
    return users.update(req.params.id, body);
  });
  app.delete<{ Params: { id: string } }>("/users/:id", async (req, reply) => {
    const p = await requireUser(req, ctx, ["admin"]);
    if (req.params.id === p.userId) throw badRequest("Você não pode excluir a si mesmo.");
    users.remove(req.params.id);
    reply.code(204);
    return null;
  });

  // ---------- API keys ----------
  app.get<{ Querystring: { all?: string } }>("/api-keys", async (req) => {
    const p = await requireUser(req, ctx);
    return { data: apiKeys.list(p.role === "admin" && req.query.all === "1" ? undefined : p.userId) };
  });
  app.post("/api-keys", async (req, reply) => {
    const p = await requireUser(req, ctx);
    const body = parse(z.object({ name: z.string().min(1), scopes: z.array(z.string().regex(/^(\*|[a-z0-9-]+:(\*|read|write)|\*:(read|write))$/, "scope inválido")).min(1), expiresInDays: z.number().int().min(1).max(3650).nullable().optional() }), req.body);
    // viewer só cria chave de leitura
    if (p.role === "viewer" && body.scopes.some((s) => !s.endsWith(":read"))) throw forbidden("Viewer só pode criar chaves de leitura (scopes terminando em :read).");
    const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null;
    reply.code(201);
    return apiKeys.create({ name: body.name, scopes: body.scopes, userId: p.userId, expiresAt });
  });
  const ownKey = async (req: Parameters<typeof requireUser>[0], keyId: string) => {
    const p = await requireUser(req, ctx);
    const key = apiKeys.get(keyId);
    if (!key) throw notFound("Chave não encontrada.");
    if (key.user_id !== p.userId && p.role !== "admin") throw forbidden();
    return key;
  };
  app.post<{ Params: { id: string } }>("/api-keys/:id/revoke", async (req) => {
    await ownKey(req, req.params.id);
    apiKeys.revoke(req.params.id);
    return apiKeys.get(req.params.id);
  });
  app.delete<{ Params: { id: string } }>("/api-keys/:id", async (req, reply) => {
    await ownKey(req, req.params.id);
    apiKeys.remove(req.params.id);
    reply.code(204);
    return null;
  });

  // ---------- Configurações ----------
  app.get("/settings", async (req) => {
    await requireUser(req, ctx, ["admin"]);
    return { ...settings.list(), boot: { port: ctx.env.port, dataDir: ctx.env.dataDir, trustProxy: ctx.env.trustProxy, appSecret: ctx.env.appSecretGenerated ? "gerado automaticamente (defina APP_SECRET em produção)" : "definido via env", setupToken: Boolean(ctx.env.setupToken), production: ctx.env.production } };
  });
  app.put("/settings", async (req) => {
    const p = await requireUser(req, ctx, ["admin"]);
    const body = parse(z.object({ values: z.record(z.string(), z.unknown()) }), req.body);
    const errors: { field: string; message: string }[] = [];
    for (const [key, value] of Object.entries(body.values)) {
      try {
        settings.set(key, value, p.userId);
      } catch (err) {
        errors.push({ field: key, message: (err as Error).message });
      }
    }
    if (errors.length) throw badRequest("Algumas configurações não foram salvas.", { errors });
    return settings.list();
  });
  app.delete<{ Params: { key: string } }>("/settings/:key", async (req) => {
    await requireUser(req, ctx, ["admin"]);
    settings.reset(req.params.key);
    return settings.list();
  });
  app.get<{ Querystring: { secrets?: string } }>("/settings/export", async (req, reply) => {
    await requireUser(req, ctx, ["admin"]);
    reply.header("Content-Disposition", 'attachment; filename="mock-api.env"').type("text/plain; charset=utf-8");
    return settings.exportEnv(req.query.secrets === "1");
  });

  // ---------- Módulos ----------
  app.get("/modules", async (req) => {
    await requireUser(req, ctx);
    return { data: registry.list() };
  });
  app.get<{ Params: { slug: string } }>("/modules/:slug", async (req) => {
    await requireUser(req, ctx);
    const plans = ctx.plans.actions(registry.getAny(req.params.slug), registry.customPlans(req.params.slug));
    return { ...registry.summary(req.params.slug), definition: registry.getAny(req.params.slug), planActions: plans, customCharts: (registry.builtin(req.params.slug)?.customCharts ?? []).map((c) => ({ name: c.name, title: c.title, description: c.description })) };
  });
  app.patch<{ Params: { slug: string } }>("/modules/:slug", async (req) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    const body = parse(z.object({ enabled: z.boolean() }), req.body);
    registry.setEnabled(req.params.slug, body.enabled);
    return registry.summary(req.params.slug);
  });
  app.post<{ Params: { slug: string } }>("/modules/:slug/reset", async (req) => {
    await requireUser(req, ctx, ["admin"]);
    registry.getAny(req.params.slug);
    registry.reset(req.params.slug);
    return registry.summary(req.params.slug);
  });
  app.post<{ Params: { slug: string } }>("/modules/:slug/generate", async (req) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    const body = parse(z.object({ resource: z.string(), count: z.number().int().min(1).max(settings.num("ai.maxRecords")) }), req.body);
    registry.generateMore(req.params.slug, body.resource, body.count);
    return registry.summary(req.params.slug);
  });
  app.delete<{ Params: { slug: string } }>("/modules/:slug", async (req, reply) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    registry.remove(req.params.slug);
    reply.code(204);
    return null;
  });
  const saveBody = z.object({
    definition: z.unknown(),
    counts: z.union([z.number().int().min(0), z.record(z.string(), z.number().int().min(0))]).optional(),
    prompt: z.string().optional(),
    aiMeta: z.record(z.string(), z.unknown()).optional(),
    replaceData: z.boolean().optional(),
    source: z.enum(["ai", "manual"]).optional(),
  });
  const save = (raw: unknown, fixedSlug?: string) => {
    const body = parse(saveBody, raw);
    const input = body.definition as Record<string, unknown>;
    const def = checkModuleDef({ ...input, slug: fixedSlug ?? slugify(String(input?.slug ?? "")), source: body.source ?? (input?.source === "ai" ? "ai" : "manual") });
    const max = settings.num("ai.maxRecords");
    const counts = typeof body.counts === "number" ? Math.min(max, body.counts) : body.counts ? Object.fromEntries(Object.entries(body.counts).map(([k, v]) => [k, Math.min(max, v)])) : settings.num("ai.defaultRecords");
    return registry.save(def, { prompt: body.prompt, aiMeta: body.aiMeta, counts, replaceData: body.replaceData });
  };
  app.post("/modules", async (req, reply) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    const slug = slugify(String(((req.body as { definition?: { slug?: string } })?.definition?.slug) ?? ""));
    if (slug && registry.list().some((m) => m.slug === slug)) throw conflict(`Já existe um módulo "${slug}". Escolha outro slug ou edite o existente.`);
    reply.code(201);
    return save(req.body);
  });
  app.put<{ Params: { slug: string } }>("/modules/:slug/definition", async (req) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    if (registry.isBuiltin(req.params.slug)) throw badRequest("Módulos prontos são definidos no código.");
    registry.getAny(req.params.slug);
    return save(req.body, req.params.slug);
  });

  // ---------- IA ----------
  app.get("/ai/status", async (req) => {
    await requireUser(req, ctx);
    return ai.status();
  });
  app.post("/ai/test", async (req) => {
    await requireUser(req, ctx, ["admin"]);
    return { ok: true, message: await ai.test() };
  });
  app.post("/ai/generate", async (req) => {
    await requireUser(req, ctx, ["admin", "editor"]);
    const body = parse(z.object({ prompt: z.string().min(3).max(4000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).optional(), previousSlug: z.string().optional() }), req.body);
    const previous = body.previousSlug && !body.history?.length ? registry.getAny(body.previousSlug) : undefined;
    return ai.generate({ prompt: body.prompt, history: body.history, previous });
  });
}
