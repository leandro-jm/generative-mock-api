import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { FeatureCollection } from "geojson";
import { get, post, type Chart, type Diagram, type ModuleDetail, type ModuleSummary, type Plan, type PlanAction, type ViewKey } from "../lib/api";
import { VIEW_LABEL } from "../lib/format";
import { useSession } from "../lib/session";
import { Button, Card, Code, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Tabs, useToast } from "../components/ui";
import { DataTable } from "../components/views/DataTable";
import { CardGrid } from "../components/views/CardGrid";
import { DynamicForm } from "../components/views/DynamicForm";
import { PlanReview } from "../components/views/PlanReview";
import { MapView } from "../components/views/MapView";
import { ChartView } from "../components/views/ChartView";
import { DiagramView } from "../components/views/DiagramView";

/** Mostra o endpoint usado (para copiar no front). */
function Endpoint({ url, method = "GET" }: { url: string; method?: string }) {
  return <p className="font-mono text-xs text-slate-500"><span className="font-semibold text-indigo-600">{method}</span> {url}</p>;
}

function ResourcePicker({ m, value, onChange, filter, order }: { m: ModuleDetail; value: string; onChange: (v: string) => void; filter?: (r: ModuleDetail["definition"]["resources"][0]) => boolean; order?: string[] }) {
  const list = m.definition.resources.filter(filter ?? (() => true));
  if (order) list.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  useEffect(() => {
    if (list.length && !list.some((r) => r.slug === value)) onChange(list[0].slug);
  }, [list, value, onChange]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-xs">
      {list.map((r) => <option key={r.slug} value={r.slug}>{r.labelPlural}</option>)}
    </Select>
  );
}

export function GalleryPage() {
  const [params, setParams] = useSearchParams();
  const modules = useQuery({ queryKey: ["modules"], queryFn: () => get<{ data: ModuleSummary[] }>("/admin-api/modules") });
  const enabled = modules.data?.data.filter((m) => m.enabled) ?? [];
  const slug = params.get("module") ?? enabled[0]?.slug ?? "";
  const view = (params.get("view") as ViewKey) ?? "table";
  const detail = useQuery({ queryKey: ["module", slug], queryFn: () => get<ModuleDetail>(`/admin-api/modules/${slug}`), enabled: Boolean(slug) });
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; });

  if (modules.isLoading) return <Loading />;
  if (!enabled.length) return <Empty title="Nenhum módulo ligado." />;
  const m = detail.data;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Galeria de views"
        description="Cada view consome um endpoint com formato fixo, igual para todo módulo (pronto ou gerado). Use como referência para o front."
        actions={
          <Select value={slug} onChange={(e) => set("module", e.target.value)} className="w-56">
            {enabled.map((x) => <option key={x.slug} value={x.slug}>{x.title}</option>)}
          </Select>
        }
      />
      <Tabs tabs={(Object.keys(VIEW_LABEL) as ViewKey[]).map((v) => ({ value: v, label: VIEW_LABEL[v], disabled: m ? !m.views[v] : false }))} value={view} onChange={(v) => set("view", v)} />
      {detail.isLoading || !m ? <Loading /> : (
        <Card className="p-4">
          {view === "table" && <TableTab m={m} />}
          {view === "card" && <CardTab m={m} />}
          {view === "form" && <FormTab m={m} />}
          {view === "plan" && <PlanTab m={m} />}
          {view === "map" && <MapTab m={m} />}
          {view === "chart" && <ChartTab m={m} />}
          {view === "diagram" && <DiagramTab m={m} />}
        </Card>
      )}
    </div>
  );
}

function TableTab({ m }: { m: ModuleDetail }) {
  const [r, setR] = useState("");
  return (
    <div className="space-y-3">
      <ResourcePicker m={m} value={r} onChange={setR} />
      {r && <><Endpoint url={`/api/v1/${m.slug}/${r}/_views/table?page=1&limit=15&q=&sort=`} /><DataTable key={r} module={m.slug} resource={r} /></>}
    </div>
  );
}

