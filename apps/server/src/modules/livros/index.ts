import { z } from "zod";
import type { BuiltinModule, ModuleDef } from "../../engine/types.ts";
import { CAPITAIS, genCnpj, genIsbn13, isbn13to10, pointNear } from "../../lib/br.ts";
import { notFound } from "../../lib/errors.ts";
import { present } from "../../engine/present.ts";
import { round2 } from "../../lib/util.ts";
import { bookTitle } from "../../lib/titles.ts";

const GENEROS = ["Romance", "Fantasia", "Ficção científica", "Suspense", "Poesia", "Contos", "Infantojuvenil", "Biografia", "História", "Técnico", "Negócios", "Autoajuda", "Divulgação científica"];
const EDITORAS = ["Editora Pedra Azul", "Maré Alta Edições", "Grão Editorial", "Papel & Tinta", "Editora Horizonte Norte", "Selo Vagalume", "Editora Ventania", "Quintal Edições", "Editora Tucano", "Farol Editorial", "Lúmen Livros", "Casa Ipê"];

const DEF: ModuleDef = {
  slug: "livros",
  title: "Livros",
  description: "Catálogo de livros fictícios com capa gerada, ISBN válido, autores, editoras, séries, avaliações, vendas e livrarias com estoque no mapa.",
  source: "builtin",
  resources: [
    {
      slug: "editoras",
      label: "Editora",
      labelPlural: "Editoras",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "cnpj", label: "CNPJ", type: "string", format: "cnpj" },
        { name: "cidade", label: "Cidade", type: "string" },
        { name: "uf", label: "UF", type: "string", format: "uf" },
        { name: "fundacao", label: "Ano de fundação", type: "integer", min: 1800, max: 2030 },
        { name: "site", label: "Site", type: "url" },
      ],
    },
    {
      slug: "autores",
      label: "Autor",
      labelPlural: "Autores",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "nacionalidade", label: "Nacionalidade", type: "string" },
        { name: "nascimento", label: "Nascimento", type: "date" },
        { name: "bio", label: "Biografia", type: "text" },
        { name: "foto_url", label: "Foto", type: "image", imageKind: "avatar", readOnly: true },
      ],
      views: { card: { title: "nome", subtitle: "nacionalidade", image: "foto_url", description: "bio", fields: ["nascimento"] } },
    },
    {
      slug: "series",
      label: "Série",
      labelPlural: "Séries",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "descricao", label: "Descrição", type: "text" },
        { name: "editora_id", label: "Editora", type: "ref", ref: "editoras", onDelete: "unlink" },
      ],
    },
    {
      slug: "livros",
      label: "Livro",
      labelPlural: "Livros",
      titleField: "titulo",
      searchFields: ["titulo", "subtitulo", "isbn13", "sinopse"],
      fields: [
        { name: "titulo", label: "Título", type: "string", required: true, group: "Obra" },
        { name: "subtitulo", label: "Subtítulo", type: "string", group: "Obra" },
        { name: "autor_ids", label: "Autores", type: "refs", ref: "autores", group: "Obra" },
        { name: "generos", label: "Gêneros", type: "tags", enum: GENEROS, group: "Obra" },
        { name: "sinopse", label: "Sinopse", type: "text", group: "Obra" },
        { name: "idioma", label: "Idioma", type: "enum", enum: ["Português", "Inglês", "Espanhol"], group: "Obra" },
        { name: "serie_id", label: "Série", type: "ref", ref: "series", group: "Obra" },
        { name: "volume", label: "Volume na série", type: "integer", min: 1, group: "Obra" },
        { name: "editora_id", label: "Editora", type: "ref", ref: "editoras", required: true, onDelete: "cascade", group: "Edição" },
        { name: "isbn13", label: "ISBN-13", type: "string", format: "isbn13", required: true, group: "Edição" },
        { name: "isbn10", label: "ISBN-10", type: "string", format: "isbn10", group: "Edição" },
        { name: "edicao", label: "Edição", type: "integer", min: 1, group: "Edição" },
        { name: "ano", label: "Ano", type: "integer", min: 1800, max: 2030, group: "Edição" },
        { name: "lancamento", label: "Lançamento", type: "date", group: "Edição" },
        { name: "paginas", label: "Páginas", type: "integer", min: 1, group: "Edição" },
        { name: "formato", label: "Formato", type: "enum", enum: ["Brochura", "Capa dura", "E-book", "Audiolivro"], group: "Edição" },
        { name: "preco", label: "Preço", type: "money", min: 0, required: true, group: "Comercial" },
        { name: "estoque", label: "Estoque", type: "integer", min: 0, group: "Comercial" },
        { name: "nota_media", label: "Nota média", type: "number", min: 0, max: 5, readOnly: true, group: "Comercial" },
        { name: "capa_url", label: "Capa", type: "image", imageKind: "cover", readOnly: true },
      ],
      views: {
        table: { columns: ["titulo", "autor_ids", "editora_id", "ano", "preco", "estoque", "nota_media"] },
        card: { title: "titulo", subtitle: "autor_ids", image: "capa_url", badges: ["generos", "formato"], description: "sinopse", fields: ["editora_id", "ano", "paginas", "preco"] },
      },
    },
    {
      slug: "avaliacoes",
      label: "Avaliação",
      labelPlural: "Avaliações",
      titleField: "titulo",
      defaultSort: "-data",
      fields: [
        { name: "livro_id", label: "Livro", type: "ref", ref: "livros", required: true },
        { name: "leitor", label: "Leitor", type: "string", required: true },
        { name: "nota", label: "Nota", type: "integer", min: 1, max: 5, required: true },
        { name: "titulo", label: "Título", type: "string" },
        { name: "comentario", label: "Comentário", type: "text" },
        { name: "data", label: "Data", type: "date", required: true },
      ],
    },
    {
      slug: "livrarias",
      label: "Livraria",
      labelPlural: "Livrarias e bibliotecas",
      titleField: "nome",
      fields: [
        { name: "nome", label: "Nome", type: "string", required: true },
        { name: "tipo", label: "Tipo", type: "enum", enum: ["Livraria", "Biblioteca", "Sebo"], required: true },
        { name: "endereco", label: "Endereço", type: "string" },
        { name: "cidade", label: "Cidade", type: "string" },
        { name: "uf", label: "UF", type: "string", format: "uf" },
        { name: "localizacao", label: "Localização", type: "geo_point", required: true },
        { name: "telefone", label: "Telefone", type: "phone" },
        { name: "horario", label: "Horário", type: "string" },
        { name: "livro_ids", label: "Livros em estoque", type: "refs", ref: "livros" },
      ],
      views: { map: { geometry: ["localizacao"], category: "tipo" }, card: { title: "nome", subtitle: "tipo", badges: ["cidade"], fields: ["endereco", "horario", "telefone"] } },
    },
    {
      slug: "vendas",
      label: "Venda",
      labelPlural: "Vendas",
      titleField: "data",
      defaultSort: "-data",
      fields: [
        { name: "livro_id", label: "Livro", type: "ref", ref: "livros", required: true },
        { name: "livraria_id", label: "Livraria", type: "ref", ref: "livrarias" },
        { name: "data", label: "Data", type: "date", required: true },
        { name: "quantidade", label: "Quantidade", type: "integer", min: 1, required: true },
        { name: "valor_total", label: "Valor total", type: "money", required: true },
        { name: "canal", label: "Canal", type: "enum", enum: ["Loja física", "Site", "Marketplace", "Feira"], required: true },
      ],
    },
  ],
  charts: [
    { name: "vendas-mes", title: "Vendas por mês", resource: "vendas", type: "line", groupBy: "data", interval: "month", metric: "sum:valor_total", sort: "label", unit: "BRL" },
    { name: "vendas-canal", title: "Vendas por mês e canal", resource: "vendas", type: "bar", groupBy: "data", interval: "month", metric: "sum:quantidade", seriesBy: "canal", sort: "label" },
    { name: "livros-genero", title: "Livros por gênero", resource: "livros", type: "pie", groupBy: "generos", metric: "count" },
    { name: "top-autores", title: "Autores com mais livros", resource: "livros", type: "bar", groupBy: "autor_ids", metric: "count", limit: 10 },
    { name: "preco-medio-editora", title: "Preço médio por editora", resource: "livros", type: "bar", groupBy: "editora_id", metric: "avg:preco", unit: "BRL" },
  ],
  diagrams: [
    { name: "autores-livros-editoras", title: "Autores, livros e editoras", kind: "graph", graph: { nodes: [{ resource: "autores", type: "autor", limit: 60 }, { resource: "livros", type: "livro", limit: 30 }, { resource: "editoras", type: "editora" }], edges: [{ resource: "livros", field: "autor_ids", label: "autoria" }, { resource: "livros", field: "editora_id", label: "publicado por" }] } },
    { name: "series", title: "Séries e volumes", kind: "graph", graph: { nodes: [{ resource: "series", type: "serie" }, { resource: "livros", type: "livro", limit: 200 }], edges: [{ resource: "livros", field: "serie_id", label: "volume" }] } },
  ],
  planActions: [
    { name: "reajuste-preco", title: "Reajuste de preço em lote", description: "Aplica um percentual sobre o preço dos livros filtrados.", resource: "livros", kind: "bulk-update", field: "preco", operation: "percent", paramLabel: "Percentual (%)" },
    { name: "ajuste-estoque", title: "Repor estoque em lote", description: "Soma uma quantidade ao estoque dos livros filtrados.", resource: "livros", kind: "bulk-update", field: "estoque", operation: "add", paramLabel: "Quantidade", severity: "low" },
  ],
};

