import { randomBytes } from "node:crypto";
import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { notFound } from "../lib/errors.ts";
import { id, sha256 } from "../lib/util.ts";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  user_id: string;
  user_name?: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

type Row = Omit<ApiKey, "scopes"> & { scopes: string; hash: string };
const toKey = (r: Row): ApiKey => {
  const { hash: _hash, ...rest } = r;
  return { ...rest, scopes: JSON.parse(r.scopes) };
};

export class ApiKeysService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  list(userId?: string): ApiKey[] {
    const sql = `SELECT k.*, u.name AS user_name FROM api_keys k JOIN users u ON u.id = k.user_id ${userId ? "WHERE k.user_id = ?" : ""} ORDER BY k.created_at DESC`;
    const rows = (userId ? this.db.prepare(sql).all(userId) : this.db.prepare(sql).all()) as unknown as Row[];
    return rows.map(toKey);
  }

  get(keyId: string): ApiKey | undefined {
    const row = this.db.prepare("SELECT * FROM api_keys WHERE id = ?").get(keyId) as Row | undefined;
    return row ? toKey(row) : undefined;
  }

  /** Devolve o segredo uma única vez; só o hash fica guardado. */
  create(input: { name: string; scopes: string[]; userId: string; expiresAt?: string | null }): { key: ApiKey; secret: string } {
    const secret = `mk_${randomBytes(24).toString("base64url")}`;
    const keyId = id();
    this.db
      .prepare("INSERT INTO api_keys (id, name, prefix, hash, scopes, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(keyId, input.name.trim(), secret.slice(0, 10), sha256(secret), JSON.stringify(input.scopes), input.userId, input.expiresAt ?? null, now());
    return { key: this.get(keyId)!, secret };
  }

  revoke(keyId: string): void {
    const res = this.db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), keyId);
    if (!res.changes) throw notFound("Chave não encontrada ou já revogada.");
  }

  remove(keyId: string): void {
    this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(keyId);
  }

  /** Valida a chave e devolve dono e scopes (null se inválida, revogada, expirada ou de usuário inativo). */
  verify(secret: string): { key: ApiKey; userRole: string; userName: string } | null {
    const row = this.db
      .prepare("SELECT k.*, u.role AS user_role, u.name AS user_name, u.active AS user_active FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.hash = ?")
      .get(sha256(secret)) as (Row & { user_role: string; user_name: string; user_active: number }) | undefined;
    if (!row || row.revoked_at || !row.user_active) return null;
    if (row.expires_at && row.expires_at < now()) return null;
    this.db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
    return { key: toKey(row), userRole: row.user_role, userName: row.user_name };
  }
}
