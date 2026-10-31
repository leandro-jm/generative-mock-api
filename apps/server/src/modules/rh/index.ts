import { z } from "zod";
import { applyQuery } from "../../engine/query.ts";
import { aggregate } from "../../engine/views/chart.ts";
import type { BuiltinModule, CustomRoute, EngineContext, PlanOp } from "../../engine/types.ts";
import { badRequest, notFound } from "../../lib/errors.ts";
import { round2 } from "../../lib/util.ts";
import { calcFerias, calcInss, calcIrrf, calcRescisao, TIPOS_RESCISAO } from "./calculos.ts";
import { RH_DEF } from "./def.ts";
import { seedRh, tabelas } from "./seed.ts";

const money = z.number().describe("Valor em reais");
const verba = z.object({ descricao: z.string(), valor: z.number(), tipo: z.enum(["provento", "desconto", "informativo"]) });

const colaborador = (ctx: EngineContext, id: number) => {
  const c = ctx.store.get("rh", "colaboradores", id);
  if (!c) throw notFound(`Colaborador ${id} não encontrado.`);
  return c;
};

const rescisaoInput = z.object({
  colaborador_id: z.number().int().optional().describe("Usa salário, admissão e dependentes do cadastro"),
  salario: z.number().positive().optional(),
  data_admissao: z.iso.date().optional(),
  data_desligamento: z.iso.date(),
  tipo: z.enum(TIPOS_RESCISAO),
  aviso_previo: z.enum(["indenizado", "trabalhado", "dispensado"]).default("indenizado"),
  ferias_vencidas_dias: z.number().int().min(0).max(60).default(0),
  saldo_fgts: z.number().min(0).optional().describe("Sem informar, estima 8% × salário × meses"),
  dependentes: z.number().int().min(0).optional(),
});

function rescisao(ctx: EngineContext, body: z.infer<typeof rescisaoInput>) {
  const c = body.colaborador_id ? colaborador(ctx, body.colaborador_id) : undefined;
  const salario = body.salario ?? (c?.salario as number | undefined);
  const admissao = body.data_admissao ?? (c?.data_admissao as string | undefined);
  if (!salario || !admissao) throw badRequest("Informe colaborador_id ou salario e data_admissao.");
  if (body.data_desligamento < admissao) throw badRequest("data_desligamento antes da admissão.");
  return calcRescisao({ salario, admissao, desligamento: body.data_desligamento, tipo: body.tipo, avisoPrevio: body.aviso_previo, feriasVencidasDias: body.ferias_vencidas_dias, saldoFgts: body.saldo_fgts, dependentes: body.dependentes ?? (c?.dependentes as number | undefined) ?? 0 }, tabelas(ctx.settings));
}

const rescisaoOutput = z.object({
  tempoServicoAnos: z.number(),
  diasAvisoPrevio: z.number(),
  verbas: z.array(verba),
  totalProventos: money,
  totalDescontos: money,
  liquido: money,
  fgts: z.object({ saldoEstimado: money, multaPercentual: z.number(), multa: money, saquePercentual: z.number(), valorSaque: money }),
  seguroDesemprego: z.boolean(),
  aviso: z.string(),
});

