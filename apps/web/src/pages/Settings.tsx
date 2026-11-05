import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw } from "lucide-react";
import { del, get, post, put, type SettingView } from "../lib/api";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Switch, Textarea, useToast } from "../components/ui";

interface SettingsResponse {
  groups: { id: string; label: string; description: string }[];
  settings: SettingView[];
  boot: { port: number; dataDir: string; trustProxy: number; appSecret: string; setupToken: boolean; production: boolean };
}

const SOURCE = { ui: { label: "tela", tone: "accent" as const }, env: { label: "env", tone: "amber" as const }, default: { label: "padrão", tone: "slate" as const } };

function SettingInput({ s, value, onChange }: { s: SettingView; value: unknown; onChange: (v: unknown) => void }) {
  switch (s.type) {
    case "boolean":
      return <div><Switch checked={Boolean(value)} onChange={onChange} label={s.label} /></div>;
    case "number":
      return <Input type="number" step="any" value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
    case "select":
      return <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>{s.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
    case "secret":
      return <Input type="password" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={s.isSet ? "•••••••• (definida; digite para trocar)" : "não definida"} autoComplete="off" />;
    case "json":
      return <Textarea className="font-mono text-xs" value={typeof value === "string" ? value : JSON.stringify(value, null, 2)} onChange={(e) => onChange(e.target.value)} rows={6} />;
    case "text":
      return <Textarea value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={s.placeholder} />;
  }
}

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => get<SettingsResponse>("/admin-api/settings") });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<unknown>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.settings.map((s) => [s.key, s.type === "secret" ? "" : s.value])));
  }, [data]);

  if (isLoading || !data) return <Loading />;

  const saveGroup = async (group: string) => {
    setSaving(group);
    setErrors(null);
    try {
      const values: Record<string, unknown> = {};
      for (const s of data.settings.filter((x) => x.group === group)) {
        let v = draft[s.key];
        if (s.type === "secret" && v === "") continue; // segredo vazio: mantém
        if (s.type === "json" && typeof v === "string") v = JSON.parse(v);
        if (JSON.stringify(v) !== JSON.stringify(s.value) || s.type === "secret") values[s.key] = v;
      }
      if (!Object.keys(values).length) return toast("Nada mudou.");
      await put("/admin-api/settings", { values });
      await qc.invalidateQueries();
      toast("Configurações salvas. Já estão valendo.");
    } catch (e) {
      setErrors(e instanceof SyntaxError ? new Error(`JSON inválido: ${e.message}`) : e);
    } finally {
      setSaving(null);
    }
  };
  const reset = async (s: SettingView) => {
    await del(`/admin-api/settings/${s.key}`);
    await qc.invalidateQueries({ queryKey: ["settings"] });
    toast(`${s.label}: voltou ao valor ${s.env ? "da env ou padrão" : "padrão"}.`);
  };
  const testAi = async () => {
    setTesting(true);
    try {
      const r = await post<{ message: string }>("/admin-api/ai/test");
      toast(`Conexão ok: ${r.message}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Tudo o que antes seria variável de ambiente fica aqui e vale na hora. Precedência: valor salvo na tela > variável de ambiente > padrão."
        actions={<a href="/admin-api/settings/export" download><Button variant="secondary"><Download className="size-4" /> Exportar .env</Button></a>}
      />
      <ErrorBox error={errors} />
      {data.groups.map((g) => {
        const items = data.settings.filter((s) => s.group === g.id);
        return (
          <Card key={g.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{g.label}</h2>
                <p className="text-sm text-fg-2">{g.description}</p>
              </div>
              <div className="flex gap-2">
                {g.id === "ai" && <Button variant="secondary" loading={testing} onClick={testAi}>Testar conexão</Button>}
                <Button loading={saving === g.id} onClick={() => saveGroup(g.id)}>Salvar</Button>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {items.map((s) => (
                <div key={s.key} className={s.type === "json" ? "md:col-span-2" : ""}>
                  <Field
                    label={s.label}
                    help={
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={SOURCE[s.source].tone}>{SOURCE[s.source].label}</Badge>
                        {s.env && <code className="text-[11px]">{s.env}</code>}
                        <span>{s.description}</span>
                        {s.source === "ui" && <button type="button" className="inline-flex items-center gap-0.5 text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg" onClick={() => reset(s)}><RotateCcw className="size-3" /> restaurar</button>}
                      </span>
                    }
                  >
                    <SettingInput s={s} value={draft[s.key]} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} />
                  </Field>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      <Card className="p-5">
        <h2 className="font-semibold">Só por variável de ambiente</h2>
        <p className="text-sm text-fg-2">Precisam existir antes de o app subir. No Dokploy, ficam na aba Environment.</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-mono text-xs text-fg-3">APP_SECRET</dt><dd>{data.boot.appSecret}</dd></div>
          <div><dt className="font-mono text-xs text-fg-3">PORT</dt><dd>{data.boot.port}</dd></div>
          <div><dt className="font-mono text-xs text-fg-3">DATA_DIR</dt><dd className="break-all">{data.boot.dataDir}</dd></div>
          <div><dt className="font-mono text-xs text-fg-3">TRUST_PROXY</dt><dd>{data.boot.trustProxy}</dd></div>
          <div><dt className="font-mono text-xs text-fg-3">SETUP_TOKEN</dt><dd>{data.boot.setupToken ? "definido" : "não definido"}</dd></div>
          <div><dt className="font-mono text-xs text-fg-3">NODE_ENV</dt><dd>{data.boot.production ? "production" : "development"}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
