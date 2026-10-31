import { notFound } from "../../lib/errors.ts";
import type { Store } from "../store.ts";
import { titleOf } from "../present.ts";
import type { DiagramDef, ModuleDef } from "../types.ts";

interface Node { id: string; label: string; type: string; parentId?: string | null; data: Record<string, unknown> }
interface Edge { id: string; source: string; target: string; label?: string }

/** Monta nós e arestas de um diagrama (árvore por parent_id, grafo por referências ou fluxo fixo). */
export function diagramView(m: ModuleDef, d: DiagramDef, store: Store) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const res = (slug: string) => {
    const r = m.resources.find((x) => x.slug === slug);
    if (!r) throw notFound(`Recurso ${slug} não existe no módulo ${m.slug}.`);
    return r;
  };

  if (d.kind === "tree" && d.tree) {
    const r = res(d.tree.resource);
    const rows = store.all(m.slug, r.slug);
    const ids = new Set(rows.map((x) => x.id));
    for (const rec of rows) {
      const parent = rec[d.tree.parentField] as number | null;
      const id = `${r.slug}:${rec.id}`;
      nodes.push({
        id,
        label: d.tree.labelField ? String(rec[d.tree.labelField] ?? "") : titleOf(r, rec),
        type: r.slug,
        parentId: parent && ids.has(parent) ? `${r.slug}:${parent}` : null,
        data: { recordId: rec.id, ...(d.tree.subtitleField ? { subtitle: rec[d.tree.subtitleField] ?? null } : {}) },
      });
      if (parent && ids.has(parent)) edges.push({ id: `e:${parent}-${rec.id}`, source: `${r.slug}:${parent}`, target: id });
    }
  } else if (d.kind === "graph" && d.graph) {
    const included = new Map<string, Set<number>>();
    for (const n of d.graph.nodes) {
      const r = res(n.resource);
      const rows = store.all(m.slug, r.slug).slice(0, n.limit ?? 40);
      included.set(r.slug, new Set(rows.map((x) => x.id)));
      for (const rec of rows) nodes.push({ id: `${r.slug}:${rec.id}`, label: titleOf(r, rec), type: n.type ?? r.slug, data: { recordId: rec.id, resource: r.slug } });
    }
    for (const e of d.graph.edges) {
      const r = res(e.resource);
      const field = r.fields.find((f) => f.name === e.field);
      if (!field?.ref) continue;
      const fromSet = included.get(r.slug);
      const toSet = included.get(field.ref);
      if (!fromSet || !toSet) continue;
      for (const rec of store.all(m.slug, r.slug)) {
        if (!fromSet.has(rec.id)) continue;
        const targets = (Array.isArray(rec[e.field]) ? rec[e.field] : [rec[e.field]]) as unknown[];
        for (const t of targets) {
          if (typeof t !== "number" || !toSet.has(t)) continue;
          edges.push({ id: `e:${r.slug}:${rec.id}-${field.ref}:${t}:${e.field}`, source: `${r.slug}:${rec.id}`, target: `${field.ref}:${t}`, label: e.label });
        }
      }
    }
    // Sem arestas, o nó só polui o desenho.
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    for (let i = nodes.length - 1; i >= 0; i--) if (!linked.has(nodes[i].id)) nodes.splice(i, 1);
  } else if (d.kind === "flow" && d.flow) {
    for (const n of d.flow.nodes) nodes.push({ id: n.id, label: n.label, type: n.type ?? "step", data: {} });
    d.flow.edges.forEach((e, i) => edges.push({ id: `e:${i}`, source: e.source, target: e.target, label: e.label }));
  }
  return { name: d.name, title: d.title, description: d.description ?? null, kind: d.kind, nodes, edges };
}
