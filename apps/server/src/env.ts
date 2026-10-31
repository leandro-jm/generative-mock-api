// Só as variáveis que precisam existir antes de o app subir. Todo o resto é configuração da tela (settings/registry.ts).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dataDir = resolve(process.env.DATA_DIR ?? "./data");
mkdirSync(dataDir, { recursive: true });

// Sem APP_SECRET, gera um e guarda no volume: o app sobe em dev sem configurar nada e não desloga ninguém a cada restart.
function loadSecret(): { secret: string; generated: boolean } {
  if (process.env.APP_SECRET) return { secret: process.env.APP_SECRET, generated: false };
  const file = join(dataDir, ".app-secret");
  if (existsSync(file)) return { secret: readFileSync(file, "utf8").trim(), generated: true };
  const secret = randomBytes(48).toString("base64");
  writeFileSync(file, secret, { mode: 0o600 });
  return { secret, generated: true };
}

const { secret, generated } = loadSecret();

export const env = {
  port: Number(process.env.PORT ?? 4310),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir,
  appSecret: secret,
  appSecretGenerated: generated,
  setupToken: process.env.SETUP_TOKEN || undefined,
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  logLevel: process.env.LOG_LEVEL ?? "info",
  production: process.env.NODE_ENV === "production",
  webDist: process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : resolve(import.meta.dirname, "../../web/dist"),
};

export type Env = typeof env;
