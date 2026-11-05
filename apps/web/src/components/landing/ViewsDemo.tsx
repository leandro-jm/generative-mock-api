import type { CSSProperties, ReactNode } from "react";
import { BarChart3, ClipboardCheck, GitFork, IdCard, Map as MapIcon, Table2, TextCursorInput } from "lucide-react";
import { cx } from "../ui";
import { useCycle } from "./hooks";

const d = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

const VIEWS = [
  { key: "table", label: "table", icon: Table2, endpoint: "GET …/colaboradores/_views/table", desc: "Colunas + página de dados, com rótulos das referências." },
  { key: "card", label: "card", icon: IdCard, endpoint: "GET …/filmes/_views/card?id=42", desc: "Título, imagem gerada, badges e campos principais." },
  { key: "form", label: "form", icon: TextCursorInput, endpoint: "GET …/_views/form?mode=create", desc: "JSON Schema + uiSchema com máscaras, opções e etapas." },
  { key: "plan", label: "plan", icon: ClipboardCheck, endpoint: "POST …/rh/plans → /confirm", desc: "Impacto com diff antes de mudar qualquer dado." },
  { key: "map", label: "map", icon: MapIcon, endpoint: "GET …/postos-trabalho/_views/map", desc: "GeoJSON: pontos, rotas e cercas virtuais." },
  { key: "chart", label: "chart", icon: BarChart3, endpoint: "GET …/filmes/_views/charts/bilheteria", desc: "{ type, labels, series[] } pronto para o gráfico." },
  { key: "diagram", label: "diagram", icon: GitFork, endpoint: "GET …/rh/_views/diagrams/organograma", desc: "Árvore, grafo ou fluxo com nós e arestas." },
] as const;

function TablePreview() {
  const rows = [
    ["Ana Ribeiro", "Analista de RH", "Ativo", "green"],
    ["Bruno Costa", "Vigilante", "Férias", "sky"],
    ["Carla Nunes", "Supervisora", "Ativo", "green"],
    ["Diego Alves", "Porteiro", "Afastado", "amber"],
  ] as const;
  const tone = { green: "border-success-border bg-success-dim text-success", sky: "border-sky-border bg-sky-dim text-sky", amber: "border-warning-border bg-warning-dim text-warning" };
  return (
    <div className="overflow-hidden rounded-lg border border-line text-[12px]">
      <div className="grid grid-cols-[1.3fr_1.2fr_0.8fr] bg-surface-2 px-3 py-1.5 text-[10px] font-medium tracking-wider text-fg-3 uppercase">
        <span>Nome</span><span>Cargo</span><span>Status</span>
      </div>
      {rows.map(([n, c, s, t], i) => (
        <div key={n} className="anim-fade-up grid grid-cols-[1.3fr_1.2fr_0.8fr] items-center border-t border-line px-3 py-1.5" style={d(120 + i * 110)}>
          <span className="truncate text-fg">{n}</span>
          <span className="truncate text-fg-2">{c}</span>
          <span><span className={cx("rounded border px-1 py-px text-[10px]", tone[t])}>{s}</span></span>
        </div>
      ))}
    </div>
  );
}

function CardPreview() {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="shimmer anim-pop relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md">
        <svg viewBox="0 0 40 60" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="28" cy="16" r="6" style={{ fill: "var(--chart-5)", opacity: 0.8 }} />
          <path d="M0 44 14 30l10 9 6-5 10 10v16H0z" style={{ fill: "var(--art-3)", opacity: 0.6 }} />
        </svg>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="anim-fade-up text-sm font-semibold text-fg" style={d(150)}>O Farol de Areia</p>
        <p className="anim-fade-up text-xs text-fg-3" style={d(230)}>2025 · Drama · 1h52</p>
        <div className="flex gap-1">
          {["Drama", "Nacional", "4.7 ★"].map((b, i) => (
            <span key={b} className="anim-pop rounded border border-line-strong bg-surface-3 px-1 py-px text-[10px] text-fg" style={d(330 + i * 90)}>{b}</span>
          ))}
        </div>
        {[92, 70, 82].map((w, i) => (
          <div key={i} className="anim-grow-x h-1.5 rounded-full bg-surface-3" style={{ width: `${w}%`, ...d(600 + i * 120) }} />
        ))}
      </div>
    </div>
  );
}

