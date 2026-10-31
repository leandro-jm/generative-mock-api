import { titleOf } from "../present.ts";
import type { ResourceDef } from "../types.ts";

/** GeoJSON FeatureCollection com as geometrias do recurso (uma feature por geometria). */
export function mapView(r: ResourceDef, rows: Record<string, unknown>[], cardOf: (rec: Record<string, unknown>) => unknown) {
  const geoFields = r.views?.map?.geometry ?? r.fields.filter((f) => f.type.startsWith("geo_")).map((f) => f.name);
  const category = r.views?.map?.category;
  const features: unknown[] = [];
  for (const rec of rows) {
    for (const g of geoFields) {
      const geometry = rec[g] as { type?: string } | null | undefined;
      if (!geometry?.type) continue;
      features.push({
        type: "Feature",
        id: `${rec.id}:${g}`,
        geometry,
        properties: {
          id: rec.id,
          field: g,
          title: titleOf(r, rec as never),
          ...(category ? { category: rec[category] ?? null } : {}),
          card: cardOf(rec),
        },
      });
    }
  }
  const coords: number[][] = [];
  const collect = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(collect);
  };
  for (const f of features as { geometry: { coordinates: unknown } }[]) collect(f.geometry.coordinates);
  const bbox = coords.length
    ? [Math.min(...coords.map((c) => c[0])), Math.min(...coords.map((c) => c[1])), Math.max(...coords.map((c) => c[0])), Math.max(...coords.map((c) => c[1]))]
    : undefined;
  return { type: "FeatureCollection", ...(bbox ? { bbox } : {}), features, metadata: { resource: r.slug, geometryFields: geoFields, category: category ?? null } };
}
