// Provedores de IA. Cada um recebe a conversa e devolve o módulo validado contra aiModuleSchema.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { z } from "zod";
import { HttpError } from "../lib/errors.ts";
import type { SettingsService } from "../settings/service.ts";
import { aiModuleSchema, strictify, type AiModule } from "./output-schema.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateResult {
  module: AiModule;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  name: string;
  model: string;
  generate(system: string, turns: ChatTurn[]): Promise<GenerateResult>;
  test(): Promise<string>;
}

const aiError = (detail: string) => new HttpError(502, "Falha na IA", detail);

// fallbacks: "default" só vale nos modelos que suportam roteamento de recusa no servidor.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const NO_EFFORT = /^claude-(3|haiku-4|sonnet-4-5|opus-4-1|opus-4-0)/;

export function anthropicProvider(s: SettingsService): AiProvider {
  const apiKey = s.str("ai.anthropicApiKey");
  const model = s.str("ai.anthropicModel");
  if (!apiKey) throw new HttpError(400, "IA não configurada", "Informe a Anthropic API key em Configurações → IA generativa.");
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 2 });
  const wrap = (err: unknown): never => {
    if (err instanceof Anthropic.AuthenticationError) throw aiError("Anthropic recusou a API key (401). Confira em Configurações.");
    if (err instanceof Anthropic.NotFoundError) throw aiError(`Modelo "${model}" não encontrado na Anthropic.`);
    if (err instanceof Anthropic.RateLimitError) throw aiError("Limite de uso da Anthropic atingido (429). Tente de novo em instantes.");
    if (err instanceof Anthropic.BadRequestError) throw aiError(`Anthropic rejeitou o pedido: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw aiError("Sem conexão com a API da Anthropic.");
    if (err instanceof Anthropic.APIError) throw aiError(`Erro da Anthropic (${err.status}): ${err.message}`);
    throw err;
  };
  return {
    name: "anthropic",
    model,
    async generate(system, turns) {
      const useFallbacks = s.bool("ai.anthropicFallbacks") && FALLBACK_MODELS.has(model);
      try {
        const res = await client.beta.messages.parse({
          model,
          max_tokens: s.num("ai.maxTokens"),
          system,
          messages: turns,
          output_config: { format: betaZodOutputFormat(aiModuleSchema), ...(NO_EFFORT.test(model) ? {} : { effort: s.str("ai.anthropicEffort") as "low" | "medium" | "high" }) },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
        if (res.stop_reason === "refusal") throw aiError("O modelo recusou o pedido. Reformule o prompt.");
        if (res.stop_reason === "max_tokens") throw aiError("A resposta passou do limite de tokens. Aumente 'Máximo de tokens' nas Configurações ou peça um módulo menor.");
        if (!res.parsed_output) throw aiError("O modelo não devolveu um JSON válido.");
        return { module: res.parsed_output, model: res.model, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        return wrap(err);
      }
    },
    async test() {
      try {
        const res = await client.messages.create({ model, max_tokens: 64, messages: [{ role: "user", content: "Responda apenas: ok" }] });
        const text = res.content.find((b) => b.type === "text");
        return `${res.model}: ${text && "text" in text ? text.text.trim() : res.stop_reason}`;
      } catch (err) {
        return wrap(err);
      }
    },
  };
}

export function openaiProvider(s: SettingsService): AiProvider {
  const model = s.str("ai.openaiModel");
  const baseURL = s.str("ai.openaiBaseUrl");
  if (!model) throw new HttpError(400, "IA não configurada", "Informe o modelo do provedor OpenAI-compatível em Configurações → IA generativa.");
  const client = new OpenAI({ apiKey: s.str("ai.openaiApiKey") || "sem-chave", baseURL, timeout: 10 * 60_000, maxRetries: 1 });
  const strict = s.bool("ai.openaiJsonSchema");
  const wrap = (err: unknown): never => {
    if (err instanceof OpenAI.APIError) throw aiError(`Erro do provedor ${baseURL} (${err.status ?? "rede"}): ${err.message}`);
    throw err;
  };
  return {
    name: "openai",
    model,
    async generate(system, turns) {
      const jsonSchema = strictify(z.toJSONSchema(aiModuleSchema, { target: "draft-7" })) as Record<string, unknown>;
      try {
        const res = await client.chat.completions.create({
          model,
          temperature: s.num("ai.temperature"),
          max_tokens: s.num("ai.maxTokens"),
          messages: [{ role: "system", content: strict ? system : `${system}\n\nResponda com um único objeto JSON que siga este JSON Schema:\n${JSON.stringify(jsonSchema)}` }, ...turns],
          response_format: strict ? { type: "json_schema", json_schema: { name: "mock_module", strict: true, schema: jsonSchema } } : { type: "json_object" },
        });
        const choice = res.choices[0];
        if (choice?.finish_reason === "length") throw aiError("A resposta passou do limite de tokens. Aumente 'Máximo de tokens' ou peça um módulo menor.");
        const text = choice?.message?.content ?? "";
        let raw: unknown;
        try {
          raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          throw aiError("O provedor não devolveu JSON válido. Tente ligar 'Saída estruturada' ou outro modelo.");
        }
        const parsed = aiModuleSchema.safeParse(raw);
        if (!parsed.success) throw aiError(`JSON fora do formato esperado: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
        return { module: parsed.data, model: res.model ?? model, usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 } };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        return wrap(err);
      }
    },
    async test() {
      try {
        const res = await client.chat.completions.create({ model, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] });
        return `${res.model ?? model}: ${res.choices[0]?.message?.content?.trim() ?? "(sem texto)"}`;
      } catch (err) {
        return wrap(err);
      }
    },
  };
}
