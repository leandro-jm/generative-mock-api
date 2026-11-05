import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Sparkles, Wand2 } from "lucide-react";
import { get, post, type ModuleDef, type ViewKey } from "../lib/api";
import { VIEW_LABEL } from "../lib/format";
import { useSession } from "../lib/session";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Tabs, Textarea, useToast } from "../components/ui";
import { ViewBadges } from "./Modules";

interface Turn { role: "user" | "assistant"; content: string }
interface GenOut {
  definition: ModuleDef;
  counts: Record<string, number>;
  coverage: Record<ViewKey, boolean>;
  preview: Record<string, Record<string, unknown>[]>;
  history: Turn[];
  model: string;
  provider: string;
  usage: { inputTokens: number; outputTokens: number };
  repaired: boolean;
}

const EXAMPLES = [
  "Clínica veterinária com tutores, pets (com foto), consultas, vacinas e unidades no mapa",
  "Frota de entregas: veículos, motoristas, rotas no mapa, entregas e ocorrências",
  "Imobiliária: imóveis com foto e localização, corretores, visitas e propostas",
  "Escola: turmas, alunos, professores, notas por bimestre e hierarquia de coordenação",
  "E-commerce de café: produtos com imagem, categorias em árvore, pedidos e lojas físicas",
];

export function AiPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => get<{ provider: string; configured: boolean; model: string }>("/admin-api/ai/status") });
  const [prompt, setPrompt] = useState("");
  const [refine, setRefine] = useState("");
  const [out, setOut] = useState<GenOut | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [defText, setDefText] = useState("");
  const [tab, setTab] = useState("resumo");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [firstPrompt, setFirstPrompt] = useState("");

  const run = async (text: string, history?: Turn[]) => {
    setBusy("gen");
    setError(null);
    try {
      const res = await post<GenOut>("/admin-api/ai/generate", { prompt: text, history });
      setOut(res);
      setCounts(res.counts);
      setDefText(JSON.stringify(res.definition, null, 2));
      setRefine("");
      if (!history) setFirstPrompt(text);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const missing = out ? (Object.keys(VIEW_LABEL) as ViewKey[]).filter((v) => !out.coverage[v]) : [];

  const save = async () => {
    if (!out) return;
    setBusy("save");
    setError(null);
    try {
      const definition = JSON.parse(defText);
      const res = await post<{ slug: string }>("/admin-api/modules", { definition, counts, prompt: firstPrompt, source: "ai", aiMeta: { model: out.model, provider: out.provider, usage: out.usage } });
      await qc.invalidateQueries({ queryKey: ["modules"] });
      toast("Módulo criado: os endpoints já estão no ar.");
      navigate(`/modulos/${res.slug}`);
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error(`JSON inválido: ${e.message}`) : e);
    } finally {
      setBusy(null);
    }
  };

  if (user.role === "viewer") return <Empty title="Seu papel (viewer) não permite criar módulos." />;
  return (
    <div className="space-y-6">
      <PageHeader title="Gerar com IA" description="Descreva o domínio; a IA desenha os recursos, campos, gráficos, diagramas e ações. O servidor gera os dados localmente e publica CRUD, views e OpenAPI." />
      {status.data && !status.data.configured && (
        <div className="rounded-lg border border-warning-border bg-warning-dim p-3 text-sm text-warning">
          Provedor de IA não configurado. {user.role === "admin" ? <Link to="/configuracoes" className="font-medium underline">Configure em Configurações → IA generativa.</Link> : "Peça para um admin configurar."}
        </div>
      )}
      <Card className="space-y-3 p-5">
        <Field label="O que você precisa?" help={status.data?.configured ? `Provedor: ${status.data.provider} · ${status.data.model}` : undefined}>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Ex.: API de academia com alunos, planos, check-ins por unidade (no mapa) e avaliações físicas" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full border border-line px-3 py-1 text-xs text-fg-2 hover:border-line-strong hover:text-fg">{ex}</button>)}
        </div>
        <Button loading={busy === "gen" && !out} disabled={prompt.trim().length < 3 || busy !== null} onClick={() => run(prompt)}><Sparkles className="size-4" /> Gerar prévia</Button>
        {busy === "gen" && <p className="text-xs text-fg-3">Gerando… pode levar de alguns segundos a alguns minutos, conforme o modelo.</p>}
      </Card>
      <ErrorBox error={error} />

      {out && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{out.definition.title}</h2>
              <p className="font-mono text-xs text-fg-3">/api/v1/{out.definition.slug}</p>
              <p className="mt-1 max-w-2xl text-sm text-fg-2">{out.definition.description}</p>
            </div>
            <div className="text-right text-xs text-fg-3">
              <p>{out.model} · {out.usage.inputTokens + out.usage.outputTokens} tokens</p>
              {out.repaired && <Badge tone="amber">corrigido automaticamente</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewBadges views={out.coverage} />
            {missing.length > 0 && <Button size="sm" variant="secondary" loading={busy === "gen"} onClick={() => run(`Cubra também as views: ${missing.map((v) => VIEW_LABEL[v]).join(", ")}.`, out.history)}><Wand2 className="size-3.5" /> Pedir à IA para cobrir {missing.map((v) => VIEW_LABEL[v]).join(", ")}</Button>}
          </div>

          <Tabs tabs={[{ value: "resumo", label: "Recursos" }, { value: "dados", label: "Amostra de dados" }, { value: "json", label: "Definição (JSON)" }]} value={tab} onChange={setTab} />
          {tab === "resumo" && (
            <div className="grid gap-4 md:grid-cols-2">
              {out.definition.resources.map((r) => (
                <div key={r.slug} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.labelPlural} <span className="font-mono text-xs text-fg-3">/{r.slug}</span></p>
                    <label className="flex items-center gap-1 text-xs text-fg-3">registros <Input type="number" min={0} className="h-7 w-20 py-0 text-xs" value={counts[r.slug] ?? 0} onChange={(e) => setCounts({ ...counts, [r.slug]: Number(e.target.value) })} /></label>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {r.fields.map((f) => (
                      <li key={f.name}><span className="font-mono">{f.name}</span> <span className="text-fg-3">{f.type}{f.ref ? ` → ${f.ref}` : ""}{f.format ? ` (${f.format})` : ""}</span>{f.required && <span className="text-danger"> *</span>}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-lg border border-line p-3 text-xs">
                <p className="mb-1 font-medium">Gráficos</p>
                {out.definition.charts?.map((c) => <p key={c.name}>{c.title}</p>) ?? "—"}
                <p className="mt-2 mb-1 font-medium">Diagramas</p>
                {out.definition.diagrams?.map((d) => <p key={d.name}>{d.title} ({d.kind})</p>) ?? "—"}
              </div>
            </div>
          )}
          {tab === "dados" && (
            <div className="space-y-4">
              {Object.entries(out.preview).map(([r, rows]) => (
                <div key={r}>
                  <p className="mb-1 text-sm font-medium">{r}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-code p-3 font-mono text-xs text-fg">{JSON.stringify(rows.slice(0, 2), null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
          {tab === "json" && <Textarea value={defText} onChange={(e) => setDefText(e.target.value)} className="min-h-[50vh] font-mono text-xs" spellCheck={false} />}

          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <Field label="Refinar" className="min-w-64 flex-1"><Input value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="Ex.: troque consultas por agendamentos e adicione forma de pagamento" /></Field>
            <Button variant="secondary" disabled={!refine.trim() || busy !== null} loading={busy === "gen"} onClick={() => run(refine, out.history)}>Refinar</Button>
            <Button loading={busy === "save"} disabled={busy !== null} onClick={save}>Salvar e publicar</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
