// Cálculos trabalhistas simplificados (valores ilustrativos; tabelas editáveis na tela).
import { round2 } from "../../lib/util.ts";

export interface Faixa {
  ate: number | null;
  aliquota: number;
  deducao?: number;
}

export interface Tabelas {
  inss: Faixa[];
  irrf: Faixa[];
  deducaoDependente: number;
  descontoSimplificado: number;
  fgtsAliquota: number;
}

/** INSS progressivo: cada faixa paga a própria alíquota; acima do teto não incide. */
export function calcInss(salario: number, faixas: Faixa[]) {
  let anterior = 0;
  let total = 0;
  const detalhe: { faixa: string; base: number; aliquota: number; valor: number }[] = [];
  for (const f of faixas) {
    const teto = f.ate ?? Infinity;
    if (salario <= anterior) break;
    const base = Math.min(salario, teto) - anterior;
    const valor = round2((base * f.aliquota) / 100);
    detalhe.push({ faixa: `${anterior.toFixed(2)} a ${f.ate === null ? "∞" : teto.toFixed(2)}`, base: round2(base), aliquota: f.aliquota, valor });
    total += valor;
    anterior = teto;
  }
  total = round2(total);
  return { salario: round2(salario), valor: total, aliquotaEfetiva: salario ? round2((total / salario) * 100) : 0, faixas: detalhe };
}

/** IRRF mensal: base = bruto − max(INSS + dependentes, desconto simplificado) − pensão. */
export function calcIrrf(input: { bruto: number; inss: number; dependentes?: number; pensao?: number }, t: Pick<Tabelas, "irrf" | "deducaoDependente" | "descontoSimplificado">) {
  const dependentes = input.dependentes ?? 0;
  const legais = input.inss + dependentes * t.deducaoDependente;
  const usaSimplificado = t.descontoSimplificado > legais;
  const base = Math.max(0, input.bruto - Math.max(legais, t.descontoSimplificado) - (input.pensao ?? 0));
  const faixa = t.irrf.find((f) => f.ate === null || base <= f.ate) ?? t.irrf[t.irrf.length - 1];
  const valor = Math.max(0, round2((base * faixa.aliquota) / 100 - (faixa.deducao ?? 0)));
  return { base: round2(base), aliquota: faixa.aliquota, deducao: faixa.deducao ?? 0, valor, deducaoUsada: usaSimplificado ? "simplificado" : "legal" };
}

export function calcFolha(salario: number, dependentes: number, t: Tabelas, extras: { descricao: string; valor: number }[] = [], descontosExtras: { descricao: string; valor: number }[] = []) {
  const totalProventos = round2(salario + extras.reduce((a, e) => a + e.valor, 0));
  const inss = calcInss(totalProventos, t.inss).valor;
  const irrf = calcIrrf({ bruto: totalProventos, inss, dependentes }, t).valor;
  const outros = descontosExtras.reduce((a, e) => a + e.valor, 0);
  return {
    totalProventos,
    inss,
    irrf,
    fgts: round2((totalProventos * t.fgtsAliquota) / 100),
    totalDescontos: round2(inss + irrf + outros),
    liquido: round2(totalProventos - inss - irrf - outros),
  };
}

export function calcFerias(input: { salario: number; dias: number; abonoPecuniario?: boolean; dependentes?: number; mediaVariaveis?: number }, t: Tabelas) {
  const remuneracao = input.salario + (input.mediaVariaveis ?? 0);
  const diasGozo = input.abonoPecuniario ? Math.min(input.dias, 20) : input.dias;
  const ferias = round2((remuneracao / 30) * diasGozo);
  const terco = round2(ferias / 3);
  const abono = input.abonoPecuniario ? round2((remuneracao / 30) * 10) : 0;
  const tercoAbono = round2(abono / 3);
  const tributavel = ferias + terco;
  const inss = calcInss(tributavel, t.inss).valor;
  const irrf = calcIrrf({ bruto: tributavel, inss, dependentes: input.dependentes }, t).valor;
  const bruto = round2(ferias + terco + abono + tercoAbono);
  return {
    diasGozo,
    diasAbono: input.abonoPecuniario ? 10 : 0,
    verbas: [
      { descricao: `Férias (${diasGozo} dias)`, valor: ferias, tipo: "provento" },
      { descricao: "1/3 constitucional", valor: terco, tipo: "provento" },
      ...(abono ? [{ descricao: "Abono pecuniário (10 dias)", valor: abono, tipo: "provento" }, { descricao: "1/3 sobre abono", valor: tercoAbono, tipo: "provento" }] : []),
      { descricao: "INSS", valor: inss, tipo: "desconto" },
      { descricao: "IRRF", valor: irrf, tipo: "desconto" },
    ],
    bruto,
    descontos: round2(inss + irrf),
    liquido: round2(bruto - inss - irrf),
  };
}

export const TIPOS_RESCISAO = ["sem_justa_causa", "pedido_demissao", "justa_causa", "acordo", "termino_contrato"] as const;
export type TipoRescisao = (typeof TIPOS_RESCISAO)[number];