function CardTab({ m }: { m: ModuleDetail }) {
  // O recurso principal (com mais campos) primeiro: Filmes antes de Pessoas.
  const withImage = m.definition.resources.filter((x) => x.fields.some((f) => f.type === "image")).sort((a, b) => b.fields.length - a.fields.length);
  const [r, setR] = useState("");
  return (
    <div className="space-y-3">
      <ResourcePicker m={m} value={r} onChange={setR} filter={withImage.length ? (x) => withImage.includes(x) : undefined} order={withImage.map((x) => x.slug)} />
      {r && <><Endpoint url={`/api/v1/${m.slug}/${r}/_views/card?limit=12`} /><CardGrid key={r} module={m.slug} resource={r} /></>}
    </div>
  );
}

function FormTab({ m }: { m: ModuleDetail }) {
  const [r, setR] = useState("");
  const [n, setN] = useState(0);
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useSession();
  return (
    <div className="space-y-3">
      <ResourcePicker m={m} value={r} onChange={setR} />
      {r && (
        <>
          <Endpoint url={`/api/v1/${m.slug}/${r}/_views/form?mode=create`} />
          {user.role === "viewer" && <p className="text-sm text-amber-700">Seu papel (viewer) não permite salvar; o formulário é só para visualizar.</p>}
          <div className="max-w-3xl">
            <DynamicForm key={`${r}-${n}`} module={m.slug} resource={r} onSaved={(rec) => { toast(`Criado #${rec.id}.`); setN(n + 1); qc.invalidateQueries({ queryKey: ["table", m.slug] }); }} />
          </div>
        </>
      )}
    </div>
  );
}

function ParamInput({ name, schema, value, onChange }: { name: string; schema: Record<string, unknown>; value: unknown; onChange: (v: unknown) => void }) {
  const enumValues = schema.enum as string[] | undefined;
  const label = `${(schema.label as string) ?? name}${schema.description ? ` — ${schema.description}` : ""}`;
  if (enumValues) return <Field label={label}><Select value={String(value ?? schema.default ?? "")} onChange={(e) => onChange(e.target.value)}>{enumValues.map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>;
  if (schema.type === "number" || schema.type === "integer") return <Field label={label}><Input type="number" value={String(value ?? schema.default ?? "")} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></Field>;
  if (schema.type === "boolean") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-indigo-600" checked={Boolean(value ?? schema.default)} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
  return <Field label={label}><Input type={schema.format === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)} /></Field>;
}

function PlanTab({ m }: { m: ModuleDetail }) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [ids, setIds] = useState("1");
  const [filter, setFilter] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const action: PlanAction | undefined = m.planActions[idx];
  const props = useMemo(() => {
    if (!action?.params) return {};
    const p = action.params as { properties?: Record<string, Record<string, unknown>> };
    return p.properties ?? (action.params as Record<string, Record<string, unknown>>);
  }, [action]);

  const build = async () => {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const filterObj = Object.fromEntries(filter.split("\n").map((l) => l.split("=").map((s) => s.trim())).filter(([k, v]) => k && v));
      const body = { action: action.action, resource: action.resource, ...(Object.keys(filterObj).length ? { filter: filterObj } : { ids: ids.split(",").map((s) => Number(s.trim())).filter(Boolean) }), params: values };
      setPlan(await post<Plan>(`/api/v1/${m.slug}/plans`, body));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  if (!action) return <Empty title="Nenhuma ação disponível." />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <Field label="Ação">
          <Select value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setValues({}); setPlan(null); }}>
            {m.planActions.map((a, i) => <option key={`${a.action}-${a.resource}`} value={i}>{a.title}</option>)}
          </Select>
        </Field>
        <p className="text-sm text-slate-500">{action.description}</p>
        <Field label="IDs alvo" help="Separados por vírgula. Ignorado se houver filtro."><Input value={ids} onChange={(e) => setIds(e.target.value)} /></Field>
        <Field label="Filtro (opcional)" help="Um por linha, como na listagem: status=Ativo, preco[gte]=50">
          <textarea className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900" rows={3} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </Field>
        {Object.entries(props).map(([k, s]) => <ParamInput key={k} name={k} schema={s} value={values[k]} onChange={(v) => setValues((x) => ({ ...x, [k]: v }))} />)}
        <Button loading={busy} onClick={build}>Gerar plano</Button>
        <Endpoint method="POST" url={`/api/v1/${m.slug}/plans`} />
        <Code>{JSON.stringify({ action: action.action, resource: action.resource, ids: ids.split(",").map((s) => Number(s.trim())).filter(Boolean), params: values }, null, 2)}</Code>
      </div>
      <div>
        <ErrorBox error={error} />
        {plan ? <PlanReview key={plan.id} plan={plan} onCancel={() => setPlan(null)} onDone={() => qc.invalidateQueries({ queryKey: ["table", m.slug] })} /> : <Empty title="Gere um plano para ver o impacto.">Nada muda até você confirmar.</Empty>}
      </div>
    </div>
  );
}

