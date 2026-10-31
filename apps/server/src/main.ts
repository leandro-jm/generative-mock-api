import { env } from "./env.ts";
import { buildApp, createContext } from "./app.ts";

const ctx = createContext(env);
const app = await buildApp(ctx, { logger: env.production ? { level: env.logLevel } : { level: env.logLevel, transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } } });

if (env.appSecretGenerated) app.log.warn(`APP_SECRET não definido: usando um gerado em ${env.dataDir}/.app-secret. Em produção, defina APP_SECRET.`);
if (ctx.users.count() === 0) app.log.info("Nenhum usuário ainda: abra o painel para criar o admin.");

setInterval(() => ctx.sessions.purgeExpired(), 3600_000).unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal}: encerrando`);
  await app.close();
  ctx.db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: env.port, host: env.host });
