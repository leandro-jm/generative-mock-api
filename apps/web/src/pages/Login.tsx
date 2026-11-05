import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { Button, ErrorBox, Field, Input, Logo, ThemeSelector } from "../components/ui";
import { LoginShowcase } from "../components/landing/Showcase";

const LINK = "text-fg-2 underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-fg";

export function LoginPage({ appName }: { appName: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await post("/admin-api/login", { email, password });
      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,1fr)_440px]">
      <LoginShowcase appName={appName} />

      {/* No celular o formulário vem primeiro; no desktop fica fixo à direita. */}
      <aside className="order-first border-b border-line bg-side lg:order-none lg:border-b-0 lg:border-l">
        <div className="flex flex-col lg:sticky lg:top-0 lg:h-screen">
          <div className="flex justify-end p-3">
            <ThemeSelector />
          </div>
          <div className="flex flex-1 items-center justify-center px-6 pb-10 lg:pb-16">
            <form onSubmit={submit} className="anim-fade-up w-full max-w-sm rounded-[10px] border border-line bg-surface shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <span className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
                  <Logo className="size-6 shrink-0 text-fg" />
                  <span className="truncate">{appName}</span>
                </span>
                <span className="text-sm font-medium text-fg-2">Entrar</span>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-sm text-fg-2">Entre para gerenciar as APIs mockadas.</p>
                <ErrorBox error={error} />
                <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></Field>
                <Field label="Senha"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
                <Button type="submit" loading={saving} disabled={!email || !password} className="w-full">{saving ? "Entrando…" : "Entrar"}</Button>
              </div>
            </form>
          </div>
          <p className="flex justify-center gap-4 border-t border-line px-6 py-4 text-xs text-fg-3">
            <a href="/docs" className={LINK}>Documentação da API</a>
            <a href="/openapi.json" className={LINK}>openapi.json</a>
          </p>
        </div>
      </aside>
    </div>
  );
}
