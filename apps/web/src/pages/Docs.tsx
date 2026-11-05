import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { get, type ModuleSummary } from "../lib/api";
import { Button, PageHeader, Select } from "../components/ui";

export function DocsPage() {
  const modules = useQuery({ queryKey: ["modules"], queryFn: () => get<{ data: ModuleSummary[] }>("/admin-api/modules") });
  const [module, setModule] = useState("");
  const spec = module ? `/openapi/${module}` : "/openapi";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentação"
        description="Swagger UI com todos os endpoints. Logado aqui, o “Try it out” já usa sua sessão; para outros clientes, use Authorize com a API key ou o JWT."
        actions={
          <>
            <Select value={module} onChange={(e) => setModule(e.target.value)} className="w-52">
              <option value="">Todos os módulos</option>
              {modules.data?.data.filter((m) => m.enabled).map((m) => <option key={m.slug} value={m.slug}>{m.title}</option>)}
            </Select>
            <a href={`${spec}.json`} download><Button variant="secondary">JSON</Button></a>
            <a href={`${spec}.yaml`} download><Button variant="secondary">YAML</Button></a>
            <a href={`/docs${module ? `?module=${module}` : ""}`} target="_blank"><Button variant="secondary"><ExternalLink className="size-4" /> Abrir</Button></a>
          </>
        }
      />
      <iframe key={module} src={`/docs${module ? `?module=${module}` : ""}`} title="Swagger UI" className="h-[calc(100vh-12rem)] w-full rounded-xl border border-line bg-surface" />
    </div>
  );
}
