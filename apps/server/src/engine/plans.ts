// Ação com confirmação (view "plan"): monta o plano com o impacto, o usuário confirma e só então executa.
import { z } from "zod";
import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.ts";
import { id as newId, round2 } from "../lib/util.ts";
import { applyQuery } from "./query.ts";
import { titleOf } from "./present.ts";
import type { CustomPlanAction, EngineContext, ModuleDef, PlanOp, ResourceDef } from "./types.ts";

export const planRequestSchema = z.object({
  action: z.string().min(1).describe('"delete", o nome de uma ação em lote ou de uma ação própria do módulo (ver GET /plans/_actions)'),
  resource: z.string().optional().describe("Recurso alvo (obrigatório para delete e ações em lote)"),
  ids: z.array(z.number().int()).optional().describe("Registros alvo"),
  filter: z.record(z.string(), z.string()).optional().describe('Alternativa a ids: filtros como na listagem, ex.: { "departamento_id": "3" }'),
  params: z.record(z.string(), z.unknown()).optional().describe("Parâmetros da ação, ex.: { percent: 10 }"),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

type Severity = "low" | "medium" | "high";

interface PlanRow {
  id: string;
  module_slug: string;
  action: string;
  request: string;
  body: string;
  ops: string;
  status: string;
  confirm_phrase: string | null;
  expires_at: string;
  executed_at: string | null;
  result: string | null;
  created_at: string;
}

export class PlansService {
  private db: Db;
  private ctx: EngineContext;
  constructor(db: Db, ctx: EngineContext) {
    this.db = db;
    this.ctx = ctx;
  }

  /** Ações disponíveis num módulo. */
  actions(m: ModuleDef, custom: CustomPlanAction[] = []) {
    return [
      ...m.resources.map((r) => ({ action: "delete", resource: r.slug, title: `Excluir ${r.labelPlural.toLowerCase()}`, description: `Exclui ${r.labelPlural.toLowerCase()} mostrando antes o efeito em cascata.`, kind: "delete", params: null })),
      ...(m.planActions ?? []).map((a) => ({ action: a.name, resource: a.resource, title: a.title, description: a.description, kind: a.kind, params: { [a.operation === "percent" ? "percent" : "value"]: { type: "number", label: a.paramLabel } } })),
      ...custom.map((a) => ({ action: a.name, resource: a.resource, title: a.title, description: a.description, kind: "custom", params: z.toJSONSchema(a.params) })),
    ];
  }

  private targets(m: ModuleDef, r: ResourceDef, req: PlanRequest): number[] {
    if (req.ids?.length) {
      const missing = req.ids.filter((x) => !this.ctx.store.get(m.slug, r.slug, x));
      if (missing.length) throw notFound(`${r.label}: ids não encontrados: ${missing.join(", ")}.`);
      return [...new Set(req.ids)];
    }
    if (req.filter && Object.keys(req.filter).length) {
      const filters = Object.entries(req.filter).map(([k, value]) => {
        const mm = /^(\w+)(?:\[(\w+)\])?$/.exec(k);
        return { field: mm?.[1] ?? k, op: (mm?.[2] ?? "eq") as "eq", value };
      });
      return applyQuery(r, this.ctx.store.all(m.slug, r.slug), { filters, sort: [] }).map((x) => x.id);
    }
    throw badRequest("Informe ids ou filter.");
  }

  /** Exclusão com cascata pelas referências (cascade / unlink / restrict). */
  private planDelete(m: ModuleDef, r: ResourceDef, ids: number[]) {
    const { store } = this.ctx;
    const deletes = new Map<string, PlanOp>();
    const updates = new Map<string, PlanOp>();
    const warnings: string[] = [];
    let blocked = false;
    const queue: { r: ResourceDef; id: number; reason?: string }[] = ids.map((id) => ({ r, id }));
    while (queue.length) {
      const item = queue.shift()!;
      const key = `${item.r.slug}:${item.id}`;
      if (deletes.has(key)) continue;
      const rec = store.get(m.slug, item.r.slug, item.id);
      if (!rec) continue;
      deletes.set(key, { op: "delete", resource: item.r.slug, id: item.id, expectedUpdatedAt: rec.updated_at, effect: "delete", label: titleOf(item.r, rec), reason: item.reason });
      updates.delete(key);
      for (const other of m.resources) {
        for (const f of other.fields) {
          if (f.ref !== item.r.slug || (f.type !== "ref" && f.type !== "refs")) continue;
          const policy = f.onDelete ?? (f.type === "ref" && f.required ? "cascade" : "unlink");
          for (const ref of store.all(m.slug, other.slug)) {
            const v = ref[f.name];
            const points = f.type === "ref" ? v === item.id : Array.isArray(v) && v.includes(item.id);
            if (!points) continue;
            const refKey = `${other.slug}:${ref.id}`;
            if (deletes.has(refKey)) continue;
            const why = `${f.label} aponta para ${item.r.label.toLowerCase()} "${titleOf(item.r, rec)}"`;
            if (policy === "restrict") {
              blocked = true;
              warnings.push(`Bloqueado: ${other.label} "${titleOf(other, ref)}" (${why}). Resolva antes de excluir.`);
            } else if (policy === "cascade" && f.type === "ref") {
              queue.push({ r: other, id: ref.id, reason: `Em cascata: ${why}` });
            } else {
              const existing = updates.get(refKey);
              const current = (existing?.data?.[f.name] ?? v) as unknown;
              const after = f.type === "ref" ? null : (current as number[]).filter((x) => x !== item.id);
              const data = { ...(existing?.data ?? {}), [f.name]: after };
              const diff = { ...(existing?.diff ?? {}), [f.name]: { before: v, after } };
              updates.set(refKey, { op: "update", resource: other.slug, id: ref.id, data, diff, expectedUpdatedAt: ref.updated_at, effect: "unlink", label: titleOf(other, ref), reason: `Desvincula: ${why}` });
            }
          }
        }
      }
    }
    const ops = [...updates.values(), ...deletes.values()];
    const nDel = deletes.size;
    const direct = ids.length;
    const summary = `Excluir ${direct} ${direct === 1 ? r.label.toLowerCase() : r.labelPlural.toLowerCase()}` + (nDel > direct ? `, mais ${nDel - direct} registro(s) em cascata` : "") + (updates.size ? ` e desvincular ${updates.size} registro(s)` : "") + ".";
    const severity: Severity = nDel >= 10 || nDel > direct ? "high" : nDel > 1 ? "medium" : "low";
    return { summary, ops, warnings, blocked, severity, title: `Excluir ${r.labelPlural.toLowerCase()}` };
  }

  private planBulk(m: ModuleDef, action: NonNullable<ModuleDef["planActions"]>[number], ids: number[], params: Record<string, unknown>) {
    const r = m.resources.find((x) => x.slug === action.resource)!;
    const field = r.fields.find((f) => f.name === action.field)!;
    const amount = Number(params.percent ?? params.value);
    if (Number.isNaN(amount)) throw badRequest(`Informe params.${action.operation === "percent" ? "percent" : "value"}.`);
    const ops: PlanOp[] = [];
    let beforeTotal = 0;
    let afterTotal = 0;
    for (const recId of ids) {
      const rec = this.ctx.store.get(m.slug, r.slug, recId)!;
      const before = Number(rec[field.name] ?? 0);
      const after = round2(action.operation === "percent" ? before * (1 + amount / 100) : action.operation === "add" ? before + amount : amount);
      beforeTotal += before;
      afterTotal += after;
      ops.push({ op: "update", resource: r.slug, id: recId, data: { [field.name]: after }, diff: { [field.name]: { before, after } }, expectedUpdatedAt: rec.updated_at, effect: "update", label: titleOf(r, rec) });
    }
    const fmt = (n: number) => (field.type === "money" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(round2(n)));
    const summary = `${action.title}: ${ids.length} ${r.labelPlural.toLowerCase()}; total de ${field.label.toLowerCase()} vai de ${fmt(beforeTotal)} para ${fmt(afterTotal)} (${afterTotal >= beforeTotal ? "+" : ""}${fmt(afterTotal - beforeTotal)}).`;
    const severity: Severity = action.severity ?? (ids.length >= 10 ? "high" : "medium");
    return { summary, ops, warnings: [] as string[], blocked: false, severity, title: action.title };
  }

  create(m: ModuleDef, req: PlanRequest, custom: CustomPlanAction[], userId?: string) {
    let built: { summary: string; ops: PlanOp[]; warnings: string[]; blocked: boolean; severity: Severity; title: string };
    const resourceOf = (slug?: string) => {
      const r = m.resources.find((x) => x.slug === slug);
      if (!r) throw badRequest(`Recurso inválido: ${slug ?? "(vazio)"}. Recursos: ${m.resources.map((x) => x.slug).join(", ")}.`);
      return r;
    };
    if (req.action === "delete") {
      const r = resourceOf(req.resource);
      built = this.planDelete(m, r, this.targets(m, r, req));
    } else if (m.planActions?.some((a) => a.name === req.action)) {
      const action = m.planActions.find((a) => a.name === req.action)!;
      built = this.planBulk(m, action, this.targets(m, resourceOf(action.resource), req), req.params ?? {});
    } else {
      const action = custom.find((a) => a.name === req.action);
      if (!action) throw badRequest(`Ação desconhecida: ${req.action}. Veja GET /api/v1/${m.slug}/plans/_actions.`);
      const params = action.params.safeParse(req.params ?? {});
      if (!params.success) throw badRequest("Parâmetros inválidos.", { errors: params.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
      const r = resourceOf(action.resource);
      const out = action.build(this.ctx, this.targets(m, r, req), params.data);
      built = { ...out, warnings: out.warnings ?? [], blocked: false, severity: action.severity, title: action.title };
    }
    if (!built.ops.length) throw badRequest("Nenhum registro seria afetado.");

    const planId = `pln_${newId(9)}`;
    const ttl = this.ctx.settings.num("mock.planTtlMinutes");
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const counts = { delete: 0, update: 0, unlink: 0, create: 0 };
    for (const op of built.ops) counts[op.effect]++;
    const phrase = built.severity === "high" ? (req.action === "delete" ? `EXCLUIR ${counts.delete} REGISTROS` : "CONFIRMAR") : null;
    const resLabel = (slug: string) => m.resources.find((x) => x.slug === slug)?.label ?? slug;
    const body = {
      id: planId,
      module: m.slug,
      action: req.action,
      resource: req.resource ?? null,
      title: built.title,
      summary: built.summary,
      severity: built.severity,
      status: built.blocked ? "blocked" : "pending",
      totals: counts,
      impacts: built.ops.map((op) => ({ resource: op.resource, resourceLabel: resLabel(op.resource), id: op.id ?? null, label: op.label, effect: op.effect, diff: op.diff ?? null, reason: op.reason ?? null, data: op.op === "create" ? op.data : undefined })),
      warnings: built.warnings,
      confirmation: {
        required: true,
        phrase,
        expiresAt,
        confirmUrl: `/api/v1/${m.slug}/plans/${planId}/confirm`,
        cancelUrl: `/api/v1/${m.slug}/plans/${planId}/cancel`,
      },
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO plans (id, module_slug, action, request, body, ops, status, confirm_phrase, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(planId, m.slug, req.action, JSON.stringify(req), JSON.stringify(body), JSON.stringify(built.ops), body.status, phrase, userId ?? null, expiresAt, body.createdAt);
    return body;
  }

  private row(m: string, planId: string): PlanRow {
    const row = this.db.prepare("SELECT * FROM plans WHERE id = ? AND module_slug = ?").get(planId, m) as PlanRow | undefined;
    if (!row) throw notFound("Plano não encontrado.");
    return row;
  }

  get(m: string, planId: string) {
    const row = this.row(m, planId);
    const body = JSON.parse(row.body);
    let status = row.status;
    if (status === "pending" && row.expires_at < now()) status = "expired";
    return { ...body, status, executedAt: row.executed_at, result: row.result ? JSON.parse(row.result) : null };
  }

  list(m: string, limit = 20) {
    const rows = this.db.prepare("SELECT id FROM plans WHERE module_slug = ? ORDER BY created_at DESC LIMIT ?").all(m, limit) as { id: string }[];
    return rows.map((r) => this.get(m, r.id));
  }

  cancel(m: string, planId: string) {
    const row = this.row(m, planId);
    if (row.status !== "pending") throw conflict(`Plano está ${row.status}.`);
    this.db.prepare("UPDATE plans SET status = 'cancelled' WHERE id = ?").run(planId);
    return this.get(m, planId);
  }

  /** Executa exatamente as operações mostradas; 409 se algum registro mudou desde o plano, 410 se expirou. */
  confirm(m: string, planId: string, phrase?: string) {
    const row = this.row(m, planId);
    if (row.status === "blocked") throw conflict("Plano bloqueado: há registros que impedem a operação (ver warnings).");
    if (row.status !== "pending") throw conflict(`Plano já está ${row.status}.`);
    if (row.expires_at < now()) {
      this.db.prepare("UPDATE plans SET status = 'expired' WHERE id = ?").run(planId);
      throw new HttpError(410, "Expirado", "O plano expirou. Gere outro.");
    }
    if (row.confirm_phrase && (phrase ?? "").trim().toUpperCase() !== row.confirm_phrase) {
      throw badRequest(`Para confirmar, envie { "phrase": "${row.confirm_phrase}" }.`, { phrase: row.confirm_phrase });
    }
    const { store } = this.ctx;
    const ops = JSON.parse(row.ops) as PlanOp[];
    const changed = ops.filter((op) => {
      if (op.op === "create" || !op.id) return false;
      const rec = store.get(m, op.resource, op.id);
      return !rec || rec.updated_at !== op.expectedUpdatedAt;
    });
    if (changed.length) {
      throw conflict("Os dados mudaram depois que o plano foi gerado. Gere outro plano.", { changed: changed.map((op) => ({ resource: op.resource, id: op.id })) });
    }
    const result = { deleted: 0, updated: 0, created: [] as { resource: string; id: number }[] };
    store.transaction(() => {
      for (const op of ops) {
        if (op.op === "delete" && op.id) result.deleted += store.delete(m, op.resource, op.id) ? 1 : 0;
        else if (op.op === "update" && op.id) result.updated += store.update(m, op.resource, op.id, op.data ?? {}, true) ? 1 : 0;
        else if (op.op === "create") result.created.push({ resource: op.resource, id: store.insert(m, op.resource, op.data ?? {}).id });
      }
      this.db.prepare("UPDATE plans SET status = 'confirmed', executed_at = ?, result = ? WHERE id = ?").run(now(), JSON.stringify(result), planId);
    });
    return this.get(m, planId);
  }
}
