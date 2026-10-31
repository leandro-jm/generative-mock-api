// Paginação, ordenação, busca e filtros sobre os registros de um recurso.
import { badRequest } from "../lib/errors.ts";
import type { Rec } from "./store.ts";
import type { FieldDef, ResourceDef } from "./types.ts";

export const RESERVED_PARAMS = new Set(["page", "limit", "sort", "q", "fields", "expand", "id", "format"]);
const OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "like", "in"] as const;
type Op = (typeof OPS)[number];

export interface Filter {
  field: string;
  op: Op;
  value: string;
}

export interface ListQuery {
  page: number;
  limit: number;
  sort: { field: string; dir: 1 | -1 }[];
  q?: string;
  filters: Filter[];
  fields?: string[];
  expand?: string[];
}

export function parseListQuery(r: ResourceDef, query: Record<string, unknown>, defaults: { limit: number; maxLimit: number }): ListQuery {
  const known = new Set(["id", "created_at", "updated_at", ...r.fields.map((f) => f.name)]);
  const str = (v: unknown) => (Array.isArray(v) ? String(v[v.length - 1]) : v === undefined ? undefined : String(v));

  const page = Math.max(1, Number(str(query.page) ?? 1) || 1);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Number(str(query.limit) ?? defaults.limit) || defaults.limit));

  const sortRaw = str(query.sort) ?? r.defaultSort ?? "id";
  const sort = sortRaw
    .split(",")
    .filter(Boolean)
    .map((s) => {
      const dir: 1 | -1 = s.startsWith("-") ? -1 : 1;
      const field = s.replace(/^[-+]/, "");
      if (!known.has(field)) throw badRequest(`Não dá para ordenar por "${field}".`);
      return { field, dir };
    });

  const filters: Filter[] = [];
  for (const [rawKey, rawVal] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(rawKey) && rawKey !== "id") continue;
    const m = /^([a-zA-Z0-9_]+)(?:\[(\w+)\])?$/.exec(rawKey);
    if (!m) continue;
    const [, field, opRaw] = m;
    if (!known.has(field)) continue;
    const op = (opRaw ?? "eq") as Op;
    if (!OPS.includes(op)) throw badRequest(`Operador desconhecido: ${opRaw}. Use ${OPS.join(", ")}.`);
    const values = Array.isArray(rawVal) ? rawVal.map(String) : [String(rawVal)];
    for (const value of values) filters.push({ field, op, value });
  }

  const list = (v: unknown) => str(v)?.split(",").map((s) => s.trim()).filter(Boolean);
  return { page, limit, sort, q: str(query.q)?.trim() || undefined, filters, fields: list(query.fields), expand: list(query.expand) };
}

function coerce(f: FieldDef | undefined, raw: string): unknown {
  if (!f) return /^\d+$/.test(raw) ? Number(raw) : raw;
  if (raw === "null") return null;
  switch (f.type) {
    case "integer":
    case "number":
    case "money":
    case "ref":
    case "refs":
      return Number(raw);
    case "boolean":
      return raw === "true" || raw === "1";
    default:
      return raw;
  }
}

const norm = (v: unknown) => (typeof v === "string" ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : v);

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(norm(a)).localeCompare(String(norm(b)), "pt-BR");
}

function matches(rec: Rec, f: Filter, field: FieldDef | undefined): boolean {
  const actual = rec[f.field];
  const values = f.op === "in" || (f.op === "eq" && f.value.includes(",")) ? f.value.split(",").map((v) => coerce(field, v)) : [coerce(field, f.value)];
  const target = values[0];
  if (Array.isArray(actual)) {
    // tags/refs: eq/in = contém algum dos valores.
    const has = values.some((v) => actual.includes(v));
    if (f.op === "eq" || f.op === "in") return has;
    if (f.op === "ne") return !has;
    if (f.op === "like") return actual.some((a) => String(norm(a)).includes(String(norm(target))));
    return false;
  }
  switch (f.op) {
    case "eq":
    case "in":
      return values.some((v) => (typeof actual === "string" && typeof v === "string" ? norm(actual) === norm(v) : actual === v));
    case "ne":
      return actual !== target;
    case "gt":
      return actual !== null && actual !== undefined && cmp(actual, target) > 0;
    case "gte":
      return actual !== null && actual !== undefined && cmp(actual, target) >= 0;
    case "lt":
      return actual !== null && actual !== undefined && cmp(actual, target) < 0;
    case "lte":
      return actual !== null && actual !== undefined && cmp(actual, target) <= 0;
    case "like":
      return actual !== null && actual !== undefined && String(norm(actual)).includes(String(norm(target)));
  }
}

export function searchFields(r: ResourceDef): string[] {
  return r.searchFields ?? r.fields.filter((f) => ["string", "text", "email", "enum", "tags"].includes(f.type)).map((f) => f.name);
}

/** Filtra e ordena (sem paginar). */
export function applyQuery(r: ResourceDef, rows: Rec[], q: Pick<ListQuery, "filters" | "q" | "sort">): Rec[] {
  const byName = new Map(r.fields.map((f) => [f.name, f]));
  let out = rows.filter((rec) => q.filters.every((f) => matches(rec, f, byName.get(f.field))));
  if (q.q) {
    const term = String(norm(q.q));
    const fields = searchFields(r);
    out = out.filter((rec) => fields.some((name) => {
      const v = rec[name];
      return Array.isArray(v) ? v.some((x) => String(norm(x)).includes(term)) : v !== null && v !== undefined && String(norm(v)).includes(term);
    }));
  }
  if (q.sort.length) {
    out = [...out].sort((a, b) => {
      for (const s of q.sort) {
        // Vazios sempre no fim, em qualquer direção.
        const an = a[s.field] === null || a[s.field] === undefined;
        const bn = b[s.field] === null || b[s.field] === undefined;
        if (an !== bn) return an ? 1 : -1;
        const c = cmp(a[s.field], b[s.field]);
        if (c !== 0) return c * s.dir;
      }
      return a.id - b.id;
    });
  }
  return out;
}

export function paginate<T>(rows: T[], page: number, limit: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { data: rows.slice((page - 1) * limit, page * limit), meta: { page, limit, total, totalPages } };
}

/** Header Link (RFC 8288) com first/prev/next/last. */
export function linkHeader(baseUrl: string, query: Record<string, unknown>, meta: { page: number; totalPages: number }): string {
  const make = (page: number, rel: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (k !== "page" && v !== undefined) for (const x of Array.isArray(v) ? v : [v]) params.append(k, String(x));
    params.set("page", String(page));
    return `<${baseUrl}?${params}>; rel="${rel}"`;
  };
  const links = [make(1, "first")];
  if (meta.page > 1) links.push(make(meta.page - 1, "prev"));
  if (meta.page < meta.totalPages) links.push(make(meta.page + 1, "next"));
  links.push(make(meta.totalPages, "last"));
  return links.join(", ");
}
