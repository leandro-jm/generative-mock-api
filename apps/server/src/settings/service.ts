import type { Db } from "../db/index.ts";
import { now } from "../db/index.ts";
import { badRequest } from "../lib/errors.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { GROUPS, SETTINGS, SETTINGS_BY_KEY, parseEnvValue, type SettingDef } from "./registry.ts";

export type SettingSource = "ui" | "env" | "default";

export interface SettingView {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingDef["type"];
  options?: SettingDef["options"];
  placeholder?: string;
  restart: boolean;
  env?: string;
  source: SettingSource;
  value: unknown;
  default: unknown;
  /** Para segredos: se há valor (o valor em si nunca sai do servidor). */
  isSet?: boolean;
}

type Listener = (key: string) => void;

export class SettingsService {
  private cache = new Map<string, { value: unknown; source: SettingSource }>();
  private listeners: Listener[] = [];
  private db: Db;
  private secret: string;
  private envSource: NodeJS.ProcessEnv;

  constructor(db: Db, secret: string, envSource: NodeJS.ProcessEnv = process.env) {
    this.db = db;
    this.secret = secret;
    this.envSource = envSource;
    this.reload();
  }

  reload(): void {
    this.cache.clear();
    const rows = this.db.prepare("SELECT key, value, encrypted FROM settings").all() as { key: string; value: string; encrypted: number }[];
    const stored = new Map(rows.map((r) => [r.key, r]));
    for (const def of SETTINGS) {
      const row = stored.get(def.key);
      if (row) {
        const raw = row.encrypted ? decrypt(row.value, this.secret) : row.value;
        this.cache.set(def.key, { value: JSON.parse(raw), source: "ui" });
        continue;
      }
      const envRaw = def.env ? this.envSource[def.env] : undefined;
      if (envRaw !== undefined && envRaw !== "") {
        try {
          const parsed = def.schema.parse(parseEnvValue(def, envRaw));
          this.cache.set(def.key, { value: parsed, source: "env" });
          continue;
        } catch {
          // env inválida: cai no padrão (a tela mostra a origem).
        }
      }
      this.cache.set(def.key, { value: def.default, source: "default" });
    }
  }

  get<T = unknown>(key: string): T {
    const hit = this.cache.get(key);
    if (!hit) throw new Error(`setting desconhecida: ${key}`);
    return hit.value as T;
  }

  num(key: string): number {
    return this.get<number>(key);
  }
  bool(key: string): boolean {
    return this.get<boolean>(key);
  }
  str(key: string): string {
    return this.get<string>(key);
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  set(key: string, value: unknown, userId?: string): void {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) throw badRequest(`Configuração desconhecida: ${key}`);
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) throw badRequest(`Valor inválido para ${def.label}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    const json = JSON.stringify(parsed.data);
    const isSecret = def.type === "secret";
    this.db
      .prepare(
        `INSERT INTO settings (key, value, encrypted, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .run(key, isSecret ? encrypt(json, this.secret) : json, isSecret ? 1 : 0, userId ?? null, now());
    this.reload();
    for (const fn of this.listeners) fn(key);
  }

  /** Apaga o valor salvo na tela: volta para env ou padrão. */
  reset(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    this.reload();
    for (const fn of this.listeners) fn(key);
  }

  list(): { groups: typeof GROUPS; settings: SettingView[] } {
    const settings = SETTINGS.map((def): SettingView => {
      const { value, source } = this.cache.get(def.key)!;
      const secret = def.type === "secret";
      return {
        key: def.key,
        group: def.group,
        label: def.label,
        description: def.description,
        type: def.type,
        options: def.options,
        placeholder: def.placeholder,
        restart: Boolean(def.restart),
        env: def.env,
        source,
        value: secret ? (value ? "••••••••" : "") : value,
        default: secret ? "" : def.default,
        ...(secret ? { isSet: Boolean(value) } : {}),
      };
    });
    return { groups: GROUPS, settings };
  }

  /** Configuração atual como .env (segredos só se pedido explicitamente). */
  exportEnv(includeSecrets = false): string {
    const lines = ["# Exportado do Mock API. Valores da tela viram valores iniciais via env.", ""];
    for (const group of GROUPS) {
      const defs = SETTINGS.filter((d) => d.group === group.id && d.env);
      if (!defs.length) continue;
      lines.push(`# ${group.label}`);
      for (const def of defs) {
        const value = this.get(def.key);
        if (def.type === "secret" && !includeSecrets) {
          lines.push(`${def.env}=`);
          continue;
        }
        const text = typeof value === "string" ? value : JSON.stringify(value);
        lines.push(`${def.env}=${/[\s#"']/.test(text) ? JSON.stringify(text) : text}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
}
