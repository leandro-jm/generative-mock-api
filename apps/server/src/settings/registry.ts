// Catálogo de tudo que se configura na tela. Precedência: valor salvo na UI > variável de ambiente > padrão.
import { z } from "zod";

export type SettingType = "string" | "text" | "number" | "boolean" | "select" | "secret" | "json";

export interface SettingDef {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingType;
  default: unknown;
  env?: string;
  options?: { value: string; label: string }[];
  schema: z.ZodType;
  /** Mudança só vale depois de reiniciar o app. */
  restart?: boolean;
  placeholder?: string;
}

export const GROUPS: { id: string; label: string; description: string }[] = [
  { id: "general", label: "Geral", description: "Identidade e endereço público." },
  { id: "auth", label: "Autenticação", description: "Como as APIs mockadas são protegidas." },
  { id: "mock", label: "Comportamento do mock", description: "Latência, erros, paginação e confirmações." },
  { id: "data", label: "Dados", description: "Geração dos dados fictícios." },
  { id: "ai", label: "IA generativa", description: "Provedor usado para gerar endpoints a partir de prompts." },
  { id: "rh", label: "RH Trabalhista", description: "Tabelas usadas nos cálculos (valores ilustrativos)." },
];

const faixa = z.object({ ate: z.number().nullable(), aliquota: z.number(), deducao: z.number().optional() });

function def(d: Omit<SettingDef, "schema"> & { schema?: z.ZodType }): SettingDef {
  const schema =
    d.schema ??
    (d.type === "number"
      ? z.number()
      : d.type === "boolean"
        ? z.boolean()
        : d.type === "select"
          ? z.enum(d.options!.map((o) => o.value) as [string, ...string[]])
          : d.type === "json"
            ? z.unknown()
            : z.string());
  return { ...d, schema };
}

