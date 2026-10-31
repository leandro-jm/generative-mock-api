import { badRequest } from "../../lib/errors.ts";
import { round2 } from "../../lib/util.ts";
import type { Store, Rec } from "../store.ts";
import { titleOf } from "../present.ts";
import type { ChartDef, ModuleDef, ResourceDef } from "../types.ts";

export interface ChartSpec {
  type: ChartDef["type"];
  groupBy: string;
  interval?: ChartDef["interval"];
  metric: string;
  seriesBy?: string;
  limit?: number;
  sort?: ChartDef["sort"];
  unit?: string;
  title?: string;
}

function bucket(v: unknown, interval?: ChartDef["interval"]): string | null {
  if (typeof v !== "string") return null;
  if (interval === "year") return v.slice(0, 4);
  if (interval === "day") return v.slice(0, 10);
  return v.slice(0, 7);
}

/** Agrega registros em séries para gráfico: { labels[], series[{ name, data[] }] }. */
export function aggregate(m: ModuleDef, r: ResourceDef, rows: Rec[], store: Store, spec: ChartSpec) {
  const field = (n: string) => {
    if (n === "created_at" || n === "updated_at") return { name: n, type: "datetime" as const, label: n === "created_at" ? "Criado em" : "Atualizado em" };
    const f = r.fields.find((x) => x.name === n);
    if (!f) throw badRequest(`Campo "${n}" não existe em ${r.slug}.`);
    return f;
  };
  const group = field(spec.groupBy);
  const [metricKind, metricField] = spec.metric.split(":") as ["count" | "sum" | "avg" | "min" | "max", string | undefined];
  if (!["count", "sum", "avg", "min", "max"].includes(metricKind)) throw badRequest("metric deve ser count, sum:campo, avg:campo, min:campo ou max:campo.");
  if (metricKind !== "count") {
    const mf = field(metricField ?? "");
    if (!["integer", "number", "money"].includes(mf.type)) throw badRequest(`metric precisa de campo numérico (${metricField} é ${mf.type}).`);
  }
  const series = spec.seriesBy ? field(spec.seriesBy) : undefined;
  const isDate = group.type === "date" || group.type === "datetime";

  const refLabel = (f: { type: string; ref?: string }, v: unknown) => {
    if ((f.type === "ref" || f.type === "refs") && f.ref && typeof v === "number") {
      const target = m.resources.find((x) => x.slug === f.ref);
      return target ? titleOf(target, store.get(m.slug, target.slug, v)) : String(v);
    }
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    return v === null || v === undefined ? "(vazio)" : String(v);
  };
  const keysOf = (f: typeof group, rec: Rec): string[] => {
    const v = rec[f.name];
    if (f.type === "date" || f.type === "datetime") {
      const b = bucket(v, spec.interval ?? "month");
      return b ? [b] : [];
    }
    if (Array.isArray(v)) return v.map((x) => refLabel(f, x));
    return [refLabel(f, v)];
  };

  const acc = new Map<string, Map<string, number[]>>();
  for (const rec of rows) {
    const value = metricKind === "count" ? 1 : Number(rec[metricField!]);
    if (Number.isNaN(value)) continue;
    const seriesKeys = series ? keysOf(series, rec) : [spec.metric];
    for (const label of keysOf(group, rec)) {
      for (const s of seriesKeys) {
        if (!acc.has(s)) acc.set(s, new Map());
        const m2 = acc.get(s)!;
        if (!m2.has(label)) m2.set(label, []);
        m2.get(label)!.push(value);
      }
    }
  }
  const reduce = (vals: number[] | undefined) => {
    if (!vals?.length) return 0;
    switch (metricKind) {
      case "count": return vals.length;
      case "sum": return round2(vals.reduce((a, b) => a + b, 0));
      case "avg": return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
      case "min": return Math.min(...vals);
      case "max": return Math.max(...vals);
    }
  };
  const totals = new Map<string, number>();
  for (const m2 of acc.values()) for (const [label, vals] of m2) totals.set(label, (totals.get(label) ?? 0) + (reduce(vals) ?? 0));
  let labels = [...totals.keys()];
  const sort = spec.sort ?? (isDate ? "label" : "value");
  labels.sort(sort === "label" ? (a, b) => a.localeCompare(b, "pt-BR") : (a, b) => totals.get(b)! - totals.get(a)!);
  if (spec.limit) labels = labels.slice(0, spec.limit);

  const metricLabel = metricKind === "count" ? "Quantidade" : `${{ sum: "Soma", avg: "Média", min: "Mínimo", max: "Máximo" }[metricKind]} de ${field(metricField!).label}`;
  return {
    title: spec.title ?? `${metricLabel} por ${group.label}`,
    type: spec.type,
    labels,
    series: [...acc].map(([name, m2]) => ({ name: series ? name : metricLabel, data: labels.map((l) => reduce(m2.get(l))) })),
    unit: spec.unit ?? (metricField && r.fields.find((f) => f.name === metricField)?.type === "money" ? "BRL" : null),
    meta: { resource: r.slug, groupBy: spec.groupBy, interval: isDate ? (spec.interval ?? "month") : null, metric: spec.metric, seriesBy: spec.seriesBy ?? null, total: rows.length },
  };
}
