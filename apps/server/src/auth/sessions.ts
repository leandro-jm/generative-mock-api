import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { id, sha256 } from "../lib/util.ts";

export const SESSION_COOKIE = "mock_session";

// O cookie leva o token; o banco guarda só o hash.
export class SessionsService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  create(userId: string, ttlHours: number): { token: string; expiresAt: Date } {
    const token = id(32);
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    this.db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, expiresAt.toISOString(), now());
    return { token, expiresAt };
  }

  resolve(token: string): string | undefined {
    const row = this.db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(sha256(token)) as { user_id: string; expires_at: string } | undefined;
    if (!row) return undefined;
    if (row.expires_at < now()) {
      this.destroy(token);
      return undefined;
    }
    return row.user_id;
  }

  destroy(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
  }

  purgeExpired(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  }
}
