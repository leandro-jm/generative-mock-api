import type { Store } from "../store.ts";
import { inputSchema } from "../schema.ts";
import { titleOf } from "../present.ts";
import type { FieldDef, ModuleDef, ResourceDef } from "../types.ts";

const MASKS: Record<string, string> = { cpf: "000.000.000-00", cnpj: "00.000.000/0000-00", cep: "00000-000", pis: "000.00000.00-0", isbn13: "000-00-0000-000-0" };

function widget(f: FieldDef): string {
  switch (f.type) {
    case "text": return "textarea";
    case "integer":
    case "number": return "number";
    case "money": return "currency";
    case "boolean": return "switch";
    case "date": return "date";
    case "datetime": return "datetime";
    case "time": return "time";
    case "email": return "email";
    case "phone": return "tel";
    case "url": return "url";
    case "image": return "image-url";
    case "enum": return (f.enum?.length ?? 0) <= 4 ? "radio" : "select";
    case "tags": return f.enum?.length ? "multiselect" : "tags";
    case "ref": return "select";
    case "refs": return "multiselect";
    case "geo_point": return "map-point";
    case "geo_line": return "map-line";
    case "geo_polygon": return "map-polygon";
    case "json": return "json";
    default: return "text";
  }
}

/** Schema de entrada + uiSchema (widgets, máscaras, etapas, opções) + valores iniciais. */
export function formView(m: ModuleDef, r: ResourceDef, store: Store, mode: "create" | "edit", record?: Record<string, unknown>) {
  const editable = r.fields.filter((f) => !f.readOnly);
  const uiSchema: Record<string, unknown> = {};
  for (const f of editable) {
    const ui: Record<string, unknown> = { label: f.label, widget: widget(f), required: Boolean(f.required) };
    if (f.description) ui.help = f.description;
    if (f.format && MASKS[f.format]) ui.mask = MASKS[f.format];
    if (f.unit) ui.suffix = f.unit;
    if (f.type === "money") ui.prefix = "R$";
    if (f.enum) ui.options = f.enum.map((v) => ({ value: v, label: v }));
    if ((f.type === "ref" || f.type === "refs") && f.ref) {
      const target = m.resources.find((x) => x.slug === f.ref);
      if (target) {
        const rows = store.all(m.slug, target.slug);
        ui.options = rows.slice(0, 500).map((row) => ({ value: row.id, label: titleOf(target, row) }));
        ui.optionsSource = `/api/v1/${m.slug}/${target.slug}?fields=${target.titleField}&limit=100&q={busca}`;
        ui.optionsTotal = rows.length;
      }
    }
    if (f.min !== undefined) ui.min = f.min;
    if (f.max !== undefined) ui.max = f.max;
    uiSchema[f.name] = ui;
  }
  const steps =
    r.views?.form?.steps ??
    (() => {
      const groups = new Map<string, string[]>();
      for (const f of editable) {
        const g = f.group ?? "Dados";
        groups.set(g, [...(groups.get(g) ?? []), f.name]);
      }
      return [...groups].map(([title, fields]) => ({ title, fields }));
    })();
  const initialValues: Record<string, unknown> = {};
  for (const f of editable) {
    if (record) initialValues[f.name] = record[f.name] ?? null;
    else initialValues[f.name] = f.type === "boolean" ? false : f.type === "tags" || f.type === "refs" ? [] : null;
  }
  return {
    resource: r.slug,
    title: mode === "create" ? `Novo ${r.label.toLowerCase()}` : `Editar ${r.label.toLowerCase()} #${record?.id}`,
    mode,
    submit: mode === "create" ? { method: "POST", url: `/api/v1/${m.slug}/${r.slug}` } : { method: "PUT", url: `/api/v1/${m.slug}/${r.slug}/${record?.id}` },
    schema: inputSchema(r),
    uiSchema,
    steps,
    initialValues,
  };
}
