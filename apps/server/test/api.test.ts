import { describe, expect, it, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { validate } from "@readme/openapi-parser";
import { createKey, makeApp, setupAdmin } from "./helpers.ts";
import type { AppContext } from "../src/context.ts";

let app: FastifyInstance;
let ctx: AppContext;
let cookie: string;
let key: string;

beforeAll(async () => {
  ({ app, ctx } = await makeApp());
  cookie = await setupAdmin(app);
  key = await createKey(app, cookie);
});

const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers: { "x-api-key": key, ...headers } });
const send = (method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({ method, url, payload: payload as object, headers: { "x-api-key": key, ...headers } });

describe("primeiro acesso e usuários", () => {
  it("setup só funciona uma vez", async () => {
    const status = await app.inject({ url: "/admin-api/setup/status" });
    expect(status.json().needsSetup).toBe(false);
    const again = await app.inject({ method: "POST", url: "/admin-api/setup", payload: { name: "Outro", email: "x@y.com", password: "12345678" } });
    expect(again.statusCode).toBe(409);
  });
  it("admin cria usuário viewer que só lê", async () => {
    const res = await app.inject({ method: "POST", url: "/admin-api/users", headers: { cookie }, payload: { name: "Leitora", email: "leitora@teste.com", password: "senha-123456", role: "viewer" } });
    expect(res.statusCode).toBe(201);
    const login = await app.inject({ method: "POST", url: "/admin-api/login", payload: { email: "leitora@teste.com", password: "senha-123456" } });
    const viewerCookie = `mock_session=${login.cookies.find((c) => c.name === "mock_session")!.value}`;
    expect((await app.inject({ url: "/api/v1/livros/livros", headers: { cookie: viewerCookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/livros/autores", headers: { cookie: viewerCookie }, payload: { nome: "X" } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/admin-api/users", headers: { cookie: viewerCookie } })).statusCode).toBe(403);
  });
});

describe("autenticação das APIs", () => {
  it("sem credencial dá 401 e com chave inválida também", async () => {
    expect((await app.inject({ url: "/api/v1/filmes/filmes" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/filmes/filmes", headers: { "x-api-key": "mk_errada" } })).statusCode).toBe(401);
  });
  it("respeita scopes da chave", async () => {
    const livrosRead = await createKey(app, cookie, ["livros:read"]);
    expect((await get("/api/v1/livros/livros", { "x-api-key": livrosRead })).statusCode).toBe(200);
    expect((await get("/api/v1/rh/colaboradores", { "x-api-key": livrosRead })).statusCode).toBe(403);
    expect((await send("POST", "/api/v1/livros/autores", { nome: "Y" }, { "x-api-key": livrosRead })).statusCode).toBe(403);
  });
  it("emite JWT por API key e por usuário/senha", async () => {
    const t1 = await app.inject({ method: "POST", url: "/api/v1/auth/token", payload: { apiKey: key } });
    expect(t1.statusCode).toBe(200);
    const bearer = { authorization: `Bearer ${t1.json().access_token}` };
    expect((await app.inject({ url: "/api/v1/rh/cargos", headers: bearer })).statusCode).toBe(200);
    const t2 = await app.inject({ method: "POST", url: "/api/v1/auth/token", payload: { email: "admin@teste.com", password: "senha-forte-123" } });
    expect(t2.json().scopes).toEqual(["*"]);
    expect((await app.inject({ url: "/api/v1/rh/cargos", headers: { authorization: "Bearer xyz" } })).statusCode).toBe(401);
  });
  it("auth.required desligado libera anônimo", async () => {
    ctx.settings.set("auth.required", false);
    expect((await app.inject({ url: "/api/v1/filmes/generos" })).statusCode).toBe(200);
    ctx.settings.set("auth.required", true);
  });
});

describe("CRUD, filtros e paginação", () => {
  it("lista com filtro, ordenação e headers", async () => {
    const res = await get("/api/v1/livros/livros?preco[gte]=100&sort=-preco&limit=5");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.data.every((l: { preco: number }) => l.preco >= 100)).toBe(true);
    const precos = body.data.map((l: { preco: number }) => l.preco);
    expect(precos).toEqual([...precos].sort((a: number, b: number) => b - a));
    expect(res.headers["x-total-count"]).toBe(String(body.meta.total));
    expect(String(res.headers.link)).toContain('rel="next"');
    expect(body.data[0].capa_url).toMatch(/^http:\/\/localhost(:\d+)?\/api\/v1\/livros\/livros\/\d+\/capa\.svg$/);
  });
  it("expand embute referências", async () => {
    const res = await get("/api/v1/filmes/filmes/1?expand=diretor_id,elenco_ids");
    const f = res.json();
    expect(f.diretor.nome).toBeTruthy();
    expect(Array.isArray(f.elenco)).toBe(true);
  });
  it("valida o corpo, cria, atualiza e exclui", async () => {
    const bad = await send("POST", "/api/v1/rh/colaboradores", { nome: "A", cpf: "123" });
    expect(bad.statusCode).toBe(400);
    expect(bad.headers["content-type"]).toContain("application/problem+json");
    expect(bad.json().errors.length).toBeGreaterThan(0);
    const badRef = await send("POST", "/api/v1/livros/livros", { titulo: "T", editora_id: 999, isbn13: "978-85-0000-000-0", preco: 10 });
    expect(badRef.statusCode).toBe(400);
    const created = await send("POST", "/api/v1/livros/livros", { titulo: "Livro de Teste", editora_id: 1, isbn13: "978-65-5000-000-4", preco: 59.9, autor_ids: [1] });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    expect(created.headers.location).toContain(`/livros/livros/${id}`);
    const patched = await send("PATCH", `/api/v1/livros/livros/${id}`, { preco: 64.9 });
    expect(patched.json().preco).toBe(64.9);
    expect(patched.json().titulo).toBe("Livro de Teste");
    expect((await send("DELETE", `/api/v1/livros/livros/${id}`)).statusCode).toBe(204);
    expect((await get(`/api/v1/livros/livros/${id}`)).statusCode).toBe(404);
  });
});

describe("views", () => {
  for (const mod of ["rh", "filmes", "livros"]) {
    it(`${mod}: cobre as 7 views`, async () => {
      const m = (await get(`/api/v1/${mod}`)).json();
      expect(m.views).toEqual({ table: true, card: true, form: true, plan: true, map: true, chart: true, diagram: true });
      const def = (await app.inject({ url: `/admin-api/modules/${mod}`, headers: { cookie } })).json().definition;
      for (const r of def.resources) {
        const table = (await get(`/api/v1/${mod}/${r.slug}/_views/table?limit=3`)).json();
        expect(table.columns[0].key).toBe("id");
        const form = (await get(`/api/v1/${mod}/${r.slug}/_views/form`)).json();
        for (const f of r.fields.filter((x: { readOnly?: boolean }) => !x.readOnly)) expect(form.uiSchema[f.name], `${r.slug}.${f.name}`).toBeTruthy();
        const cards = (await get(`/api/v1/${mod}/${r.slug}/_views/card?limit=2`)).json();
        expect(cards.data[0].title).toBeTruthy();
        if (r.fields.some((f: { type: string }) => f.type.startsWith("geo_"))) {
          const map = (await get(`/api/v1/${mod}/${r.slug}/_views/map`)).json();
          expect(map.type).toBe("FeatureCollection");
          expect(map.features.length).toBeGreaterThan(0);
          expect(map.features[0].geometry.coordinates.length).toBeGreaterThan(0);
        }
      }
      for (const c of (await get(`/api/v1/${mod}/_views/charts`)).json().data) {
        const chart = (await get(c.url)).json();
        expect(chart.labels.length, c.name).toBeGreaterThan(0);
        for (const s of chart.series) expect(s.data.length).toBe(chart.labels.length);
      }
      for (const d of (await get(`/api/v1/${mod}/_views/diagrams`)).json().data) {
        const diagram = (await get(d.url)).json();
        expect(diagram.nodes.length, d.name).toBeGreaterThan(0);
        const ids = new Set(diagram.nodes.map((n: { id: string }) => n.id));
        for (const e of diagram.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      }
    });
  }
  it("chart livre por recurso", async () => {
    const res = await get("/api/v1/rh/colaboradores/_views/chart?groupBy=departamento_id&metric=avg:salario&type=bar&status=Ativo");
    expect(res.statusCode).toBe(200);
    expect(res.json().unit).toBe("BRL");
  });
  it("form de edição traz valores atuais", async () => {
    const form = (await get("/api/v1/rh/colaboradores/_views/form?mode=edit&id=1")).json();
    expect(form.submit.method).toBe("PUT");
    expect(form.initialValues.nome).toBeTruthy();
    expect(form.steps.length).toBe(4);
    expect(form.uiSchema.cpf.mask).toBe("000.000.000-00");
  });
});

describe("plan (ação com confirmação)", () => {
  it("exclusão em cascata: mostra impacto e só executa ao confirmar", async () => {
    const livrosDaEditora = (await get("/api/v1/livros/livros?editora_id=2&limit=100")).json().meta.total;
    const plan = (await send("POST", "/api/v1/livros/plans", { action: "delete", resource: "editoras", ids: [2] })).json();
    expect(plan.status).toBe("pending");
    expect(plan.totals.delete).toBeGreaterThan(livrosDaEditora);
    expect(plan.impacts.some((i: { resource: string; effect: string }) => i.resource === "livros" && i.effect === "delete")).toBe(true);
    expect((await get("/api/v1/livros/editoras/2")).statusCode).toBe(200);
    const semFrase = await send("POST", `/api/v1/livros/plans/${plan.id}/confirm`, {});
    if (plan.confirmation.phrase) {
      expect(semFrase.statusCode).toBe(400);
      const ok = await send("POST", `/api/v1/livros/plans/${plan.id}/confirm`, { phrase: plan.confirmation.phrase });
      expect(ok.json().status).toBe("confirmed");
    } else expect(semFrase.json().status).toBe("confirmed");
    expect((await get("/api/v1/livros/editoras/2")).statusCode).toBe(404);
    expect((await get("/api/v1/livros/livros?editora_id=2")).json().meta.total).toBe(0);
  });
  it("409 se os dados mudarem depois do plano", async () => {
    const plan = (await send("POST", "/api/v1/filmes/plans", { action: "delete", resource: "pessoas", ids: [3] })).json();
    await send("PATCH", "/api/v1/filmes/pessoas/3", { bio: "mudou" });
    const res = await send("POST", `/api/v1/filmes/plans/${plan.id}/confirm`, { phrase: plan.confirmation.phrase });
    expect(res.statusCode).toBe(409);
  });
  it("restrict bloqueia (cargo com colaboradores)", async () => {
    const plan = (await send("POST", "/api/v1/rh/plans", { action: "delete", resource: "cargos", ids: [1] })).json();
    expect(plan.status).toBe("blocked");
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect((await send("POST", `/api/v1/rh/plans/${plan.id}/confirm`, {})).statusCode).toBe(409);
    expect((await send("DELETE", "/api/v1/rh/cargos/1")).statusCode).toBe(409);
  });
  it("desligar colaborador cria rescisão e S-2299", async () => {
    const ativo = (await get("/api/v1/rh/colaboradores?status=Ativo&limit=1&sort=-salario")).json().data[0];
    const antes = (await get("/api/v1/rh/rescisoes")).json().meta.total;
    const plan = (await send("POST", "/api/v1/rh/plans", { action: "desligar-colaborador", ids: [ativo.id], resource: "colaboradores", params: { tipo: "sem_justa_causa" } })).json();
    expect(plan.severity).toBe("high");
    expect(plan.impacts.some((i: { resource: string }) => i.resource === "esocial-eventos")).toBe(true);
    const done = (await send("POST", `/api/v1/rh/plans/${plan.id}/confirm`, { phrase: plan.confirmation.phrase })).json();
    expect(done.status).toBe("confirmed");
    expect((await get(`/api/v1/rh/colaboradores/${ativo.id}`)).json().status).toBe("Desligado");
    expect((await get("/api/v1/rh/rescisoes")).json().meta.total).toBe(antes + 1);
  });
  it("reajuste em lote mostra diff", async () => {
    const plan = (await send("POST", "/api/v1/livros/plans", { action: "reajuste-preco", filter: { formato: "E-book" }, params: { percent: 10 } })).json();
    const d = plan.impacts[0].diff.preco;
    expect(d.after).toBeCloseTo(d.before * 1.1, 1);
  });
  it("com mock.confirmDeletes, DELETE responde 428 e executa com X-Confirm-Plan", async () => {
    ctx.settings.set("mock.confirmDeletes", true);
    const first = await send("DELETE", "/api/v1/filmes/avaliacoes/5");
    expect(first.statusCode).toBe(428);
    const plan = first.json().plan;
    const second = await send("DELETE", "/api/v1/filmes/avaliacoes/5", undefined, { "x-confirm-plan": plan.id });
    expect(second.json().status).toBe("confirmed");
    ctx.settings.set("mock.confirmDeletes", false);
  });
});

describe("imagens, mock e cálculos", () => {
  it("serve SVG e PNG sem autenticação", async () => {
    const svg = await app.inject({ url: "/api/v1/filmes/filmes/1/poster.svg" });
    expect(svg.statusCode).toBe(200);
    expect(svg.headers["content-type"]).toContain("image/svg+xml");
    expect(svg.body).toContain("<svg");
    const png = await app.inject({ url: "/api/v1/livros/livros/1/capa.png?w=200" });
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    expect((await app.inject({ url: "/api/v1/rh/colaboradores/1/foto.svg" })).statusCode).toBe(200);
  });
  it("X-Mock-Status força erro", async () => {
    const res = await get("/api/v1/rh/cargos", { "x-mock-status": "503" });
    expect(res.statusCode).toBe(503);
    expect(res.json().mock).toBe(true);
  });
  it("cálculo de rescisão por colaborador", async () => {
    const res = await send("POST", "/api/v1/rh/calculos/rescisao", { colaborador_id: 20, data_desligamento: new Date().toISOString().slice(0, 10), tipo: "acordo" });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().fgts.multaPercentual).toBe(20);
    expect((await send("POST", "/api/v1/rh/calculos/inss", { salario: 3000 })).json().valor).toBe(253.41);
  });
  it("livro por ISBN", async () => {
    const l = (await get("/api/v1/livros/livros/3")).json();
    expect((await get(`/api/v1/livros/livros/isbn/${l.isbn13}`)).json().id).toBe(3);
  });
});

describe("OpenAPI", () => {
  it("spec completa e por módulo são válidas", async () => {
    const all = await app.inject({ url: "/openapi.json" });
    expect(all.statusCode).toBe(200);
    const result = await validate(all.json());
    expect(result.valid, JSON.stringify(result.valid ? [] : result.errors.slice(0, 3))).toBe(true);
    for (const m of ["rh", "filmes", "livros"]) {
      const doc = (await app.inject({ url: `/openapi/${m}.json` })).json();
      const r = await validate(doc);
      expect(r.valid, `${m}: ${JSON.stringify(r.valid ? [] : r.errors.slice(0, 3))}`).toBe(true);
    }
    expect((await app.inject({ url: "/openapi.yaml" })).body).toContain("openapi: 3.1.0");
    expect((await app.inject({ url: "/docs" })).body).toContain("swagger-ui");
  });
});

describe("configurações", () => {
  it("UI > env > padrão e segredo cifrado", async () => {
    const { ctx: c2 } = await makeApp({ MOCK_PAGE_SIZE: "7", ANTHROPIC_API_KEY: "sk-env" });
    expect(c2.settings.num("mock.defaultPageSize")).toBe(7);
    expect(c2.settings.list().settings.find((s) => s.key === "mock.defaultPageSize")!.source).toBe("env");
    c2.settings.set("mock.defaultPageSize", 9);
    expect(c2.settings.num("mock.defaultPageSize")).toBe(9);
    c2.settings.set("ai.anthropicApiKey", "sk-tela");
    const raw = c2.db.prepare("SELECT value FROM settings WHERE key = 'ai.anthropicApiKey'").get() as { value: string };
    expect(raw.value).not.toContain("sk-tela");
    expect(c2.settings.str("ai.anthropicApiKey")).toBe("sk-tela");
    expect(c2.settings.list().settings.find((s) => s.key === "ai.anthropicApiKey")!.value).toBe("••••••••");
    c2.settings.reset("mock.defaultPageSize");
    expect(c2.settings.num("mock.defaultPageSize")).toBe(7);
    expect(() => c2.settings.set("mock.errorRate", 300)).toThrow();
  });
  it("a tela salva e exporta .env", async () => {
    const res = await app.inject({ method: "PUT", url: "/admin-api/settings", headers: { cookie }, payload: { values: { "general.appName": "Meu Mock", "mock.latencyMaxMs": 0 } } });
    expect(res.statusCode).toBe(200);
    const env = await app.inject({ url: "/admin-api/settings/export", headers: { cookie } });
    expect(env.body).toContain("APP_NAME=");
  });
});
