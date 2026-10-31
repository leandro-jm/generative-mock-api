import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../context.ts";
import { forbidden, unauthorized } from "../lib/errors.ts";
import { SESSION_COOKIE } from "./sessions.ts";
import { ROLE_SCOPES, hasScope, type Principal, type Role } from "./types.ts";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
  interface FastifyContextConfig {
    /** none: rota pública; image: pública se auth.publicImages. */
    auth?: "none" | "image";
    mode?: "read" | "write";
    module?: string;
  }
}

const ANON: Principal = { kind: "anonymous", scopes: [] };

/** Descobre quem chama: X-API-Key, Bearer (JWT ou chave mk_) ou cookie de sessão da tela. */
export async function resolvePrincipal(req: FastifyRequest, ctx: AppContext): Promise<Principal> {
  if (req.principal) return req.principal;
  let p: Principal = ANON;
  const apiKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const auth = req.headers.authorization;
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const keySecret = apiKey ?? (bearer?.startsWith("mk_") ? bearer : undefined);
  if (keySecret) {
    const hit = ctx.apiKeys.verify(keySecret);
    if (!hit) throw unauthorized("API key inválida, revogada ou expirada.");
    p = { kind: "apiKey", userId: hit.key.user_id, role: hit.userRole as Role, name: hit.key.name, scopes: hit.key.scopes, keyId: hit.key.id };
  } else if (bearer) {
    const claims = await ctx.jwt.verify(bearer);
    if (!claims) throw unauthorized("Token inválido ou expirado. Gere outro em POST /api/v1/auth/token.");
    const user = ctx.users.get(claims.sub);
    if (!user?.active) throw unauthorized("Usuário do token não existe mais ou está inativo.");
    p = { kind: "jwt", userId: user.id, role: user.role, name: user.name, scopes: claims.scopes };
  } else {
    const token = req.cookies?.[SESSION_COOKIE];
    const userId = token ? ctx.sessions.resolve(token) : undefined;
    const user = userId ? ctx.users.get(userId) : undefined;
    if (user?.active) p = { kind: "session", userId: user.id, role: user.role, name: user.name, scopes: ROLE_SCOPES[user.role] };
  }
  req.principal = p;
  return p;
}

/** Exige scope no módulo (APIs mockadas). Com auth.required desligado, anônimo passa. */
export async function requireScope(req: FastifyRequest, ctx: AppContext, module: string, mode: "read" | "write"): Promise<Principal> {
  const p = await resolvePrincipal(req, ctx);
  if (p.kind === "anonymous") {
    if (!ctx.settings.bool("auth.required")) return { ...p, scopes: ["*"] };
    throw unauthorized();
  }
  if (!hasScope(p.scopes, module, mode)) throw forbidden(`Falta o scope ${module}:${mode} (a credencial tem: ${p.scopes.join(", ") || "nenhum"}).`);
  return p;
}

/** Exige usuário logado na tela (sessão), opcionalmente com papel mínimo. */
export async function requireUser(req: FastifyRequest, ctx: AppContext, roles?: Role[]): Promise<Principal & { userId: string; role: Role }> {
  const p = await resolvePrincipal(req, ctx);
  if (!p.userId || !p.role) throw unauthorized("Entre na tela para continuar.");
  if (roles && !roles.includes(p.role)) throw forbidden(`Precisa do papel ${roles.join(" ou ")}.`);
  return p as Principal & { userId: string; role: Role };
}

export type Reply = FastifyReply;
