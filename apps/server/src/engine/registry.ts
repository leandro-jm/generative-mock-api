// Módulos ativos: os prontos (código) e os guardados no banco (IA/manual).
import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { makeFaker, seedModule } from "./datagen.ts";
import type { BuiltinModule, CustomPlanAction, EngineContext, ModuleDef } from "./types.ts";

interface ModuleRow {
  slug: string;
  title: string;
  description: string;
  source: ModuleDef["source"];
  enabled: number;
  definition: string | null;
  prompt: string | null;
  ai_meta: string | null;
  version: number;
  seeded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleSummary {
  slug: string;
  title: string;
  description: string;
  source: ModuleDef["source"];
  enabled: boolean;
  version: number;
  prompt: string | null;
  aiMeta: Record<string, unknown> | null;
  resources: { slug: string; label: string; labelPlural: string; count: number }[];
  views: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export class ModuleRegistry {
  private builtins: Map<string, BuiltinModule>;
  private defs = new Map<string, ModuleDef>();
  private db: Db;
  private ctx: EngineContext;
  /** Muda a cada alteração de módulos (cache da spec OpenAPI). */
  revision = 0;

  constructor(db: Db, ctx: EngineContext, builtins: BuiltinModule[]) {
    this.db = db;
    this.ctx = ctx;
    this.builtins = new Map(builtins.map((b) => [b.def.slug, b]));
  }

  /** Garante as linhas dos módulos prontos e semeia os que ainda não têm dados. */
  init(): void {
    for (const b of this.builtins.values()) {
      const row = this.row(b.def.slug);
      if (!row) {
        const ts = now();
        this.db.prepare("INSERT INTO modules (slug, title, description, source, enabled, created_at, updated_at) VALUES (?, ?, ?, 'builtin', 1, ?, ?)").run(b.def.slug, b.def.title, b.def.description, ts, ts);
      }
      if (!this.row(b.def.slug)!.seeded_at) this.reset(b.def.slug);
    }
    this.load();
  }

  private row(slug: string): ModuleRow | undefined {
    return this.db.prepare("SELECT * FROM modules WHERE slug = ?").get(slug) as ModuleRow | undefined;
  }

  private load(): void {
    this.defs.clear();
    const rows = this.db.prepare("SELECT * FROM modules ORDER BY source = 'builtin' DESC, created_at").all() as unknown as ModuleRow[];
    for (const row of rows) {
      const def = row.source === "builtin" ? this.builtins.get(row.slug)?.def : row.definition ? (JSON.parse(row.definition) as ModuleDef) : undefined;
      if (def) this.defs.set(row.slug, def);
    }
    this.revision++;
  }

  builtin(slug: string): BuiltinModule | undefined {
    return this.builtins.get(slug);
  }

  allBuiltins(): BuiltinModule[] {
    return [...this.builtins.values()];
  }

  customPlans(slug: string): CustomPlanAction[] {
    return this.builtins.get(slug)?.customPlans ?? [];
  }

  /** Definição de um módulo ativo; 404 se não existir ou estiver desligado. */
  get(slug: string): ModuleDef {
    const row = this.row(slug);
    const def = this.defs.get(slug);
    if (!row || !def || !row.enabled) throw notFound(`Módulo "${slug}" não existe ou está desligado.`);
    return def;
  }

  getAny(slug: string): ModuleDef {
    const def = this.defs.get(slug);
    if (!def) throw notFound(`Módulo "${slug}" não existe.`);
    return def;
  }

  enabled(): ModuleDef[] {
    const on = new Set((this.db.prepare("SELECT slug FROM modules WHERE enabled = 1").all() as { slug: string }[]).map((r) => r.slug));
    return [...this.defs.values()].filter((d) => on.has(d.slug));
  }

  summary(slug: string): ModuleSummary {
    const row = this.row(slug);
    const def = this.defs.get(slug);
    if (!row || !def) throw notFound(`Módulo "${slug}" não existe.`);
    return {
      slug,
      title: def.title,
      description: def.description,
      source: row.source,
      enabled: Boolean(row.enabled),
      version: row.version,
      prompt: row.prompt,
      aiMeta: row.ai_meta ? JSON.parse(row.ai_meta) : null,
      resources: def.resources.map((r) => ({ slug: r.slug, label: r.label, labelPlural: r.labelPlural, count: this.ctx.store.count(slug, r.slug) })),
      views: viewCoverage(def, this.customPlans(slug).length > 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(): ModuleSummary[] {
    return [...this.defs.keys()].map((slug) => this.summary(slug));
  }

  setEnabled(slug: string, enabled: boolean): void {
    this.getAny(slug);
    this.db.prepare("UPDATE modules SET enabled = ?, updated_at = ? WHERE slug = ?").run(enabled ? 1 : 0, now(), slug);
    this.revision++;
  }

  /** Volta o módulo aos dados gerados pela semente. */
  reset(slug: string): void {
    const builtin = this.builtins.get(slug);
    this.ctx.store.transaction(() => {
      this.ctx.store.clearModule(slug);
      if (builtin) builtin.seed(this.ctx);
      else {
        const row = this.row(slug);
        if (!row?.definition) throw notFound(`Módulo "${slug}" não existe.`);
        const meta = row.ai_meta ? JSON.parse(row.ai_meta) : {};
        const def = JSON.parse(row.definition) as ModuleDef;
        seedModule(this.ctx.store, def, this.ctx.faker(this.ctx.settings.num("data.seed") + row.version), meta.counts ?? this.ctx.settings.num("ai.defaultRecords"));
      }
      this.db.prepare("UPDATE modules SET seeded_at = ? WHERE slug = ?").run(now(), slug);
    });
  }

  /** Grava (cria ou substitui) um módulo de IA/manual e gera os dados. */
  save(def: ModuleDef, opts: { prompt?: string; aiMeta?: Record<string, unknown>; counts: number | Record<string, number>; replaceData?: boolean }): ModuleSummary {
    if (this.builtins.has(def.slug)) throw conflict(`"${def.slug}" é um módulo pronto; escolha outro slug.`);
    const existing = this.row(def.slug);
    const ts = now();
    const meta = { ...(opts.aiMeta ?? {}), counts: opts.counts };
    if (existing) {
      this.db
        .prepare("UPDATE modules SET title = ?, description = ?, source = ?, definition = ?, prompt = COALESCE(?, prompt), ai_meta = ?, version = version + 1, updated_at = ? WHERE slug = ?")
        .run(def.title, def.description, def.source, JSON.stringify(def), opts.prompt ?? null, JSON.stringify(meta), ts, def.slug);
    } else {
      this.db
        .prepare("INSERT INTO modules (slug, title, description, source, enabled, definition, prompt, ai_meta, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)")
        .run(def.slug, def.title, def.description, def.source, JSON.stringify(def), opts.prompt ?? null, JSON.stringify(meta), ts, ts);
    }
    this.load();
    if (!existing || opts.replaceData !== false) this.reset(def.slug);
    return this.summary(def.slug);
  }

  /** Acrescenta registros gerados a um recurso de módulo de IA/manual. */
  generateMore(slug: string, resource: string, count: number): void {
    if (this.builtins.has(slug)) throw badRequest("Módulos prontos usam reset; gerar mais é para módulos de IA ou manuais.");
    const def = this.getAny(slug);
    if (!def.resources.some((r) => r.slug === resource)) throw notFound(`Recurso ${resource} não existe.`);
    seedModule(this.ctx.store, def, makeFaker(this.ctx.settings.str("data.locale"), Date.now() % 100000), { [resource]: count }, "append");
  }

  remove(slug: string): void {
    if (this.builtins.has(slug)) throw badRequest("Módulos prontos não podem ser excluídos; desligue-os.");
    this.getAny(slug);
    this.ctx.store.clearModule(slug);
    this.db.prepare("DELETE FROM modules WHERE slug = ?").run(slug);
    this.db.prepare("DELETE FROM plans WHERE module_slug = ?").run(slug);
    this.load();
  }

  isBuiltin(slug: string): boolean {
    return this.builtins.has(slug);
  }
}

/** Quais das 7 views o módulo cobre (selos na tela). */
export function viewCoverage(def: ModuleDef, hasCustomPlans = false): Record<string, boolean> {
  const fields = def.resources.flatMap((r) => r.fields);
  return {
    table: def.resources.length > 0,
    card: def.resources.some((r) => r.views?.card?.image || r.fields.some((f) => f.type === "image")),
    form: def.resources.some((r) => r.fields.some((f) => !f.readOnly)),
    plan: hasCustomPlans || Boolean(def.planActions?.length) || fields.some((f) => f.type === "ref" || f.type === "refs"),
    map: fields.some((f) => f.type.startsWith("geo_")),
    chart: Boolean(def.charts?.length),
    diagram: Boolean(def.diagrams?.length),
  };
}
