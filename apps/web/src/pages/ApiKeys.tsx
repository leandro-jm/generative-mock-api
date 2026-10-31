import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { del, get, post, type ApiKey, type ModuleSummary } from "../lib/api";
import { dateTime } from "../lib/format";
import { useSession } from "../lib/session";
import { Badge, Button, Card, Code, CopyButton, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Switch, useToast } from "../components/ui";

export function ApiKeysPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["api-keys", all], queryFn: () => get<{ data: ApiKey[] }>(`/admin-api/api-keys${all ? "?all=1" : ""}`) });

  const revoke = async (k: ApiKey) => {
    if (!confirm(`Revogar a chave "${k.name}"? Quem usa vai receber 401.`)) return;
    await post(`/admin-api/api-keys/${k.id}/revoke`);
    await qc.invalidateQueries({ queryKey: ["api-keys"] });
    toast("Chave revogada.");
  };
  const remove = async (k: ApiKey) => {
    if (!confirm(`Excluir a chave "${k.name}"?`)) return;
    await del(`/admin-api/api-keys/${k.id}`);
    await qc.invalidateQueries({ queryKey: ["api-keys"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="API Keys"
        description="Chaves para consumir as APIs mockadas (header X-API-Key ou Bearer). O segredo aparece só uma vez."
        actions={<>{user.role === "admin" && <label className="flex items-center gap-2 text-sm"><Switch checked={all} onChange={setAll} /> Todas</label>}<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova chave</Button></>}
      />
      {keys.isLoading ? <Loading /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase dark:bg-slate-900">
              <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">Prefixo</th><th className="px-4 py-2">Scopes</th>{all && <th className="px-4 py-2">Dono</th>}<th className="px-4 py-2">Último uso</th><th className="px-4 py-2">Expira</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {keys.data?.data.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2 font-medium">{k.name} {k.revoked_at && <Badge tone="rose">revogada</Badge>}</td>
                  <td className="px-4 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-4 py-2"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} tone="indigo">{s}</Badge>)}</div></td>
                  {all && <td className="px-4 py-2">{k.user_name}</td>}
                  <td className="px-4 py-2 text-slate-500">{k.last_used_at ? dateTime(k.last_used_at) : "nunca"}</td>
                  <td className="px-4 py-2 text-slate-500">{k.expires_at ? dateTime(k.expires_at) : "não expira"}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(k)}>Revogar</Button>}
                    <Button size="sm" variant="ghost" onClick={() => remove(k)}>Excluir</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.data?.data.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhuma chave ainda.</p>}
        </Card>
      )}
      {open && <NewKeyModal onClose={() => setOpen(false)} onCreated={async (s) => { setOpen(false); setSecret(s); await qc.invalidateQueries({ queryKey: ["api-keys"] }); }} />}
      <Modal open={secret !== null} onClose={() => setSecret(null)} title="Chave criada" footer={<Button onClick={() => setSecret(null)}>Já copiei</Button>}>
        <div className="space-y-3">
          <p className="text-sm">Copie agora: o segredo não será mostrado de novo.</p>
          <div className="flex items-center gap-2"><code className="flex-1 rounded bg-slate-100 p-2 font-mono text-xs break-all dark:bg-slate-800">{secret}</code><CopyButton text={secret ?? ""} /></div>
          <Code>{`curl -H "X-API-Key: ${secret}" ${location.origin}/api/v1/filmes/filmes?limit=3`}</Code>
        </div>
      </Modal>
    </div>
  );
}

function NewKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const { user } = useSession();
  const modules = useQuery({ queryKey: ["modules"], queryFn: () => get<{ data: ModuleSummary[] }>("/admin-api/modules") });
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(user.role === "viewer" ? "*:read" : "*");
  const [custom, setCustom] = useState<string[]>([]);
  const [days, setDays] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const scopes = preset === "custom" ? custom : [preset];

  const toggle = (s: string) => setCustom((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await post<{ secret: string }>("/admin-api/api-keys", { name, scopes, expiresInDays: days ? Number(days) : null });
      onCreated(res.secret);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Nova API key" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} disabled={!name || !scopes.length} onClick={save}>Criar</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Nome" help="Para lembrar onde a chave é usada."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="App mobile – homologação" autoFocus /></Field>
        <Field label="Permissões">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {user.role !== "viewer" && <option value="*">Tudo (ler e escrever em todos os módulos)</option>}
            <option value="*:read">Só leitura em todos os módulos</option>
            <option value="custom">Escolher por módulo</option>
          </Select>
        </Field>
        {preset === "custom" && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {modules.data?.data.map((m) => (
              <div key={m.slug} className="flex items-center justify-between text-sm">
                <span>{m.title}</span>
                <span className="flex gap-3">
                  {(["read", "write"] as const).filter((x) => user.role !== "viewer" || x === "read").map((mode) => (
                    <label key={mode} className="flex items-center gap-1"><input type="checkbox" className="accent-indigo-600" checked={custom.includes(`${m.slug}:${mode}`)} onChange={() => toggle(`${m.slug}:${mode}`)} />{mode === "read" ? "ler" : "escrever"}</label>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
        <Field label="Expira em (dias)" help="Vazio: não expira."><Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
