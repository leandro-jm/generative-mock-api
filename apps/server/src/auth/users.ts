import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { id } from "../lib/util.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import type { Role } from "./types.ts";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserRow extends Omit<User, "active"> {
  active: number;
  password_hash: string;
}

const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: Boolean(r.active), created_at: r.created_at, updated_at: r.updated_at });

export const MIN_PASSWORD = 8;

export class UsersService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  }

  list(): User[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY created_at").all() as unknown as UserRow[]).map(toUser);
  }

  get(userId: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  }

  async create(input: { name: string; email: string; password: string; role: Role }): Promise<User> {
    if (input.password.length < MIN_PASSWORD) throw badRequest(`A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`);
    if (this.db.prepare("SELECT 1 FROM users WHERE email = ?").get(input.email)) throw conflict("Já existe um usuário com este e-mail.");
    const ts = now();
    const userId = id();
    this.db
      .prepare("INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
      .run(userId, input.name.trim(), input.email.trim().toLowerCase(), await hashPassword(input.password), input.role, ts, ts);
    return this.get(userId)!;
  }

  async update(userId: string, patch: { name?: string; role?: Role; active?: boolean; password?: string }): Promise<User> {
    const user = this.get(userId);
    if (!user) throw notFound("Usuário não encontrado.");
    const demoting = (patch.role && patch.role !== "admin") || patch.active === false;
    if (user.role === "admin" && demoting && this.activeAdmins() <= 1) throw conflict("Precisa existir pelo menos um admin ativo.");
    if (patch.password !== undefined && patch.password.length < MIN_PASSWORD) throw badRequest(`A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`);
    const ts = now();
    if (patch.name !== undefined) this.db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(patch.name.trim(), ts, userId);
    if (patch.role !== undefined) this.db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(patch.role, ts, userId);
    if (patch.active !== undefined) {
      this.db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").run(patch.active ? 1 : 0, ts, userId);
      if (!patch.active) this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    }
    if (patch.password !== undefined) {
      this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(await hashPassword(patch.password), ts, userId);
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    }
    return this.get(userId)!;
  }

  remove(userId: string): void {
    const user = this.get(userId);
    if (!user) throw notFound("Usuário não encontrado.");
    if (user.role === "admin" && user.active && this.activeAdmins() <= 1) throw conflict("Não dá para excluir o último admin.");
    this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  }

  async authenticate(email: string, password: string): Promise<User | undefined> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
    if (!row || !row.active) return undefined;
    return (await verifyPassword(password, row.password_hash)) ? toUser(row) : undefined;
  }

  private activeAdmins(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get() as { n: number }).n;
  }
}
