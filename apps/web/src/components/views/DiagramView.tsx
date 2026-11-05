import { useMemo } from "react";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import * as dagre from "@dagrejs/dagre";
import type { Diagram } from "../../lib/api";
import { useTheme, useThemeColors } from "../../lib/theme";
const W = 180;
const H = 44;

/** View diagram: nós e arestas posicionados com dagre (árvore/fluxo de cima para baixo, grafo da esquerda para a direita). */
export function DiagramView({ diagram, height = 520 }: { diagram: Diagram; height?: number }) {
  const { resolved } = useTheme();
  const t = useThemeColors();
  const { nodes, edges, legend } = useMemo(() => {
    const TYPE_COLORS = t.series.slice(0, 7);
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: diagram.kind === "graph" ? "LR" : "TB", nodesep: 24, ranksep: diagram.kind === "graph" ? 120 : 60 });
    g.setDefaultEdgeLabel(() => ({}));
    const types = [...new Set(diagram.nodes.map((n) => n.type))];
    const color = (t: string) => TYPE_COLORS[types.indexOf(t) % TYPE_COLORS.length];
    for (const n of diagram.nodes) g.setNode(n.id, { width: W, height: H });
    for (const e of diagram.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const nodes: Node[] = diagram.nodes.map((n) => {
      const p = g.node(n.id);
      const sub = n.data?.subtitle as string | undefined;
      return {
        id: n.id,
        position: { x: p.x - W / 2, y: p.y - H / 2 },
        data: { label: sub ? `${n.label} · ${sub}` : n.label },
        style: { width: W, fontSize: 12, borderRadius: 8, border: `1.5px solid ${color(n.type)}`, background: "var(--surface-2)", color: "var(--text)", padding: 6 },
        draggable: true,
      };
    });
    const edges: Edge[] = diagram.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: diagram.kind === "flow" ? e.label : undefined, markerEnd: { type: MarkerType.ArrowClosed, color: t.borderStrong }, style: { strokeWidth: 1.2, stroke: t.borderStrong }, labelStyle: { fontSize: 11, fill: t.text3 }, labelBgStyle: { fill: t.surface } }));
    return { nodes, edges, legend: types.map((t) => ({ t, c: color(t) })) };
  }, [diagram, t]);

  return (
    <div className="space-y-2">
      <div style={{ height }} className="overflow-hidden rounded-xl border border-line bg-surface text-fg">
        <ReactFlow colorMode={resolved} nodes={nodes} edges={edges} fitView minZoom={0.05} proOptions={{ hideAttribution: true }} nodesConnectable={false}>
          <Background gap={16} color={t.borderStrong} />
          <Controls showInteractive={false} />
          {nodes.length > 30 && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
      {legend.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-fg-2">
          {legend.map(({ t, c }) => <span key={t} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{t}</span>)}
        </div>
      )}
    </div>
  );
}