/** Meses em que o empregado trabalhou 15 dias ou mais entre duas datas (avos). */
function avos(inicio: Date, fim: Date): number {
  let n = 0;
  const cur = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cur <= fim) {
    const ini = cur < inicio ? inicio : cur;
    const fimMes = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const end = fimMes > fim ? fim : fimMes;
    if ((end.getTime() - ini.getTime()) / 86_400_000 + 1 >= 15) n++;
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return n;
}

export function calcRescisao(
  input: { salario: number; admissao: string; desligamento: string; tipo: TipoRescisao; avisoPrevio: "indenizado" | "trabalhado" | "dispensado"; feriasVencidasDias?: number; saldoFgts?: number; dependentes?: number },
  t: Tabelas,
) {
  const adm = new Date(`${input.admissao}T00:00:00Z`);
  const desl = new Date(`${input.desligamento}T00:00:00Z`);
  const anos = Math.floor((desl.getTime() - adm.getTime()) / (365.25 * 86_400_000));
  const s = input.salario;
  const verbas: { descricao: string; valor: number; tipo: "provento" | "desconto" | "informativo" }[] = [];
  const add = (descricao: string, valor: number, tipo: "provento" | "desconto" | "informativo" = "provento") => valor > 0 && verbas.push({ descricao, valor: round2(valor), tipo });

  const saldo = (s / 30) * desl.getUTCDate();
  add(`Saldo de salário (${desl.getUTCDate()} dias)`, saldo);

  let diasAviso = 0;
  if (input.avisoPrevio === "indenizado" && (input.tipo === "sem_justa_causa" || input.tipo === "acordo")) {
    diasAviso = Math.min(90, 30 + 3 * anos);
    const fator = input.tipo === "acordo" ? 0.5 : 1;
    add(`Aviso prévio indenizado (${diasAviso} dias${fator < 1 ? ", metade por acordo" : ""})`, (s / 30) * diasAviso * fator);
  }
  // O aviso indenizado projeta o contrato para frente (conta nos avos).
  const projecao = new Date(desl.getTime() + diasAviso * 86_400_000);
  const justa = input.tipo === "justa_causa";

  if (!justa) {
    const inicioAno = new Date(Date.UTC(projecao.getUTCFullYear(), 0, 1));
    const avos13 = avos(adm > inicioAno ? adm : inicioAno, projecao);
    add(`13º proporcional (${avos13}/12)`, (s / 12) * avos13);
    const aniversario = new Date(Date.UTC(projecao.getUTCFullYear(), adm.getUTCMonth(), adm.getUTCDate()));
    if (aniversario > projecao) aniversario.setUTCFullYear(aniversario.getUTCFullYear() - 1);
    const avosFerias = avos(aniversario < adm ? adm : aniversario, projecao) % 12;
    const fp = (s / 12) * avosFerias;
    add(`Férias proporcionais (${avosFerias}/12)`, fp);
    add("1/3 sobre férias proporcionais", fp / 3);
  }
  if (input.feriasVencidasDias) {
    const fv = (s / 30) * input.feriasVencidasDias;
    add(`Férias vencidas (${input.feriasVencidasDias} dias)`, fv);
    add("1/3 sobre férias vencidas", fv / 3);
  }

  const decimo = verbas.find((v) => v.descricao.startsWith("13º"))?.valor ?? 0;
  const inssSaldo = calcInss(saldo, t.inss).valor;
  const inss13 = calcInss(decimo, t.inss).valor;
  const irrfSaldo = calcIrrf({ bruto: saldo, inss: inssSaldo, dependentes: input.dependentes }, t).valor;
  const irrf13 = calcIrrf({ bruto: decimo, inss: inss13, dependentes: input.dependentes }, t).valor;
  add("INSS sobre saldo de salário", inssSaldo, "desconto");
  add("INSS sobre 13º", inss13, "desconto");
  add("IRRF sobre saldo de salário", irrfSaldo, "desconto");
  add("IRRF sobre 13º", irrf13, "desconto");

  const meses = Math.max(1, Math.round((desl.getTime() - adm.getTime()) / (30.44 * 86_400_000)));
  const saldoFgts = input.saldoFgts ?? round2(s * (t.fgtsAliquota / 100) * meses);
  const multaPct = input.tipo === "sem_justa_causa" ? 40 : input.tipo === "acordo" ? 20 : 0;
  const multa = round2((saldoFgts * multaPct) / 100);
  const saquePct = input.tipo === "sem_justa_causa" ? 100 : input.tipo === "acordo" ? 80 : 0;
  add(`Multa FGTS (${multaPct}%)`, multa, "informativo");

  const proventos = round2(verbas.filter((v) => v.tipo === "provento").reduce((a, v) => a + v.valor, 0));
  const descontos = round2(verbas.filter((v) => v.tipo === "desconto").reduce((a, v) => a + v.valor, 0));
  return {
    tempoServicoAnos: anos,
    diasAvisoPrevio: diasAviso,
    verbas,
    totalProventos: proventos,
    totalDescontos: descontos,
    liquido: round2(proventos - descontos),
    fgts: { saldoEstimado: saldoFgts, multaPercentual: multaPct, multa, saquePercentual: saquePct, valorSaque: round2(((saldoFgts + multa) * saquePct) / 100) },
    seguroDesemprego: input.tipo === "sem_justa_causa",
    aviso: "Cálculo ilustrativo para dados de teste: não use para rescisões reais.",
  };
}
