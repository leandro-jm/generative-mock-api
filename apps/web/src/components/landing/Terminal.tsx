import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../ui";
import { useReducedMotion } from "./hooks";

type Example = { label: string; cmd: string; status: string; ms: number; body: string };

// Endpoints reais do mock-api (veja o README); os valores são ilustrativos.
const EXAMPLES: Example[] = [
  {
    label: "Listagem",
    cmd: 'curl -H "X-API-Key: mk_…" \\\n  "/api/v1/filmes/filmes?limit=2&sort=-ano"',
    status: "200 OK",
    ms: 38,
    body: `{
  "data": [
    { "id": 42, "titulo": "O Farol de Areia", "ano": 2025, "nota": 4.7 },
    { "id": 17, "titulo": "Noite em Paraty", "ano": 2024, "nota": 4.1 }
  ],
  "meta": { "page": 1, "limit": 2, "total": 120, "totalPages": 60 }
}`,
  },
  {
    label: "View card",
    cmd: 'curl -H "X-API-Key: mk_…" \\\n  "/api/v1/rh/colaboradores/_views/card?id=7"',
    status: "200 OK",
    ms: 24,
    body: `{
  "title": "Ana Ribeiro",
  "subtitle": "Analista de RH",
  "badges": ["Ativo", "CLT"],
  "fields": [
    { "label": "CPF", "value": "123.456.789-09" },
    { "label": "Admissão", "value": "2021-03-15" }
  ]
}`,
  },
  {
    label: "Plan",
    cmd: `curl -X POST "/api/v1/rh/plans" \\\n  -d '{"action":"desligar-colaborador","ids":[7]}'`,
    status: "201 Created",
    ms: 61,
    body: `{
  "title": "Desligar colaborador",
  "severity": "high",
  "status": "pending",
  "totals": { "delete": 3, "update": 2, "create": 1 },
  "confirmation": {
    "phrase": "CONFIRMAR",
    "confirmUrl": "/api/v1/rh/plans/pl_8f2c/confirm"
  }
}`,
  },
];

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g;

/** Realce de sintaxe mínimo para JSON (chaves, strings, números). */
function highlight(line: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1] && m[2]) out.push(<span key={m.index} className="text-fg">{m[1]}</span>, m[2]);
    else if (m[1]) out.push(<span key={m.index} className="text-success">{m[1]}</span>);
    else out.push(<span key={m.index} className="text-sky">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(line.slice(last));
  return out;
}

type Phase = "type" | "run" | "out" | "hold";

/** Terminal que digita um curl, "executa" e mostra a resposta linha a linha, em ciclo. */
export function Terminal() {
  const reduced = useReducedMotion();
  const [ex, setEx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("type");
  const e = EXAMPLES[ex];
  const lines = e.body.split("\n");

  const go = (i: number) => {
    setEx(i);
    setTyped(0);
    setShown(0);
    setPhase("type");
  };

  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setTimeout>;
    if (phase === "type") id = typed < e.cmd.length ? setTimeout(() => setTyped(typed + 1 + (Math.random() < 0.3 ? 1 : 0)), 18 + Math.random() * 30) : setTimeout(() => setPhase("run"), 280);
    else if (phase === "run") id = setTimeout(() => setPhase("out"), 520);
    else if (phase === "out") id = shown < lines.length ? setTimeout(() => setShown(shown + 1), 60) : setTimeout(() => setPhase("hold"), 0);
    else id = setTimeout(() => { if (!document.hidden) go((ex + 1) % EXAMPLES.length); else setPhase("hold"); }, 3400);
    return () => clearTimeout(id);
  }, [reduced, phase, typed, shown, ex, e.cmd.length, lines.length]);

  const cmd = reduced ? e.cmd : e.cmd.slice(0, typed);
  const visible = reduced ? lines.length : shown;
  const done = reduced || phase === "out" || phase === "hold";

  return (
    <div className="glow-border rounded-xl shadow-[var(--shadow-pop)]">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-surface-3 ring-1 ring-line-strong" />)}
        </div>
        <div role="tablist" aria-label="Exemplos de chamada" className="flex flex-1 gap-1 overflow-x-auto">
          {EXAMPLES.map((x, i) => (
            <button key={x.label} role="tab" aria-selected={i === ex} onClick={() => go(i)} className={cx("relative rounded-md px-2 py-0.5 text-xs whitespace-nowrap transition-colors", i === ex ? "bg-surface-3 text-fg" : "text-fg-3 hover:text-fg")}>
              {x.label}
            </button>
          ))}
        </div>
        <span className="hidden font-mono text-[11px] text-fg-3 sm:block">zsh</span>
      </div>
      <div className="h-[290px] overflow-hidden p-4 font-mono text-[12px] leading-[1.6]">
        <pre className="whitespace-pre-wrap text-fg-2">
          <span className="text-fg-3 select-none">$ </span>
          {cmd.split("\n").map((l, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              {i === 0 ? <><span className="font-medium text-fg">{l.slice(0, 4)}</span>{l.slice(4)}</> : l}
            </Fragment>
          ))}
          {phase === "type" && !reduced && <span className="caret text-fg" />}
        </pre>
        <div className="mt-3 flex h-5 items-center gap-2 text-[11px]">
          {phase === "run" && !reduced && <span className="flex items-center gap-1.5 text-fg-3"><Loader2 className="size-3 animate-spin" /> aguardando resposta…</span>}
          {done && (
            <span key={ex} className="anim-pop inline-flex items-center gap-1.5 rounded-md border border-success-border bg-success-dim px-1.5 py-px text-success">
              <span className="size-1.5 rounded-full bg-success" /> {e.status} · {e.ms}ms
            </span>
          )}
          {done && <span className="text-fg-3">application/json</span>}
        </div>
        <pre className="mt-2 text-fg-2">
          {lines.slice(0, visible).map((l, i) => (
            <div key={`${ex}-${i}`} className="anim-fade-in">{highlight(l)}</div>
          ))}
        </pre>
      </div>
    </div>
  );
}
