// Gera registros a partir das definições de campo (módulos de IA e manuais). Determinístico pela semente.
import { Faker, base, en, es, pt_BR } from "@faker-js/faker";
import { CAPITAIS, circlePolygon, genCep, genCnpj, genCpf, genIsbn13, genPis, isbn13to10, pointNear, UFS } from "../lib/br.ts";
import type { FieldDef, ModuleDef, ResourceDef } from "./types.ts";
import type { Store } from "./store.ts";

const LOCALES = { pt_BR: [pt_BR, en, base], en: [en, base], es: [es, en, base] } as const;

export function makeFaker(locale: string, seed: number): Faker {
  const f = new Faker({ locale: [...(LOCALES[locale as keyof typeof LOCALES] ?? LOCALES.pt_BR)] });
  f.seed(seed);
  return f;
}

/** Chama faker por caminho ("person.fullName"); undefined se não existir. */
function callFaker(f: Faker, path: string): unknown {
  const parts = path.replace(/\(\)$/, "").split(".");
  let target: unknown = f;
  let parent: unknown = f;
  for (const p of parts) {
    if (target === null || typeof target !== "object" || !(p in (target as object))) return undefined;
    parent = target;
    target = (target as Record<string, unknown>)[p];
  }
  if (typeof target !== "function") return undefined;
  try {
    return (target as (...a: unknown[]) => unknown).call(parent);
  } catch {
    return undefined;
  }
}

/** Ordena recursos para que os referenciados sejam gerados antes. */
export function dependencyOrder(resources: ResourceDef[]): ResourceDef[] {
  const bySlug = new Map(resources.map((r) => [r.slug, r]));
  const out: ResourceDef[] = [];
  const state = new Map<string, number>();
  const visit = (r: ResourceDef) => {
    if (state.get(r.slug) === 2) return;
    if (state.get(r.slug) === 1) return; // ciclo: segue sem esperar
    state.set(r.slug, 1);
    for (const f of r.fields) if (f.ref && f.ref !== r.slug && bySlug.has(f.ref)) visit(bySlug.get(f.ref)!);
    state.set(r.slug, 2);
    out.push(r);
  };
  resources.forEach(visit);
  return out;
}

interface GenCtx {
  ids: Map<string, number[]>;
  index: number;
  self: Record<string, unknown>;
}

function byName(f: Faker, field: FieldDef): unknown {
  const n = field.name.toLowerCase();
  if (/(^|_)(nome_completo|full_name|nome|name)$/.test(n)) return f.person.fullName();
  if (/sobrenome|last_name/.test(n)) return f.person.lastName();
  if (/(cidade|city)/.test(n)) return f.location.city();
  if (/(estado|^uf$|state)/.test(n)) return f.helpers.arrayElement(UFS);
  if (/(endereco|address|logradouro|rua)/.test(n)) return f.location.streetAddress();
  if (/(empresa|company)/.test(n)) return f.company.name();
  if (/(titulo|title)/.test(n)) return f.lorem.words({ min: 2, max: 5 }).replace(/^\w/, (c) => c.toUpperCase());
  if (/(descricao|description|observa|resumo|sinopse|bio)/.test(n)) return f.lorem.sentences({ min: 1, max: 3 });
  if (/(codigo|code|sku)/.test(n)) return f.string.alphanumeric({ length: 8, casing: "upper" });
  if (/(cor|color)/.test(n)) return f.color.rgb();
  return undefined;
}