function Typed({ text, delay }: { text: string; delay: number }) {
  return (
    <span className="inline-block overflow-hidden align-bottom whitespace-nowrap" style={{ maxWidth: 0, animation: `type-in ${text.length * 45}ms steps(${text.length}) ${delay}ms forwards`, ["--w" as string]: `${text.length + 0.5}ch` }}>
      {text}
    </span>
  );
}

function FormPreview() {
  const fields = [
    { label: "Nome", value: "Ana Ribeiro", at: 150 },
    { label: "CPF", value: "123.456.789-09", at: 750, mono: true },
    { label: "Cargo", value: "Analista de RH ▾", at: 1500 },
  ];
  return (
    <div className="space-y-2 text-[12px]">
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-[64px_1fr] items-center gap-2">
          <span className="text-fg-3">{f.label}</span>
          <span className={cx("rounded-md border border-line bg-surface px-2 py-1 text-fg", f.mono && "font-mono")}>
            <Typed text={f.value} delay={f.at} />
            <span className="ml-px inline-block h-3 w-px bg-fg-3 align-middle" />
          </span>
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <span className="rounded-md border border-line px-2 py-1 text-fg-2">Cancelar</span>
        <span className="anim-pop pulse-ring rounded-md bg-primary px-2.5 py-1 font-medium text-primary-fg" style={d(2300)}>Salvar</span>
      </div>
    </div>
  );
}

