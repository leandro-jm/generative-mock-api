import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp, createContext } from "../src/app.ts";
import type { Env } from "../src/env.ts";
import type { AppContext } from "../src/context.ts";

export async function makeApp(envSource: NodeJS.ProcessEnv = {}): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const dataDir = mkdtempSync(join(tmpdir(), "mock-api-test-"));
  const env: Env = { port: 0, host: "127.0.0.1", dataDir, appSecret: "segredo-de-teste", appSecretGenerated: false, setupToken: undefined, trustProxy: 1, logLevel: "error", production: false, webDist: join(dataDir, "sem-web") };
  const ctx = createContext(env, undefined, envSource);
  const app = await buildApp(ctx, { logger: false });
  await app.ready();
  return { app, ctx };
}

/** Faz o setup do admin e devolve o cookie de sessão. */
export async function setupAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/admin-api/setup", payload: { name: "Admin Teste", email: "admin@teste.com", password: "senha-forte-123" } });
  if (res.statusCode !== 200) throw new Error(`setup falhou: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === "mock_session")!;
  return `mock_session=${cookie.value}`;
}

export async function createKey(app: FastifyInstance, cookie: string, scopes: string[] = ["*"]): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/admin-api/api-keys", headers: { cookie }, payload: { name: "teste", scopes } });
  if (res.statusCode !== 201) throw new Error(`api key falhou: ${res.body}`);
  return res.json().secret;
}
