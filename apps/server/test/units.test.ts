import { describe, expect, it } from "vitest";
import { makeFaker } from "../src/engine/datagen.ts";
import { genCnpj, genCpf, genIsbn13, genPis, isCnpj, isCpf, isIsbn10, isIsbn13, isPis, isbn13to10 } from "../src/lib/br.ts";
import { applyQuery, paginate, parseListQuery } from "../src/engine/query.ts";
import { calcFerias, calcInss, calcIrrf, calcRescisao, type Tabelas } from "../src/modules/rh/calculos.ts";
import type { ResourceDef } from "../src/engine/types.ts";
import type { Rec } from "../src/engine/store.ts";

const T: Tabelas = {
  inss: [{ ate: 1518, aliquota: 7.5 }, { ate: 2793.88, aliquota: 9 }, { ate: 4190.83, aliquota: 12 }, { ate: 8157.41, aliquota: 14 }],
  irrf: [{ ate: 2428.8, aliquota: 0, deducao: 0 }, { ate: 2826.65, aliquota: 7.5, deducao: 182.16 }, { ate: 3751.05, aliquota: 15, deducao: 394.16 }, { ate: 4664.68, aliquota: 22.5, deducao: 675.49 }, { ate: null, aliquota: 27.5, deducao: 908.73 }],
  deducaoDependente: 189.59,
  descontoSimplificado: 607.2,
  fgtsAliquota: 8,
};

describe("documentos brasileiros", () => {
  const f = makeFaker("pt_BR", 1);
  it("gera e valida CPF, CNPJ, PIS e ISBN", () => {
    for (let i = 0; i < 50; i++) {
      expect(isCpf(genCpf(f))).toBe(true);
      expect(isCnpj(genCnpj(f))).toBe(true);
      expect(isPis(genPis(f))).toBe(true);
      const isbn = genIsbn13(f);
      expect(isIsbn13(isbn)).toBe(true);
      expect(isIsbn10(isbn13to10(isbn)!)).toBe(true);
    }
    expect(isCpf("111.111.111-11")).toBe(false);
    expect(isCpf("529.982.247-25")).toBe(true);
    expect(isCnpj("11.222.333/0001-81")).toBe(true);
  });
  it("é determinístico pela semente", () => {
    expect(genCpf(makeFaker("pt_BR", 9))).toBe(genCpf(makeFaker("pt_BR", 9)));
  });
});

describe("cálculos de RH", () => {
  it("INSS progressivo", () => {
    expect(calcInss(1518, T.inss).valor).toBe(113.85);
    expect(calcInss(3000, T.inss).valor).toBe(253.41);
    // acima do teto: contribuição máxima
    expect(calcInss(20000, T.inss).valor).toBe(calcInss(8157.41, T.inss).valor);
  });
  it("IRRF usa o maior desconto (legal ou simplificado)", () => {
    const isento = calcIrrf({ bruto: 2800, inss: calcInss(2800, T.inss).valor }, T);
    expect(isento.valor).toBe(0);
    const r = calcIrrf({ bruto: 6000, inss: calcInss(6000, T.inss).valor, dependentes: 1 }, T);
    expect(r.deducaoUsada).toBe("legal");
    expect(r.aliquota).toBe(27.5);
    expect(r.valor).toBeGreaterThan(0);
  });
  it("férias: 30 dias + 1/3", () => {
    const r = calcFerias({ salario: 3000, dias: 30 }, T);
    expect(r.bruto).toBe(4000);
    expect(r.liquido).toBeLessThan(4000);
  });
  it("rescisão sem justa causa tem aviso proporcional e multa de 40%", () => {
    const r = calcRescisao({ salario: 3000, admissao: "2020-03-10", desligamento: "2026-06-15", tipo: "sem_justa_causa", avisoPrevio: "indenizado" }, T);
    expect(r.diasAvisoPrevio).toBe(30 + 3 * 6);
    expect(r.fgts.multaPercentual).toBe(40);
    expect(r.verbas.some((v) => v.descricao.startsWith("13º"))).toBe(true);
    const justa = calcRescisao({ salario: 3000, admissao: "2020-03-10", desligamento: "2026-06-15", tipo: "justa_causa", avisoPrevio: "dispensado" }, T);
    expect(justa.verbas.some((v) => v.descricao.startsWith("13º"))).toBe(false);
    expect(justa.fgts.multa).toBe(0);
  });
});

describe("query", () => {
  const r: ResourceDef = {
    slug: "x",
    label: "X",
    labelPlural: "Xs",
    titleField: "nome",
    fields: [
      { name: "nome", label: "Nome", type: "string" },
      { name: "preco", label: "Preço", type: "money" },
      { name: "tags", label: "Tags", type: "tags" },
    ],
  };
  const rows = [
    { id: 1, nome: "Árvore", preco: 10, tags: ["a"] },
    { id: 2, nome: "banana", preco: 30, tags: ["b"] },
    { id: 3, nome: "Caju", preco: 20, tags: ["a", "b"] },
  ] as unknown as Rec[];
  it("filtra, busca sem acento, ordena e pagina", () => {
    const q = parseListQuery(r, { "preco[gte]": "15", sort: "-preco" }, { limit: 20, maxLimit: 100 });
    expect(applyQuery(r, rows, q).map((x) => x.id)).toEqual([2, 3]);
    expect(applyQuery(r, rows, parseListQuery(r, { q: "arvore" }, { limit: 20, maxLimit: 100 })).map((x) => x.id)).toEqual([1]);
    expect(applyQuery(r, rows, parseListQuery(r, { tags: "b" }, { limit: 20, maxLimit: 100 })).map((x) => x.id)).toEqual([2, 3]);
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ data: [3, 4], meta: { page: 2, limit: 2, total: 5, totalPages: 3 } });
  });
  it("recusa ordenação por campo inexistente", () => {
    expect(() => parseListQuery(r, { sort: "foo" }, { limit: 20, maxLimit: 100 })).toThrow();
  });
});
