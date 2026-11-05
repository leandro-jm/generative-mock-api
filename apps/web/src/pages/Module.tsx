import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Download, FileJson, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { del, get, post, put, type ModuleDetail, type Plan } from "../lib/api";
import { number, SOURCE_LABEL } from "../lib/format";
import { useSession } from "../lib/session";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Tabs, Textarea, useToast } from "../components/ui";
import { DataTable } from "../components/views/DataTable";
import { DynamicForm } from "../components/views/DynamicForm";
import { PlanReview } from "../components/views/PlanReview";
import { ViewBadges } from "./Modules";

export function ModulePage() {
  const { slug = "" } = useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: m, error, isLoading } = useQuery({ queryKey: ["module", slug], queryFn: () => get<ModuleDetail>(`/admin-api/modules/${slug}`) });
  const [resource, setResource] = useState<string>("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<unknown>(null);
  const [defOpen, setDefOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = user.role !== "viewer";

  if (isLoading) return <Loading />;
  if (error || !m) return <ErrorBox error={error} />;
  const current = resource || m.resources[0]?.slug;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["table", slug] }), qc.invalidateQueries({ queryKey: ["module", slug] }), qc.invalidateQueries({ queryKey: ["modules"] })]);

  const askDelete = async (id: number) => {
    setPlanError(null);
    try {
      setPlan(await post<Plan>(`/api/v1/${slug}/plans`, { action: "delete", resource: current, ids: [id] }));
    } catch (e) {
      setPlanError(e);
    }
  };
  const reset = async () => {
    if (!confirm(`Voltar "${m.title}" aos dados da semente? Alterações feitas nos dados serão perdidas.`)) return;
    setBusy(true);
    try {
      await post(`/admin-api/modules/${slug}/reset`);
      await refresh();
      toast("Dados restaurados.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Excluir o módulo "${m.title}" e todos os dados?`)) return;
    await del(`/admin-api/modules/${slug}`);
    await qc.invalidateQueries({ queryKey: ["modules"] });
    toast("Módulo excluído.");
    navigate("/modulos");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <>
            <a href={`/openapi/${slug}.json`} download={`${slug}.openapi.json`}><Button variant="secondary"><Download className="size-4" /> Spec</Button></a>
            {m.source !== "builtin" && canEdit && <Button variant="secondary" onClick={() => setDefOpen(true)}><FileJson className="size-4" /> Definição</Button>}
            {m.source !== "builtin" && canEdit && <Button variant="secondary" onClick={() => setMoreOpen(true)}><Sparkles className="size-4" /> Gerar mais dados</Button>}
            {user.role === "admin" && <Button variant="secondary" loading={busy} onClick={reset}><RotateCcw className="size-4" /> Resetar dados</Button>}
            {m.source !== "builtin" && canEdit && <Button variant="danger" onClick={remove}><Trash2 className="size-4" /> Excluir</Button>}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={m.source === "builtin" ? "accent" : "amber"}>{SOURCE_LABEL[m.source]}</Badge>
        {!m.enabled && <Badge tone="rose">Desligado</Badge>}
        <ViewBadges views={m.views} />
        <Link to={`/views?module=${slug}`} className="text-sm text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">Abrir na galeria de views →</Link>
      </div>
      {m.prompt && <p className="text-sm text-fg-2"><b>Prompt:</b> {m.prompt}</p>}

      <Card className="p-4">
        <Tabs tabs={m.resources.map((r) => ({ value: r.slug, label: <>{r.labelPlural} <span className="text-xs text-fg-3">{number(r.count)}</span></> }))} value={current} onChange={setResource} />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="text-xs text-fg-3">GET /api/v1/{slug}/{current}</code>
            {canEdit && <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> Novo</Button>}
          </div>
          <ErrorBox error={planError} />
          {m.enabled ? <DataTable key={current} module={slug} resource={current} onEdit={canEdit ? setEditing : undefined} onDelete={canEdit ? askDelete : undefined} /> : <p className="text-sm text-fg-2">Ligue o módulo para ver e editar os dados.</p>}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Endpoints principais</h2>
        <div className="mt-3 grid gap-x-6 gap-y-1 font-mono text-xs text-fg-2 md:grid-cols-2">
          {m.resources.map((r) => <span key={r.slug}>GET|POST /api/v1/{slug}/{r.slug} · GET|PUT|PATCH|DELETE …/{"{id}"}</span>)}
          <span>GET /api/v1/{slug}/{"{recurso}"}/_views/{"{table|card|form|map|chart}"}</span>
          <span>GET /api/v1/{slug}/_views/charts · /_views/diagrams</span>
          <span>POST /api/v1/{slug}/plans → POST …/plans/{"{id}"}/confirm</span>
        </div>
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo registro" : `Editar #${editing}`} wide>
        {editing !== null && <DynamicForm module={slug} resource={current} id={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); toast("Salvo."); }} />}
      </Modal>
      <Modal open={plan !== null} onClose={() => setPlan(null)} title="Confirmar exclusão" wide>
        {plan && <PlanReview plan={plan} onCancel={() => setPlan(null)} onDone={async () => { await refresh(); toast("Exclusão executada."); }} />}
      </Modal>
      {defOpen && <DefinitionModal m={m} onClose={() => setDefOpen(false)} onSaved={refresh} />}
      {moreOpen && <MoreDataModal m={m} onClose={() => setMoreOpen(false)} onSaved={refresh} />}
    </div>
  );
}

function DefinitionModal({ m, onClose, onSaved }: { m: ModuleDetail; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [text, setText] = useState(JSON.stringify(m.definition, null, 2));
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await put(`/admin-api/modules/${m.slug}/definition`, { definition: JSON.parse(text), counts: (m.aiMeta?.counts as number | Record<string, number>) ?? undefined, replaceData: replace, source: m.source === "ai" ? "ai" : "manual" });
      await onSaved();
      toast("Definição salva.");
      onClose();
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error(`JSON inválido: ${e.message}`) : e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Definição do módulo (JSON)" wide footer={<><label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[var(--accent)]" /> Regerar os dados</label><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <ErrorBox error={error} />
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[55vh] font-mono text-xs" spellCheck={false} />
      </div>
    </Modal>
  );
}

function MoreDataModal({ m, onClose, onSaved }: { m: ModuleDetail; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [resource, setResource] = useState(m.resources[0].slug);
  const [count, setCount] = useState(20);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const save = async () => {
    setSaving(true);
    try {
      await post(`/admin-api/modules/${m.slug}/generate`, { resource, count });
      await onSaved();
      toast(`${count} registros gerados.`);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Gerar mais dados" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Gerar</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Recurso">
          <select className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm" value={resource} onChange={(e) => setResource(e.target.value)}>
            {m.resources.map((r) => <option key={r.slug} value={r.slug}>{r.labelPlural}</option>)}
          </select>
        </Field>
        <Field label="Quantidade"><Input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}
