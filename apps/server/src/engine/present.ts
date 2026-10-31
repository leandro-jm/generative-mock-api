// Como um registro sai na resposta: URLs absolutas de imagem, expand de referências e projeção de campos.
import type { Store, Rec } from "./store.ts";
import type { ModuleDef, ResourceDef } from "./types.ts";

export function imageName(field: string): string {
  return field.replace(/_url$/, "");
}

export function imagePath(m: string, r: string, id: number, field: string, ext: "svg" | "png" = "svg"): string {
  return `/api/v1/${m}/${r}/${id}/${imageName(field)}.${ext}`;
}

export interface PresentOpts {
  baseUrl: string;
  fields?: string[];
  expand?: string[];
  store?: Store;
  module?: ModuleDef;
}

export function present(m: string, r: ResourceDef, rec: Rec, opts: PresentOpts): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rec };
  for (const f of r.fields) {
    if (f.type !== "image") continue;
    const v = out[f.name];
    // Valor vazio ou relativo: aponta para o gerador de imagens do próprio servidor.
    if (v === undefined || v === null || v === "") out[f.name] = `${opts.baseUrl}${imagePath(m, r.slug, rec.id, f.name)}`;
    else if (typeof v === "string" && v.startsWith("/")) out[f.name] = `${opts.baseUrl}${v}`;
  }
  if (opts.expand?.length && opts.store && opts.module) {
    for (const name of opts.expand) {
      const f = r.fields.find((x) => x.name === name && (x.type === "ref" || x.type === "refs"));
      if (!f?.ref) continue;
      const target = opts.module.resources.find((x) => x.slug === f.ref);
      if (!target) continue;
      const key = name.replace(/_ids?$/, "") || name;
      const lookup = (id: unknown) => {
        const t = typeof id === "number" ? opts.store!.get(m, target.slug, id) : undefined;
        return t ? present(m, target, t, { baseUrl: opts.baseUrl }) : null;
      };
      out[key === name ? `${name}_obj` : key] = f.type === "ref" ? lookup(rec[name]) : ((rec[name] as unknown[]) ?? []).map(lookup).filter(Boolean);
    }
  }
  if (opts.fields?.length) {
    const keep = new Set(["id", ...opts.fields]);
    for (const k of Object.keys(out)) if (!keep.has(k) && !opts.expand?.some((e) => k.startsWith(e.replace(/_ids?$/, "")))) delete out[k];
  }
  return out;
}

export function titleOf(r: ResourceDef, rec: Rec | undefined): string {
  if (!rec) return "";
  const v = rec[r.titleField];
  return v === undefined || v === null ? `${r.label} #${rec.id}` : String(v);
}
