import type { CSSProperties, ReactElement } from "react";
import { BookOpen, Fingerprint, ImageIcon, KeyRound, MessageSquareText, Rocket, Sparkles, Timer, Users } from "lucide-react";
import { Logo, cx } from "../ui";
import { useCycle, usePointerSpotlight, useTypewriter } from "./hooks";
import { Terminal } from "./Terminal";
import { ViewsDemo } from "./ViewsDemo";

const d = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

const WORDS = ["RH Trabalhista", "Filmes", "Livros", "o seu domínio"];

const STEPS = [
  { icon: MessageSquareText, title: "Descreva o domínio", desc: "“clínica veterinária com tutores, pets e consultas”" },
  { icon: Sparkles, title: "A IA desenha", desc: "Recursos, campos, gráficos, diagramas e ações." },
  { icon: Rocket, title: "API no ar", desc: "CRUD, 7 views, Swagger e milhares de registros." },
];

const FEATURES = [
  { icon: BookOpen, label: "OpenAPI 3.1 + Swagger" },
  { icon: KeyRound, label: "API Keys e JWT" },
  { icon: Timer, label: "X-Mock-Delay / X-Mock-Status" },
  { icon: ImageIcon, label: "Pôsteres e capas gerados" },
  { icon: Fingerprint, label: "CPF, CNPJ, PIS e ISBN válidos" },
  { icon: Users, label: "Usuários e papéis" },
];

/** Arte em linhas (pilha isométrica de "tabelas"), no espírito do CubeArt do MCP Gateway. */
function LineArt() {
  const lines: ReactElement[] = [];
  const layer = (oy: number, k: string, op: number) => {
    for (let y = 0; y <= 50; y += 2) {
      const half = y <= 25 ? (y * 100) / 25 : ((50 - y) * 100) / 25;
      lines.push(<line key={`${k}${y}`} x1={100 - half} y1={oy + y} x2={100 + half} y2={oy + y} style={{ stroke: "var(--art-1)" }} strokeOpacity={op} strokeWidth={0.6} />);
    }
    lines.push(<polyline key={`${k}e`} points={`0,${oy + 25} 100,${oy + 50} 200,${oy + 25}`} fill="none" style={{ stroke: "var(--art-2)" }} strokeOpacity={op + 0.15} strokeWidth={0.8} />);
  };
  layer(0, "a", 0.5);
  layer(34, "b", 0.32);
  layer(68, "c", 0.18);
  return (
    <svg width="360" height="250" viewBox="-4 -4 208 128" aria-hidden className="landing-art">
      {lines}
    </svg>
  );
}

function HowItWorks() {
  const [active, select] = useCycle(STEPS.length, 2600);
  return (
    <div className="relative">
      <div className="absolute top-4 right-[16.66%] left-[16.66%] hidden h-px bg-line sm:block" aria-hidden>
        <div className="h-full bg-fg transition-[width] duration-700 ease-out" style={{ width: `${(active / (STEPS.length - 1)) * 100}%` }} />
      </div>
      <ol className="relative grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const on = i <= active;
          return (
            <li key={s.title}>
              <button type="button" onClick={() => select(i)} className="group flex w-full flex-row items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
                <span className={cx("relative flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-500", on ? "border-fg bg-primary text-primary-fg" : "border-line-strong bg-surface text-fg-3", i === active && "pulse-ring")}>
                  <s.icon className="size-4" />
                </span>
                <span>
                  <span className={cx("block text-sm font-medium transition-colors", on ? "text-fg" : "text-fg-3")}>
                    <span className="mr-1 font-mono text-xs text-fg-3">{i + 1}.</span>
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-3">{s.desc}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Mini landing do login: o que o mock-api faz e como funciona, com animações leves. */
export function LoginShowcase({ appName }: { appName: string }) {
  const word = useTypewriter(WORDS);
  const ref = usePointerSpotlight<HTMLElement>();
  return (
    <section ref={ref} aria-label={`Sobre o ${appName}`} className="relative isolate overflow-hidden">
      {/* fundo */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="landing-grid absolute inset-0" />
        <div className="landing-spot absolute inset-0" />
        <div className="absolute -top-6 -right-16 opacity-60 sm:opacity-80">
          <LineArt />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-10 px-6 py-10 sm:px-10 lg:py-14">
        <header className="space-y-4">
          <div className="anim-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pr-3 pl-1.5 text-xs text-fg-2 backdrop-blur-sm" style={d(0)}>
            <Logo className="size-5 text-fg" />
            <span className="font-medium text-fg">{appName}</span>
            <span className="h-3 w-px bg-line-strong" />
            dados fictícios, APIs de verdade
          </div>
          <h1 className="anim-fade-up max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl" style={d(80)}>
            APIs fictícias prontas em segundos para <span className="whitespace-nowrap text-fg-2">{word}<span className="caret text-fg" aria-hidden /></span>
          </h1>
          <p className="anim-fade-up max-w-xl text-sm text-fg-2 sm:text-[15px]" style={d(160)}>
            CRUD com filtros, views prontas para o front e documentação OpenAPI. Os dados são coerentes e gerados por semente, para testes, demos e protótipos.
          </p>
        </header>

        <div className="anim-fade-up" style={d(240)}>
          <Terminal />
        </div>

        <div className="anim-fade-up space-y-3" style={d(320)}>
          <h2 className="text-[11px] font-medium tracking-wider text-fg-3 uppercase">7 views, mesmo formato em todo módulo</h2>
          <ViewsDemo />
        </div>

        <div className="anim-fade-up space-y-4" style={d(400)}>
          <h2 className="text-[11px] font-medium tracking-wider text-fg-3 uppercase">Como funciona com IA</h2>
          <HowItWorks />
        </div>

        <ul className="flex flex-wrap gap-2">
          {FEATURES.map((f, i) => (
            <li key={f.label} className="anim-fade-up inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-2.5 py-1 text-xs text-fg-2 backdrop-blur-sm transition-colors hover:border-line-strong hover:text-fg" style={d(480 + i * 60)}>
              <f.icon className="size-3.5 text-fg-3" />
              {f.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
