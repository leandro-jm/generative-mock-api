import type { Rec } from "../store.ts";
import type { ResourceDef } from "../types.ts";

const fmtValue = (v: unknown, type: string): unknown => {
  if (v === null || v === undefined) return null;
  if (type === "money" && typeof v === "number") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (type === "date" && typeof v === "string") return v.split("-").reverse().join("/");
  if (type === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.join(", ");
  return v;
};

/** Card padronizado de um registro já apresentado (URLs absolutas, refs resolvidas em `refLabels`). */
export function toCard(r: ResourceDef, rec: Record<string, unknown>, refLabels: (field: string, id: unknown) => string | null) {
  const hint = r.views?.card ?? { title: r.titleField };
  const fieldDef = (n: string) => r.fields.find((f) => f.name === n);
  const val = (n?: string) => {
    if (!n) return null;
    const f = fieldDef(n);
    const v = rec[n];
    if (f?.type === "ref") return refLabels(n, v);
    if (f?.type === "refs" && Array.isArray(v)) return v.map((x) => refLabels(n, x)).filter(Boolean).join(", ");
    return fmtValue(v, f?.type ?? "string");
  };
  const badges = (hint.badges ?? []).flatMap((n) => {
    const v = rec[n];
    const f = fieldDef(n);
    if (Array.isArray(v)) return f?.type === "refs" ? v.map((x) => refLabels(n, x)).filter(Boolean) : v.map(String);
    return v === null || v === undefined ? [] : [String(f?.type === "ref" ? refLabels(n, v) : fmtValue(v, f?.type ?? "string"))];
  });
  const defaultFields = r.fields.filter((f) => !f.hidden && !["image", "text", "json", "geo_point", "geo_line", "geo_polygon"].includes(f.type) && f.name !== hint.title && f.name !== hint.subtitle).slice(0, 4).map((f) => f.name);
  return {
    id: rec.id as number,
    title: String(val(hint.title) ?? `#${rec.id}`),
    subtitle: val(hint.subtitle) as string | null,
    image: hint.image ? ((rec[hint.image] as string) ?? null) : null,
    badges,
    description: val(hint.description) as string | null,
    fields: (hint.fields ?? defaultFields).map((n) => ({ key: n, label: fieldDef(n)?.label ?? n, value: val(n) })),
  };
}

export type Card = ReturnType<typeof toCard>;
export type { Rec };
