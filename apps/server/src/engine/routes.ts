// Rotas /api/v1 de todos os módulos: CRUD, imagens, views, planos e rotas próprias dos módulos prontos.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import rateLimit from "@fastify/rate-limit";
import type { AppContext } from "../context.ts";
import { requireScope, resolvePrincipal } from "../auth/guard.ts";
import { HttpError, badRequest, notFound } from "../lib/errors.ts";
import { baseUrl } from "../lib/http.ts";
import { applyMockBehaviour } from "../mock/behaviour.ts";
import { renderSvg } from "../images/svg.ts";
import { svgToPng } from "../images/png.ts";
import { applyQuery, linkHeader, paginate, parseListQuery } from "./query.ts";
import { imageName, present, titleOf } from "./present.ts";
import { validateInput } from "./validate.ts";
import { tableColumns } from "./views/table.ts";
import { toCard } from "./views/card.ts";
import { formView } from "./views/form.ts";
import { mapView } from "./views/map.ts";
import { aggregate } from "./views/chart.ts";
import { diagramView } from "./views/diagram.ts";
import { planRequestSchema } from "./plans.ts";
import type { Rec } from "./store.ts";
import type { ModuleDef, ResourceDef } from "./types.ts";

type Params = { module: string; resource: string; id: string };

export async function engineRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { store, registry, settings, plans } = ctx;

  const resolve = (m: string, r?: string) => {
    const mod = registry.get(m);
    if (!r) return { mod, res: undefined as unknown as ResourceDef };
    const res = mod.resources.find((x) => x.slug === r);
    if (!res) throw notFound(`Recurso "${r}" não existe em ${m}. Recursos: ${mod.resources.map((x) => x.slug).join(", ")}.`);
    return { mod, res };
  };
  const recordOr404 = (m: string, res: ResourceDef, idRaw: string): Rec => {
    const id = Number(idRaw);
    const rec = Number.isInteger(id) ? store.get(m, res.slug, id) : undefined;
    if (!rec) throw notFound(`${res.label} ${idRaw} não encontrado.`);
    return rec;
  };
  const limits = () => ({ limit: settings.num("mock.defaultPageSize"), maxLimit: settings.num("mock.maxPageSize") });
  const base = (req: FastifyRequest) => baseUrl(req, settings);

  /** Rótulo de uma referência (para cards e tabelas). */
  const refLabeler = (mod: ModuleDef, res: ResourceDef) => (field: string, id: unknown) => {
    const f = res.fields.find((x) => x.name === field);
    const target = f?.ref ? mod.resources.find((x) => x.slug === f.ref) : undefined;
    if (!target || typeof id !== "number") return id === null || id === undefined ? null : String(id);
    return titleOf(target, store.get(mod.slug, target.slug, id)) || `#${id}`;
  };

  /** Confere que refs apontam para registros existentes. */
  const checkRefs = (mod: ModuleDef, res: ResourceDef, body: Record<string, unknown>) => {
    const errors: { field: string; message: string }[] = [];
    for (const f of res.fields) {
      if ((f.type !== "ref" && f.type !== "refs") || !f.ref || body[f.name] === undefined || body[f.name] === null) continue;
      const ids = f.type === "ref" ? [body[f.name]] : (body[f.name] as unknown[]);
      for (const id of ids) if (!store.get(mod.slug, f.ref, id as number)) errors.push({ field: f.name, message: `${f.ref} ${id} não existe` });
    }
    if (errors.length) throw badRequest("Referência para registro inexistente.", { errors });
  };

  // Autenticação, latência/erros simulados e limite de requisições valem para tudo em /api/v1.
  app.addHook("preHandler", async (req, reply) => {
    const cfg = req.routeOptions.config;
    if (cfg.auth === "none") return;
    const params = req.params as Partial<Params>;
    const module = cfg.module ?? params.module;
    if (cfg.auth === "image" && settings.bool("auth.publicImages")) {
      // imagens públicas não passam pela latência simulada (são usadas em <img>)
      return;
    }
    if (module) await requireScope(req, ctx, module, cfg.mode ?? (req.method === "GET" ? "read" : "write"));
    await applyMockBehaviour(req, reply, settings);
  });

  await app.register(rateLimit, {
    global: true,
    max: () => settings.num("mock.rateLimitPerMinute") || 1_000_000,
    timeWindow: 60_000,
    allowList: () => settings.num("mock.rateLimitPerMinute") === 0,
    keyGenerator: (req) => (req.headers["x-api-key"] as string) ?? req.headers.authorization ?? req.ip,
    errorResponseBuilder: (_req, c) => new HttpError(429, "Muitas requisições", `Limite de ${c.max} requisições por minuto. Tente de novo em ${Math.ceil(c.ttl / 1000)}s.`),
  });

  // ---------- Autenticação dos consumidores ----------
  const tokenBody = z.union([z.object({ email: z.email(), password: z.string() }), z.object({ apiKey: z.string() })]);
  app.post("/auth/token", { config: { auth: "none" } }, async (req) => {
    const body = tokenBody.safeParse(req.body);
    if (!body.success) throw badRequest('Envie { "email", "password" } ou { "apiKey" }.');
    const ttl = settings.num("auth.jwtTtlMinutes");
    if ("apiKey" in body.data) {
      const hit = ctx.apiKeys.verify(body.data.apiKey);
      if (!hit) throw new HttpError(401, "Não autenticado", "API key inválida.");
      const token = await ctx.jwt.sign({ sub: hit.key.user_id, scopes: hit.key.scopes, name: hit.key.name, kid: hit.key.id }, ttl);
      return { access_token: token, token_type: "Bearer", expires_in: ttl * 60, scopes: hit.key.scopes };
    }
    const user = await ctx.users.authenticate(body.data.email, body.data.password);
    if (!user) throw new HttpError(401, "Não autenticado", "E-mail ou senha inválidos.");
    const scopes = user.role === "viewer" ? ["*:read"] : ["*"];
    const token = await ctx.jwt.sign({ sub: user.id, scopes, name: user.name }, ttl);
    return { access_token: token, token_type: "Bearer", expires_in: ttl * 60, scopes };
  });

  app.get("/auth/me", { config: { auth: "none" } }, async (req) => {
    const p = await resolvePrincipal(req, ctx);
    return { kind: p.kind, name: p.name ?? null, role: p.role ?? null, scopes: p.scopes };
  });

  // ---------- Catálogo ----------
  app.get("/", { config: { auth: "none" } }, async (req) => {
    const b = base(req);
    return {
      name: settings.str("general.appName"),
      docs: `${b}/docs`,
      openapi: `${b}/openapi.json`,
      auth: { required: settings.bool("auth.required"), token: `${b}/api/v1/auth/token`, headers: ["X-API-Key: mk_...", "Authorization: Bearer <jwt>"] },
      modules: registry.enabled().map((m) => ({ slug: m.slug, title: m.title, description: m.description, url: `${b}/api/v1/${m.slug}`, openapi: `${b}/openapi/${m.slug}.json` })),
    };
  });

  app.get<{ Params: Params }>("/:module", async (req) => {
    const { mod } = resolve(req.params.module);
    const b = `${base(req)}/api/v1/${mod.slug}`;
    const s = registry.summary(mod.slug);
    return {
      ...s,
      links: {
        resources: Object.fromEntries(mod.resources.map((r) => [r.slug, `${b}/${r.slug}`])),
        charts: `${b}/_views/charts`,
        diagrams: `${b}/_views/diagrams`,
        planActions: `${b}/plans/_actions`,
        openapi: `${base(req)}/openapi/${mod.slug}.json`,
      },
    };
  });

  // ---------- CRUD ----------
  app.get<{ Params: Params; Querystring: Record<string, unknown> }>("/:module/:resource", async (req, reply) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const q = parseListQuery(res, req.query, limits());
    const rows = applyQuery(res, store.all(mod.slug, res.slug), q);
    const page = paginate(rows, q.page, q.limit);
    const b = base(req);
    reply.header("X-Total-Count", String(page.meta.total));
    reply.header("Link", linkHeader(`${b}/api/v1/${mod.slug}/${res.slug}`, req.query, page.meta));
    return { data: page.data.map((r) => present(mod.slug, res, r, { baseUrl: b, fields: q.fields, expand: q.expand, store, module: mod })), meta: page.meta };
  });

  app.get<{ Params: Params; Querystring: { expand?: string; fields?: string } }>("/:module/:resource/:id", async (req) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const rec = recordOr404(mod.slug, res, req.params.id);
    const list = (s?: string) => s?.split(",").map((x) => x.trim()).filter(Boolean);
    return present(mod.slug, res, rec, { baseUrl: base(req), expand: list(req.query.expand), fields: list(req.query.fields), store, module: mod });
  });

  app.post<{ Params: Params }>("/:module/:resource", async (req, reply) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const body = validateInput(res, req.body ?? {}, false);
    checkRefs(mod, res, body);
    const rec = store.insert(mod.slug, res.slug, body);
    reply.code(201).header("Location", `${base(req)}/api/v1/${mod.slug}/${res.slug}/${rec.id}`);
    return present(mod.slug, res, rec, { baseUrl: base(req) });
  });

  const write = (merge: boolean) => async (req: FastifyRequest<{ Params: Params }>) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const current = recordOr404(mod.slug, res, req.params.id);
    const body = validateInput(res, req.body ?? {}, merge);
    checkRefs(mod, res, body);
    // PUT troca os campos editáveis; os somente leitura continuam como estavam.
    const keep = merge ? {} : Object.fromEntries(res.fields.filter((f) => f.readOnly && current[f.name] !== undefined).map((f) => [f.name, current[f.name]]));
    const rec = store.update(mod.slug, res.slug, current.id, { ...keep, ...body }, merge)!;
    return present(mod.slug, res, rec, { baseUrl: base(req) });
  };
  app.put<{ Params: Params }>("/:module/:resource/:id", write(false));
  app.patch<{ Params: Params }>("/:module/:resource/:id", write(true));

  app.delete<{ Params: Params }>("/:module/:resource/:id", async (req, reply) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const rec = recordOr404(mod.slug, res, req.params.id);
    const planId = req.headers["x-confirm-plan"] as string | undefined;
    if (planId) {
      const plan = plans.get(mod.slug, planId);
      if (plan.action !== "delete" || plan.resource !== res.slug || !plan.impacts.some((i: { id: number; resource: string; effect: string }) => i.id === rec.id && i.resource === res.slug && i.effect === "delete")) {
        throw badRequest("O plano informado em X-Confirm-Plan não é a exclusão deste registro.");
      }
      return plans.confirm(mod.slug, planId, req.headers["x-confirm-phrase"] as string | undefined);
    }
    if (settings.bool("mock.confirmDeletes")) {
      const principal = await resolvePrincipal(req, ctx);
      const plan = plans.create(mod, { action: "delete", resource: res.slug, ids: [rec.id] }, [], principal.userId);
      reply.code(428);
      return { type: "about:blank", title: "Confirmação necessária", status: 428, detail: "Exclusão exige confirmação. Revise o plano e repita o DELETE com o header X-Confirm-Plan (e X-Confirm-Phrase, se pedido) ou use confirmUrl.", plan };
    }
    // Sem confirmação: aplica a mesma cascata do plano, direto.
    const plan = plans.create(mod, { action: "delete", resource: res.slug, ids: [rec.id] }, []);
    if (plan.status === "blocked") throw new HttpError(409, "Conflito", "Há registros que impedem a exclusão.", { warnings: plan.warnings, plan });
    plans.confirm(mod.slug, plan.id, plan.confirmation.phrase ?? undefined);
    reply.code(204);
    return null;
  });

  app.post<{ Params: { module: string } }>("/:module/_reset", async (req) => {
    const p = await resolvePrincipal(req, ctx);
    if (p.role !== "admin") throw new HttpError(403, "Acesso negado", "Só admin pode resetar dados.");
    const { mod } = resolve(req.params.module);
    registry.reset(mod.slug);
    return registry.summary(mod.slug);
  });

  // ---------- Imagens ----------
  app.get<{ Params: Params & { file: string }; Querystring: { w?: string } }>("/:module/:resource/:id/:file", { config: { auth: "image", mode: "read" } }, async (req, reply) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const m = /^([a-z0-9_-]+)\.(svg|png)$/.exec(req.params.file);
    if (!m) throw notFound();
    const field = res.fields.find((f) => f.type === "image" && imageName(f.name) === m[1]);
    if (!field) throw notFound(`${res.label} não tem a imagem "${m[1]}".`);
    const rec = recordOr404(mod.slug, res, req.params.id);
    const custom = registry.builtin(mod.slug)?.image?.(res.slug, field.name, rec, ctx.engine);
    const card = toCard(res, rec, refLabeler(mod, res));
    const spec = custom ?? { kind: field.imageKind ?? "generic", title: card.title, subtitle: card.subtitle ? String(card.subtitle) : card.badges[0] ?? null, seed: `${mod.slug}-${res.slug}-${rec.id}`, palette: card.badges[0] ?? null };
    const svg = renderSvg(spec);
    reply.header("Cache-Control", "public, max-age=3600");
    reply.header("ETag", `"${rec.updated_at}-${m[2]}-${req.query.w ?? ""}"`);
    if (m[2] === "svg") return reply.type("image/svg+xml; charset=utf-8").send(svg);
    return reply.type("image/png").send(svgToPng(svg, req.query.w ? Number(req.query.w) : undefined));
  });

  // ---------- Views por recurso ----------
  app.get<{ Params: Params & { view: string }; Querystring: Record<string, unknown> }>("/:module/:resource/_views/:view", async (req) => {
    const { mod, res } = resolve(req.params.module, req.params.resource);
    const b = base(req);
    const labels = refLabeler(mod, res);
    const query = req.query;
    switch (req.params.view) {
      case "table": {
        const q = parseListQuery(res, query, limits());
        const page = paginate(applyQuery(res, store.all(mod.slug, res.slug), q), q.page, q.limit);
        const columns = tableColumns(res);
        const refCols = columns.filter((c) => c.type === "ref" || c.type === "refs");
        return {
          resource: res.slug,
          title: res.labelPlural,
          columns,
          data: page.data.map((r) => {
            const row = present(mod.slug, res, r, { baseUrl: b });
            const _labels: Record<string, unknown> = {};
            for (const c of refCols) _labels[c.key] = Array.isArray(r[c.key]) ? (r[c.key] as unknown[]).map((x) => labels(c.key, x)) : labels(c.key, r[c.key]);
            return { ...row, _labels };
          }),
          meta: page.meta,
          actions: { create: `/api/v1/${mod.slug}/${res.slug}/_views/form?mode=create`, edit: `/api/v1/${mod.slug}/${res.slug}/_views/form?mode=edit&id={id}`, delete: `/api/v1/${mod.slug}/plans` },
        };
      }
      case "card": {
        if (query.id !== undefined) return toCard(res, present(mod.slug, res, recordOr404(mod.slug, res, String(query.id)), { baseUrl: b }), labels);
        const q = parseListQuery(res, query, limits());
        const page = paginate(applyQuery(res, store.all(mod.slug, res.slug), q), q.page, q.limit);
        return { resource: res.slug, data: page.data.map((r) => toCard(res, present(mod.slug, res, r, { baseUrl: b }), labels)), meta: page.meta };
      }
      case "form": {
        const mode = query.mode === "edit" ? "edit" : "create";
        const rec = mode === "edit" ? recordOr404(mod.slug, res, String(query.id ?? "")) : undefined;
        return formView(mod, res, store, mode, rec);
      }
      case "map": {
        if (!res.fields.some((f) => f.type.startsWith("geo_"))) throw badRequest(`${res.labelPlural} não têm campos geográficos.`);
        const q = parseListQuery(res, { ...query, limit: undefined }, limits());
        const rows = applyQuery(res, store.all(mod.slug, res.slug), q).slice(0, Number(query.limit ?? 2000));
        return mapView(res, rows, (rec) => toCard(res, present(mod.slug, res, rec as Rec, { baseUrl: b }), labels));
      }
      case "chart": {
        const { type = "bar", groupBy, metric = "count", interval, seriesBy, limit, sort, ...rest } = query as Record<string, string>;
        if (!groupBy) throw badRequest("Informe groupBy (campo para agrupar).");
        if (!["bar", "line", "pie", "area"].includes(type)) throw badRequest("type deve ser bar, line, pie ou area.");
        const q = parseListQuery(res, rest, limits());
        const rows = applyQuery(res, store.all(mod.slug, res.slug), { filters: q.filters, q: q.q, sort: [] });
        return aggregate(mod, res, rows, store, { type: type as "bar", groupBy, metric, interval: interval as "month" | undefined, seriesBy, limit: limit ? Number(limit) : undefined, sort: sort as "label" | undefined });
      }
      default:
        throw notFound(`View "${req.params.view}" não existe. Views por recurso: table, card, form, map, chart.`);
    }
  });

  // ---------- Views do módulo: gráficos e diagramas ----------
  app.get<{ Params: { module: string } }>("/:module/_views/charts", async (req) => {
    const { mod } = resolve(req.params.module);
    const b = `/api/v1/${mod.slug}/_views/charts`;
    return {
      data: [
        ...(mod.charts ?? []).map((c) => ({ name: c.name, title: c.title, description: c.description ?? null, type: c.type, resource: c.resource, url: `${b}/${c.name}` })),
        ...(registry.builtin(mod.slug)?.customCharts ?? []).map((c) => ({ name: c.name, title: c.title, description: c.description, type: "computed", resource: null, url: `${b}/${c.name}` })),
      ],
    };
  });
  app.get<{ Params: { module: string; name: string } }>("/:module/_views/charts/:name", async (req) => {
    const { mod } = resolve(req.params.module);
    const custom = registry.builtin(mod.slug)?.customCharts?.find((c) => c.name === req.params.name);
    if (custom) return custom.build(ctx.engine);
    const c = mod.charts?.find((x) => x.name === req.params.name);
    if (!c) throw notFound(`Gráfico "${req.params.name}" não existe.`);
    const { res } = resolve(mod.slug, c.resource);
    const filters = c.filter ? parseListQuery(res, c.filter, limits()).filters : [];
    const rows = applyQuery(res, store.all(mod.slug, res.slug), { filters, sort: [] });
    return { name: c.name, description: c.description ?? null, ...aggregate(mod, res, rows, store, { ...c }) };
  });
  app.get<{ Params: { module: string } }>("/:module/_views/diagrams", async (req) => {
    const { mod } = resolve(req.params.module);
    return { data: (mod.diagrams ?? []).map((d) => ({ name: d.name, title: d.title, description: d.description ?? null, kind: d.kind, url: `/api/v1/${mod.slug}/_views/diagrams/${d.name}` })) };
  });
  app.get<{ Params: { module: string; name: string } }>("/:module/_views/diagrams/:name", async (req) => {
    const { mod } = resolve(req.params.module);
    const d = mod.diagrams?.find((x) => x.name === req.params.name);
    if (!d) throw notFound(`Diagrama "${req.params.name}" não existe.`);
    return diagramView(mod, d, store);
  });

  // ---------- Planos (ações com confirmação) ----------
  app.get<{ Params: { module: string } }>("/:module/plans/_actions", async (req) => {
    const { mod } = resolve(req.params.module);
    return { data: plans.actions(mod, registry.customPlans(mod.slug)) };
  });
  app.get<{ Params: { module: string } }>("/:module/plans", async (req) => {
    const { mod } = resolve(req.params.module);
    return { data: plans.list(mod.slug) };
  });
  app.post<{ Params: { module: string } }>("/:module/plans", async (req, reply) => {
    const { mod } = resolve(req.params.module);
    const body = planRequestSchema.safeParse(req.body ?? {});
    if (!body.success) throw badRequest("Pedido de plano inválido.", { errors: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
    const p = await resolvePrincipal(req, ctx);
    reply.code(201);
    return plans.create(mod, body.data, registry.customPlans(mod.slug), p.userId);
  });
  app.get<{ Params: { module: string; planId: string } }>("/:module/plans/:planId", async (req) => {
    const { mod } = resolve(req.params.module);
    return plans.get(mod.slug, req.params.planId);
  });
  app.post<{ Params: { module: string; planId: string }; Body: { phrase?: string } }>("/:module/plans/:planId/confirm", async (req) => {
    const { mod } = resolve(req.params.module);
    return plans.confirm(mod.slug, req.params.planId, req.body?.phrase);
  });
  app.post<{ Params: { module: string; planId: string } }>("/:module/plans/:planId/cancel", async (req) => {
    const { mod } = resolve(req.params.module);
    return plans.cancel(mod.slug, req.params.planId);
  });

  // ---------- Rotas próprias dos módulos prontos ----------
  for (const b of registry.allBuiltins()) {
    const m = b.def;
    for (const route of b.customRoutes ?? []) {
      app.route({
        method: route.method,
        url: `/${m.slug}${route.url}`,
        config: { module: m.slug, mode: route.mode },
        handler: async (req: FastifyRequest, _reply: FastifyReply) => {
          registry.get(m.slug); // desligado → 404
          const parse = <T>(schema: z.ZodType<T> | undefined, value: unknown, what: string): T => {
            if (!schema) return value as T;
            const out = schema.safeParse(value ?? {});
            if (!out.success) throw badRequest(`${what} inválido.`, { errors: out.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
            return out.data;
          };
          return route.handler({ params: parse(route.params, req.params, "Parâmetro"), query: parse(route.query, req.query, "Query"), body: parse(route.body, req.body, "Corpo"), baseUrl: base(req) }, ctx.engine);
        },
      });
    }
  }
}
