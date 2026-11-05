import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2Off, Pencil, Plus, Trash2 } from "lucide-react";
import { post, type Plan, type PlanImpact } from "../../lib/api";
import { Badge, Button, ErrorBox, Field, Input, type Tone } from "../ui";

const EFFECT: Record<PlanImpact["effect"], { label: string; tone: Tone; icon: typeof Trash2 }> = {
  delete: { label: "Excluir", tone: "rose", icon: Trash2 },
  update: { label: "Alterar", tone: "amber", icon: Pencil },
  unlink: { label: "Desvincular", tone: "sky", icon: Link2Off },
  create: { label: "Criar", tone: "green", icon: Plus },
};
const fmt = (v: unknown) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** View plan: mostra o impacto e pede confirmação (frase quando a ação é grave). */
export function PlanReview({ plan, onDone, onCancel }: { plan: Plan; onDone: (p: Plan) => void; onCancel: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(plan);

  const act = async (kind: "confirm" | "cancel") => {
    setBusy(true);
    setError(null);
    try {
      const res = await post<Plan>(kind === "confirm" ? state.confirmation.confirmUrl : state.confirmation.cancelUrl, kind === "confirm" ? { phrase } : {});
      setState(res);
      if (kind === "confirm") onDone(res);
      else onCancel();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const groups = state.impacts.reduce<Record<string, PlanImpact[]>>((acc, i) => ((acc[`${i.effect}:${i.resourceLabel}`] ??= []).push(i), acc), {});
  const done = state.status === "confirmed";
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 ${state.severity === "high" ? "border-danger-border bg-danger-dim" : "border-warning-border bg-warning-dim"}`}>
        <p className="flex items-center gap-2 font-medium">
          {done ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
          {state.title}
          <Badge tone={state.severity === "high" ? "rose" : state.severity === "medium" ? "amber" : "slate"}>{state.severity}</Badge>
          <Badge>{state.status}</Badge>
        </p>
        <p className="mt-1 text-sm">{state.summary}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(state.totals).filter(([, n]) => n > 0).map(([k, n]) => <Badge key={k} tone={EFFECT[k as PlanImpact["effect"]].tone}>{EFFECT[k as PlanImpact["effect"]].label}: {n}</Badge>)}
      </div>
      {state.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warning-dim p-3 text-sm text-warning">
          {state.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {Object.entries(groups).map(([key, items]) => {
          const e = EFFECT[items[0].effect];
          return (
            <div key={key}>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg-3 uppercase"><e.icon className="size-3.5" /> {e.label} · {items[0].resourceLabel} ({items.length})</p>
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {items.slice(0, 50).map((i, k) => (
                  <li key={k} className="px-3 py-1.5">
                    <span className="font-medium">{i.label}</span>
                    {i.id !== null && <span className="text-fg-3"> #{i.id}</span>}
                    {i.reason && <span className="block text-xs text-fg-3">{i.reason}</span>}
                    {i.diff && (
                      <span className="block text-xs">
                        {Object.entries(i.diff).map(([f, d]) => <span key={f} className="mr-3"><b>{f}</b>: <s className="text-fg-3">{fmt(d.before)}</s> → {fmt(d.after)}</span>)}
                      </span>
                    )}
                  </li>
                ))}
                {items.length > 50 && <li className="px-3 py-1.5 text-xs text-fg-3">… e mais {items.length - 50}</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <ErrorBox error={error} />
      {done ? (
        <p className="text-sm text-success">Executado: {state.result?.deleted ?? 0} excluído(s), {state.result?.updated ?? 0} alterado(s), {state.result?.created.length ?? 0} criado(s).</p>
      ) : state.status === "pending" ? (
        <div className="space-y-3 border-t border-line pt-3">
          {state.confirmation.phrase && (
            <Field label={`Digite "${state.confirmation.phrase}" para confirmar`}>
              <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={state.confirmation.phrase} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" loading={busy} onClick={() => act("cancel")}>Cancelar plano</Button>
            <Button variant="danger" loading={busy} disabled={Boolean(state.confirmation.phrase) && phrase.trim().toUpperCase() !== state.confirmation.phrase} onClick={() => act("confirm")}>Confirmar e executar</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-2">Plano {state.status}. {state.status === "blocked" && "Resolva os bloqueios e gere outro plano."}</p>
      )}
    </div>
  );
}
