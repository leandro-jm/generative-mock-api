// Comportamento do mock: latência artificial, erros sorteados e status forçado por header.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SettingsService } from "../settings/service.ts";
import { HttpError, statusTitle } from "../lib/errors.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function applyMockBehaviour(req: FastifyRequest, reply: FastifyReply, settings: SettingsService): Promise<void> {
  const forcedDelay = Number(req.headers["x-mock-delay"]);
  const min = settings.num("mock.latencyMinMs");
  const max = Math.max(min, settings.num("mock.latencyMaxMs"));
  const delay = Number.isFinite(forcedDelay) && forcedDelay >= 0 ? Math.min(forcedDelay, 60_000) : max > 0 ? min + Math.random() * (max - min) : 0;
  if (delay > 0) {
    reply.header("X-Mock-Delay-Applied", String(Math.round(delay)));
    await sleep(delay);
  }
  const forced = Number(req.headers["x-mock-status"]);
  if (Number.isInteger(forced) && forced >= 400 && forced <= 599) {
    throw new HttpError(forced, statusTitle(forced), `Status ${forced} forçado pelo header X-Mock-Status.`, { mock: true });
  }
  const rate = settings.num("mock.errorRate");
  if (rate > 0 && Math.random() * 100 < rate) {
    const status = [500, 502, 503][Math.floor(Math.random() * 3)];
    throw new HttpError(status, statusTitle(status), "Erro sorteado pela taxa de erro configurada (Configurações → Comportamento do mock).", { mock: true });
  }
}
