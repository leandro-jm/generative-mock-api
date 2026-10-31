import type { DatabaseSync } from "node:sqlite";

// Migrações em ordem; a versão aplicada fica em PRAGMA user_version.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT,
    last_used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE modules (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL CHECK (source IN ('builtin','ai','manual')),
    enabled INTEGER NOT NULL DEFAULT 1,
    definition TEXT,
    prompt TEXT,
    ai_meta TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    seeded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE records (
    module_slug TEXT NOT NULL,
    resource_slug TEXT NOT NULL,
    id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (module_slug, resource_slug, id)
  );
  CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    module_slug TEXT NOT NULL,
    action TEXT NOT NULL,
    request TEXT NOT NULL,
    body TEXT NOT NULL,
    ops TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','expired','blocked')),
    confirm_phrase TEXT,
    created_by TEXT,
    expires_at TEXT NOT NULL,
    executed_at TEXT,
    result TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX plans_module ON plans(module_slug, created_at);
  `,
];

export function migrate(db: DatabaseSync): void {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
