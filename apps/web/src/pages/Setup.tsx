import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { Button, Card, ErrorBox, Field, Input } from "../components/ui";

export function SetupPage({ tokenRequired }: { tokenRequired: boolean }) {
  const [form, setForm] = useState({ appName: "Mock API", name: "", email: "", password: "", confirm: "", setupToken: "" });
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError(new Error("As senhas não conferem."));
    setSaving(true);
    setError(null);
    try {
      await post("/admin-api/setup", { appName: form.appName, name: form.name, email: form.email, password: form.password, ...(tokenRequired ? { setupToken: form.setupToken } : {}) });
      location.href = "/";
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <img src="/favicon.svg" alt="" className="mb-4 size-10" />
        <h1 className="text-xl font-semibold">Primeiro acesso</h1>
        <p className="mt-1 text-sm text-slate-500">Crie o usuário administrador. Depois você cadastra outras pessoas em Usuários.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <ErrorBox error={error} />
          <Field label="Nome do app"><Input value={form.appName} onChange={set("appName")} /></Field>
          <Field label="Seu nome" required><Input value={form.name} onChange={set("name")} required autoFocus /></Field>
          <Field label="E-mail" required><Input type="email" value={form.email} onChange={set("email")} required autoComplete="username" /></Field>
          <Field label="Senha" required help="Mínimo de 8 caracteres."><Input type="password" value={form.password} onChange={set("password")} minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Confirme a senha" required><Input type="password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" /></Field>
          {tokenRequired && <Field label="Token de setup" required help="Valor da variável SETUP_TOKEN do servidor."><Input value={form.setupToken} onChange={set("setupToken")} required /></Field>}
          <Button type="submit" loading={saving} className="w-full">Criar administrador</Button>
        </form>
      </Card>
    </div>
  );
}