function PlanPreview() {
  const items = [
    { sign: "−", text: "Excluir 3 escalas", cls: "text-danger" },
    { sign: "~", text: "Benefícios: ativo → encerrado", cls: "text-warning" },
    { sign: "+", text: "Criar evento eSocial S-2299", cls: "text-success" },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-danger-border bg-danger-dim/40 p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-fg">Desligar colaborador</span>
        <span className="rounded border border-danger-border bg-danger-dim px-1 py-px text-[10px] text-danger">high</span>
      </div>
      <ul className="space-y-1 font-mono">
        {items.map((it, i) => (
          <li key={it.text} className="anim-fade-up flex gap-2" style={d(150 + i * 180)}>
            <span className={cx("w-3", it.cls)}>{it.sign}</span>
            <span className="text-fg-2">{it.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-fg">
          <Typed text="CONFIRMAR" delay={900} />
        </span>
        <span className="anim-pop pulse-ring rounded-md bg-primary px-2.5 py-1 font-medium text-primary-fg" style={d(1500)}>Confirmar</span>
      </div>
    </div>
  );
}

function MapPreview() {
  const pins = [
    [70, 58, "var(--chart-2)"],
    [126, 96, "var(--chart-3)"],
    [196, 52, "var(--chart-2)"],
    [244, 112, "var(--chart-5)"],
    [168, 128, "var(--chart-3)"],
  ] as const;
  return (
    <svg viewBox="0 0 320 160" className="h-[150px] w-full rounded-lg border border-line bg-surface-2" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={160} style={{ stroke: "var(--border)" }} strokeWidth={0.6} />)}
      {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 40} x2={320} y2={i * 40} style={{ stroke: "var(--border)" }} strokeWidth={0.6} />)}
      <path d="M20 140 C 60 120, 90 80, 140 90 S 230 40, 300 30" fill="none" style={{ stroke: "var(--border-strong)" }} strokeWidth={6} strokeLinecap="round" />
      <polygon points="150,30 230,24 250,78 176,92" className="anim-draw" style={{ ["--len" as string]: 300, stroke: "var(--chart-4)", fill: "color-mix(in srgb, var(--chart-4) 14%, transparent)" }} strokeWidth={1.5} />
      <polyline points="40,120 90,104 120,120 160,110 210,126 270,100" fill="none" className="anim-draw" style={{ ["--len" as string]: 280, stroke: "var(--chart-1)", animationDelay: "500ms" }} strokeWidth={1.5} strokeDasharray="4 3" />
      {pins.map(([x, y, c], i) => (
        <g key={i} className="anim-drop" style={{ transformBox: "fill-box", ...d(250 + i * 160) }}>
          <circle cx={x} cy={y} r={9} style={{ fill: c, opacity: 0.18 }} />
          <circle cx={x} cy={y} r={4.5} style={{ fill: c, stroke: "var(--surface)" }} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

function ChartPreview() {
  const bars = [38, 52, 44, 66, 58, 80, 72, 94];
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-fg">Bilheteria por ano</span>
        <span className="anim-fade-in text-success" style={d(900)}>+18,4%</span>
      </div>
      <div className="flex h-[100px] items-end gap-2 border-b border-line">
        {bars.map((h, i) => (
          <div key={i} className="anim-grow-y flex-1 rounded-t-[3px]" style={{ height: `${h}%`, background: i === bars.length - 1 ? "var(--chart-2)" : "var(--chart-1)", opacity: i === bars.length - 1 ? 1 : 0.35 + i * 0.06, ...d(100 + i * 80) }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-3"><span>2018</span><span>2025</span></div>
    </div>
  );
}

function DiagramPreview() {
  const nodes = [
    { x: 160, y: 22, label: "Diretoria" },
    { x: 80, y: 78, label: "RH" },
    { x: 240, y: 78, label: "Operações" },
    { x: 190, y: 134, label: "Postos" },
    { x: 290, y: 134, label: "Rondas" },
    { x: 80, y: 134, label: "Folha" },
  ];
  const edges = [[0, 1], [0, 2], [2, 3], [2, 4], [1, 5]] as const;
  return (
    <svg viewBox="0 0 340 156" className="h-[150px] w-full rounded-lg border border-line bg-surface-2" aria-hidden>
      {edges.map(([a, b], i) => (
        <path key={i} d={`M${nodes[a].x} ${nodes[a].y + 11} C ${nodes[a].x} ${(nodes[a].y + nodes[b].y) / 2}, ${nodes[b].x} ${(nodes[a].y + nodes[b].y) / 2}, ${nodes[b].x} ${nodes[b].y - 11}`} fill="none" className="anim-draw" style={{ ["--len" as string]: 140, stroke: "var(--border-strong)", ...d(300 + i * 160) }} strokeWidth={1.3} />
      ))}
      {nodes.map((n, i) => (
        <g key={n.label} className="anim-pop" style={{ transformBox: "fill-box", transformOrigin: "center", ...d(i * 140) }}>
          <rect x={n.x - 34} y={n.y - 11} width={68} height={22} rx={6} style={{ fill: "var(--surface)", stroke: i === 0 ? "var(--accent)" : "var(--chart-" + (i < 3 ? 2 : 3) + ")" }} strokeWidth={1.2} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10} style={{ fill: "var(--text)" }}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

const PREVIEWS: Record<(typeof VIEWS)[number]["key"], () => ReactNode> = {
  table: TablePreview,
  card: CardPreview,
  form: FormPreview,
  plan: PlanPreview,
  map: MapPreview,
  chart: ChartPreview,
  diagram: DiagramPreview,
};

/** As 7 views do mock-api, cada uma com uma mini prévia animada; avança sozinho e aceita clique. */
export function ViewsDemo() {
  const [active, select] = useCycle(VIEWS.length, 3600);
  const v = VIEWS[active];
  const Preview = PREVIEWS[v.key];
  return (
    <div className="rounded-xl border border-line bg-surface/80 p-4 shadow-[var(--shadow)] backdrop-blur-sm">
      <div role="tablist" aria-label="Views" className="flex flex-wrap gap-1">
        {VIEWS.map((x, i) => (
          <button key={x.key} role="tab" aria-selected={i === active} onClick={() => select(i)} className={cx("relative inline-flex items-center gap-1.5 overflow-hidden rounded-md border px-2 py-1 font-mono text-[11px] transition-colors", i === active ? "border-line-strong bg-surface-3 text-fg" : "border-transparent text-fg-3 hover:text-fg")}>
            <x.icon className="size-3.5" />
            {x.label}
            {i === active && <span key={`bar-${active}`} className="absolute inset-x-0 bottom-0 h-px origin-left bg-fg" style={{ animation: "grow-x 3600ms linear both" }} />}
          </button>
        ))}
      </div>
      <div key={v.key} className="mt-3 min-h-[160px]">
        <Preview />
      </div>
      <div key={`cap-${v.key}`} className="anim-fade-in mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3">
        <code className="font-mono text-[11px] text-fg">{v.endpoint}</code>
        <span className="text-xs text-fg-3">{v.desc}</span>
      </div>
    </div>
  );
}
