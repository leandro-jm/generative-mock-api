import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#ea580c", "#e11d48", "#7c3aed", "#ca8a04", "#0d9488", "#db2777", "#475569"];

function FitBounds({ bbox }: { bbox?: number[] }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [24, 24], maxZoom: 15 });
  }, [bbox, map]);
  return null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** View map: desenha o GeoJSON de /_views/map, colorindo por categoria. */
export function MapView({ data, height = 480 }: { data: FeatureCollection & { bbox?: number[] }; height?: number }) {
  const colors = useMemo(() => {
    const cats = [...new Set(data.features.map((f) => String(f.properties?.category ?? "")))];
    return new Map(cats.map((c, i) => [c, PALETTE[i % PALETTE.length]]));
  }, [data]);
  const colorOf = (f?: Feature) => colors.get(String(f?.properties?.category ?? "")) ?? PALETTE[0];
  return (
    <div className="space-y-2">
      <div style={{ height }} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <MapContainer center={[-15.8, -47.9]} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <GeoJSON
            key={JSON.stringify(data.bbox) + data.features.length}
            data={data}
            style={(f) => ({ color: colorOf(f), weight: 2, fillOpacity: 0.15 })}
            pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 6, color: "#fff", weight: 1.5, fillColor: colorOf(f), fillOpacity: 0.9 })}
            onEachFeature={(f, layer) => {
              const card = f.properties?.card;
              layer.bindPopup(`<b>${esc(f.properties?.title)}</b>${card?.subtitle ? `<br>${esc(card.subtitle)}` : ""}${card?.fields?.length ? `<br><small>${card.fields.map((x: { label: string; value: unknown }) => `${esc(x.label)}: ${esc(x.value ?? "—")}`).join("<br>")}</small>` : ""}`);
            }}
          />
          <FitBounds bbox={data.bbox} />
        </MapContainer>
      </div>
      {colors.size > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
          {[...colors].slice(0, 12).map(([c, color]) => (
            <span key={c} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: color }} />{c || "(sem categoria)"}</span>
          ))}
        </div>
      )}
    </div>
  );
}
