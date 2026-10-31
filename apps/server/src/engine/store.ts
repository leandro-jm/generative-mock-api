// Registros de todos os módulos numa tabela só (dados em JSON), com cache em memória por recurso.
import type { Db } from "../db/index.ts";
import { now, tx } from "../db/index.ts";

export interface Rec {
  id: number;
  created_at: string;
  updated_at: string;
  [field: string]: unknown;
}

type Row = { id: number; data: string; created_at: string; updated_at: string };

export class Store {
  private cache = new Map<string, Rec[]>();
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  private key(m: string, r: string) {
    return `${m}/${r}`;
  }

  private invalidate(m: string, r?: string) {
    if (r) this.cache.delete(this.key(m, r));
    else for (const k of [...this.cache.keys()]) if (k.startsWith(`${m}/`)) this.cache.delete(k);
  }

  /** Todos os registros (ordem por id). Não mutar o array devolvido. */
  all(m: string, r: string): Rec[] {
    const k = this.key(m, r);
    let rows = this.cache.get(k);
    if (!rows) {
      const raw = this.db.prepare("SELECT id, data, created_at, updated_at FROM records WHERE module_slug = ? AND resource_slug = ? ORDER BY id").all(m, r) as unknown as Row[];
      rows = raw.map((row) => ({ id: row.id, ...JSON.parse(row.data), created_at: row.created_at, updated_at: row.updated_at }));
      this.cache.set(k, rows);
    }
    return rows;
  }

  byId(m: string, r: string): Map<number, Rec> {
    return new Map(this.all(m, r).map((rec) => [rec.id, rec]));
  }

  get(m: string, r: string, id: number): Rec | undefined {
    return this.all(m, r).find((rec) => rec.id === id);
  }

  count(m: string, r: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM records WHERE module_slug = ? AND resource_slug = ?").get(m, r) as { n: number }).n;
  }

  private nextId(m: string, r: string): number {
    return ((this.db.prepare("SELECT MAX(id) AS n FROM records WHERE module_slug = ? AND resource_slug = ?").get(m, r) as { n: number | null }).n ?? 0) + 1;
  }

  insert(m: string, r: string, data: Record<string, unknown>, id?: number): Rec {
    const ts = now();
    const newId = id ?? this.nextId(m, r);
    const { id: _i, created_at: _c, updated_at: _u, ...clean } = data;
    this.db.prepare("INSERT INTO records (module_slug, resource_slug, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(m, r, newId, JSON.stringify(clean), ts, ts);
    this.invalidate(m, r);
    return { id: newId, ...clean, created_at: ts, updated_at: ts };
  }

  /** Insere muitos de uma vez (seed). Cada item pode trazer id e created_at. */
  bulkInsert(m: string, r: string, items: Record<string, unknown>[]): void {
    const stmt = this.db.prepare("INSERT INTO records (module_slug, resource_slug, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    let next = this.nextId(m, r);
    tx(this.db, () => {
      for (const item of items) {
        const { id, created_at, updated_at, ...clean } = item;
        const ts = (created_at as string) ?? now();
        stmt.run(m, r, (id as number) ?? next++, JSON.stringify(clean), ts, (updated_at as string) ?? ts);
      }
    });
    this.invalidate(m, r);
  }

  /** Substitui os dados (PUT) ou mescla (merge=true, PATCH). */
  update(m: string, r: string, id: number, data: Record<string, unknown>, merge: boolean): Rec | undefined {
    const current = this.get(m, r, id);
    if (!current) return undefined;
    const { id: _i, created_at, updated_at: _u, ...base } = current;
    const { id: _i2, created_at: _c2, updated_at: _u2, ...incoming } = data;
    const next = merge ? { ...base, ...incoming } : incoming;
    // Ordena o updated_at mesmo em duas escritas no mesmo milissegundo (o plano usa isso para detectar mudança).
    let ts = now();
    if (ts <= current.updated_at) ts = new Date(new Date(current.updated_at).getTime() + 1).toISOString();
    this.db.prepare("UPDATE records SET data = ?, updated_at = ? WHERE module_slug = ? AND resource_slug = ? AND id = ?").run(JSON.stringify(next), ts, m, r, id);
    this.invalidate(m, r);
    return { id, ...next, created_at, updated_at: ts };
  }

  delete(m: string, r: string, id: number): boolean {
    const res = this.db.prepare("DELETE FROM records WHERE module_slug = ? AND resource_slug = ? AND id = ?").run(m, r, id);
    this.invalidate(m, r);
    return res.changes > 0;
  }

  clearModule(m: string): void {
    this.db.prepare("DELETE FROM records WHERE module_slug = ?").run(m);
    this.invalidate(m);
  }

  clearResource(m: string, r: string): void {
    this.db.prepare("DELETE FROM records WHERE module_slug = ? AND resource_slug = ?").run(m, r);
    this.invalidate(m, r);
  }

  transaction<T>(fn: () => T): T {
    try {
      return tx(this.db, fn);
    } finally {
      this.cache.clear();
    }
  }
}
