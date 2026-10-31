import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { del, get, patch, post, type Role, type User } from "../lib/api";
import { dateTime } from "../lib/format";
import { useSession } from "../lib/session";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Switch, useToast } from "../components/ui";

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "admin", label: "Admin", help: "Tudo, inclusive usuários e configurações." },
  { value: "editor", label: "Editor", help: "Cria e edita módulos, dados e chaves próprias." },
  { value: "viewer", label: "Viewer", help: "Só leitura e documentação." },
];

export function UsersPage() {
  const { user: me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => get<{ data: User[] }>("/admin-api/users") });
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [error, setError] = useState<unknown>(null);

  const update = async (u: User, body: Partial<User>) => {
    setError(null);
    try {
      await patch(`/admin-api/users/${u.id}`, body);
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setError(e);
    }
  };
  const remove = async (u: User) => {
    if (!confirm(`Excluir ${u.name}? As API keys dela também serão apagadas.`)) return;
    setError(null);
    try {
      await del(`/admin-api/users/${u.id}`);
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast("Usuário excluído.");
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Usuários" description="Quem acessa o painel. Cada usuário cria as próprias API keys." actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Novo usuário</Button>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase dark:bg-slate-900"><tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">E-mail</th><th className="px-4 py-2">Papel</th><th className="px-4 py-2">Ativo</th><th className="px-4 py-2">Criado em</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.data.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.name} {u.id === me.id && <Badge>você</Badge>}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <Select value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value as Role })} className="h-8 w-32 py-0">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </td>
                  <td className="px-4 py-2"><Switch checked={u.active} disabled={u.id === me.id} onChange={(v) => update(u, { active: v })} /></td>
                  <td className="px-4 py-2 text-slate-500">{dateTime(u.created_at)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Editar</Button>
                    {u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => remove(u)}>Excluir</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {editing && <UserModal user={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await qc.invalidateQueries({ queryKey: ["users"] }); toast("Usuário salvo."); }} />}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user?.name ?? "", email: user?.email ?? "", password: "", role: user?.role ?? ("editor" as Role) });
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (user) await patch(`/admin-api/users/${user.id}`, { name: form.name, ...(form.password ? { password: form.password } : {}) });
      else await post("/admin-api/users", form);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={user ? `Editar ${user.name}` : "Novo usuário"} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {!user && <Field label="E-mail" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
        <Field label={user ? "Nova senha" : "Senha"} required={!user} help={user ? "Vazio mantém a atual. Trocar encerra as sessões dela." : "Mínimo de 8 caracteres."}><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
        {!user && (
          <Field label="Papel" help={ROLES.find((r) => r.value === form.role)?.help}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
