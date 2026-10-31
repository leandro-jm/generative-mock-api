import type { BuiltinModule, ModuleDef } from "../../engine/types.ts";
import { CAPITAIS, pointNear } from "../../lib/br.ts";
import { round2 } from "../../lib/util.ts";
import { filmTitle } from "../../lib/titles.ts";

const GENEROS = ["Ação", "Aventura", "Animação", "Comédia", "Crime", "Documentário", "Drama", "Fantasia", "Ficção científica", "Romance", "Suspense", "Terror", "Musical", "Faroeste"];
const CORES = ["#c0392b", "#1e8449", "#5dade2", "#f39c12", "#2c3e50", "#566573", "#6c3483", "#7d3c98", "#1f618d", "#c2185b", "#34495e", "#4a0000", "#e91e63", "#a0522d"];
const REDES = ["CineLux", "Cine Aurora", "Telão Cinemas", "Cine Estação", "Grand Plaza Cine"];
const LOCACOES = ["Farol da Ponta", "Mercado Municipal", "Estação Ferroviária Antiga", "Praia do Leste", "Mirante da Serra", "Fazenda Santa Rita", "Centro Histórico", "Porto Velho", "Cachoeira Grande", "Viaduto Central", "Biblioteca Pública", "Galpão 12"];

const DEF: ModuleDef = {
  slug: "filmes",
  title: "Filmes",
  description: "Catálogo de filmes fictícios com pôster e backdrop gerados, elenco, gêneros, avaliações, locações de filmagem e cinemas em cartaz.",
  source: "builtin",
  resources: [
    {
      slug: "generos",
      label: "Gênero",
      labelPlural: "Gêneros",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "descricao", label: "Descrição", type: "text" },
        { name: "cor", label: "Cor", type: "string", format: "color" },
      ],
    },
    {
      slug: "pessoas",
      label: "Pessoa",
      labelPlural: "Pessoas",
      description: "Atores, atrizes e equipe técnica (fictícios).",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "funcoes", label: "Funções", type: "tags", enum: ["Atuação", "Direção", "Roteiro", "Produção", "Fotografia"] },
        { name: "nascimento", label: "Nascimento", type: "date" },
        { name: "nacionalidade", label: "Nacionalidade", type: "string" },
        { name: "bio", label: "Biografia", type: "text" },
        { name: "foto_url", label: "Foto", type: "image", imageKind: "avatar", readOnly: true },
      ],
      views: { card: { title: "nome", subtitle: "nacionalidade", image: "foto_url", badges: ["funcoes"], fields: ["nascimento"] } },
    },
    {
      slug: "filmes",
      label: "Filme",
      labelPlural: "Filmes",
      titleField: "titulo",
      searchFields: ["titulo", "titulo_original", "sinopse"],
      defaultSort: "-ano",
      fields: [
        { name: "titulo", label: "Título", type: "string", required: true, group: "Informações" },
        { name: "titulo_original", label: "Título original", type: "string", group: "Informações" },
        { name: "sinopse", label: "Sinopse", type: "text", group: "Informações" },
        { name: "ano", label: "Ano", type: "integer", min: 1950, max: 2030, required: true, group: "Informações" },
        { name: "lancamento", label: "Lançamento", type: "date", group: "Informações" },
        { name: "duracao_min", label: "Duração", type: "integer", unit: "min", min: 1, group: "Informações" },
        { name: "genero_ids", label: "Gêneros", type: "refs", ref: "generos", group: "Classificação" },
        { name: "classificacao", label: "Classificação indicativa", type: "enum", enum: ["L", "10", "12", "14", "16", "18"], group: "Classificação" },
        { name: "idioma", label: "Idioma", type: "enum", enum: ["Português", "Inglês", "Espanhol", "Francês", "Coreano", "Japonês"], group: "Classificação" },
        { name: "pais", label: "País", type: "string", group: "Classificação" },
        { name: "status", label: "Status", type: "enum", enum: ["Em produção", "Em cartaz", "Lançado", "Streaming"], required: true, group: "Classificação" },
        { name: "nota", label: "Nota", type: "number", min: 0, max: 10, group: "Números" },
        { name: "votos", label: "Votos", type: "integer", min: 0, group: "Números" },
        { name: "orcamento", label: "Orçamento", type: "money", group: "Números" },
        { name: "bilheteria", label: "Bilheteria", type: "money", group: "Números" },
        { name: "diretor_id", label: "Direção", type: "ref", ref: "pessoas", group: "Equipe" },
        { name: "elenco_ids", label: "Elenco", type: "refs", ref: "pessoas", group: "Equipe" },
        { name: "poster_url", label: "Pôster", type: "image", imageKind: "poster", readOnly: true },
        { name: "backdrop_url", label: "Backdrop", type: "image", imageKind: "backdrop", readOnly: true },
      ],
      views: {
        table: { columns: ["titulo", "ano", "genero_ids", "diretor_id", "nota", "bilheteria", "status"] },
        card: { title: "titulo", subtitle: "ano", image: "poster_url", badges: ["genero_ids", "classificacao"], description: "sinopse", fields: ["diretor_id", "duracao_min", "nota", "status"] },
      },
    },
    {
      slug: "avaliacoes",
      label: "Avaliação",
      labelPlural: "Avaliações",
      titleField: "titulo",
      defaultSort: "-data",
      fields: [
        { name: "filme_id", label: "Filme", type: "ref", ref: "filmes", required: true },
        { name: "autor", label: "Autor", type: "string", required: true },
        { name: "critico", label: "Crítico profissional", type: "boolean" },
        { name: "nota", label: "Nota", type: "integer", min: 1, max: 10, required: true },
        { name: "titulo", label: "Título", type: "string" },
        { name: "comentario", label: "Comentário", type: "text" },
        { name: "data", label: "Data", type: "date", required: true },
      ],
    },
    {
      slug: "locacoes",
      label: "Locação",
      labelPlural: "Locações de filmagem",
      titleField: "nome",
      fields: [
        { name: "filme_id", label: "Filme", type: "ref", ref: "filmes", required: true },
        { name: "nome", label: "Nome do local", type: "string", required: true },
        { name: "cidade", label: "Cidade", type: "string" },
        { name: "uf", label: "UF", type: "string", format: "uf" },
        { name: "localizacao", label: "Localização", type: "geo_point", required: true },
        { name: "dias_filmagem", label: "Dias de filmagem", type: "integer", min: 1 },
      ],
      views: { map: { geometry: ["localizacao"], category: "cidade" } },
    },
    {
      slug: "cinemas",
      label: "Cinema",
      labelPlural: "Cinemas",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "rede", label: "Rede", type: "enum", enum: REDES },
        { name: "endereco", label: "Endereço", type: "string" },
        { name: "cidade", label: "Cidade", type: "string" },
        { name: "uf", label: "UF", type: "string", format: "uf" },
        { name: "localizacao", label: "Localização", type: "geo_point", required: true },
        { name: "salas", label: "Salas", type: "integer", min: 1 },
        { name: "em_cartaz_ids", label: "Em cartaz", type: "refs", ref: "filmes" },
      ],
      views: { map: { geometry: ["localizacao"], category: "rede" }, card: { title: "nome", subtitle: "rede", badges: ["cidade"], fields: ["endereco", "salas", "em_cartaz_ids"] } },
    },
  ],
  charts: [
    { name: "bilheteria-ano", title: "Bilheteria por ano", resource: "filmes", type: "bar", groupBy: "ano", metric: "sum:bilheteria", sort: "label", unit: "BRL" },
    { name: "bilheteria-genero", title: "Bilheteria por gênero", resource: "filmes", type: "pie", groupBy: "genero_ids", metric: "sum:bilheteria", unit: "BRL" },
    { name: "nota-genero", title: "Nota média por gênero", resource: "filmes", type: "bar", groupBy: "genero_ids", metric: "avg:nota" },
    { name: "filmes-status", title: "Filmes por status", resource: "filmes", type: "pie", groupBy: "status", metric: "count" },
    { name: "avaliacoes-mes", title: "Avaliações por mês (crítica × público)", resource: "avaliacoes", type: "line", groupBy: "data", interval: "month", metric: "count", seriesBy: "critico", sort: "label" },
  ],
  diagrams: [
    { name: "colaboracoes", title: "Colaborações entre elenco e direção", description: "Filmes ligados a quem dirigiu e atuou.", kind: "graph", graph: { nodes: [{ resource: "filmes", type: "filme", limit: 25 }, { resource: "pessoas", type: "pessoa", limit: 120 }], edges: [{ resource: "filmes", field: "diretor_id", label: "direção" }, { resource: "filmes", field: "elenco_ids", label: "elenco" }] } },
    { name: "generos", title: "Filmes por gênero", kind: "graph", graph: { nodes: [{ resource: "generos", type: "genero" }, { resource: "filmes", type: "filme", limit: 40 }], edges: [{ resource: "filmes", field: "genero_ids" }] } },
  ],
};

