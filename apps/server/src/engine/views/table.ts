import type { FieldDef, ResourceDef } from "../types.ts";

const FORMAT: Partial<Record<FieldDef["type"], string>> = {
  money: "currency", date: "date", datetime: "datetime", boolean: "boolean", image: "image", tags: "tags", enum: "badge", ref: "ref", refs: "refs", email: "email", url: "link", integer: "number", number: "number",
};

const NOT_IN_TABLE = new Set(["geo_point", "geo_line", "geo_polygon", "json", "text"]);

export function tableColumns(r: ResourceDef) {
  const filterable = (f: FieldDef) => !["image", "json", "geo_point", "geo_line", "geo_polygon"].includes(f.type);
  const fields = r.views?.table?.columns
    ? r.views.table.columns.map((n) => r.fields.find((f) => f.name === n)).filter((f): f is FieldDef => Boolean(f))
    : r.fields.filter((f) => !f.hidden && !NOT_IN_TABLE.has(f.type)).slice(0, 8);
  return [
    { key: "id", label: "ID", type: "integer", format: "number", sortable: true, filterable: true },
    ...fields.map((f) => ({
      key: f.name,
      label: f.label,
      type: f.type,
      format: f.format ?? FORMAT[f.type] ?? "text",
      sortable: !["tags", "refs", "image"].includes(f.type),
      filterable: filterable(f),
      ...(f.enum ? { options: f.enum } : {}),
      ...(f.ref ? { ref: f.ref } : {}),
      ...(f.unit ? { unit: f.unit } : {}),
    })),
  ];
}
