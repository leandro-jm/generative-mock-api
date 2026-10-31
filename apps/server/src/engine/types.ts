// Definições que descrevem um módulo de API mockada. Os módulos prontos (código) e os gerados por IA (banco)
// usam o mesmo formato; o motor deriva daqui CRUD, validação, views e a spec OpenAPI.
import type { z } from "zod";
import type { Faker } from "@faker-js/faker";
import type { Store } from "./store.ts";
import type { SettingsService } from "../settings/service.ts";

export const FIELD_TYPES = [
  "string", "text", "integer", "number", "money", "boolean", "date", "datetime", "time",
  "email", "phone", "url", "image", "enum", "tags", "ref", "refs",
  "geo_point", "geo_line", "geo_polygon", "json",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_FORMATS = ["cpf", "cnpj", "cep", "pis", "isbn10", "isbn13", "uf", "color", "cbo", "cid"] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

export type ImageKind = "poster" | "backdrop" | "cover" | "avatar" | "generic";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  enum?: string[];
  /** Recurso (do mesmo módulo) referenciado por ref/refs. */
  ref?: string;
  /** O que acontece com quem aponta para um registro excluído. Padrão: cascade se obrigatório, unlink se não. */
  onDelete?: "cascade" | "unlink" | "restrict";
  format?: FieldFormat;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** Caminho de função do faker (ex.: "person.fullName") para gerar o valor. */
  faker?: string;
  /** Valores de exemplo sorteados na geração. */
  samples?: unknown[];
  /** Etapa do formulário. */
  group?: string;
  /** Para type=image: desenho usado pelo gerador de SVG. */
  imageKind?: ImageKind;
  /** Para type=json: schema do valor. */
  schema?: Record<string, unknown>;
  /** Some da tabela (continua na API). */
  hidden?: boolean;
  unit?: string;
}

export interface CardHint {
  title: string;
  subtitle?: string;
  image?: string;
  badges?: string[];
  description?: string;
  fields?: string[];
}

export interface ResourceDef {
  slug: string;
  label: string;
  labelPlural: string;
  description?: string;
  fields: FieldDef[];
  titleField: string;
  searchFields?: string[];
  defaultSort?: string;
  views?: {
    table?: { columns: string[] };
    card?: CardHint;
    map?: { geometry: string[]; category?: string };
    form?: { steps: { title: string; fields: string[] }[] };
  };
}

export interface ChartDef {
  name: string;
  title: string;
  description?: string;
  resource: string;
  type: "bar" | "line" | "pie" | "area";
  groupBy: string;
  interval?: "day" | "month" | "year";
  /** "count", "sum:campo" ou "avg:campo". */
  metric: string;
  seriesBy?: string;
  unit?: string;
  limit?: number;
  sort?: "label" | "value";
  /** Filtros aplicados antes de agregar, no formato da listagem: { "status[ne]": "Desligado" }. */
  filter?: Record<string, string>;
}

export interface DiagramDef {
  name: string;
  title: string;
  description?: string;
  kind: "tree" | "graph" | "flow";
  tree?: { resource: string; parentField: string; labelField?: string; subtitleField?: string };
  graph?: { nodes: { resource: string; type?: string; limit?: number }[]; edges: { resource: string; field: string; label?: string }[] };
  flow?: { nodes: { id: string; label: string; type?: string }[]; edges: { source: string; target: string; label?: string }[] };
}

export interface PlanActionDef {
  name: string;
  title: string;
  description: string;
  resource: string;
  kind: "bulk-update";
  field: string;
  operation: "percent" | "add" | "set";
  paramLabel: string;
  severity?: "low" | "medium" | "high";
}

export interface ModuleDef {
  slug: string;
  title: string;
  description: string;
  source: "builtin" | "ai" | "manual";
  resources: ResourceDef[];
  charts?: ChartDef[];
  diagrams?: DiagramDef[];
  planActions?: PlanActionDef[];
}

/** Operação que um plano executa ao ser confirmado. */
export interface PlanOp {
  op: "create" | "update" | "delete";
  resource: string;
  id?: number;
  data?: Record<string, unknown>;
  /** updated_at visto ao montar o plano: se mudou, a confirmação dá 409. */
  expectedUpdatedAt?: string;
  effect: "create" | "update" | "delete" | "unlink";
  label: string;
  diff?: Record<string, { before: unknown; after: unknown }>;
  reason?: string;
}

export interface EngineContext {
  store: Store;
  settings: SettingsService;
  faker: (seed?: number) => Faker;
}

export interface CustomPlanAction {
  name: string;
  title: string;
  description: string;
  resource: string;
  severity: "low" | "medium" | "high";
  params: z.ZodType;
  build: (ctx: EngineContext, ids: number[], params: any) => { summary: string; ops: PlanOp[]; warnings?: string[] };
}

/** Módulo pronto: definição + seed + rotas próprias. */
export interface BuiltinModule {
  def: ModuleDef;
  seed: (ctx: EngineContext) => void;
  /** Rotas próprias, registradas e documentadas no OpenAPI pelo motor. */
  customRoutes?: CustomRoute[];
  customPlans?: CustomPlanAction[];
  /** Dados do desenho de uma imagem (pôster, capa, foto). Sem isto, usa o card do registro. */
  image?: (resource: string, field: string, rec: Record<string, unknown>, ctx: EngineContext) => ImageSpecLike | undefined;
  /** Gráficos calculados em código (ex.: turnover), listados junto dos declarativos. */
  customCharts?: { name: string; title: string; description: string; build: (ctx: EngineContext) => unknown }[];
}

export interface ImageSpecLike {
  kind: ImageKind;
  title: string;
  subtitle?: string | null;
  footer?: string | null;
  tag?: string | null;
  seed: string;
  palette?: string | null;
}

export const RESERVED_RESOURCE_SLUGS = new Set(["plans", "_views", "_reset", "auth"]);

/** Rota própria de um módulo pronto (path relativo a /api/v1/<módulo>, com :param do Fastify). */
export interface CustomRoute {
  method: "GET" | "POST";
  url: string;
  summary: string;
  description?: string;
  tag: string;
  mode: "read" | "write";
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  handler: (input: { params: any; query: any; body: any; baseUrl: string }, ctx: EngineContext) => unknown;
}