const routes: CustomRoute[] = [
  {
    method: "POST",
    url: "/calculos/inss",
    tag: "rh · cálculos",
    summary: "Calcula o INSS progressivo",
    description: "Usa as faixas configuradas na tela (RH Trabalhista). Valores ilustrativos.",
    mode: "read",
    body: z.object({ salario: z.number().positive() }),
    response: z.object({ salario: money, valor: money, aliquotaEfetiva: z.number(), faixas: z.array(z.object({ faixa: z.string(), base: money, aliquota: z.number(), valor: money })) }),
    handler: ({ body }, ctx) => calcInss(body.salario, tabelas(ctx.settings).inss),
  },
  {
    method: "POST",
    url: "/calculos/irrf",
    tag: "rh · cálculos",
    summary: "Calcula o IRRF mensal",
    description: "Se inss não vier, calcula sobre o bruto. Usa o maior entre deduções legais e desconto simplificado.",
    mode: "read",
    body: z.object({ bruto: z.number().positive(), inss: z.number().min(0).optional(), dependentes: z.number().int().min(0).default(0), pensao: z.number().min(0).default(0) }),
    response: z.object({ base: money, aliquota: z.number(), deducao: z.number(), valor: money, deducaoUsada: z.enum(["legal", "simplificado"]) }),
    handler: ({ body }, ctx) => {
      const t = tabelas(ctx.settings);
      return calcIrrf({ bruto: body.bruto, inss: body.inss ?? calcInss(body.bruto, t.inss).valor, dependentes: body.dependentes, pensao: body.pensao }, t);
    },
  },
  {
    method: "POST",
    url: "/calculos/ferias",
    tag: "rh · cálculos",
    summary: "Simula o pagamento de férias",
    mode: "read",
    body: z.object({ colaborador_id: z.number().int().optional(), salario: z.number().positive().optional(), dias: z.number().int().min(5).max(30).default(30), abono_pecuniario: z.boolean().default(false), dependentes: z.number().int().min(0).optional(), media_variaveis: z.number().min(0).default(0) }),
    response: z.object({ diasGozo: z.number(), diasAbono: z.number(), verbas: z.array(verba), bruto: money, descontos: money, liquido: money }),
    handler: ({ body }, ctx) => {
      const c = body.colaborador_id ? colaborador(ctx, body.colaborador_id) : undefined;
      const salario = body.salario ?? (c?.salario as number | undefined);
      if (!salario) throw badRequest("Informe colaborador_id ou salario.");
      return calcFerias({ salario, dias: body.dias, abonoPecuniario: body.abono_pecuniario, dependentes: body.dependentes ?? (c?.dependentes as number) ?? 0, mediaVariaveis: body.media_variaveis }, tabelas(ctx.settings));
    },
  },
  {
    method: "POST",
    url: "/calculos/rescisao",
    tag: "rh · cálculos",
    summary: "Simula as verbas rescisórias",
    description: "Saldo de salário, aviso prévio (30 + 3 dias por ano, até 90), 13º e férias proporcionais, férias vencidas, INSS/IRRF e multa do FGTS.",
    mode: "read",
    body: rescisaoInput,
    response: rescisaoOutput,
    handler: ({ body }, ctx) => rescisao(ctx, body),
  },
  {
    method: "GET",
    url: "/colaboradores/:id/holerites",
    tag: "rh · colaboradores",
    summary: "Holerites de um colaborador",
    mode: "read",
    params: z.object({ id: z.coerce.number().int() }),
    response: z.object({ colaborador: z.object({ id: z.number(), nome: z.string() }), data: z.array(z.record(z.string(), z.unknown())) }),
    handler: ({ params }, ctx) => {
      const c = colaborador(ctx, params.id);
      const data = applyQuery(RH_DEF.resources.find((r) => r.slug === "holerites")!, ctx.store.all("rh", "holerites"), { filters: [{ field: "colaborador_id", op: "eq", value: String(c.id) }], sort: [{ field: "competencia", dir: -1 }] });
      return { colaborador: { id: c.id, nome: c.nome as string }, data };
    },
  },
  {
    method: "GET",
    url: "/colaboradores/:id/ferias",
    tag: "rh · colaboradores",
    summary: "Férias e saldo de um colaborador",
    mode: "read",
    params: z.object({ id: z.coerce.number().int() }),
    response: z.object({ colaborador: z.object({ id: z.number(), nome: z.string() }), periodosCompletos: z.number(), diasGozados: z.number(), saldoEstimado: z.number(), data: z.array(z.record(z.string(), z.unknown())) }),
    handler: ({ params }, ctx) => {
      const c = colaborador(ctx, params.id);
      const data = ctx.store.all("rh", "ferias").filter((x) => x.colaborador_id === c.id);
      const periodos = Math.floor((Date.now() - new Date(`${c.data_admissao}T00:00:00Z`).getTime()) / (365.25 * 86_400_000));
      const gozados = data.filter((x) => ["Gozada", "Aprovada", "Agendada"].includes(x.status as string)).reduce((a, x) => a + Number(x.dias), 0);
      return { colaborador: { id: c.id, nome: c.nome as string }, periodosCompletos: periodos, diasGozados: gozados, saldoEstimado: Math.max(0, Math.min(60, periodos * 30 - gozados - Math.max(0, periodos - 2) * 30)), data };
    },
  },
];

const hoje = () => new Date().toISOString().slice(0, 10);

