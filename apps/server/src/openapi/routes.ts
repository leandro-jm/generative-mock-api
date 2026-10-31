import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import fastifyStatic from "@fastify/static";
import YAML from "yaml";
import type { AppContext } from "../context.ts";
import { requireUser } from "../auth/guard.ts";
import { baseUrl } from "../lib/http.ts";
import { escapeXml } from "../lib/util.ts";
import { buildOpenApi } from "./builder.ts";

const swaggerDir = dirname(createRequire(import.meta.url).resolve("swagger-ui-dist/package.json"));

export async function openapiRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const cache = new Map<string, Record<string, unknown>>();

  const spec = (req: FastifyRequest, only?: string) => {
    const b = baseUrl(req, ctx.settings);
    // A spec depende dos módulos (revision), dos exemplos (dados) e de algumas configurações.
    const key = [ctx.registry.revision, b, only ?? "*", ctx.settings.str("general.appName"), ctx.settings.bool("auth.publicImages")].join("|");
    let doc = cache.get(key);
    if (!doc) {
      if (cache.size > 50) cache.clear();
      if (only) ctx.registry.get(only);
      doc = buildOpenApi({ modules: ctx.registry.enabled(), builtins: new Map(ctx.registry.allBuiltins().map((x) => [x.def.slug, x])), store: ctx.store, settings: ctx.settings, baseUrl: b, only });
      cache.set(key, doc);
    }
    return doc;
  };

  const guard = async (req: FastifyRequest) => {
    if (!ctx.settings.bool("auth.publicDocs")) await requireUser(req, ctx);
  };

  app.get("/openapi.json", async (req) => {
    await guard(req);
    return spec(req);
  });
  app.get("/openapi.yaml", async (req, reply) => {
    await guard(req);
    return reply.type("application/yaml; charset=utf-8").send(YAML.stringify(spec(req), { aliasDuplicateObjects: false }));
  });
  app.get<{ Params: { file: string } }>("/openapi/:file", async (req, reply) => {
    await guard(req);
    const m = /^([a-z0-9-]+)\.(json|yaml)$/.exec(req.params.file);
    if (!m) return reply.code(404).send({ title: "Não encontrado", status: 404, detail: "Use /openapi/<módulo>.json ou .yaml" });
    const doc = spec(req, m[1]);
    return m[2] === "json" ? doc : reply.type("application/yaml; charset=utf-8").send(YAML.stringify(doc, { aliasDuplicateObjects: false }));
  });

  await app.register(fastifyStatic, { root: swaggerDir, prefix: "/docs/assets/", decorateReply: false, index: false });

  app.get<{ Querystring: { module?: string } }>("/docs", async (req, reply) => {
    await guard(req);
    const module = /^[a-z0-9-]+$/.test(req.query.module ?? "") ? req.query.module : "";
    const title = escapeXml(`${ctx.settings.str("general.appName")} · Documentação`);
    reply.type("text/html; charset=utf-8");
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/docs/assets/swagger-ui.css">
<style>body{margin:0}.topbar{display:none}.back{font:14px system-ui;padding:10px 16px;background:#0f172a}.back a{color:#93c5fd;text-decoration:none}</style>
</head><body><div class="back"><a href="/">← Voltar ao painel</a></div><div id="ui"></div>
<script src="/docs/assets/swagger-ui-bundle.js"></script><script src="/docs/assets/swagger-ui-standalone-preset.js"></script>
<script src="/docs/init.js${module ? `?module=${module}` : ""}"></script></body></html>`;
  });
  // Script separado: a CSP do helmet não permite script inline.
  app.get("/docs/init.js", async (req, reply) => {
    const urls = [{ url: "/openapi.json", name: "Todos os módulos" }, ...ctx.registry.enabled().map((m) => ({ url: `/openapi/${m.slug}.json`, name: m.title }))];
    const q = (req.query as { module?: string }).module;
    reply.type("application/javascript; charset=utf-8").header("Cache-Control", "no-store");
    return `window.ui = SwaggerUIBundle({
  urls: ${JSON.stringify(urls)},
  "urls.primaryName": ${JSON.stringify(urls.find((u) => u.url.includes(`/${q}.json`))?.name ?? urls[0].name)},
  dom_id: "#ui",
  deepLinking: true,
  persistAuthorization: true,
  withCredentials: true,
  displayRequestDuration: true,
  filter: true,
  tryItOutEnabled: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "StandaloneLayout"
});`;
  });
}
