// SQLite nativo do Node (node:sqlite): sem dependência nativa para compilar no Docker.
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { migrate } from "./migrations.ts";

export type Db = DatabaseSync;

export function openDb(dataDir: string, file = "mock-api.db"): Db {
  const db = new DatabaseSync(file === ":memory:" ? ":memory:" : join(dataDir, file));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** Roda fn numa transação; desfaz tudo se lançar. Dentro de outra transação, só participa dela. */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function now(): string {
  return new Date().toISOString();
}