export const rhModule: BuiltinModule = {
  def: RH_DEF,
  seed: seedRh,
  customRoutes: routes,
  image: (resource, _field, rec, ctx) => {
    if (resource !== "colaboradores") return undefined;
    const cargo = ctx.store.get("rh", "cargos", rec.cargo_id as number);
    return { kind: "avatar", title: String(rec.nome ?? ""), subtitle: (cargo?.titulo as string) ?? null, seed: `rh-colab-${rec.id}-${rec.cpf}` };
  },
  customCharts: [
    {
      name: "turnover",
      title: "Turnover mensal (%)",
      description: "Desligamentos do mês ÷ headcount no início do mês × 100, últimos 12 meses.",
      build: (ctx) => {
        const colabs = ctx.store.all("rh", "colaboradores");
        const labels: string[] = [];
        const turnover: number[] = [];
        const desligamentos: number[] = [];
        const now = new Date();
        for (let k = 11; k >= 0; k--) {
          const ini = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
          const fim = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 0));
          const iniS = ini.toISOString().slice(0, 10);
          const fimS = fim.toISOString().slice(0, 10);
          const head = colabs.filter((c) => (c.data_admissao as string) < iniS && (!c.data_desligamento || (c.data_desligamento as string) >= iniS)).length;
          const sai = colabs.filter((c) => c.data_desligamento && (c.data_desligamento as string) >= iniS && (c.data_desligamento as string) <= fimS).length;
          labels.push(iniS.slice(0, 7));
          desligamentos.push(sai);
          turnover.push(head ? round2((sai / head) * 100) : 0);
        }
        return { title: "Turnover mensal (%)", type: "line", labels, series: [{ name: "Turnover (%)", data: turnover }, { name: "Desligamentos", data: desligamentos }], unit: "%", meta: { resource: "colaboradores", computed: true } };
      },
    },
    {
      name: "folha-por-departamento",
      title: "Folha mensal por departamento",
      description: "Soma dos salários dos colaboradores ativos por departamento.",
      build: (ctx) => {
        const r = RH_DEF.resources.find((x) => x.slug === "colaboradores")!;
        const rows = applyQuery(r, ctx.store.all("rh", "colaboradores"), { filters: [{ field: "status", op: "ne", value: "Desligado" }], sort: [] });
        return aggregate(RH_DEF, r, rows, ctx.store, { type: "bar", groupBy: "departamento_id", metric: "sum:salario", title: "Folha mensal por departamento", unit: "BRL" });
      },
    },
  ],
  customPlans: [
    {
      name: "desligar-colaborador",
      title: "Desligar colaborador",
      description: "Calcula a rescisão, cria o registro de rescisão e o evento S-2299, encerra benefícios, cancela escalas futuras e marca o colaborador como Desligado.",
      resource: "colaboradores",
      severity: "high",
      params: z.object({
        tipo: z.enum(TIPOS_RESCISAO).default("sem_justa_causa"),
        data_desligamento: z.iso.date().optional().describe("Padrão: hoje"),
        aviso_previo: z.enum(["indenizado", "trabalhado", "dispensado"]).default("indenizado"),
        ferias_vencidas_dias: z.number().int().min(0).max(60).default(0),
      }),
      build: (ctx, ids, p) => {
        const ops: PlanOp[] = [];
        const warnings: string[] = [];
        const data = p.data_desligamento ?? hoje();
        let total = 0;
        for (const id of ids) {
          const c = colaborador(ctx, id);
          if (c.status === "Desligado") {
            warnings.push(`${c.nome} já está desligado; ignorado.`);
            continue;
          }
          const calc = rescisao(ctx, { colaborador_id: id, data_desligamento: data, tipo: p.tipo, aviso_previo: p.aviso_previo, ferias_vencidas_dias: p.ferias_vencidas_dias });
          total += calc.liquido;
          ops.push({ op: "update", resource: "colaboradores", id, data: { status: "Desligado", data_desligamento: data }, diff: { status: { before: c.status, after: "Desligado" }, data_desligamento: { before: c.data_desligamento ?? null, after: data } }, expectedUpdatedAt: c.updated_at, effect: "update", label: String(c.nome) });
          ops.push({ op: "create", resource: "rescisoes", data: { colaborador_id: id, data_desligamento: data, tipo: p.tipo, aviso_previo: p.aviso_previo, verbas: calc.verbas, total_proventos: calc.totalProventos, total_descontos: calc.totalDescontos, liquido: calc.liquido, multa_fgts: calc.fgts.multa }, effect: "create", label: `Rescisão de ${c.nome}: líquido R$ ${calc.liquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` });
          ops.push({ op: "create", resource: "esocial-eventos", data: { evento: "S-2299", descricao: "Desligamento", colaborador_id: id, data_evento: data, recibo: null, status: "Pendente", payload: { ideVinculo: { cpfTrab: c.cpf, matricula: c.matricula }, infoDeslig: { dtDeslig: data, vrLiquido: calc.liquido } } }, effect: "create", label: `Evento S-2299 de ${c.nome}` });
          for (const b of ctx.store.all("rh", "beneficios").filter((x) => x.colaborador_id === id && x.ativo)) {
            ops.push({ op: "update", resource: "beneficios", id: b.id, data: { ativo: false }, diff: { ativo: { before: true, after: false } }, expectedUpdatedAt: b.updated_at, effect: "update", label: `${b.tipo} de ${c.nome}`, reason: "Benefício encerrado no desligamento" });
          }
          for (const e of ctx.store.all("rh", "escalas").filter((x) => x.colaborador_id === id && (x.data as string) > data)) {
            ops.push({ op: "delete", resource: "escalas", id: e.id, expectedUpdatedAt: e.updated_at, effect: "delete", label: `Escala de ${e.data} (${e.inicio}–${e.fim})`, reason: "Escala posterior ao desligamento" });
          }
          if (calc.verbas.some((v) => v.descricao.startsWith("Férias vencidas")) === false && p.ferias_vencidas_dias === 0) {
            const pend = ctx.store.all("rh", "ferias").filter((x) => x.colaborador_id === id && ["Solicitada", "Aprovada", "Agendada"].includes(x.status as string));
            if (pend.length) warnings.push(`${c.nome} tem ${pend.length} período(s) de férias pendente(s); confira ferias_vencidas_dias.`);
          }
        }
        const n = ops.filter((o) => o.resource === "colaboradores").length;
        return { summary: `Desligar ${n} colaborador(es) (${p.tipo.replace(/_/g, " ")}, em ${data}). Líquido total das rescisões: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`, ops, warnings };
      },
    },
    {
      name: "excluir-departamento",
      title: "Excluir departamento com realocação",
      description: "Move colaboradores e subdepartamentos para outro departamento e exclui o original.",
      resource: "departamentos",
      severity: "high",
      params: z.object({ realocar_para: z.number().int().describe("Departamento que recebe os colaboradores") }),
      build: (ctx, ids, p) => {
        const destino = ctx.store.get("rh", "departamentos", p.realocar_para);
        if (!destino) throw notFound(`Departamento destino ${p.realocar_para} não encontrado.`);
        if (ids.includes(p.realocar_para)) throw badRequest("O destino não pode estar entre os excluídos.");
        const ops: PlanOp[] = [];
        for (const id of ids) {
          const d = ctx.store.get("rh", "departamentos", id)!;
          for (const c of ctx.store.all("rh", "colaboradores").filter((x) => x.departamento_id === id)) {
            ops.push({ op: "update", resource: "colaboradores", id: c.id, data: { departamento_id: destino.id }, diff: { departamento_id: { before: d.nome, after: destino.nome } }, expectedUpdatedAt: c.updated_at, effect: "update", label: String(c.nome), reason: `Realocado de ${d.nome}` });
          }
          for (const sub of ctx.store.all("rh", "departamentos").filter((x) => x.parent_id === id && !ids.includes(x.id))) {
            ops.push({ op: "update", resource: "departamentos", id: sub.id, data: { parent_id: destino.id }, diff: { parent_id: { before: d.nome, after: destino.nome } }, expectedUpdatedAt: sub.updated_at, effect: "update", label: String(sub.nome), reason: "Subdepartamento reposicionado" });
          }
          ops.push({ op: "delete", resource: "departamentos", id, expectedUpdatedAt: d.updated_at, effect: "delete", label: String(d.nome) });
        }
        const moved = ops.filter((o) => o.resource === "colaboradores").length;
        return { summary: `Excluir ${ids.length} departamento(s) e realocar ${moved} colaborador(es) para ${destino.nome}.`, ops };
      },
    },
    {
      name: "aprovar-ferias",
      title: "Aprovar férias em lote",
      description: "Aprova solicitações de férias pendentes e registra o aprovador.",
      resource: "ferias",
      severity: "medium",
      params: z.object({ aprovador_id: z.number().int().optional() }),
      build: (ctx, ids, p) => {
        const ops: PlanOp[] = [];
        const warnings: string[] = [];
        for (const id of ids) {
          const fr = ctx.store.get("rh", "ferias", id)!;
          if (fr.status !== "Solicitada") {
            warnings.push(`Férias #${id} estão "${fr.status}"; ignoradas.`);
            continue;
          }
          const c = ctx.store.get("rh", "colaboradores", fr.colaborador_id as number);
          const aprovador = p.aprovador_id ?? (c?.gestor_id as number | null) ?? null;
          ops.push({ op: "update", resource: "ferias", id, data: { status: "Aprovada", aprovador_id: aprovador }, diff: { status: { before: "Solicitada", after: "Aprovada" } }, expectedUpdatedAt: fr.updated_at, effect: "update", label: `${c?.nome ?? "Colaborador"}: ${fr.inicio} (${fr.dias} dias)` });
        }
        return { summary: `Aprovar ${ops.length} solicitação(ões) de férias.`, ops, warnings };
      },
    },
  ],
};