export const SETTINGS: SettingDef[] = [
  def({ key: "general.appName", group: "general", label: "Nome do app", description: "Aparece no topo da tela e no título da documentação.", type: "string", default: "Mock API", env: "APP_NAME" }),
  def({ key: "general.publicUrl", group: "general", label: "URL pública", description: "Endereço com https:// usado em servers do OpenAPI e nas URLs de imagens. Vazio: usa o host da requisição.", type: "string", default: "", env: "PUBLIC_URL", placeholder: "https://mock.exemplo.com", schema: z.union([z.literal(""), z.url()]) }),
  def({ key: "general.corsOrigins", group: "general", label: "Origens CORS", description: "Origens liberadas, separadas por vírgula. * libera todas.", type: "string", default: "*", env: "CORS_ORIGINS" }),

  def({ key: "auth.required", group: "auth", label: "Exigir autenticação nas APIs", description: "Desligado, as APIs mockadas respondem sem chave (a tela continua exigindo login).", type: "boolean", default: true, env: "AUTH_REQUIRED" }),
  def({ key: "auth.jwtTtlMinutes", group: "auth", label: "Validade do JWT (min)", description: "Tempo de vida do access_token emitido em POST /api/v1/auth/token.", type: "number", default: 60, env: "JWT_TTL_MINUTES", schema: z.number().int().min(1).max(60 * 24 * 30) }),
  def({ key: "auth.sessionTtlHours", group: "auth", label: "Validade da sessão da tela (h)", description: "Depois disso o usuário precisa entrar de novo.", type: "number", default: 168, env: "SESSION_TTL_HOURS", schema: z.number().int().min(1).max(24 * 90) }),
  def({ key: "auth.publicImages", group: "auth", label: "Imagens públicas", description: "Pôsteres, capas e fotos abrem sem autenticação (necessário para usar em <img>).", type: "boolean", default: true, env: "PUBLIC_IMAGES" }),
  def({ key: "auth.publicDocs", group: "auth", label: "Documentação pública", description: "/docs e /openapi.json abrem sem login.", type: "boolean", default: true, env: "PUBLIC_DOCS" }),

  def({ key: "mock.latencyMinMs", group: "mock", label: "Latência mínima (ms)", description: "Atraso artificial mínimo em cada resposta das APIs mockadas.", type: "number", default: 0, env: "MOCK_LATENCY_MIN_MS", schema: z.number().int().min(0).max(60000) }),
  def({ key: "mock.latencyMaxMs", group: "mock", label: "Latência máxima (ms)", description: "Sorteia entre a mínima e esta. Igual à mínima: atraso fixo.", type: "number", default: 0, env: "MOCK_LATENCY_MAX_MS", schema: z.number().int().min(0).max(60000) }),
  def({ key: "mock.errorRate", group: "mock", label: "Taxa de erro (%)", description: "Percentual de respostas que viram erro 500/502/503 sorteado. Header X-Mock-Status força um status.", type: "number", default: 0, env: "MOCK_ERROR_RATE", schema: z.number().min(0).max(100) }),
  def({ key: "mock.rateLimitPerMinute", group: "mock", label: "Limite de requisições por minuto", description: "Por chave/IP. 0 desliga.", type: "number", default: 600, env: "MOCK_RATE_LIMIT", schema: z.number().int().min(0) }),
  def({ key: "mock.defaultPageSize", group: "mock", label: "Itens por página (padrão)", description: "Usado quando a requisição não manda limit.", type: "number", default: 20, env: "MOCK_PAGE_SIZE", schema: z.number().int().min(1).max(1000) }),
  def({ key: "mock.maxPageSize", group: "mock", label: "Itens por página (máximo)", description: "Teto para o parâmetro limit.", type: "number", default: 100, env: "MOCK_MAX_PAGE_SIZE", schema: z.number().int().min(1).max(5000) }),
  def({ key: "mock.confirmDeletes", group: "mock", label: "Exigir plano para excluir", description: "Ligado, DELETE direto responde 428 com o plano; executa só com X-Confirm-Plan ou POST /plans/{id}/confirm.", type: "boolean", default: false, env: "MOCK_CONFIRM_DELETES" }),
  def({ key: "mock.planTtlMinutes", group: "mock", label: "Validade de um plano (min)", description: "Depois disso a confirmação responde 410.", type: "number", default: 15, env: "MOCK_PLAN_TTL_MINUTES", schema: z.number().int().min(1).max(1440) }),

  def({ key: "data.locale", group: "data", label: "Idioma dos dados", description: "Locale do gerador para módulos de IA e registros novos.", type: "select", default: "pt_BR", env: "DATA_LOCALE", options: [{ value: "pt_BR", label: "Português (Brasil)" }, { value: "en", label: "Inglês" }, { value: "es", label: "Espanhol" }] }),
  def({ key: "data.seed", group: "data", label: "Semente", description: "Mesma semente, mesmos dados ao resetar um módulo.", type: "number", default: 42, env: "DATA_SEED", schema: z.number().int() }),
  def({ key: "data.scale", group: "data", label: "Escala de volume", description: "Multiplica a quantidade de registros dos módulos prontos (1 = padrão). Vale no próximo reset.", type: "number", default: 1, env: "DATA_SCALE", schema: z.number().min(0.2).max(10) }),

  def({ key: "ai.provider", group: "ai", label: "Provedor", description: "Anthropic (Claude) ou qualquer API compatível com OpenAI (OpenAI, OpenRouter, Groq, Ollama...).", type: "select", default: "anthropic", env: "AI_PROVIDER", options: [{ value: "anthropic", label: "Anthropic (Claude)" }, { value: "openai", label: "OpenAI-compatível" }] }),
  def({ key: "ai.anthropicApiKey", group: "ai", label: "Anthropic API key", description: "Chave da Anthropic (fica cifrada no banco).", type: "secret", default: "", env: "ANTHROPIC_API_KEY" }),
  def({ key: "ai.anthropicModel", group: "ai", label: "Modelo Anthropic", description: "ID do modelo Claude.", type: "string", default: "claude-opus-5-5", env: "ANTHROPIC_MODEL" }),
  def({ key: "ai.anthropicEffort", group: "ai", label: "Esforço (Anthropic)", description: "Profundidade do raciocínio: mais alto, mais lento e caro.", type: "select", default: "medium", env: "ANTHROPIC_EFFORT", options: [{ value: "low", label: "Baixo" }, { value: "medium", label: "Médio" }, { value: "high", label: "Alto" }] }),
  def({ key: "ai.anthropicFallbacks", group: "ai", label: "Fallback em recusa (Anthropic)", description: "Se o modelo recusar o pedido, a própria API tenta outro modelo (fallbacks: default).", type: "boolean", default: true, env: "ANTHROPIC_FALLBACKS" }),
  def({ key: "ai.openaiApiKey", group: "ai", label: "API key OpenAI-compatível", description: "Chave do provedor compatível (vazio para Ollama local).", type: "secret", default: "", env: "OPENAI_API_KEY" }),
  def({ key: "ai.openaiBaseUrl", group: "ai", label: "Base URL OpenAI-compatível", description: "Ex.: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://ollama:11434/v1.", type: "string", default: "https://api.openai.com/v1", env: "OPENAI_BASE_URL" }),
  def({ key: "ai.openaiModel", group: "ai", label: "Modelo OpenAI-compatível", description: "Nome do modelo no provedor escolhido.", type: "string", default: "", env: "OPENAI_MODEL", placeholder: "ex.: gpt-4.1-mini, llama3.1" }),
  def({ key: "ai.openaiJsonSchema", group: "ai", label: "Saída estruturada (json_schema)", description: "Desligue se o provedor não suportar response_format json_schema; aí usa json_object.", type: "boolean", default: true, env: "OPENAI_JSON_SCHEMA" }),
  def({ key: "ai.temperature", group: "ai", label: "Temperatura (OpenAI-compatível)", description: "Criatividade das respostas. Modelos Claude atuais não usam este parâmetro.", type: "number", default: 0.7, env: "AI_TEMPERATURE", schema: z.number().min(0).max(2) }),
  def({ key: "ai.maxTokens", group: "ai", label: "Máximo de tokens", description: "Teto de saída por geração.", type: "number", default: 16000, env: "AI_MAX_TOKENS", schema: z.number().int().min(1000).max(64000) }),
  def({ key: "ai.defaultRecords", group: "ai", label: "Registros por recurso (padrão)", description: "Quantos registros gerar para cada recurso de um módulo novo.", type: "number", default: 30, env: "AI_DEFAULT_RECORDS", schema: z.number().int().min(1).max(5000) }),
  def({ key: "ai.maxRecords", group: "ai", label: "Registros por recurso (máximo)", description: "Teto aceito na geração.", type: "number", default: 1000, env: "AI_MAX_RECORDS", schema: z.number().int().min(1).max(20000) }),

  def({ key: "rh.salarioMinimo", group: "rh", label: "Salário mínimo", description: "Base para pisos e geração de salários.", type: "number", default: 1518, env: "RH_SALARIO_MINIMO", schema: z.number().positive() }),
  def({ key: "rh.inssFaixas", group: "rh", label: "Faixas do INSS", description: "Tabela progressiva: [{ ate, aliquota }] com ate=null na última faixa (teto).", type: "json", default: [{ ate: 1518, aliquota: 7.5 }, { ate: 2793.88, aliquota: 9 }, { ate: 4190.83, aliquota: 12 }, { ate: 8157.41, aliquota: 14 }], schema: z.array(faixa).min(1) }),
  def({ key: "rh.irrfFaixas", group: "rh", label: "Faixas do IRRF", description: "[{ ate, aliquota, deducao }] com ate=null na última faixa.", type: "json", default: [{ ate: 2428.8, aliquota: 0, deducao: 0 }, { ate: 2826.65, aliquota: 7.5, deducao: 182.16 }, { ate: 3751.05, aliquota: 15, deducao: 394.16 }, { ate: 4664.68, aliquota: 22.5, deducao: 675.49 }, { ate: null, aliquota: 27.5, deducao: 908.73 }], schema: z.array(faixa).min(1) }),
  def({ key: "rh.irrfDeducaoDependente", group: "rh", label: "Dedução por dependente (IRRF)", description: "Valor deduzido da base por dependente.", type: "number", default: 189.59, schema: z.number().min(0) }),
  def({ key: "rh.irrfDescontoSimplificado", group: "rh", label: "Desconto simplificado (IRRF)", description: "Usado no lugar das deduções legais quando for maior.", type: "number", default: 607.2, schema: z.number().min(0) }),
  def({ key: "rh.fgtsAliquota", group: "rh", label: "Alíquota do FGTS (%)", description: "Depósito mensal sobre a remuneração.", type: "number", default: 8, schema: z.number().min(0).max(100) }),
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

/** Converte o texto de uma env para o tipo da setting. */
export function parseEnvValue(def: SettingDef, raw: string): unknown {
  switch (def.type) {
    case "number":
      return Number(raw);
    case "boolean":
      return ["1", "true", "yes", "on", "sim"].includes(raw.toLowerCase());
    case "json":
      return JSON.parse(raw);
    default:
      return raw;
  }
}