export const livrosModule: BuiltinModule = {
  def: DEF,
  seed: (ctx) => {
    const f = ctx.faker(ctx.settings.num("data.seed") + 2);
    const n = (x: number) => Math.max(1, Math.round(x * ctx.settings.num("data.scale")));
    const put = (r: string, items: Record<string, unknown>[]) => ctx.store.bulkInsert("livros", r, items);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const ano = new Date().getUTCFullYear();

    put("editoras", EDITORAS.map((nome, i) => {
      const c = f.helpers.arrayElement(CAPITAIS);
      return { id: i + 1, nome, cnpj: genCnpj(f), cidade: c.cidade, uf: c.uf, fundacao: f.number.int({ min: 1920, max: 2018 }), site: `https://${nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "")}.exemplo.com` };
    }));

    const nAutores = n(60);
    put("autores", Array.from({ length: nAutores }, (_, i) => ({ id: i + 1, nome: f.person.fullName(), nacionalidade: f.helpers.weightedArrayElement([{ value: "Brasileira", weight: 7 }, { value: "Portuguesa", weight: 2 }, { value: "Angolana", weight: 1 }, { value: "Moçambicana", weight: 1 }, { value: "Argentina", weight: 1 }]), nascimento: iso(f.date.birthdate({ min: 24, max: 90, mode: "age" })), bio: f.lorem.paragraph() })));

    const series = Array.from({ length: n(10) }, (_, i) => ({ id: i + 1, nome: `Saga ${f.helpers.arrayElement(["das Marés", "do Norte", "de Pedra Branca", "dos Faróis", "da Serra Alta", "do Vale do Eco", "das Estações", "Vagalume"])}`, descricao: f.lorem.sentence(), editora_id: f.number.int({ min: 1, max: EDITORAS.length }) }));
    put("series", series);
    const volumes = new Map<number, number>();

    const nLivros = n(120);
    const livros = Array.from({ length: nLivros }, (_, i) => {
      const generos = f.helpers.arrayElements(GENEROS, { min: 1, max: 2 });
      const t = bookTitle(f, generos[0]);
      const serie = ["Fantasia", "Ficção científica", "Infantojuvenil", "Suspense"].includes(generos[0]) && f.datatype.boolean({ probability: 0.4 }) ? f.helpers.arrayElement(series) : undefined;
      const volume = serie ? (volumes.get(serie.id) ?? 0) + 1 : null;
      if (serie) volumes.set(serie.id, volume!);
      const isbn = genIsbn13(f);
      const y = f.number.int({ min: ano - 25, max: ano });
      const formato = f.helpers.weightedArrayElement([{ value: "Brochura", weight: 6 }, { value: "Capa dura", weight: 2 }, { value: "E-book", weight: 3 }, { value: "Audiolivro", weight: 1 }]);
      return {
        id: i + 1,
        titulo: serie ? `${t.titulo}` : t.titulo,
        subtitulo: serie ? `${serie.nome}, livro ${volume}` : t.subtitulo,
        autor_ids: f.helpers.arrayElements(Array.from({ length: nAutores }, (_, k) => k + 1), { min: 1, max: f.datatype.boolean({ probability: 0.15 }) ? 2 : 1 }),
        generos,
        sinopse: f.lorem.paragraph({ min: 3, max: 5 }),
        idioma: f.helpers.weightedArrayElement([{ value: "Português", weight: 8 }, { value: "Inglês", weight: 1 }, { value: "Espanhol", weight: 1 }]),
        serie_id: serie?.id ?? null,
        volume,
        editora_id: serie?.editora_id ?? f.number.int({ min: 1, max: EDITORAS.length }),
        isbn13: isbn,
        isbn10: isbn13to10(isbn),
        edicao: f.helpers.weightedArrayElement([{ value: 1, weight: 6 }, { value: 2, weight: 2 }, { value: 3, weight: 1 }]),
        ano: y,
        lancamento: iso(f.date.between({ from: `${y}-01-01`, to: `${y}-12-28` })),
        paginas: f.number.int({ min: 96, max: 780 }),
        formato,
        preco: round2(formato === "E-book" ? f.number.float({ min: 14.9, max: 49.9 }) : f.number.float({ min: 34.9, max: 149.9 })),
        estoque: formato === "E-book" || formato === "Audiolivro" ? 0 : f.number.int({ min: 0, max: 400 }),
        nota_media: 0,
      };
    });

    const avaliacoes = Array.from({ length: n(500) }, () => {
      const livro = f.helpers.arrayElement(livros);
      const nota = f.helpers.weightedArrayElement([{ value: 5, weight: 4 }, { value: 4, weight: 4 }, { value: 3, weight: 2 }, { value: 2, weight: 1 }, { value: 1, weight: 1 }]);
      return { livro_id: livro.id, leitor: f.person.fullName(), nota, titulo: nota >= 4 ? f.helpers.arrayElement(["Não consegui largar", "Recomendo muito", "Leitura deliciosa"]) : nota === 3 ? "Bom, mas esperava mais" : f.helpers.arrayElement(["Não me pegou", "Arrastado"]), comentario: f.lorem.sentences({ min: 1, max: 3 }), data: iso(f.date.between({ from: `${Math.max(livro.ano, ano - 3)}-01-01`, to: new Date() })) };
    }).sort((a, b) => a.data.localeCompare(b.data));
    for (const l of livros) {
      const notas = avaliacoes.filter((a) => a.livro_id === l.id).map((a) => a.nota);
      l.nota_media = notas.length ? round2(notas.reduce((a, b) => a + b, 0) / notas.length) : 0;
    }
    put("livros", livros);
    put("avaliacoes", avaliacoes);

    const nLivrarias = n(35);
    put("livrarias", Array.from({ length: nLivrarias }, (_, i) => {
      const c = CAPITAIS[i % CAPITAIS.length];
      const tipo = f.helpers.weightedArrayElement([{ value: "Livraria", weight: 5 }, { value: "Biblioteca", weight: 2 }, { value: "Sebo", weight: 1 }]);
      const fisicos = livros.filter((l) => l.formato === "Brochura" || l.formato === "Capa dura").map((l) => l.id);
      return { id: i + 1, nome: `${tipo === "Biblioteca" ? "Biblioteca" : tipo === "Sebo" ? "Sebo" : "Livraria"} ${f.helpers.arrayElement(["Entrelinhas", "Página Viva", "Ponto Final", "Marca-Texto", "Capítulo Um", "Prosa", "Estante Aberta", "Vírgula"])} ${f.location.street().split(" ").slice(-1)[0]}`, tipo, endereco: f.location.streetAddress(), cidade: c.cidade, uf: c.uf, localizacao: { type: "Point", coordinates: pointNear(f, c, 9) }, telefone: f.phone.number(), horario: tipo === "Biblioteca" ? "Seg a sex, 8h às 20h" : "Seg a sáb, 10h às 22h", livro_ids: f.helpers.arrayElements(fisicos, { min: 5, max: Math.min(25, fisicos.length) }) };
    }));

    const vendas: Record<string, unknown>[] = [];
    for (let i = 0; i < n(1500); i++) {
      const l = f.helpers.weightedArrayElement(livros.map((x) => ({ value: x, weight: 1 + x.nota_media * 2 })));
      const q = f.helpers.weightedArrayElement([{ value: 1, weight: 8 }, { value: 2, weight: 2 }, { value: 5, weight: 1 }]);
      const canal = l.formato === "E-book" || l.formato === "Audiolivro" ? "Site" : f.helpers.weightedArrayElement([{ value: "Loja física", weight: 4 }, { value: "Site", weight: 3 }, { value: "Marketplace", weight: 3 }, { value: "Feira", weight: 1 }]);
      vendas.push({ livro_id: l.id, livraria_id: canal === "Loja física" ? f.number.int({ min: 1, max: nLivrarias }) : null, data: iso(f.date.between({ from: new Date(Date.now() - 730 * 86_400_000), to: new Date() })), quantidade: q, valor_total: round2(l.preco * q), canal });
    }
    vendas.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    put("vendas", vendas);
  },
  customRoutes: [
    {
      method: "GET",
      url: "/livros/isbn/:isbn",
      tag: "livros · livros",
      summary: "Busca um livro pelo ISBN-10 ou ISBN-13",
      description: "Aceita com ou sem hífens.",
      mode: "read",
      params: z.object({ isbn: z.string() }),
      response: z.record(z.string(), z.unknown()),
      handler: ({ params, baseUrl }, ctx) => {
        const clean = String(params.isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
        const rec = ctx.store.all("livros", "livros").find((l) => String(l.isbn13).replace(/-/g, "") === clean || String(l.isbn10 ?? "").toUpperCase() === clean);
        if (!rec) throw notFound(`Nenhum livro com ISBN ${params.isbn}.`);
        return present("livros", DEF.resources.find((r) => r.slug === "livros")!, rec, { baseUrl });
      },
    },
  ],
  image: (resource, _field, rec, ctx) => {
    if (resource === "livros") {
      const autores = ((rec.autor_ids as number[]) ?? []).map((a) => ctx.store.get("livros", "autores", a)?.nome).filter(Boolean).join(" e ");
      const editora = ctx.store.get("livros", "editoras", rec.editora_id as number);
      return { kind: "cover", title: String(rec.titulo), subtitle: autores || null, footer: (editora?.nome as string) ?? null, tag: ((rec.generos as string[]) ?? [])[0] ?? null, seed: `livro-${rec.id}-${rec.isbn13}` };
    }
    if (resource === "autores") return { kind: "avatar", title: String(rec.nome), seed: `autor-${rec.id}-${rec.nome}` };
    return undefined;
  },
};
