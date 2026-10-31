// Campos → JSON Schema (draft 2020-12, o mesmo do OpenAPI 3.1).
import type { FieldDef, ResourceDef } from "./types.ts";

type Schema = Record<string, unknown>;

const position = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 3, description: "[longitude, latitude]" };

export const GEO_SCHEMAS: Record<string, Schema> = {
  geo_point: {
    type: "object",
    description: "GeoJSON Point",
    required: ["type", "coordinates"],
    properties: { type: { const: "Point" }, coordinates: position },
  },
  geo_line: {
    type: "object",
    description: "GeoJSON LineString",
    required: ["type", "coordinates"],
    properties: { type: { const: "LineString" }, coordinates: { type: "array", items: position, minItems: 2 } },
  },
  geo_polygon: {
    type: "object",
    description: "GeoJSON Polygon",
    required: ["type", "coordinates"],
    properties: { type: { const: "Polygon" }, coordinates: { type: "array", items: { type: "array", items: position, minItems: 4 } } },
  },
};

export function fieldSchema(f: FieldDef): Schema {
  let s: Schema;
  switch (f.type) {
    case "string":
    case "phone":
      s = { type: "string" };
      break;
    case "text":
      s = { type: "string", "x-widget": "textarea" };
      break;
    case "integer":
      s = { type: "integer" };
      break;
    case "number":
      s = { type: "number" };
      break;
    case "money":
      s = { type: "number", "x-format": "money" };
      break;
    case "boolean":
      s = { type: "boolean" };
      break;
    case "date":
      s = { type: "string", format: "date" };
      break;
    case "datetime":
      s = { type: "string", format: "date-time" };
      break;
    case "time":
      s = { type: "string", pattern: "^\\d{2}:\\d{2}$" };
      break;
    case "email":
      s = { type: "string", format: "email" };
      break;
    case "url":
      s = { type: "string", format: "uri" };
      break;
    case "image":
      s = { type: "string", format: "uri-reference", "x-image": f.imageKind ?? "generic" };
      break;
    case "enum":
      s = { type: "string", enum: f.enum ?? [] };
      break;
    case "tags":
      s = { type: "array", items: f.enum?.length ? { type: "string", enum: f.enum } : { type: "string" } };
      break;
    case "ref":
      s = { type: "integer", "x-ref": f.ref };
      break;
    case "refs":
      s = { type: "array", items: { type: "integer" }, "x-ref": f.ref };
      break;
    case "geo_point":
    case "geo_line":
    case "geo_polygon":
      s = structuredClone(GEO_SCHEMAS[f.type]);
      break;
    case "json":
      s = f.schema ? structuredClone(f.schema) : {};
      break;
  }
  if (f.format) s.format = f.format;
  if (f.min !== undefined) s.minimum = f.min;
  if (f.max !== undefined) s.maximum = f.max;
  if (f.minLength !== undefined) s.minLength = f.minLength;
  if (f.maxLength !== undefined) s.maxLength = f.maxLength;
  s.title = f.label;
  if (f.description) s.description = f.description;
  if (f.readOnly) s.readOnly = true;
  if (f.unit) s["x-unit"] = f.unit;
  // Opcional aceita null (exceto quando o tipo já é aberto).
  if (!f.required && s.type && f.type !== "json") s.type = [s.type as string, "null"];
  if (!f.required && s.enum) s.enum = [...(s.enum as unknown[]), null];
  return s;
}

const SYSTEM_PROPS: Record<string, Schema> = {
  id: { type: "integer", readOnly: true, title: "ID" },
  created_at: { type: "string", format: "date-time", readOnly: true, title: "Criado em" },
  updated_at: { type: "string", format: "date-time", readOnly: true, title: "Atualizado em" },
};

/** Schema do registro como sai da API. */
export function recordSchema(r: ResourceDef): Schema {
  const properties: Schema = { id: SYSTEM_PROPS.id };
  for (const f of r.fields) properties[f.name] = fieldSchema(f);
  properties.created_at = SYSTEM_PROPS.created_at;
  properties.updated_at = SYSTEM_PROPS.updated_at;
  return {
    type: "object",
    title: r.label,
    description: r.description,
    required: ["id", ...r.fields.filter((f) => f.required).map((f) => f.name), "created_at", "updated_at"],
    properties,
  };
}

/** Schema de entrada (POST/PUT): sem campos somente leitura. partial=true para PATCH. */
export function inputSchema(r: ResourceDef, partial = false): Schema {
  const properties: Schema = {};
  const required: string[] = [];
  for (const f of r.fields) {
    if (f.readOnly) continue;
    properties[f.name] = fieldSchema(f);
    if (f.required && !partial && f.type !== "image") required.push(f.name);
  }
  return { type: "object", title: `${r.label} (entrada)`, additionalProperties: false, required, properties };
}
