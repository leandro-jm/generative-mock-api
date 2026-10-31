import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsMod from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { isCep, isCnpj, isCpf, isIsbn10, isIsbn13, isPis, UFS } from "../lib/br.ts";
import { badRequest } from "../lib/errors.ts";
import { inputSchema } from "./schema.ts";
import type { ResourceDef } from "./types.ts";

// ajv-formats publica CJS: em ESM a função vem em .default.
const addFormats = ((addFormatsMod as unknown as { default?: unknown }).default ?? addFormatsMod) as (ajv: Ajv2020) => Ajv2020;

export const ajv = new Ajv2020({ strict: false, allErrors: true, coerceTypes: false });
addFormats(ajv);
ajv.addFormat("cpf", isCpf);
ajv.addFormat("cnpj", isCnpj);
ajv.addFormat("pis", isPis);
ajv.addFormat("cep", isCep);
ajv.addFormat("isbn13", isIsbn13);
ajv.addFormat("isbn10", isIsbn10);
ajv.addFormat("uf", (s: string) => UFS.includes(s));
ajv.addFormat("color", /^#[0-9a-fA-F]{6}$/);
ajv.addFormat("cbo", /^\d{4}-\d{2}$/);
ajv.addFormat("cid", /^[A-Z]\d{2}(\.\d)?$/);

const cache = new WeakMap<ResourceDef, { full: ValidateFunction; partial: ValidateFunction }>();

function validators(r: ResourceDef) {
  let v = cache.get(r);
  if (!v) {
    v = { full: ajv.compile(inputSchema(r)), partial: ajv.compile(inputSchema(r, true)) };
    cache.set(r, v);
  }
  return v;
}

/** Valida o corpo de POST/PUT (full) ou PATCH (partial); lança 400 com os erros por campo. */
export function validateInput(r: ResourceDef, body: unknown, partial: boolean): Record<string, unknown> {
  const fn = partial ? validators(r).partial : validators(r).full;
  if (!fn(body)) {
    const errors = (fn.errors ?? []).map((e) => ({
      field: e.instancePath.replace(/^\//, "").replace(/\//g, ".") || (e.params as { missingProperty?: string; additionalProperty?: string }).missingProperty || (e.params as { additionalProperty?: string }).additionalProperty || "",
      message: e.message ?? "inválido",
    }));
    throw badRequest("O corpo não segue o schema do recurso.", { errors });
  }
  return body as Record<string, unknown>;
}