export const filmesModule: BuiltinModule = {
  def: DEF,
  seed: (ctx) => {
    const f = ctx.faker(ctx.settings.num("data.seed") + 1);
    const n = (x: number) => Math.max(1, Math.round(x * ctx.settings.num("data.scale")));
    const put = (r: string, items: Record<string, unknown>[]) => ctx.store.bulkInsert("filmes", r, items);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    put("generos", GENEROS.map((nome, i) => ({ id: i + 1, nome, descricao: f.lorem.sentence(), cor: CORES[i] })));

    const nPessoas = n(120);
    const pessoas = Array.from({ length: nPessoas }, (_, i) => {
      const diretor = i < nPessoas / 6;
      return {
        id: i + 1,
        nome: f.person.fullName(),
        funcoes: diretor ? f.helpers.arrayElements(["Direção", "Roteiro", "Produção"], { min: 1, max: 2 }).concat(["Direção"]).filter((v, k, a) => a.indexOf(v) === k) : f.datatype.boolean({ probability: 0.1 }) ? ["Atuação", "Produção"] : ["Atuação"],
        nascimento: iso(f.date.birthdate({ min: 20, max: 80, mode: "age" })),
        nacionalidade: f.helpers.weightedArrayElement([{ value: "Brasileira", weight: 6 }, { value: "Portuguesa", weight: 1 }, { value: "Argentina", weight: 1 }, { value: "Estadunidense", weight: 2 }, { value: "Francesa", weight: 1 }]),
        bio: f.lorem.paragraph(),
      };
    });
    put("pessoas", pessoas);
    const diretores = pessoas.filter((p) => p.funcoes.includes("Direção")).map((p) => p.id);
    const atores = pessoas.filter((p) => p.funcoes.includes("Atuação")).map((p) => p.id);

    const nFilmes = n(80);
    const ano = new Date().getUTCFullYear();
    const filmes = Array.from({ length: nFilmes }, (_, i) => {
      const t = filmTitle(f);
      const y = f.number.int({ min: ano - 30, max: ano + 1 });
      const status = y > ano ? "Em produção" : y === ano ? f.helpers.arrayElement(["Em cartaz", "Em cartaz", "Lançado"]) : f.helpers.arrayElement(["Lançado", "Streaming"]);
      const orc = f.number.int({ min: 2, max: 180 }) * 1_000_000;
      const nota = round2(f.number.float({ min: 3.5, max: 9.4, fractionDigits: 1 }));
      return {
        id: i + 1,
        titulo: t.titulo,
        titulo_original: f.datatype.boolean({ probability: 0.35 }) ? t.original : t.titulo,
        sinopse: f.lorem.paragraph({ min: 2, max: 4 }),
        ano: y,
        lancamento: iso(f.date.between({ from: `${y}-01-01`, to: `${y}-12-28` })),
        duracao_min: f.number.int({ min: 78, max: 172 }),
        genero_ids: f.helpers.arrayElements(GENEROS.map((_, k) => k + 1), { min: 1, max: 3 }).sort((a, b) => a - b),
        classificacao: f.helpers.arrayElement(["L", "10", "12", "14", "16", "18"]),
        idioma: f.helpers.weightedArrayElement([{ value: "Português", weight: 6 }, { value: "Inglês", weight: 3 }, { value: "Espanhol", weight: 1 }, { value: "Francês", weight: 1 }, { value: "Coreano", weight: 1 }]),
        pais: f.helpers.weightedArrayElement([{ value: "Brasil", weight: 6 }, { value: "Estados Unidos", weight: 2 }, { value: "Portugal", weight: 1 }, { value: "Argentina", weight: 1 }]),
        status,
        nota: status === "Em produção" ? null : nota,
        votos: status === "Em produção" ? 0 : f.number.int({ min: 120, max: 250_000 }),
        orcamento: orc,
        bilheteria: status === "Em produção" ? 0 : Math.round(orc * f.number.float({ min: 0.2, max: 6 }) * (nota / 7)),
        diretor_id: f.helpers.arrayElement(diretores),
        elenco_ids: f.helpers.arrayElements(atores, { min: 3, max: 7 }),
      };
    });
    put("filmes", filmes);

    const lancados = filmes.filter((x) => x.status !== "Em produção");
    const avaliacoes = Array.from({ length: n(400) }, () => {
      const filme = f.helpers.arrayElement(lancados);
      const nota = Math.max(1, Math.min(10, Math.round((filme.nota ?? 6) + f.number.float({ min: -3, max: 2.5 }))));
      return {
        filme_id: filme.id,
        autor: f.person.fullName(),
        critico: f.datatype.boolean({ probability: 0.2 }),
        nota,
        titulo: f.helpers.arrayElement(nota >= 8 ? ["Imperdível", "Uma obra-prima", "Emocionante do início ao fim", "Surpreendente"] : nota >= 5 ? ["Vale a sessão", "Bom, mas irregular", "Diverte", "Atuações acima do roteiro"] : ["Decepcionante", "Longo demais", "Não convence", "Fraco"]),
        comentario: f.lorem.sentences({ min: 1, max: 4 }),
        data: iso(f.date.between({ from: `${Math.max(filme.ano, ano - 3)}-01-01`, to: new Date() })),
      };
    }).sort((a, b) => a.data.localeCompare(b.data));
    put("avaliacoes", avaliacoes);

    put("locacoes", Array.from({ length: n(60) }, () => {
      const cidade = f.helpers.arrayElement(CAPITAIS);
      return { filme_id: f.number.int({ min: 1, max: nFilmes }), nome: f.helpers.arrayElement(LOCACOES), cidade: cidade.cidade, uf: cidade.uf, localizacao: { type: "Point", coordinates: pointNear(f, cidade, 25) }, dias_filmagem: f.number.int({ min: 1, max: 21 }) };
    }));

    const emCartaz = filmes.filter((x) => x.status === "Em cartaz").map((x) => x.id);
    put("cinemas", Array.from({ length: n(30) }, (_, i) => {
      const cidade = CAPITAIS[i % CAPITAIS.length];
      const rede = f.helpers.arrayElement(REDES);
      return { nome: `${rede} ${f.helpers.arrayElement(["Shopping", "Centro", "Park", "Boulevard", "Plaza"])} ${f.location.street().split(" ").slice(-1)[0]}`, rede, endereco: f.location.streetAddress(), cidade: cidade.cidade, uf: cidade.uf, localizacao: { type: "Point", coordinates: pointNear(f, cidade, 10) }, salas: f.number.int({ min: 2, max: 14 }), em_cartaz_ids: emCartaz.length ? f.helpers.arrayElements(emCartaz, { min: 1, max: Math.min(6, emCartaz.length) }) : [] };
    }));
  },
  image: (resource, field, rec, ctx) => {
    if (resource === "filmes") {
      const generos = ((rec.genero_ids as number[]) ?? []).map((g) => GENEROS[g - 1]).filter(Boolean);
      const diretor = ctx.store.get("filmes", "pessoas", rec.diretor_id as number);
      if (field === "backdrop_url") return { kind: "backdrop", title: String(rec.titulo), subtitle: `${rec.ano} · ${generos.join(" · ")}`, seed: `filme-${rec.id}`, palette: generos[0] };
      return { kind: "poster", title: String(rec.titulo), subtitle: diretor ? `Um filme de ${diretor.nome}` : null, footer: `${rec.ano} · ${rec.classificacao === "L" ? "Livre" : `${rec.classificacao} anos`}`, tag: generos[0] ?? null, seed: `filme-${rec.id}`, palette: generos[0] };
    }
    if (resource === "pessoas") return { kind: "avatar", title: String(rec.nome), seed: `pessoa-${rec.id}-${rec.nome}` };
    return undefined;
  },
};
