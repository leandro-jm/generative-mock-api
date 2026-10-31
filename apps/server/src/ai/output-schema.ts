// Formato que o modelo devolve. Tudo obrigatório (opcional vira null) para servir à saída estruturada
// da Anthropic e ao json_schema strict dos provedores compatíveis com OpenAI.
import { z } from "zod";
import { FIELD_FORMATS, FIELD_TYPES, type ChartDef, type DiagramDef, type ModuleDef, type ResourceDef } from "../engine/types.ts";
import { slugify } from "../lib/util.ts";

const nullableStr = z.string().nullable();

export const aiFieldSchema = z.object({
  name: z.string().describe("snake_case, sem acento"),
  label: z.string().describe("Rótulo em português"),
  type: z.enum(FIELD_TYPES),
  description: nullableStr,
  required: z.boolean(),
  enumValues: z.array(z.string()).nullable().describe("Opções quando type=enum ou tags"),
  ref: nullableStr.describe("slug do recurso referenciado quando type=ref ou refs"),
  onDelete: z.enum(["cascade", "unlink", "restrict"]).nullable(),
  format: z.enum(FIELD_FORMATS).nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  faker: nullableStr.describe("Função do @faker-js/faker v10, ex.: person.fullName, company.name, commerce.productName"),
  samples: z.array(z.string()).nullable().describe("8 a 15 valores realistas e fictícios para sortear"),
  group: nullableStr.describe("Etapa do formulário"),
  imageKind: z.enum(["poster", "backdrop", "cover", "avatar", "generic"]).nullable(),
  unit: nullableStr,
});

export const aiResourceSchema = z.object({
  slug: z.string().describe("kebab-case no plural, ex.: consultas"),
  label: z.string().describe("Singular"),
  labelPlural: z.string(),
  description: z.string(),
  titleField: z.string().describe("Campo que identifica o registro (nome, título...)"),
  records: z.number().int().nullable().describe("Quantidade sugerida de registros"),
  fields: z.array(aiFieldSchema),
  card: z.object({ title: z.string(), subtitle: nullableStr, image: nullableStr, badges: z.array(z.string()), description: nullableStr }).nullable(),
  map: z.object({ geometry: z.array(z.string()), category: nullableStr }).nullable(),
});

export const aiModuleSchema = z.object({
  slug: z.string().describe("kebab-case curto, ex.: clinica-vet"),
  title: z.string(),
  description: z.string(),
  resources: z.array(aiResourceSchema),
  charts: z.array(z.object({ name: z.string(), title: z.string(), resource: z.string(), type: z.enum(["bar", "line", "pie", "area"]), groupBy: z.string(), interval: z.enum(["day", "month", "year"]).nullable(), metric: z.string().describe("count, sum:campo ou avg:campo"), seriesBy: nullableStr })),
  diagrams: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      kind: z.enum(["tree", "graph"]),
      resource: nullableStr.describe("Para tree: recurso com auto-referência"),
      parentField: nullableStr.describe("Para tree: campo ref para o próprio recurso"),
      nodes: z.array(z.object({ resource: z.string(), type: z.string() })).nullable().describe("Para graph"),
      edges: z.array(z.object({ resource: z.string(), field: z.string(), label: nullableStr })).nullable().describe("Para graph: campos ref/refs que ligam os nós"),
    }),
  ),
  planActions: z.array(z.object({ name: z.string(), title: z.string(), description: z.string(), resource: z.string(), field: z.string().describe("Campo numérico"), operation: z.enum(["percent", "add", "set"]), paramLabel: z.string() })),
});

export type AiModule = z.infer<typeof aiModuleSchema>;

const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as T;

/** Converte a saída do modelo em ModuleDef (ainda precisa passar por checkModuleDef). */
export function toModuleDef(ai: AiModule): { def: ModuleDef; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const resources: ResourceDef[] = ai.resources.map((r) => {
    const slug = slugify(r.slug) || slugify(r.labelPlural);
    if (r.records) counts[slug] = r.records;
    const fields = r.fields
      .filter((f) => !["id", "created_at", "updated_at"].includes(f.name))
      .map((f) => {
        const numeric = ["integer", "number", "money"].includes(f.type);
        return clean({
          name: f.name,
          label: f.label,
          type: f.type,
          description: f.description,
          required: f.required || undefined,
          enum: f.type === "enum" || f.type === "tags" ? (f.enumValues ?? undefined) : undefined,
          ref: f.type === "ref" || f.type === "refs" ? (f.ref ? slugify(f.ref) : undefined) : undefined,
          onDelete: f.onDelete,
          format: f.format,
          min: f.min,
          max: f.max,
          faker: f.faker,
          samples: f.samples?.length ? (numeric ? f.samples.map(Number).filter((n) => !Number.isNaN(n)) : f.samples) : undefined,
          group: f.group,
          imageKind: f.type === "image" ? (f.imageKind ?? "generic") : undefined,
          readOnly: f.type === "image" ? true : undefined,
          unit: f.unit,
        });
      });
    const names = new Set(fields.map((f) => f.name));
    const ok = (n: string | null | undefined) => (n && names.has(n) ? n : undefined);
    const card = r.card ? clean({ title: ok(r.card.title) ?? r.titleField, subtitle: ok(r.card.subtitle), image: ok(r.card.image), badges: r.card.badges.filter((b) => names.has(b)), description: ok(r.card.description) }) : undefined;
    const geo = fields.filter((f) => f.type.startsWith("geo_")).map((f) => f.name);
    const mapGeo = r.map?.geometry.filter((g) => names.has(g)) ?? geo;
    return clean({
      slug,
      label: r.label,
      labelPlural: r.labelPlural,
      description: r.description,
      titleField: names.has(r.titleField) ? r.titleField : fields[0]?.name,
      fields,
      views: clean({ card, map: mapGeo.length ? clean({ geometry: mapGeo, category: ok(r.map?.category) }) : undefined }),
    }) as ResourceDef;
  });
  const def: ModuleDef = {
    slug: slugify(ai.slug) || "modulo-ia",
    title: ai.title,
    description: ai.description,
    source: "ai",
    resources,
    charts: ai.charts.map((c) => clean({ name: slugify(c.name), title: c.title, resource: slugify(c.resource), type: c.type, groupBy: c.groupBy, interval: c.interval, metric: c.metric, seriesBy: c.seriesBy, sort: c.interval ? ("label" as const) : undefined }) as ChartDef),
    diagrams: ai.diagrams.map((d): DiagramDef =>
      d.kind === "tree"
        ? { name: slugify(d.name), title: d.title, kind: "tree" as const, tree: { resource: slugify(d.resource ?? ""), parentField: d.parentField ?? "" } }
        : { name: slugify(d.name), title: d.title, kind: "graph" as const, graph: { nodes: (d.nodes ?? []).map((n) => ({ resource: slugify(n.resource), type: n.type, limit: 40 })), edges: (d.edges ?? []).map((e) => ({ resource: slugify(e.resource), field: e.field, ...(e.label ? { label: e.label } : {}) })) } },
    ),
    planActions: ai.planActions.map((a) => ({ name: slugify(a.name), title: a.title, description: a.description, resource: slugify(a.resource), kind: "bulk-update" as const, field: a.field, operation: a.operation, paramLabel: a.paramLabel })),
  };
  return { def, counts };
}

/** Deixa o JSON Schema aceitável para json_schema strict (OpenAI): todo objeto fechado e com todas as chaves obrigatórias. */
export function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = strictify(v);
  if (out.type === "object" && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  delete out.$schema;
  return out;
}