export function genValue(f: Faker, field: FieldDef, ctx: GenCtx): unknown {
  if (field.readOnly && field.type !== "image") return undefined;
  if (!field.required && field.type !== "image" && f.number.float({ min: 0, max: 1 }) < 0.08) return null;
  if (field.samples?.length && !["ref", "refs", "geo_point", "geo_line", "geo_polygon"].includes(field.type)) {
    const v = f.helpers.arrayElement(field.samples);
    if (field.type !== "tags") return v;
  }
  if (field.faker) {
    const v = callFaker(f, field.faker);
    if (v !== undefined) return field.type === "integer" ? Math.round(Number(v)) : v instanceof Date ? v.toISOString() : v;
  }
  switch (field.format) {
    case "cpf": return genCpf(f);
    case "cnpj": return genCnpj(f);
    case "pis": return genPis(f);
    case "cep": return genCep(f);
    case "isbn13": return genIsbn13(f);
    case "isbn10": return isbn13to10(genIsbn13(f));
    case "uf": return f.helpers.arrayElement(UFS);
    case "color": return f.color.rgb();
  }
  const min = field.min ?? 0;
  switch (field.type) {
    case "string":
      return byName(f, field) ?? f.lorem.words({ min: 1, max: 3 });
    case "text":
      return f.lorem.paragraph();
    case "integer":
      return f.number.int({ min, max: field.max ?? Math.max(min + 100, 100) });
    case "number":
      return f.number.float({ min, max: field.max ?? Math.max(min + 1000, 1000), fractionDigits: 2 });
    case "money":
      return f.number.float({ min: field.min ?? 10, max: field.max ?? 5000, fractionDigits: 2 });
    case "boolean":
      return f.datatype.boolean({ probability: 0.7 });
    case "date":
      return f.date.between({ from: "2019-01-01", to: "2026-10-01" }).toISOString().slice(0, 10);
    case "datetime":
      return f.date.between({ from: "2024-01-01", to: "2026-10-30" }).toISOString();
    case "time":
      return `${String(f.number.int({ min: 6, max: 22 })).padStart(2, "0")}:${f.helpers.arrayElement(["00", "15", "30", "45"])}`;
    case "email":
      return f.internet.email({ provider: "exemplo.com" }).toLowerCase();
    case "phone":
      return f.phone.number();
    case "url":
      return `https://exemplo.com/${f.lorem.slug(2)}`;
    case "image":
      return null; // URL gerada na resposta pelo servidor de imagens
    case "enum":
      return f.helpers.arrayElement(field.enum?.length ? field.enum : ["a", "b"]);
    case "tags":
      return field.enum?.length ? f.helpers.arrayElements(field.enum, { min: 1, max: Math.min(3, field.enum.length) }) : f.helpers.arrayElements((field.samples as string[]) ?? f.lorem.words(5).split(" "), { min: 1, max: 3 });
    case "ref": {
      const pool = ctx.ids.get(field.ref ?? "") ?? [];
      return pool.length ? f.helpers.arrayElement(pool) : null;
    }
    case "refs": {
      const pool = ctx.ids.get(field.ref ?? "") ?? [];
      return pool.length ? f.helpers.arrayElements(pool, { min: 1, max: Math.min(3, pool.length) }) : [];
    }
    case "geo_point":
      return { type: "Point", coordinates: pointNear(f) };
    case "geo_line": {
      const city = f.helpers.arrayElement(CAPITAIS);
      let p = pointNear(f, city, 5);
      const coords = [p];
      for (let i = 0; i < f.number.int({ min: 4, max: 8 }); i++) {
        p = [Number((p[0] + f.number.float({ min: -0.006, max: 0.006 })).toFixed(6)), Number((p[1] + f.number.float({ min: -0.006, max: 0.006 })).toFixed(6))];
        coords.push(p);
      }
      return { type: "LineString", coordinates: coords };
    }
    case "geo_polygon":
      return { type: "Polygon", coordinates: circlePolygon(pointNear(f), f.number.int({ min: 80, max: 400 })) };
    case "json":
      return {};
  }
}

export function genRecord(f: Faker, r: ResourceDef, ctx: GenCtx): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  ctx.self = out;
  for (const field of r.fields) {
    // Hierarquia (ref para o próprio recurso): só aponta para registros anteriores, evitando ciclos.
    if (field.type === "ref" && field.ref === r.slug) {
      out[field.name] = ctx.index > 0 && f.number.float({ min: 0, max: 1 }) < 0.85 ? f.number.int({ min: 1, max: Math.max(1, Math.floor(ctx.index / 2) + 1) }) : null;
      continue;
    }
    const v = genValue(f, field, ctx);
    if (v !== undefined) out[field.name] = v;
  }
  return out;
}

/** Gera e grava `count` registros por recurso do módulo (respeitando dependências). */
export function seedModule(store: Store, def: ModuleDef, f: Faker, count: number | Record<string, number>, mode: "replace" | "append" = "replace"): void {
  if (mode === "replace") store.clearModule(def.slug);
  const ids = new Map<string, number[]>();
  for (const r of def.resources) ids.set(r.slug, store.all(def.slug, r.slug).map((x) => x.id));
  for (const r of dependencyOrder(def.resources)) {
    const n = typeof count === "number" ? count : (count[r.slug] ?? 0);
    if (n <= 0) continue;
    const startIndex = ids.get(r.slug)?.length ?? 0;
    const items: Record<string, unknown>[] = [];
    for (let i = 0; i < n; i++) items.push(genRecord(f, r, { ids, index: startIndex + i, self: {} }));
    store.bulkInsert(def.slug, r.slug, items);
    ids.set(r.slug, store.all(def.slug, r.slug).map((x) => x.id));
  }
}
