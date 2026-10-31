import { describe, expect, it } from "vitest";
import { makeApp, setupAdmin, createKey } from "./helpers.ts";
import type { AiModule } from "../src/ai/output-schema.ts";
import type { AiProvider } from "../src/ai/providers.ts";
import { validate } from "@readme/openapi-parser";

const field = (o: Partial<AiModule["resources"][0]["fields"][0]> & { name: string; type: AiModule["resources"][0]["fields"][0]["type"] }) => ({
  label: o.name, description: null, required: false, enumValues: null, ref: null, onDelete: null, format: null, min: null, max: null, faker: null, samples: null, group: null, imageKind: null, unit: null, ...o,
});

const VET: AiModule = {
  slug: "clinica-vet",
  title: "Clínica Veterinária",
  description: "Tutores, pets e consultas.",
  resources: [
    { slug: "tutores", label: "Tutor", labelPlural: "Tutores", description: "Donos", titleField: "nome", records: 10, card: null, map: { geometry: ["endereco_geo"], category: null }, fields: [field({ name: "nome", type: "string", required: true, faker: "person.fullName" }), field({ name: "cpf", type: "string", format: "cpf" }), field({ name: "endereco_geo", type: "geo_point" })] },
    { slug: "pets", label: "Pet", labelPlural: "Pets", description: "Animais", titleField: "nome", records: 20, card: { title: "nome", subtitle: "especie", image: "foto_url", badges: ["especie"], description: null }, map: null, fields: [field({ name: "nome", type: "string", required: true, samples: ["Thor", "Mel", "Bidu"] }), field({ name: "especie", type: "enum", enumValues: ["Cão", "Gato"], required: true }), field({ name: "tutor_id", type: "ref", ref: "tutores", required: true }), field({ name: "foto_url", type: "image", imageKind: "avatar" }), field({ name: "peso", type: "number", min: 1, max: 40 })] },
    { slug: "consultas", label: "Consulta", labelPlural: "Consultas", description: "Atendimentos", titleField: "motivo", records: 40, card: null, map: null, fields: [field({ name: "pet_id", type: "ref", ref: "pets", required: true }), field({ name: "data", type: "date", required: true }), field({ name: "motivo", type: "string", samples: ["Vacina", "Check-up"] }), field({ name: "valor", type: "money", min: 80, max: 400 })] },
  ],
  charts: [{ name: "consultas-mes", title: "Consultas por mês", resource: "consultas", type: "line", groupBy: "data", interval: "month", metric: "count", seriesBy: null }],
  diagrams: [{ name: "tutores-pets", title: "Tutores e pets", kind: "graph", resource: null, parentField: null, nodes: [{ resource: "tutores", type: "tutor" }, { resource: "pets", type: "pet" }], edges: [{ resource: "pets", field: "tutor_id", label: "tutor" }] }],
  planActions: [{ name: "reajuste-consulta", title: "Reajuste", description: "Reajusta valores", resource: "consultas", field: "valor", operation: "percent", paramLabel: "%" }],
};

function fakeProvider(outputs: AiModule[]): AiProvider & { calls: number } {
  return {
    name: "fake",
    model: "fake-1",
    calls: 0,
    async generate() {
      return { module: outputs[Math.min(this.calls++, outputs.length - 1)], model: "fake-1", usage: { inputTokens: 10, outputTokens: 20 } };
    },
    async test() {
      return "ok";
    },
  };
}

describe("geração por IA", () => {
  it("gera prévia, salva e o módulo vira API documentada", async () => {
    const { app, ctx } = await makeApp();
    const cookie = await setupAdmin(app);
    const key = await createKey(app, cookie);
    ctx.ai.override = fakeProvider([VET]);
    const gen = await app.inject({ method: "POST", url: "/admin-api/ai/generate", headers: { cookie }, payload: { prompt: "clínica veterinária" } });
    expect(gen.statusCode, gen.body).toBe(200);
    const out = gen.json();
    expect(out.coverage).toEqual({ table: true, card: true, form: true, plan: true, map: true, chart: true, diagram: true });
    expect(out.preview.pets.length).toBeGreaterThan(0);
    expect(out.counts).toEqual({ tutores: 10, pets: 20, consultas: 40 });

    const save = await app.inject({ method: "POST", url: "/admin-api/modules", headers: { cookie }, payload: { definition: out.definition, counts: out.counts, prompt: "clínica veterinária", source: "ai" } });
    expect(save.statusCode, save.body).toBe(201);
    const pets = await app.inject({ url: "/api/v1/clinica-vet/pets?expand=tutor_id", headers: { "x-api-key": key } });
    expect(pets.json().meta.total).toBe(20);
    expect(pets.json().data[0].tutor.nome).toBeTruthy();
    expect(pets.json().data[0].foto_url).toContain("/api/v1/clinica-vet/pets/");
    expect((await app.inject({ url: "/api/v1/clinica-vet/pets/1/foto.png" })).headers["content-type"]).toBe("image/png");

    const spec = (await app.inject({ url: "/openapi.json" })).json();
    expect(spec.paths["/api/v1/clinica-vet/pets"]).toBeTruthy();
    expect((await validate(spec)).valid).toBe(true);

    const plan = await app.inject({ method: "POST", url: "/api/v1/clinica-vet/plans", headers: { "x-api-key": key }, payload: { action: "delete", resource: "tutores", ids: [1] } });
    expect(plan.json().totals.delete).toBeGreaterThanOrEqual(1);

    // mais dados e exclusão
    await app.inject({ method: "POST", url: "/admin-api/modules/clinica-vet/generate", headers: { cookie }, payload: { resource: "consultas", count: 5 } });
    expect((await app.inject({ url: "/api/v1/clinica-vet/consultas", headers: { "x-api-key": key } })).json().meta.total).toBe(45);
    expect((await app.inject({ method: "DELETE", url: "/admin-api/modules/clinica-vet", headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ url: "/api/v1/clinica-vet/pets", headers: { "x-api-key": key } })).statusCode).toBe(404);
  });

  it("corrige uma vez quando a definição vem incoerente", async () => {
    const { app, ctx } = await makeApp();
    const cookie = await setupAdmin(app);
    const broken: AiModule = { ...VET, resources: VET.resources.map((r) => (r.slug === "pets" ? { ...r, fields: r.fields.map((f) => (f.name === "tutor_id" ? { ...f, ref: "donos" } : f)) } : r)) };
    const fake = fakeProvider([broken, VET]);
    ctx.ai.override = fake;
    const gen = await app.inject({ method: "POST", url: "/admin-api/ai/generate", headers: { cookie }, payload: { prompt: "vet" } });
    expect(gen.statusCode, gen.body).toBe(200);
    expect(gen.json().repaired).toBe(true);
    expect(fake.calls).toBe(2);
  });

  it("sem chave configurada responde 400 explicando onde configurar", async () => {
    const { app } = await makeApp();
    const cookie = await setupAdmin(app);
    const res = await app.inject({ method: "POST", url: "/admin-api/ai/generate", headers: { cookie }, payload: { prompt: "qualquer coisa" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain("Configurações");
  });
});
