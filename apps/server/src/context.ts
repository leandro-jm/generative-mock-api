import type { Env } from "./env.ts";
import type { Db } from "./db/index.ts";
import type { SettingsService } from "./settings/service.ts";
import type { UsersService } from "./auth/users.ts";
import type { SessionsService } from "./auth/sessions.ts";
import type { ApiKeysService } from "./auth/api-keys.ts";
import type { JwtService } from "./auth/jwt.ts";
import type { Store } from "./engine/store.ts";
import type { ModuleRegistry } from "./engine/registry.ts";
import type { PlansService } from "./engine/plans.ts";
import type { EngineContext } from "./engine/types.ts";
import type { AiService } from "./ai/service.ts";

/** Serviços compartilhados pelas rotas. */
export interface AppContext {
  env: Env;
  db: Db;
  settings: SettingsService;
  users: UsersService;
  sessions: SessionsService;
  apiKeys: ApiKeysService;
  jwt: JwtService;
  store: Store;
  registry: ModuleRegistry;
  plans: PlansService;
  engine: EngineContext;
  ai: AiService;
}
