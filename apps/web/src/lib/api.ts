// Cliente das APIs do servidor (sessão por cookie; erros no formato problem+json).
export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  errors: FieldError[];
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.detail ?? body.title ?? `Erro ${status}`));
    this.status = status;
    this.errors = (body.errors as FieldError[]) ?? [];
    this.body = body;
  }
}

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return null as T;
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { detail: text }; } })() : {};
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const get = <T,>(url: string) => api<T>(url);
export const post = <T,>(url: string, body: unknown = {}) => api<T>(url, { method: "POST", body });
export const put = <T,>(url: string, body: unknown) => api<T>(url, { method: "PUT", body });
export const patch = <T,>(url: string, body: unknown) => api<T>(url, { method: "PATCH", body });
export const del = <T,>(url: string) => api<T>(url, { method: "DELETE" });

// ---------- Tipos das respostas ----------
export type Role = "admin" | "editor" | "viewer";
export interface User { id: string; name: string; email: string; role: Role; active: boolean; created_at: string }
export type ViewKey = "table" | "card" | "form" | "plan" | "map" | "chart" | "diagram";
export interface ModuleSummary {
  slug: string;
  title: string;
  description: string;
  source: "builtin" | "ai" | "manual";
  enabled: boolean;
  version: number;
  prompt: string | null;
  aiMeta: Record<string, unknown> | null;
  resources: { slug: string; label: string; labelPlural: string; count: number }[];
  views: Record<ViewKey, boolean>;
  createdAt: string;
  updatedAt: string;
}
export interface FieldDef { name: string; label: string; type: string; required?: boolean; readOnly?: boolean; enum?: string[]; ref?: string; format?: string; description?: string; imageKind?: string; group?: string; unit?: string; min?: number; max?: number; faker?: string; samples?: unknown[] }
export interface ResourceDef { slug: string; label: string; labelPlural: string; description?: string; fields: FieldDef[]; titleField: string; views?: Record<string, unknown> }
export interface ModuleDef { slug: string; title: string; description: string; source: string; resources: ResourceDef[]; charts?: { name: string; title: string }[]; diagrams?: { name: string; title: string; kind: string }[]; planActions?: unknown[] }
export interface PlanAction { action: string; resource: string; title: string; description: string; kind: "delete" | "bulk-update" | "custom"; params: Record<string, unknown> | null }
export interface ModuleDetail extends ModuleSummary { definition: ModuleDef; planActions: PlanAction[]; customCharts: { name: string; title: string; description: string }[] }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface TableColumn { key: string; label: string; type: string; format: string; sortable: boolean; filterable: boolean; options?: string[]; ref?: string; unit?: string }
export interface TableView { resource: string; title: string; columns: TableColumn[]; data: (Record<string, unknown> & { id: number; _labels: Record<string, unknown> })[]; meta: PageMeta }
export interface Card { id: number; title: string; subtitle: string | null; image: string | null; badges: string[]; description: string | null; fields: { key: string; label: string; value: unknown }[] }
export interface UiField { label: string; widget: string; required: boolean; help?: string; mask?: string; suffix?: string; prefix?: string; options?: { value: string | number; label: string }[]; min?: number; max?: number }
export interface FormView { resource: string; title: string; mode: "create" | "edit"; submit: { method: string; url: string }; schema: Record<string, unknown>; uiSchema: Record<string, UiField>; steps: { title: string; fields: string[] }[]; initialValues: Record<string, unknown> }
export interface Chart { name?: string; title: string; description?: string | null; type: "bar" | "line" | "pie" | "area"; labels: string[]; series: { name: string; data: number[] }[]; unit: string | null }
export interface Diagram { name: string; title: string; description: string | null; kind: "tree" | "graph" | "flow"; nodes: { id: string; label: string; type: string; parentId?: string | null; data: Record<string, unknown> }[]; edges: { id: string; source: string; target: string; label?: string }[] }
export interface PlanImpact { resource: string; resourceLabel: string; id: number | null; label: string; effect: "create" | "update" | "delete" | "unlink"; diff: Record<string, { before: unknown; after: unknown }> | null; reason: string | null }
export interface Plan { id: string; module: string; action: string; resource: string | null; title: string; summary: string; severity: "low" | "medium" | "high"; status: string; totals: Record<string, number>; impacts: PlanImpact[]; warnings: string[]; confirmation: { required: boolean; phrase: string | null; expiresAt: string; confirmUrl: string; cancelUrl: string }; result?: { deleted: number; updated: number; created: { resource: string; id: number }[] } | null }
export interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; user_id: string; user_name?: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string }
export interface SettingView { key: string; group: string; label: string; description: string; type: "string" | "text" | "number" | "boolean" | "select" | "secret" | "json"; options?: { value: string; label: string }[]; placeholder?: string; restart: boolean; env?: string; source: "ui" | "env" | "default"; value: unknown; default: unknown; isSet?: boolean }
