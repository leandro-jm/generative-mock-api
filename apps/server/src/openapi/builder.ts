// Spec OpenAPI 3.1 montada a partir das definições dos módulos (prontos e gerados), a cada mudança.
import { z } from "zod";
import { fieldSchema, inputSchema, recordSchema } from "../engine/schema.ts";
import { imageName, present } from "../engine/present.ts";
import { planRequestSchema } from "../engine/plans.ts";
import type { BuiltinModule, ModuleDef, ResourceDef } from "../engine/types.ts";
import type { Store } from "../engine/store.ts";
import type { SettingsService } from "../settings/service.ts";

type Obj = Record<string, unknown>;

const pascal = (s: string) => s.split(/[-_\s]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Obj, description = "OK", example?: unknown) => ({ description, content: { "application/json": { schema, ...(example !== undefined ? { example } : {}) } } });

export function zodSchema(schema: z.ZodType, io: "input" | "output" = "output"): Obj {
  const out = z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any" }) as Obj;
  delete out.$schema;
  return out;
}

const PROBLEM_REFS = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "429": { $ref: "#/components/responses/TooManyRequests" },
};
const errors = (...codes: (keyof typeof PROBLEM_REFS)[]) => Object.fromEntries(codes.map((c) => [c, PROBLEM_REFS[c]]));

const MOCK_HEADERS = [
  { name: "X-Mock-Delay", in: "header", required: false, description: "Força um atraso em ms (simulação).", schema: { type: "integer", minimum: 0, maximum: 60000 } },
  { name: "X-Mock-Status", in: "header", required: false, description: "Força a resposta com este status de erro (400–599).", schema: { type: "integer", minimum: 400, maximum: 599 } },
];

