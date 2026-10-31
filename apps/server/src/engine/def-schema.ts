// Validação de definições de módulo vindas de fora do código (IA ou edição manual na tela).
import { z } from "zod";
import { badRequest } from "../lib/errors.ts";
import { FIELD_FORMATS, FIELD_TYPES, RESERVED_RESOURCE_SLUGS, type ModuleDef } from "./types.ts";

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, "use minúsculas, números e hífen (2 a 48 caracteres)");
const fieldName = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "use snake_case");

export const fieldDefSchema = z.object({
  name: fieldName,
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  description: z.string().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  enum: z.array(z.string()).optional(),
  ref: z.string().optional(),
  onDelete: z.enum(["cascade", "unlink", "restrict"]).optional(),
  format: z.enum(FIELD_FORMATS).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  faker: z.string().optional(),
  samples: z.array(z.unknown()).optional(),
  group: z.string().optional(),
  imageKind: z.enum(["poster", "backdrop", "cover", "avatar", "generic"]).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  hidden: z.boolean().optional(),
  unit: z.string().optional(),
});

export const resourceDefSchema = z.object({
  slug,
  label: z.string().min(1),
  labelPlural: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldDefSchema).min(1),
  titleField: fieldName,
  searchFields: z.array(fieldName).optional(),
  defaultSort: z.string().optional(),
  views: z
    .object({
      table: z.object({ columns: z.array(fieldName) }).optional(),
      card: z.object({ title: fieldName, subtitle: fieldName.optional(), image: fieldName.optional(), badges: z.array(fieldName).optional(), description: fieldName.optional(), fields: z.array(fieldName).optional() }).optional(),
      map: z.object({ geometry: z.array(fieldName).min(1), category: fieldName.optional() }).optional(),
      form: z.object({ steps: z.array(z.object({ title: z.string(), fields: z.array(fieldName) })) }).optional(),
    })
    .optional(),
});

export const moduleDefSchema = z.object({
  slug,
  title: z.string().min(1),
  description: z.string().default(""),
  source: z.enum(["builtin", "ai", "manual"]).default("manual"),
  resources: z.array(resourceDefSchema).min(1),
  charts: z
    .array(z.object({ name: slug, title: z.string(), description: z.string().optional(), resource: slug, type: z.enum(["bar", "line", "pie", "area"]), groupBy: fieldName, interval: z.enum(["day", "month", "year"]).optional(), metric: z.string(), seriesBy: fieldName.optional(), unit: z.string().optional(), limit: z.number().int().optional(), sort: z.enum(["label", "value"]).optional(), filter: z.record(z.string(), z.string()).optional() }))
    .optional(),
  diagrams: z
    .array(
      z.object({
        name: slug,
        title: z.string(),
        description: z.string().optional(),
        kind: z.enum(["tree", "graph", "flow"]),
        tree: z.object({ resource: slug, parentField: fieldName, labelField: fieldName.optional(), subtitleField: fieldName.optional() }).optional(),
        graph: z.object({ nodes: z.array(z.object({ resource: slug, type: z.string().optional(), limit: z.number().int().optional() })), edges: z.array(z.object({ resource: slug, field: fieldName, label: z.string().optional() })) }).optional(),
        flow: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string().optional() })), edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })) }).optional(),
      }),
    )
    .optional(),
  planActions: z
    .array(z.object({ name: slug, title: z.string(), description: z.string(), resource: slug, kind: z.literal("bulk-update"), field: fieldName, operation: z.enum(["percent", "add", "set"]), paramLabel: z.string(), severity: z.enum(["low", "medium", "high"]).optional() }))
    .optional(),
});

/** Valida estrutura e coerência (refs, campos citados nas views, nomes reservados). Lança 400 com a lista de problemas. */
export function checkModuleDef(input: unknown): ModuleDef {
  const parsed = moduleDefSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Definição de módulo inválida.", { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
  const def = parsed.data as ModuleDef;
  const errors: string[] = [];
  const slugs = new Set<string>();
  for (const r of def.resources) {
    if (slugs.has(r.slug)) errors.push(`Recurso duplicado: ${r.slug}`);
    slugs.add(r.slug);
    if (RESERVED_RESOURCE_SLUGS.has(r.slug)) errors.push(`Nome reservado: ${r.slug}`);
  }
  for (const r of def.resources) {
    const names = new Set<string>();
    for (const f of r.fields) {
      if (names.has(f.name)) errors.push(`${r.slug}: campo duplicado ${f.name}`);
      if (["id", "created_at", "updated_at"].includes(f.name)) errors.push(`${r.slug}: ${f.name} é automático, remova`);
      names.add(f.name);
      if ((f.type === "ref" || f.type === "refs") && (!f.ref || !slugs.has(f.ref))) errors.push(`${r.slug}.${f.name}: ref "${f.ref}" não existe`);
      if (f.type === "enum" && !f.enum?.length) errors.push(`${r.slug}.${f.name}: enum sem opções`);
    }
    const has = (n?: string) => !n || names.has(n);
    if (!has(r.titleField)) errors.push(`${r.slug}: titleField ${r.titleField} não existe`);
    const card = r.views?.card;
    if (card) for (const n of [card.title, card.subtitle, card.image, card.description, ...(card.badges ?? []), ...(card.fields ?? [])]) if (!has(n)) errors.push(`${r.slug}: card cita campo inexistente ${n}`);
    for (const n of r.views?.map?.geometry ?? []) if (!has(n)) errors.push(`${r.slug}: map cita campo inexistente ${n}`);
    for (const n of r.views?.table?.columns ?? []) if (!has(n)) errors.push(`${r.slug}: table cita campo inexistente ${n}`);
  }
  const field = (res: string, f: string) => def.resources.find((r) => r.slug === res)?.fields.find((x) => x.name === f);
  for (const c of def.charts ?? []) {
    if (!slugs.has(c.resource)) errors.push(`gráfico ${c.name}: recurso ${c.resource} não existe`);
    else if (!field(c.resource, c.groupBy) && !["created_at", "updated_at"].includes(c.groupBy)) errors.push(`gráfico ${c.name}: groupBy ${c.groupBy} não existe`);
  }
  for (const d of def.diagrams ?? []) {
    if (d.kind === "tree" && (!d.tree || !field(d.tree.resource, d.tree.parentField))) errors.push(`diagrama ${d.name}: árvore precisa de resource e parentField existentes`);
    if (d.kind === "graph" && d.graph) for (const e of d.graph.edges) if (!field(e.resource, e.field)?.ref) errors.push(`diagrama ${d.name}: aresta ${e.resource}.${e.field} não é referência`);
  }
  for (const a of def.planActions ?? []) {
    const f = field(a.resource, a.field);
    if (!f || !["integer", "number", "money"].includes(f.type)) errors.push(`ação ${a.name}: ${a.resource}.${a.field} precisa ser numérico`);
  }
  if (errors.length) throw badRequest("Definição de módulo incoerente.", { errors: errors.map((message) => ({ field: "", message })) });
  return def;
}