function MapTab({ m }: { m: ModuleDetail }) {
  const [r, setR] = useState("");
  const url = `/api/v1/${m.slug}/${r}/_views/map`;
  const { data, error, isLoading } = useQuery({ queryKey: ["map", m.slug, r], queryFn: () => get<FeatureCollection & { bbox?: number[] }>(url), enabled: Boolean(r) });
  return (
    <div className="space-y-3">
      <ResourcePicker m={m} value={r} onChange={setR} filter={(x) => x.fields.some((f) => f.type.startsWith("geo_"))} />
      <Endpoint url={url} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : data && <MapView data={data} />}
    </div>
  );
}

function ChartTab({ m }: { m: ModuleDetail }) {
  const list = useQuery({ queryKey: ["charts", m.slug], queryFn: () => get<{ data: { name: string; title: string; url: string; description: string | null }[] }>(`/api/v1/${m.slug}/_views/charts`) });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {list.data?.data.map((c) => <ChartCard key={c.name} url={c.url} title={c.title} />)}
      {list.data?.data.length === 0 && <Empty title="Este módulo não tem gráficos." />}
    </div>
  );
}

function ChartCard({ url, title }: { url: string; title: string }) {
  const { data, error } = useQuery({ queryKey: ["chart", url], queryFn: () => get<Chart>(url) });
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="font-medium">{title}</p>
      <Endpoint url={url} />
      <ErrorBox error={error} />
      {data ? <div className="mt-3"><ChartView chart={data} height={260} /></div> : <Loading />}
    </div>
  );
}

function DiagramTab({ m }: { m: ModuleDetail }) {
  const list = useQuery({ queryKey: ["diagrams", m.slug], queryFn: () => get<{ data: { name: string; title: string; url: string; kind: string }[] }>(`/api/v1/${m.slug}/_views/diagrams`) });
  const [name, setName] = useState("");
  const current = list.data?.data.find((d) => d.name === name) ?? list.data?.data[0];
  const d = useQuery({ queryKey: ["diagram", current?.url], queryFn: () => get<Diagram>(current!.url), enabled: Boolean(current) });
  if (list.data?.data.length === 0) return <Empty title="Este módulo não tem diagramas." />;
  return (
    <div className="space-y-3">
      <Select value={current?.name ?? ""} onChange={(e) => setName(e.target.value)} className="max-w-xs">
        {list.data?.data.map((x) => <option key={x.name} value={x.name}>{x.title} ({x.kind})</option>)}
      </Select>
      {current && <Endpoint url={current.url} />}
      <ErrorBox error={d.error} />
      {d.isLoading ? <Loading /> : d.data && <><p className="text-sm text-slate-500">{d.data.description} {d.data.nodes.length} nós, {d.data.edges.length} arestas.</p><DiagramView diagram={d.data} /></>}
    </div>
  );
}