function baseComponents(): Obj {
  const problem = {
    type: "object",
    description: "Erro no formato RFC 9457 (application/problem+json).",
    required: ["title", "status", "detail"],
    properties: {
      type: { type: "string", example: "about:blank" },
      title: { type: "string" },
      status: { type: "integer" },
      detail: { type: "string" },
      instance: { type: "string" },
      errors: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } },
    },
  };
  const problemResponse = (description: string) => ({ description, content: { "application/problem+json": { schema: ref("Problem") } } });
  const position = { type: "array", items: { type: "number" }, minItems: 2 };
  return {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "Chave criada na tela (API Keys). Formato mk_..." },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "access_token de POST /api/v1/auth/token (ou a própria API key como Bearer)." },
    },
    parameters: {
      page: { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "Página (começa em 1)." },
      limit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1 }, description: "Itens por página (padrão e máximo nas Configurações)." },
      sort: { name: "sort", in: "query", schema: { type: "string" }, description: "Campos separados por vírgula; prefixo - para decrescente. Ex.: -ano,titulo" },
      q: { name: "q", in: "query", schema: { type: "string" }, description: "Busca textual (sem acento, sem diferenciar maiúsculas)." },
      fields: { name: "fields", in: "query", schema: { type: "string" }, description: "Projeção: campos separados por vírgula." },
      expand: { name: "expand", in: "query", schema: { type: "string" }, description: "Embute registros referenciados. Ex.: expand=diretor_id,elenco_ids" },
      id: { name: "id", in: "path", required: true, schema: { type: "integer" } },
      planId: { name: "planId", in: "path", required: true, schema: { type: "string" } },
      w: { name: "w", in: "query", schema: { type: "integer", minimum: 16, maximum: 2000 }, description: "Largura do PNG em px." },
    },
    responses: {
      BadRequest: problemResponse("Requisição inválida (corpo fora do schema, filtro inválido...)."),
      Unauthorized: problemResponse("Sem credencial válida."),
      Forbidden: problemResponse("Credencial sem o scope necessário."),
      NotFound: problemResponse("Não encontrado."),
      TooManyRequests: problemResponse("Limite de requisições por minuto excedido."),
    },
    schemas: {
      Problem: problem,
      PageMeta: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
      TableColumn: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, type: { type: "string" }, format: { type: "string" }, sortable: { type: "boolean" }, filterable: { type: "boolean" }, options: { type: "array", items: { type: "string" } }, ref: { type: "string" }, unit: { type: "string" } } },
      TableView: { type: "object", description: "View table: colunas + página de dados (com _labels das referências).", properties: { resource: { type: "string" }, title: { type: "string" }, columns: { type: "array", items: ref("TableColumn") }, data: { type: "array", items: { type: "object" } }, meta: ref("PageMeta"), actions: { type: "object" } } },
      Card: { type: "object", description: "View card: formato fixo para qualquer recurso.", required: ["id", "title"], properties: { id: { type: "integer" }, title: { type: "string" }, subtitle: { type: ["string", "null"] }, image: { type: ["string", "null"], format: "uri" }, badges: { type: "array", items: { type: "string" } }, description: { type: ["string", "null"] }, fields: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, value: {} } } } } },
      CardPage: { type: "object", properties: { resource: { type: "string" }, data: { type: "array", items: ref("Card") }, meta: ref("PageMeta") } },
      FormView: { type: "object", description: "View form: JSON Schema de entrada + uiSchema (widgets, máscaras, opções) + etapas + valores iniciais.", properties: { resource: { type: "string" }, title: { type: "string" }, mode: { enum: ["create", "edit"] }, submit: { type: "object", properties: { method: { type: "string" }, url: { type: "string" } } }, schema: { type: "object" }, uiSchema: { type: "object", additionalProperties: { type: "object" } }, steps: { type: "array", items: { type: "object", properties: { title: { type: "string" }, fields: { type: "array", items: { type: "string" } } } } }, initialValues: { type: "object" } } },
      GeoJSONFeatureCollection: { type: "object", description: "View map: GeoJSON (RFC 7946). properties.card traz o card do registro.", required: ["type", "features"], properties: { type: { const: "FeatureCollection" }, bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 }, features: { type: "array", items: { type: "object", properties: { type: { const: "Feature" }, id: { type: "string" }, geometry: { type: "object", properties: { type: { enum: ["Point", "LineString", "Polygon"] }, coordinates: { type: "array", items: {} } } }, properties: { type: "object", properties: { id: { type: "integer" }, field: { type: "string" }, title: { type: "string" }, category: {}, card: ref("Card") } } } } }, metadata: { type: "object" } }, "x-position": position },
      Chart: { type: "object", description: "View chart: rótulos + séries alinhadas.", required: ["type", "labels", "series"], properties: { name: { type: "string" }, title: { type: "string" }, description: { type: ["string", "null"] }, type: { enum: ["bar", "line", "pie", "area"] }, labels: { type: "array", items: { type: "string" } }, series: { type: "array", items: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "number" } } } } }, unit: { type: ["string", "null"] }, meta: { type: "object" } } },
      Diagram: { type: "object", description: "View diagram: nós e arestas (tree, graph ou flow).", required: ["kind", "nodes", "edges"], properties: { name: { type: "string" }, title: { type: "string" }, description: { type: ["string", "null"] }, kind: { enum: ["tree", "graph", "flow"] }, nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, type: { type: "string" }, parentId: { type: ["string", "null"] }, data: { type: "object" } } } }, edges: { type: "array", items: { type: "object", properties: { id: { type: "string" }, source: { type: "string" }, target: { type: "string" }, label: { type: "string" } } } } } },
      ViewList: { type: "object", properties: { data: { type: "array", items: { type: "object", properties: { name: { type: "string" }, title: { type: "string" }, description: { type: ["string", "null"] }, url: { type: "string" } } } } } },
      PlanRequest: zodSchema(planRequestSchema, "input"),
      PlanImpact: { type: "object", properties: { resource: { type: "string" }, resourceLabel: { type: "string" }, id: { type: ["integer", "null"] }, label: { type: "string" }, effect: { enum: ["create", "update", "delete", "unlink"] }, diff: { type: ["object", "null"], additionalProperties: { type: "object", properties: { before: {}, after: {} } } }, reason: { type: ["string", "null"] }, data: { type: "object" } } },
      Plan: {
        type: "object",
        description: "View plan: ação que precisa de confirmação. Mostra o impacto; nada muda até POST confirm.",
        properties: {
          id: { type: "string" },
          module: { type: "string" },
          action: { type: "string" },
          resource: { type: ["string", "null"] },
          title: { type: "string" },
          summary: { type: "string" },
          severity: { enum: ["low", "medium", "high"] },
          status: { enum: ["pending", "blocked", "confirmed", "cancelled", "expired"] },
          totals: { type: "object", properties: { delete: { type: "integer" }, update: { type: "integer" }, unlink: { type: "integer" }, create: { type: "integer" } } },
          impacts: { type: "array", items: ref("PlanImpact") },
          warnings: { type: "array", items: { type: "string" } },
          confirmation: { type: "object", properties: { required: { type: "boolean" }, phrase: { type: ["string", "null"], description: "Quando presente, envie no corpo do confirm." }, expiresAt: { type: "string", format: "date-time" }, confirmUrl: { type: "string" }, cancelUrl: { type: "string" } } },
          createdAt: { type: "string", format: "date-time" },
          executedAt: { type: ["string", "null"] },
          result: { type: ["object", "null"] },
        },
      },
      PlanAction: { type: "object", properties: { action: { type: "string" }, resource: { type: "string" }, title: { type: "string" }, description: { type: "string" }, kind: { enum: ["delete", "bulk-update", "custom"] }, params: {} } },
      TokenRequest: { oneOf: [{ type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } }, { type: "object", required: ["apiKey"], properties: { apiKey: { type: "string" } } }] },
      TokenResponse: { type: "object", properties: { access_token: { type: "string" }, token_type: { const: "Bearer" }, expires_in: { type: "integer" }, scopes: { type: "array", items: { type: "string" } } } },
    },
  };
}

