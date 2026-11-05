import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { BookOpen, Boxes, Database, KeyRound, Sparkles, Users } from "lucide-react";
import { get, type ModuleSummary } from "../lib/api";
import { number } from "../lib/format";
import { Card, Code, Loading, PageHeader } from "../components/ui";
import { ViewBadges } from "./Modules";

interface Stats { modules: number; enabledModules: number; resources: number; records: number; users: number; apiKeys: number; ai: { provider: string; configured: boolean; model: string }; authRequired: boolean }

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => get<Stats>("/admin-api/stats") });
  const modules = useQuery({ queryKey: ["modules"], queryFn: () => get<{ data: ModuleSummary[] }>("/admin-api/modules") });
  const base = location.origin;
  if (stats.isLoading) return <Loading />;
  const s = stats.data!;
  const tiles = [
    { label: "Módulos ativos", value: `${s.enabledModules}/${s.modules}`, icon: Boxes, to: "/modulos" },
    { label: "Registros", value: number(s.records), icon: Database, to: "/modulos" },
    { label: "API keys ativas", value: number(s.apiKeys), icon: KeyRound, to: "/api-keys" },
    { label: "Usuários", value: number(s.users), icon: Users, to: "/usuarios" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Painel" description="APIs com dados fictícios seguindo OpenAPI 3.1, prontas para testes, demos e protótipos." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="p-4 transition-colors hover:border-line-strong">
              <t.icon className="size-4 text-fg-3" />
              <p className="mt-2 text-2xl font-semibold tabular-nums">{t.value}</p>
              <p className="text-sm text-fg-2">{t.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Módulos</h2>
          <ul className="mt-3 divide-y divide-line">
            {modules.data?.data.map((m) => (
              <li key={m.slug} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link to={`/modulos/${m.slug}`} className="font-medium hover:underline decoration-line-strong underline-offset-2">{m.title}</Link>
                  <p className="text-xs text-fg-3">/api/v1/{m.slug} · {m.resources.length} recursos · {number(m.resources.reduce((a, r) => a + r.count, 0))} registros</p>
                </div>
                <ViewBadges views={m.views} />
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-fg-2" /> IA generativa</h2>
            <p className="mt-1 text-sm text-fg-2">{s.ai.configured ? `Configurada: ${s.ai.provider} · ${s.ai.model}` : "Ainda não configurada."}</p>
            <Link to={s.ai.configured ? "/ia" : "/configuracoes"} className="mt-3 inline-block text-sm font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">{s.ai.configured ? "Gerar um módulo por prompt →" : "Configurar provedor →"}</Link>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-fg-2" /> Documentação</h2>
            <p className="mt-1 text-sm text-fg-2">Swagger UI com todos os endpoints e a spec JSON/YAML.</p>
            <div className="mt-3 flex gap-3 text-sm font-medium">
              <a href="/docs" target="_blank" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">Swagger</a>
              <a href="/openapi.json" target="_blank" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">openapi.json</a>
            </div>
          </Card>
        </div>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Primeiros passos</h2>
        <p className="text-sm text-fg-2">
          {s.authRequired ? <>Crie uma chave em <Link to="/api-keys" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">API Keys</Link> e envie no header <code>X-API-Key</code>, ou troque por um JWT.</> : "A autenticação está desligada: as APIs respondem sem chave."}
        </p>
        <Code>{`# Lista filmes (página 1, 5 itens, mais recentes primeiro)
curl -H "X-API-Key: mk_SUA_CHAVE" "${base}/api/v1/filmes/filmes?limit=5&sort=-ano"

# JWT a partir da chave
curl -X POST ${base}/api/v1/auth/token -H "content-type: application/json" -d '{"apiKey":"mk_SUA_CHAVE"}'

# Views prontas para o front
curl -H "X-API-Key: mk_SUA_CHAVE" ${base}/api/v1/livros/livros/_views/card?limit=6
curl -H "X-API-Key: mk_SUA_CHAVE" ${base}/api/v1/rh/postos-trabalho/_views/map
curl -H "X-API-Key: mk_SUA_CHAVE" ${base}/api/v1/rh/_views/diagrams/organograma

# Plano com confirmação (nada muda até o confirm)
curl -X POST -H "X-API-Key: mk_SUA_CHAVE" -H "content-type: application/json" \\
  ${base}/api/v1/rh/plans -d '{"action":"desligar-colaborador","resource":"colaboradores","ids":[10]}'`}</Code>
      </Card>
    </div>
  );
}
