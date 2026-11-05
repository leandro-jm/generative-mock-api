import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { get, patch, type ModuleSummary, type ViewKey } from "../lib/api";
import { number, SOURCE_LABEL, VIEW_LABEL } from "../lib/format";
import { useSession } from "../lib/session";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Switch, useToast } from "../components/ui";

export function ViewBadges({ views }: { views: Record<ViewKey, boolean> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.keys(VIEW_LABEL) as ViewKey[]).map((v) => (
        <Badge key={v} tone={views[v] ? "green" : "slate"} className={views[v] ? "" : "line-through opacity-60"}>{VIEW_LABEL[v]}</Badge>
      ))}
    </div>
  );
}

export function ModulesPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, error, isLoading } = useQuery({ queryKey: ["modules"], queryFn: () => get<{ data: ModuleSummary[] }>("/admin-api/modules") });
  const canEdit = user.role !== "viewer";

  const toggle = async (m: ModuleSummary, enabled: boolean) => {
    await patch(`/admin-api/modules/${m.slug}`, { enabled });
    await qc.invalidateQueries({ queryKey: ["modules"] });
    toast(`${m.title} ${enabled ? "ligado" : "desligado"}.`);
  };

  if (isLoading) return <Loading />;
  return (
    <div>
      <PageHeader
        title="Módulos"
        description="Cada módulo é uma API com vários recursos. Os prontos vêm com dados coerentes; os gerados por IA ou manuais você cria e edita."
        actions={canEdit && <Link to="/ia"><Button><Plus className="size-4" /> Novo módulo</Button></Link>}
      />
      <ErrorBox error={error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.data.map((m) => (
          <Card key={m.slug} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/modulos/${m.slug}`} className="font-semibold hover:underline decoration-line-strong underline-offset-2">{m.title}</Link>
                <p className="font-mono text-xs text-fg-3">/api/v1/{m.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.source === "builtin" ? "accent" : m.source === "ai" ? "amber" : "slate"}>{SOURCE_LABEL[m.source]}</Badge>
                <Switch checked={m.enabled} onChange={(v) => toggle(m, v)} disabled={!canEdit} label="Ligado" />
              </div>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-fg-2">{m.description}</p>
            <div className="mt-3"><ViewBadges views={m.views} /></div>
            <p className="mt-3 text-xs text-fg-3">{m.resources.length} recursos · {number(m.resources.reduce((a, r) => a + r.count, 0))} registros</p>
            <div className="mt-auto flex gap-2 pt-4">
              <Link to={`/modulos/${m.slug}`}><Button variant="secondary" size="sm">Abrir</Button></Link>
              <Link to={`/views?module=${m.slug}`}><Button variant="secondary" size="sm">Views</Button></Link>
              <a href={`/docs?module=${m.slug}`} target="_blank"><Button variant="ghost" size="sm">Docs</Button></a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