function filterParams(r: ResourceDef) {
  return r.fields
    .filter((f) => !["image", "json", "geo_point", "geo_line", "geo_polygon", "text"].includes(f.type))
    .map((f) => {
      const s = fieldSchema({ ...f, required: true, readOnly: false });
      const scalar = f.type === "tags" || f.type === "refs" ? (s.items as Obj) : s;
      return { name: f.name, in: "query", required: false, description: `Filtro por ${f.label}. Também aceita ${f.name}[ne|gt|gte|lt|lte|like|in].`, schema: { type: scalar.type ?? "string", ...(scalar.enum ? { enum: scalar.enum } : {}), ...(scalar.format ? { format: scalar.format } : {}) } };
    });
}

export interface BuildInput {
  modules: ModuleDef[];
  builtins: Map<string, BuiltinModule>;
  store: Store;
  settings: SettingsService;
  baseUrl: string;
  only?: string;
}

export function buildOpenApi(input: BuildInput): Obj {
  const { settings, baseUrl, store } = input;
  const modules = input.only ? input.modules.filter((m) => m.slug === input.only) : input.modules;
  const components = baseComponents();
  const schemas = components.schemas as Obj;
  const paths: Obj = {};
  const tags: Obj[] = [];
  const publicImages = settings.bool("auth.publicImages");

  if (!input.only) {
    tags.push({ name: "auth", description: "Credenciais para consumir as APIs." });
    paths["/api/v1/auth/token"] = {
      post: { tags: ["auth"], summary: "Gera um access_token (JWT)", description: "Com e-mail e senha de um usuário da tela ou com uma API key. Use o token em Authorization: Bearer.", operationId: "authToken", security: [], requestBody: { required: true, content: { "application/json": { schema: ref("TokenRequest") } } }, responses: { "200": json(ref("TokenResponse")), ...errors("400", "401") } },
    };
    paths["/api/v1/auth/me"] = { get: { tags: ["auth"], summary: "Quem sou eu (credencial atual)", operationId: "authMe", security: [], responses: { "200": json({ type: "object", properties: { kind: { type: "string" }, name: { type: ["string", "null"] }, role: { type: ["string", "null"] }, scopes: { type: "array", items: { type: "string" } } } }) } } };
    paths["/api/v1"] = { get: { tags: ["auth"], summary: "Catálogo de módulos", operationId: "catalog", security: [], responses: { "200": json({ type: "object" }) } } };
  }

  for (const m of modules) {
    const M = pascal(m.slug);
    const prefix = `/api/v1/${m.slug}`;
    const builtin = input.builtins.get(m.slug);
    const op = (slug: string) => `${m.slug}_${slug}`.replace(/[^a-zA-Z0-9_]/g, "_");
    const viewTag = `${m.slug} · views`;
    const planTag = `${m.slug} · planos`;

    for (const r of m.resources) {
      const R = `${M}${pascal(r.slug)}`;
      const tag = `${m.slug} · ${r.slug}`;
      tags.push({ name: tag, description: `${r.labelPlural}${r.description ? ` — ${r.description}` : ""}` });
      const sample = store.all(m.slug, r.slug)[0];
      const example = sample ? present(m.slug, r, sample, { baseUrl }) : undefined;
      schemas[R] = { ...recordSchema(r), ...(example ? { examples: [example] } : {}), "x-views": r.views ?? {}, "x-title-field": r.titleField };
      schemas[`${R}Input`] = inputSchema(r);
      schemas[`${R}Patch`] = inputSchema(r, true);
      schemas[`${R}Page`] = { type: "object", required: ["data", "meta"], properties: { data: { type: "array", items: ref(R) }, meta: ref("PageMeta") } };

      const listParams = [{ $ref: "#/components/parameters/page" }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/sort" }, { $ref: "#/components/parameters/q" }, { $ref: "#/components/parameters/fields" }, { $ref: "#/components/parameters/expand" }, ...filterParams(r), ...MOCK_HEADERS];
      paths[`${prefix}/${r.slug}`] = {
        get: { tags: [tag], summary: `Lista ${r.labelPlural.toLowerCase()}`, description: "Paginação com page/limit; total em X-Total-Count e links em Link.", operationId: op(`list_${r.slug}`), parameters: listParams, responses: { "200": json(ref(`${R}Page`)), ...errors("400", "401", "403", "429") } },
        post: { tags: [tag], summary: `Cria ${r.label.toLowerCase()}`, operationId: op(`create_${r.slug}`), parameters: MOCK_HEADERS, requestBody: { required: true, content: { "application/json": { schema: ref(`${R}Input`) } } }, responses: { "201": json(ref(R), "Criado"), ...errors("400", "401", "403") } },
      };
      paths[`${prefix}/${r.slug}/{id}`] = {
        parameters: [{ $ref: "#/components/parameters/id" }],
        get: { tags: [tag], summary: `Busca ${r.label.toLowerCase()} por id`, operationId: op(`get_${r.slug}`), parameters: [{ $ref: "#/components/parameters/expand" }, { $ref: "#/components/parameters/fields" }, ...MOCK_HEADERS], responses: { "200": json(ref(R)), ...errors("401", "403", "404") } },
        put: { tags: [tag], summary: `Substitui ${r.label.toLowerCase()}`, operationId: op(`replace_${r.slug}`), requestBody: { required: true, content: { "application/json": { schema: ref(`${R}Input`) } } }, responses: { "200": json(ref(R)), ...errors("400", "401", "403", "404") } },
        patch: { tags: [tag], summary: `Atualiza parte de ${r.label.toLowerCase()}`, operationId: op(`patch_${r.slug}`), requestBody: { required: true, content: { "application/json": { schema: ref(`${R}Patch`) } } }, responses: { "200": json(ref(R)), ...errors("400", "401", "403", "404") } },
        delete: {
          tags: [tag],
          summary: `Exclui ${r.label.toLowerCase()} (com cascata)`,
          description: "Aplica a cascata das referências. Com 'Exigir plano para excluir' ligado, responde 428 com o plano; repita com X-Confirm-Plan (e X-Confirm-Phrase se o plano pedir).",
          operationId: op(`delete_${r.slug}`),
          parameters: [
            { name: "X-Confirm-Plan", in: "header", schema: { type: "string" }, description: "id do plano de exclusão a executar" },
            { name: "X-Confirm-Phrase", in: "header", schema: { type: "string" }, description: "frase de confirmação, quando exigida" },
          ],
          responses: { "204": { description: "Excluído" }, "200": json(ref("Plan"), "Plano executado (com X-Confirm-Plan)"), "409": { description: "Bloqueado por referências (restrict)", content: { "application/problem+json": { schema: ref("Problem") } } }, "428": json({ allOf: [ref("Problem"), { type: "object", properties: { plan: ref("Plan") } }] }, "Confirmação necessária: corpo traz o plano"), ...errors("401", "403", "404") },
        },
      };
      for (const f of r.fields.filter((x) => x.type === "image")) {
        for (const ext of ["svg", "png"] as const) {
          paths[`${prefix}/${r.slug}/{id}/${imageName(f.name)}.${ext}`] = {
            get: {
              tags: [tag],
              summary: `${f.label} (${ext.toUpperCase()})`,
              description: `Imagem fictícia gerada pelo servidor (${f.imageKind ?? "generic"}).${publicImages ? " Pública (sem autenticação)." : ""}`,
              operationId: op(`image_${r.slug}_${imageName(f.name)}_${ext}`),
              ...(publicImages ? { security: [] } : {}),
              parameters: [{ $ref: "#/components/parameters/id" }, ...(ext === "png" ? [{ $ref: "#/components/parameters/w" }] : [])],
              responses: { "200": { description: "Imagem", content: { [ext === "svg" ? "image/svg+xml" : "image/png"]: { schema: { type: "string", format: "binary" } } } }, ...errors("404") },
            },
          };
        }
      }
      paths[`${prefix}/${r.slug}/_views/table`] = { get: { tags: [viewTag], summary: `table · ${r.labelPlural}`, operationId: op(`view_table_${r.slug}`), parameters: listParams, responses: { "200": json(ref("TableView")), ...errors("400", "401", "403") } } };
      paths[`${prefix}/${r.slug}/_views/card`] = { get: { tags: [viewTag], summary: `card · ${r.labelPlural}`, description: "Sem id: página de cards (aceita os filtros da listagem). Com ?id=: um card.", operationId: op(`view_card_${r.slug}`), parameters: [{ name: "id", in: "query", schema: { type: "integer" } }, ...listParams], responses: { "200": json({ oneOf: [ref("Card"), ref("CardPage")] }), ...errors("401", "403", "404") } } };
      paths[`${prefix}/${r.slug}/_views/form`] = { get: { tags: [viewTag], summary: `form · ${r.label}`, operationId: op(`view_form_${r.slug}`), parameters: [{ name: "mode", in: "query", schema: { enum: ["create", "edit"], default: "create" } }, { name: "id", in: "query", schema: { type: "integer" }, description: "Obrigatório em mode=edit" }], responses: { "200": json(ref("FormView")), ...errors("401", "403", "404") } } };
      if (r.fields.some((f) => f.type.startsWith("geo_"))) {
        paths[`${prefix}/${r.slug}/_views/map`] = { get: { tags: [viewTag], summary: `map · ${r.labelPlural}`, operationId: op(`view_map_${r.slug}`), parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 2000 } }, { $ref: "#/components/parameters/q" }, ...filterParams(r)], responses: { "200": { description: "GeoJSON", content: { "application/json": { schema: ref("GeoJSONFeatureCollection") } } }, ...errors("401", "403") } } };
      }
      const groupable = ["created_at", ...r.fields.filter((f) => !["image", "json", "geo_point", "geo_line", "geo_polygon", "text"].includes(f.type)).map((f) => f.name)];
      const numeric = r.fields.filter((f) => ["integer", "number", "money"].includes(f.type)).map((f) => f.name);
      paths[`${prefix}/${r.slug}/_views/chart`] = {
        get: {
          tags: [viewTag],
          summary: `chart · ${r.labelPlural} (agregação livre)`,
          operationId: op(`view_chart_${r.slug}`),
          parameters: [
            { name: "groupBy", in: "query", required: true, schema: { enum: groupable } },
            { name: "metric", in: "query", schema: { type: "string", default: "count" }, description: `count | sum:campo | avg:campo | min:campo | max:campo. Numéricos: ${numeric.join(", ") || "(nenhum)"}` },
            { name: "type", in: "query", schema: { enum: ["bar", "line", "pie", "area"], default: "bar" } },
            { name: "interval", in: "query", schema: { enum: ["day", "month", "year"] }, description: "Para groupBy de data." },
            { name: "seriesBy", in: "query", schema: { enum: groupable } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "sort", in: "query", schema: { enum: ["label", "value"] } },
            ...filterParams(r),
          ],
          responses: { "200": json(ref("Chart")), ...errors("400", "401", "403") },
        },
      };
    }

    // Gráficos e diagramas do módulo
    tags.push({ name: viewTag, description: `Views prontas para o front (table, card, form, map, chart, diagram) de ${m.title}.` });
    const chartNames = [...(m.charts ?? []).map((c) => c.name), ...(builtin?.customCharts ?? []).map((c) => c.name)];
    paths[`${prefix}/_views/charts`] = { get: { tags: [viewTag], summary: `Gráficos prontos de ${m.title}`, operationId: op("charts"), responses: { "200": json(ref("ViewList")) } } };
    if (chartNames.length) paths[`${prefix}/_views/charts/{name}`] = { get: { tags: [viewTag], summary: `chart · gráfico pronto de ${m.title}`, description: [...(m.charts ?? []).map((c) => `- **${c.name}**: ${c.title}`), ...(builtin?.customCharts ?? []).map((c) => `- **${c.name}**: ${c.title} (calculado)`)].join("\n"), operationId: op("chart"), parameters: [{ name: "name", in: "path", required: true, schema: { enum: chartNames } }], responses: { "200": json(ref("Chart")), ...errors("404") } } };
    paths[`${prefix}/_views/diagrams`] = { get: { tags: [viewTag], summary: `Diagramas de ${m.title}`, operationId: op("diagrams"), responses: { "200": json(ref("ViewList")) } } };
    if (m.diagrams?.length) paths[`${prefix}/_views/diagrams/{name}`] = { get: { tags: [viewTag], summary: `diagram · ${m.title}`, description: m.diagrams.map((d) => `- **${d.name}** (${d.kind}): ${d.title}`).join("\n"), operationId: op("diagram"), parameters: [{ name: "name", in: "path", required: true, schema: { enum: m.diagrams.map((d) => d.name) } }], responses: { "200": json(ref("Diagram")), ...errors("404") } } };

    // Planos
    tags.push({ name: planTag, description: "View plan: ações com confirmação do usuário (exclusão em cascata, operações em lote, ações do domínio). 1) POST /plans mostra o impacto; 2) POST /plans/{planId}/confirm executa." });
    const actions = [{ action: "delete", resource: m.resources[0].slug, ids: [1] }, ...(m.planActions ?? []).map((a) => ({ action: a.name, resource: a.resource, filter: {}, params: { [a.operation === "percent" ? "percent" : "value"]: 10 } })), ...(builtin?.customPlans ?? []).map((a) => ({ action: a.name, resource: a.resource, ids: [1] }))];
    paths[`${prefix}/plans/_actions`] = { get: { tags: [planTag], summary: "Ações disponíveis", operationId: op("plan_actions"), responses: { "200": json({ type: "object", properties: { data: { type: "array", items: ref("PlanAction") } } }) } } };
    paths[`${prefix}/plans`] = {
      get: { tags: [planTag], summary: "Planos recentes", operationId: op("plans_list"), responses: { "200": json({ type: "object", properties: { data: { type: "array", items: ref("Plan") } } }) } },
      post: { tags: [planTag], summary: "Monta um plano (não altera nada)", operationId: op("plan_create"), requestBody: { required: true, content: { "application/json": { schema: ref("PlanRequest"), examples: Object.fromEntries(actions.map((a) => [a.action, { value: a }])) } } }, responses: { "201": json(ref("Plan"), "Plano criado"), ...errors("400", "401", "403", "404") } },
    };
    paths[`${prefix}/plans/{planId}`] = { get: { tags: [planTag], summary: "Consulta um plano", operationId: op("plan_get"), parameters: [{ $ref: "#/components/parameters/planId" }], responses: { "200": json(ref("Plan")), ...errors("404") } } };
    paths[`${prefix}/plans/{planId}/confirm`] = { post: { tags: [planTag], summary: "Confirma e executa o plano", description: "Executa exatamente o que o plano mostrou. 409 se os dados mudaram (ou plano bloqueado), 410 se expirou.", operationId: op("plan_confirm"), parameters: [{ $ref: "#/components/parameters/planId" }], requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { phrase: { type: "string" } } } } } }, responses: { "200": json(ref("Plan")), "409": { description: "Dados mudaram ou plano bloqueado" }, "410": { description: "Plano expirado" }, ...errors("400", "404") } } };
    paths[`${prefix}/plans/{planId}/cancel`] = { post: { tags: [planTag], summary: "Cancela o plano", operationId: op("plan_cancel"), parameters: [{ $ref: "#/components/parameters/planId" }], responses: { "200": json(ref("Plan")), ...errors("404") } } };
    paths[`${prefix}/_reset`] = { post: { tags: [planTag], summary: "Volta o módulo aos dados da semente (admin)", operationId: op("reset"), responses: { "200": json({ type: "object" }), ...errors("401", "403") } } };

    // Rotas próprias
    for (const route of builtin?.customRoutes ?? []) {
      if (!tags.some((t) => t.name === route.tag)) tags.push({ name: route.tag });
      const url = `${prefix}${route.url.replace(/:(\w+)/g, "{$1}")}`;
      const params = route.params ? Object.entries((zodSchema(route.params, "input").properties ?? {}) as Obj).map(([name, schema]) => ({ name, in: "path", required: true, schema })) : [];
      const query = route.query ? Object.entries((zodSchema(route.query, "input").properties ?? {}) as Obj).map(([name, schema]) => ({ name, in: "query", schema })) : [];
      const opId = op(`${route.method.toLowerCase()}_${route.url.replace(/[/:]+/g, "_")}`);
      paths[url] = {
        ...((paths[url] as Obj) ?? {}),
        [route.method.toLowerCase()]: {
          tags: [route.tag],
          summary: route.summary,
          ...(route.description ? { description: route.description } : {}),
          operationId: opId,
          parameters: [...params, ...query],
          ...(route.body ? { requestBody: { required: true, content: { "application/json": { schema: zodSchema(route.body, "input") } } } } : {}),
          responses: { "200": json(zodSchema(route.response)), ...errors("400", "401", "403", "404") },
        },
      };
    }
  }

  const single = input.only ? modules[0] : undefined;
  return {
    openapi: "3.1.0",
    info: {
      title: single ? `${settings.str("general.appName")} · ${single.title}` : settings.str("general.appName"),
      version: "1.0.0",
      description: single
        ? single.description
        : [
            "APIs com dados fictícios para testes, demos e protótipos.",
            "",
            "**Autenticação**: header `X-API-Key: mk_...` (crie na tela, em API Keys) ou `Authorization: Bearer <token>` (POST /api/v1/auth/token).",
            "",
            "**Views para o front**: cada recurso tem `_views/table`, `_views/card`, `_views/form`, `_views/chart` e, se tiver geometria, `_views/map` (GeoJSON). Cada módulo tem gráficos (`_views/charts`), diagramas (`_views/diagrams`) e planos com confirmação (`/plans`).",
            "",
            "**Simulação**: headers `X-Mock-Delay` e `X-Mock-Status` em qualquer chamada.",
            "",
            `Módulos: ${modules.map((m) => `**${m.title}** (${m.source === "builtin" ? "pronto" : m.source === "ai" ? "gerado por IA" : "manual"})`).join(", ")}.`,
          ].join("\n"),
    },
    servers: [{ url: baseUrl, description: "Este servidor" }],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    tags,
    paths,
    components,
  };
}
