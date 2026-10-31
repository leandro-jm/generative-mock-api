// Gera módulos a partir de prompts: chama o provedor, converte, valida, corrige uma vez se preciso e monta a prévia.
import type { SettingsService } from "../settings/service.ts";
import { HttpError } from "../lib/errors.ts";
import { checkModuleDef } from "../engine/def-schema.ts";
import { dependencyOrder, genRecord, makeFaker } from "../engine/datagen.ts";
import { viewCoverage } from "../engine/registry.ts";
import type { ModuleDef } from "../engine/types.ts";
import { anthropicProvider, openaiProvider, type AiProvider, type ChatTurn } from "./providers.ts";
import { toModuleDef } from "./output-schema.ts";
import { SYSTEM_PROMPT, refinePrompt, repairPrompt, userPrompt } from "./prompt.ts";

export interface GenerateInput {
  prompt: string;
  /** Conversa anterior (para refinar). */
  history?: ChatTurn[];
  /** Módulo atual, quando refinando. */
  previous?: ModuleDef;
}

export interface GenerateOutput {
  definition: ModuleDef;
  counts: Record<string, number>;
  coverage: Record<string, boolean>;
  preview: Record<string, Record<string, unknown>[]>;
  history: ChatTurn[];
  model: string;
  provider: string;
  usage: { inputTokens: number; outputTokens: number };
  repaired: boolean;
}

/** Registros de exemplo gerados em memória (não grava nada). */
export function previewRecords(def: ModuleDef, locale: string, perResource = 4): Record<string, Record<string, unknown>[]> {
  const f = makeFaker(locale, 7);
  const ids = new Map(def.resources.map((r) => [r.slug, Array.from({ length: perResource }, (_, i) => i + 1)]));
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const r of dependencyOrder(def.resources)) {
    out[r.slug] = Array.from({ length: perResource }, (_, i) => ({ id: i + 1, ...genRecord(f, r, { ids, index: i, self: {} }) }));
  }
  return out;
}

export class AiService {
  private settings: SettingsService;
  /** Provedor falso injetado em testes. */
  override?: AiProvider;

  constructor(settings: SettingsService) {
    this.settings = settings;
  }

  provider(): AiProvider {
    if (this.override) return this.override;
    return this.settings.str("ai.provider") === "openai" ? openaiProvider(this.settings) : anthropicProvider(this.settings);
  }

  status() {
    const p = this.settings.str("ai.provider");
    const configured = p === "openai" ? Boolean(this.settings.str("ai.openaiModel")) : Boolean(this.settings.str("ai.anthropicApiKey"));
    return { provider: p, configured, model: p === "openai" ? this.settings.str("ai.openaiModel") : this.settings.str("ai.anthropicModel") };
  }

  async test(): Promise<string> {
    return this.provider().test();
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!input.prompt?.trim()) throw new HttpError(400, "Requisição inválida", "Escreva o prompt.");
    const provider = this.provider();
    const locale = this.settings.str("data.locale");
    const turns: ChatTurn[] = input.history?.length
      ? [...input.history, { role: "user", content: refinePrompt(input.prompt) }]
      : input.previous
        ? [{ role: "user", content: userPrompt("Use o módulo abaixo como ponto de partida.", locale) }, { role: "assistant", content: JSON.stringify(input.previous) }, { role: "user", content: refinePrompt(input.prompt) }]
        : [{ role: "user", content: userPrompt(input.prompt, locale) }];

    let result = await provider.generate(SYSTEM_PROMPT, turns);
    let usage = { ...result.usage };
    let repaired = false;
    let converted = toModuleDef(result.module);
    let def: ModuleDef;
    try {
      def = checkModuleDef(converted.def);
    } catch (err) {
      // Uma rodada de correção com a lista de problemas.
      const problems = ((err as HttpError).extra?.errors as { field: string; message: string }[] | undefined)?.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)) ?? [String(err)];
      turns.push({ role: "assistant", content: JSON.stringify(result.module) }, { role: "user", content: repairPrompt(problems) });
      result = await provider.generate(SYSTEM_PROMPT, turns);
      usage = { inputTokens: usage.inputTokens + result.usage.inputTokens, outputTokens: usage.outputTokens + result.usage.outputTokens };
      converted = toModuleDef(result.module);
      def = checkModuleDef(converted.def);
      repaired = true;
    }
    const max = this.settings.num("ai.maxRecords");
    const fallback = this.settings.num("ai.defaultRecords");
    const counts = Object.fromEntries(def.resources.map((r) => [r.slug, Math.min(max, converted.counts[r.slug] ?? fallback)]));
    return {
      definition: def,
      counts,
      coverage: viewCoverage(def),
      preview: previewRecords(def, locale),
      history: [...turns, { role: "assistant", content: JSON.stringify(result.module) }],
      model: result.model,
      provider: provider.name,
      usage,
      repaired,
    };
  }
}
