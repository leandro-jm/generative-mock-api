import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { Button, Card, ErrorBox, Field, Input } from "../components/ui";

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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <img src="/favicon.svg" alt="" className="mb-4 size-10" />
        <h1 className="text-xl font-semibold">{appName}</h1>
        <p className="mt-1 text-sm text-slate-500">Entre para gerenciar as APIs mockadas.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <ErrorBox error={error} />
          <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></Field>
          <Field label="Senha"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
          <Button type="submit" loading={saving} className="w-full">Entrar</Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          <a href="/docs" className="text-indigo-600 hover:underline">Documentação da API</a>
        </p>
      </Card>
    </div>
  );
}
