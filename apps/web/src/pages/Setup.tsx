import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { Button, ErrorBox, Field, Input, Logo, ThemeSelector } from "../components/ui";

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
    <div className="relative flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="absolute top-3 right-3">
        <ThemeSelector />
      </div>
      <div className="anim-fade-up relative w-full max-w-md rounded-[10px] border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-6 text-fg" /> Mock API
          </span>
          <span className="text-sm font-medium text-fg-2">Primeiro acesso</span>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <p className="text-sm text-fg-2">Crie o usuário administrador. Depois você cadastra outras pessoas em Usuários.</p>
          <ErrorBox error={error} />
          <Field label="Nome do app"><Input value={form.appName} onChange={set("appName")} /></Field>
          <Field label="Seu nome" required><Input value={form.name} onChange={set("name")} required autoFocus /></Field>
          <Field label="E-mail" required><Input type="email" value={form.email} onChange={set("email")} required autoComplete="username" /></Field>
          <Field label="Senha" required help="Mínimo de 8 caracteres."><Input type="password" value={form.password} onChange={set("password")} minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Confirme a senha" required><Input type="password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" /></Field>
          {tokenRequired && <Field label="Token de setup" required help="Valor da variável SETUP_TOKEN do servidor."><Input value={form.setupToken} onChange={set("setupToken")} required /></Field>}
          <Button type="submit" loading={saving} className="w-full">Criar administrador</Button>
        </form>
      </div>
    </div>
  );
}
