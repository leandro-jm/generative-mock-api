import type { FastifyRequest } from "fastify";
import type { SettingsService } from "../settings/service.ts";

/** Origem pública (URL da tela de configurações ou o host da requisição, respeitando o proxy). */
export function baseUrl(req: FastifyRequest, settings: SettingsService): string {
  const configured = settings.str("general.publicUrl");
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.host}`;
}
