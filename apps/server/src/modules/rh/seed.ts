import type { Faker } from "@faker-js/faker";
import type { EngineContext } from "../../engine/types.ts";
import type { SettingsService } from "../../settings/service.ts";
import { CAPITAIS, circlePolygon, genCep, genCnpj, genCpf, genPis, pointNear } from "../../lib/br.ts";
import { round2 } from "../../lib/util.ts";
import { calcFolha, calcRescisao, type Faixa, type Tabelas } from "./calculos.ts";

export function tabelas(s: SettingsService): Tabelas {
  return {
    inss: s.get<Faixa[]>("rh.inssFaixas"),
    irrf: s.get<Faixa[]>("rh.irrfFaixas"),
    deducaoDependente: s.num("rh.irrfDeducaoDependente"),
    descontoSimplificado: s.num("rh.irrfDescontoSimplificado"),
    fgtsAliquota: s.num("rh.fgtsAliquota"),
  };
}

type Area = "operacional" | "pessoas" | "financeiro" | "ti" | "comercial" | "gestao";

const DEPARTAMENTOS: { nome: string; sigla: string; empresa: number; parent: number | null; area: Area; peso: number }[] = [
  { nome: "Diretoria Geral", sigla: "DG", empresa: 1, parent: null, area: "gestao", peso: 1 },
  { nome: "Operações", sigla: "OPS", empresa: 1, parent: 1, area: "operacional", peso: 2 },
  { nome: "Segurança Patrimonial", sigla: "SEG", empresa: 1, parent: 2, area: "operacional", peso: 30 },
  { nome: "Facilities", sigla: "FAC", empresa: 1, parent: 2, area: "operacional", peso: 18 },
  { nome: "Portaria e Recepção", sigla: "POR", empresa: 1, parent: 2, area: "operacional", peso: 14 },
  { nome: "Gente & Gestão", sigla: "G&G", empresa: 1, parent: 1, area: "pessoas", peso: 2 },
  { nome: "Departamento Pessoal", sigla: "DP", empresa: 1, parent: 6, area: "pessoas", peso: 4 },
  { nome: "Recrutamento e Seleção", sigla: "R&S", empresa: 1, parent: 6, area: "pessoas", peso: 3 },
  { nome: "Treinamento", sigla: "TRE", empresa: 1, parent: 6, area: "pessoas", peso: 2 },
  { nome: "Financeiro", sigla: "FIN", empresa: 1, parent: 1, area: "financeiro", peso: 2 },
  { nome: "Contabilidade", sigla: "CTB", empresa: 1, parent: 10, area: "financeiro", peso: 3 },
  { nome: "Tecnologia", sigla: "TI", empresa: 1, parent: 1, area: "ti", peso: 2 },
  { nome: "Sistemas", sigla: "SIS", empresa: 1, parent: 12, area: "ti", peso: 4 },
  { nome: "Comercial", sigla: "COM", empresa: 1, parent: 1, area: "comercial", peso: 4 },
  { nome: "Administrativo Sul", sigla: "ADM-S", empresa: 2, parent: null, area: "pessoas", peso: 3 },
  { nome: "Operações Sul", sigla: "OPS-S", empresa: 2, parent: 15, area: "operacional", peso: 16 },
  { nome: "Administrativo Saúde", sigla: "ADM-H", empresa: 3, parent: null, area: "financeiro", peso: 2 },
  { nome: "Higienização Hospitalar", sigla: "HIG", empresa: 3, parent: 17, area: "operacional", peso: 14 },
];

const CARGOS: { titulo: string; cbo: string; nivel: string; min: number; max: number; area: Area | "lideranca" }[] = [
  { titulo: "Vigilante", cbo: "5173-30", nivel: "Operacional", min: 2100, max: 2700, area: "operacional" },
  { titulo: "Porteiro", cbo: "5174-10", nivel: "Operacional", min: 1700, max: 2150, area: "operacional" },
  { titulo: "Auxiliar de limpeza", cbo: "5143-20", nivel: "Operacional", min: 1518, max: 1850, area: "operacional" },
  { titulo: "Recepcionista", cbo: "4221-05", nivel: "Operacional", min: 1750, max: 2200, area: "operacional" },
  { titulo: "Líder de equipe", cbo: "5101-10", nivel: "Pleno", min: 2800, max: 3500, area: "operacional" },
  { titulo: "Supervisor operacional", cbo: "5101-30", nivel: "Sênior", min: 3600, max: 4800, area: "operacional" },
  { titulo: "Assistente de DP", cbo: "4110-10", nivel: "Júnior", min: 2300, max: 3000, area: "pessoas" },
  { titulo: "Analista de DP", cbo: "2524-05", nivel: "Pleno", min: 3800, max: 5200, area: "pessoas" },
  { titulo: "Analista de R&S", cbo: "2524-05", nivel: "Pleno", min: 3600, max: 5000, area: "pessoas" },
  { titulo: "Instrutor de treinamento", cbo: "2331-10", nivel: "Pleno", min: 3200, max: 4500, area: "pessoas" },
  { titulo: "Analista financeiro", cbo: "2522-10", nivel: "Pleno", min: 4200, max: 6200, area: "financeiro" },
  { titulo: "Contador", cbo: "2522-10", nivel: "Sênior", min: 6000, max: 8500, area: "financeiro" },
  { titulo: "Desenvolvedor de software", cbo: "2124-05", nivel: "Pleno", min: 6500, max: 10500, area: "ti" },
  { titulo: "Analista de suporte", cbo: "3172-10", nivel: "Júnior", min: 3000, max: 4200, area: "ti" },
  { titulo: "Executivo de contas", cbo: "2521-05", nivel: "Sênior", min: 5000, max: 8000, area: "comercial" },
  { titulo: "Coordenador", cbo: "1421-05", nivel: "Coordenação", min: 7500, max: 10500, area: "lideranca" },
  { titulo: "Gerente", cbo: "1421-10", nivel: "Gerência", min: 11000, max: 16000, area: "lideranca" },
  { titulo: "Diretor", cbo: "1210-10", nivel: "Diretoria", min: 18000, max: 28000, area: "lideranca" },
];

const CLIENTES = ["Condomínio Jardim das Acácias", "Residencial Morada do Sol", "Shopping Vila Aurora", "Hospital Santa Clara do Vale", "Centro Empresarial Atlântico", "Colégio Monte Alegre", "Indústria Ferro Leve", "Galpão Logístico Rota 9", "Edifício Corporativo Ipê", "Universidade do Planalto", "Clube Náutico Lagoa Azul", "Torre Comercial Horizonte"];
const CID = ["J06.9", "A09", "M54.5", "K29.7", "R51", "J11.1", "S93.4", "F41.1", "H10.9", "N39.0"];
const OPERADORAS: Record<string, string[]> = {
  "Plano de saúde": ["Vida Plena Saúde", "Unimed Fictícia", "Bem Cuidar"],
  "Plano odontológico": ["Sorriso Mais", "OdontoBem"],
  "Vale-refeição": ["RefeiCard", "Sabor Card"],
  "Vale-alimentação": ["AlimentaCard", "Cesta Fácil"],
  "Vale-transporte": ["Passe Urbano"],
  "Seguro de vida": ["Segura Vida"],
  "Auxílio academia": ["FitRede"],
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const hhmm = (h: number, m = 0) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

function withIds<T extends object>(items: T[]): (T & { id: number })[] {
  return items.map((x, i) => ({ ...x, id: i + 1 }));
}

export function seedRh(ctx: EngineContext): void {
  const s = ctx.settings;
  const f: Faker = ctx.faker(s.num("data.seed"));
  const scale = s.num("data.scale");
  const n = (x: number) => Math.max(1, Math.round(x * scale));
  const t = tabelas(s);
  const put = (r: string, items: Record<string, unknown>[]) => ctx.store.bulkInsert("rh", r, items);
  const hoje = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  // Empresas
  const empresas = withIds(
    [
      { razao_social: "Guardião Serviços Integrados Ltda.", nome_fantasia: "Guardião Facilities", cidade: "São Paulo", uf: "SP", cnae: "8011-1/01" },
      { razao_social: "Sentinela Sul Segurança e Portaria Ltda.", nome_fantasia: "Sentinela Sul", cidade: "Porto Alegre", uf: "RS", cnae: "8011-1/01" },
      { razao_social: "Limpa Bem Higienização Hospitalar S.A.", nome_fantasia: "Limpa Bem Saúde", cidade: "Belo Horizonte", uf: "MG", cnae: "8121-4/00" },
    ].map((e) => ({ ...e, cnpj: genCnpj(f), endereco: f.location.streetAddress() })),
  );
  put("empresas", empresas);

  // Cargos
  const cargos = withIds(CARGOS.map(({ titulo, cbo, nivel, min, max }) => ({ titulo, cbo, nivel, salario_min: min, salario_max: max })));
  put("cargos", cargos);
  const cargoIds = (area: Area | "lideranca") => CARGOS.map((c, i) => ({ c, id: i + 1 })).filter((x) => x.c.area === area);

  // Postos de trabalho com cerca virtual
  const postos = withIds(
    Array.from({ length: n(24) }, (_, i) => {
      const cidade = CAPITAIS[i % 8];
      const centro = pointNear(f, cidade, 10);
      const raio = f.helpers.arrayElement([80, 100, 150, 200, 300]);
      return {
        nome: `${f.helpers.arrayElement(CLIENTES)} – ${f.location.street()}`,
        cliente: f.helpers.arrayElement(CLIENTES),
        empresa_id: cidade.uf === "RS" ? 2 : cidade.uf === "MG" ? 3 : 1,
        endereco: f.location.streetAddress(),
        cidade: cidade.cidade,
        uf: cidade.uf,
        localizacao: { type: "Point", coordinates: centro },
        cerca_virtual: { type: "Polygon", coordinates: circlePolygon(centro, raio) },
        raio_m: raio,
        vagas: f.number.int({ min: 2, max: 12 }),
        ativo: f.datatype.boolean({ probability: 0.9 }),
      };
    }),
  );
  put("postos-trabalho", postos);

  // Colaboradores: primeiro um gestor por departamento, depois o restante distribuído pelos pesos.
  type Colab = Record<string, unknown> & { id: number; departamento_id: number; cargo_id: number; salario: number; data_admissao: string; status: string; dependentes: number; nome: string };
  const colaboradores: Colab[] = [];
  const gestorDe = new Map<number, number>();
  const pessoa = (deptIdx: number, cargoId: number, gestor: boolean) => {
    const dept = DEPARTAMENTOS[deptIdx];
    const cargo = CARGOS[cargoId - 1];
    const sex = f.person.sexType();
    const first = f.person.firstName(sex);
    const last = f.person.lastName();
    const nome = `${first} ${f.person.lastName()} ${last}`;
    const admissao = f.date.between({ from: gestor ? "2012-01-01" : "2016-01-01", to: addDays(hoje, -20) });
    const cidade = CAPITAIS[(dept.empresa === 2 ? 4 : dept.empresa === 3 ? 2 : f.number.int(7)) % CAPITAIS.length];
    const operacional = dept.area === "operacional" && !gestor;
    const jornada = operacional ? f.helpers.arrayElement(["12x36", "6x1", "44h semanais"]) : f.helpers.arrayElement(["40h semanais", "44h semanais"]);
    const id = colaboradores.length + 1;
    const c: Colab = {
      id,
      matricula: String(10000 + id),
      nome,
      nome_social: null,
      cpf: genCpf(f),
      rg: f.string.numeric(9),
      pis: genPis(f),
      data_nascimento: iso(f.date.birthdate({ min: 19, max: 62, mode: "age" })),
      sexo: sex === "female" ? "Feminino" : "Masculino",
      estado_civil: f.helpers.weightedArrayElement([{ value: "Solteiro(a)", weight: 4 }, { value: "Casado(a)", weight: 4 }, { value: "União estável", weight: 2 }, { value: "Divorciado(a)", weight: 1 }]),
      dependentes: f.helpers.weightedArrayElement([{ value: 0, weight: 5 }, { value: 1, weight: 3 }, { value: 2, weight: 2 }, { value: 3, weight: 1 }]),
      email: `${first}.${last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z.]/g, "") + `${id}@empresa-ficticia.com.br`,
      telefone: f.phone.number(),
      cep: genCep(f),
      endereco: f.location.streetAddress(),
      cidade: cidade.cidade,
      uf: cidade.uf,
      data_admissao: iso(admissao),
      tipo_contrato: gestor || !operacional ? f.helpers.weightedArrayElement([{ value: "CLT", weight: 9 }, { value: "PJ", weight: 1 }]) : f.helpers.weightedArrayElement([{ value: "CLT", weight: 14 }, { value: "Temporário", weight: 1 }, { value: "Aprendiz", weight: 1 }]),
      cargo_id: cargoId,
      departamento_id: deptIdx + 1,
      gestor_id: null,
      posto_id: operacional ? f.number.int({ min: 1, max: postos.length }) : null,
      salario: round2(f.number.float({ min: cargo.min, max: cargo.max, fractionDigits: 0 })),
      jornada,
      turno: jornada === "12x36" ? f.helpers.arrayElement(["Diurno", "Noturno"]) : "Diurno",
      status: "Ativo",
      data_desligamento: null,
    };
    colaboradores.push(c);
    return c;
  };
  const lider = cargoIds("lideranca");
  DEPARTAMENTOS.forEach((d, i) => {
    const level = d.parent === null ? (i === 0 ? 2 : 1) : DEPARTAMENTOS[d.parent - 1].parent === null ? 1 : 0;
    const c = pessoa(i, lider[level].id, true);
    gestorDe.set(i + 1, c.id);
  });
  const pesos = DEPARTAMENTOS.map((d, i) => ({ value: i, weight: d.peso }));
  const total = n(150);
  while (colaboradores.length < total) {
    const di = f.helpers.weightedArrayElement(pesos);
    const area = DEPARTAMENTOS[di].area;
    const options = cargoIds(area === "gestao" ? "pessoas" : area);
    pessoa(di, f.helpers.arrayElement(options).id, false);
  }
  for (const c of colaboradores) {
    const dept = DEPARTAMENTOS[c.departamento_id - 1];
    const gestorDept = gestorDe.get(c.departamento_id)!;
    c.gestor_id = gestorDept !== c.id ? gestorDept : dept.parent ? gestorDe.get(dept.parent)! : null;
  }
  // Situação: alguns desligados, em férias e afastados.
  const desligados = new Set<number>();
  for (const c of colaboradores) {
    if (gestorDe.get(c.departamento_id) === c.id) continue;
    const r = f.number.float({ min: 0, max: 1 });
    const ini = new Date(`${c.data_admissao}T00:00:00Z`);
    const from = addDays(ini, 60) > addDays(hoje, -400) ? addDays(ini, 60) : addDays(hoje, -400);
    if (r < 0.07 && from < addDays(hoje, -3)) {
      c.status = "Desligado";
      c.data_desligamento = iso(f.date.between({ from, to: addDays(hoje, -3) }));
      desligados.add(c.id);
    } else if (r < 0.12) c.status = "Férias";
    else if (r < 0.16) c.status = "Afastado";
  }
  put("colaboradores", colaboradores);

  const departamentos = DEPARTAMENTOS.map((d, i) => ({ id: i + 1, nome: d.nome, sigla: d.sigla, empresa_id: d.empresa, parent_id: d.parent, gestor_id: gestorDe.get(i + 1), centro_custo: `CC-${String(100 + i * 10)}` }));
  put("departamentos", departamentos);

  const ativos = colaboradores.filter((c) => c.status !== "Desligado");
  const operacionais = ativos.filter((c) => c.posto_id);

  // Escalas: 7 dias para trás e 14 para frente
  const escalas: Record<string, unknown>[] = [];
  for (const c of operacionais.slice(0, n(70))) {
    const offset = c.id % 2;
    const noturno = c.turno === "Noturno";
    for (let d = -7; d <= 14; d++) {
      const dia = addDays(hoje, d);
      const trabalha = c.jornada === "12x36" ? (d + offset) % 2 === 0 : dia.getUTCDay() !== (c.id % 7);
      const ini = c.jornada === "12x36" ? (noturno ? 19 : 7) : f.helpers.arrayElement([6, 7, 8, 14]);
      escalas.push({
        colaborador_id: c.id,
        posto_id: c.posto_id,
        data: iso(dia),
        inicio: trabalha ? hhmm(ini) : "00:00",
        fim: trabalha ? hhmm(c.jornada === "12x36" ? ini + 12 : ini + 8, c.jornada === "12x36" ? 0 : 48) : "00:00",
        tipo: !trabalha ? "Folga" : f.number.float({ min: 0, max: 1 }) < 0.05 ? "Extra" : "Normal",
        status: d < 0 ? (trabalha && f.number.float({ min: 0, max: 1 }) < 0.04 ? "Falta" : "Realizada") : "Planejada",
      });
    }
  }
  put("escalas", escalas);

  // Marcações de ponto dos últimos 5 dias, com geolocalização dentro (ou não) da cerca do posto
  const marcacoes: Record<string, unknown>[] = [];
  for (const c of operacionais.slice(0, n(45))) {
    const posto = postos[(c.posto_id as number) - 1];
    const [lng, lat] = posto.localizacao.coordinates as [number, number];
    for (let d = -5; d < 0; d++) {
      const dia = addDays(hoje, d);
      if (dia.getUTCDay() === c.id % 7) continue;
      const base = c.turno === "Noturno" ? 19 : 7;
      const horas = c.jornada === "12x36" ? [[base, 0, "Entrada"], [base + 12, 0, "Saída"]] : [[base, 0, "Entrada"], [base + 4, 0, "Saída intervalo"], [base + 5, 0, "Retorno intervalo"], [base + 8, 48, "Saída"]];
      for (const [h, m, tipo] of horas as [number, number, string][]) {
        const fora = f.number.float({ min: 0, max: 1 }) < 0.08;
        const dist = fora ? posto.raio_m * f.number.float({ min: 1.3, max: 4 }) : posto.raio_m * f.number.float({ min: 0, max: 0.8 });
        const ang = f.number.float({ min: 0, max: Math.PI * 2 });
        const dt = new Date(dia.getTime() + (h * 60 + m + f.number.int({ min: -9, max: 9 })) * 60_000 + 3 * 3600_000);
        marcacoes.push({
          colaborador_id: c.id,
          posto_id: c.posto_id,
          data_hora: dt.toISOString(),
          tipo,
          localizacao: { type: "Point", coordinates: [Number((lng + (dist / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(ang)).toFixed(6)), Number((lat + (dist / 111_320) * Math.sin(ang)).toFixed(6))] },
          dentro_cerca: !fora,
          precisao_m: f.number.int({ min: 3, max: fora ? 60 : 25 }),
          origem: f.helpers.weightedArrayElement([{ value: "App", weight: 7 }, { value: "Relógio", weight: 2 }, { value: "Web", weight: 1 }]),
        });
      }
    }
  }
  marcacoes.sort((a, b) => String(a.data_hora).localeCompare(String(b.data_hora)));
  put("marcacoes-ponto", marcacoes);

  // Rondas: rotas em volta do posto
  const rondas: Record<string, unknown>[] = [];
  const vigilantes = operacionais.filter((c) => CARGOS[c.cargo_id - 1].titulo === "Vigilante");
  for (const p of postos) {
    const [lng, lat] = p.localizacao.coordinates as [number, number];
    for (let k = 0; k < f.number.int({ min: 2, max: 4 }); k++) {
      const pts = f.number.int({ min: 5, max: 9 });
      const raio = (p.raio_m as number) * 0.9;
      const coords: number[][] = [];
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2 + f.number.float({ min: -0.2, max: 0.2 });
        const rr = raio * f.number.float({ min: 0.5, max: 1 });
        coords.push([Number((lng + (rr / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a)).toFixed(6)), Number((lat + (rr / 111_320) * Math.sin(a)).toFixed(6))]);
      }
      const inicio = f.number.int({ min: 0, max: 23 });
      const v = vigilantes.length ? f.helpers.arrayElement(vigilantes) : undefined;
      rondas.push({
        nome: `Ronda ${String.fromCharCode(65 + k)} – ${p.cidade}`,
        posto_id: p.id,
        colaborador_id: v?.id ?? null,
        data: iso(addDays(hoje, -f.number.int({ min: 0, max: 6 }))),
        inicio: hhmm(inicio),
        fim: hhmm(inicio + 1, 10),
        rota: { type: "LineString", coordinates: coords },
        checkpoints: pts,
        distancia_m: Math.round(2 * Math.PI * raio * 0.8),
        status: f.helpers.weightedArrayElement([{ value: "Concluída", weight: 7 }, { value: "Em andamento", weight: 1 }, { value: "Pendente", weight: 1 }, { value: "Interrompida", weight: 1 }]),
      });
    }
  }
  put("rondas", rondas);

  // Benefícios
  const beneficios: Record<string, unknown>[] = [];
  const temVt = new Set<number>();
  for (const c of colaboradores) {
    const tipos = ["Vale-refeição", "Plano de saúde", ...(f.datatype.boolean() ? ["Vale-transporte"] : []), ...(f.datatype.boolean({ probability: 0.4 }) ? ["Plano odontológico"] : []), ...(f.datatype.boolean({ probability: 0.2 }) ? ["Auxílio academia"] : [])];
    for (const tipo of tipos) {
      const valor = { "Vale-refeição": 38 * 22, "Plano de saúde": f.number.int({ min: 280, max: 650 }), "Vale-transporte": f.number.int({ min: 180, max: 420 }), "Plano odontológico": 45, "Auxílio academia": 99.9 }[tipo] ?? 100;
      if (tipo === "Vale-transporte") temVt.add(c.id);
      beneficios.push({
        colaborador_id: c.id,
        tipo,
        operadora: f.helpers.arrayElement(OPERADORAS[tipo] ?? ["Fornecedor"]),
        valor,
        desconto_folha: tipo === "Vale-transporte" ? round2(Math.min(c.salario * 0.06, valor)) : tipo === "Plano de saúde" ? round2(valor * 0.2) : 0,
        inicio: c.data_admissao,
        ativo: c.status !== "Desligado",
      });
    }
  }
  put("beneficios", beneficios);

  // Holerites dos últimos 6 meses
  const holerites: Record<string, unknown>[] = [];
  for (let k = 6; k >= 1; k--) {
    const comp = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
    const competencia = comp.toISOString().slice(0, 7);
    for (const c of colaboradores) {
      if (c.data_admissao > iso(new Date(Date.UTC(comp.getUTCFullYear(), comp.getUTCMonth() + 1, 0)))) continue;
      if (c.data_desligamento && (c.data_desligamento as string) < iso(comp)) continue;
      if (c.tipo_contrato === "PJ") continue;
      const extras: { descricao: string; valor: number }[] = [];
      if (c.turno === "Noturno") extras.push({ descricao: "Adicional noturno (20%)", valor: round2(c.salario * 0.2 * 0.4) });
      if (f.number.float({ min: 0, max: 1 }) < 0.25) extras.push({ descricao: "Horas extras 50%", valor: round2((c.salario / 220) * 1.5 * f.number.int({ min: 2, max: 18 })) });
      const descontosExtras = [
        ...(temVt.has(c.id) ? [{ descricao: "Vale-transporte (6%)", valor: round2(c.salario * 0.06) }] : []),
        { descricao: "Coparticipação plano de saúde", valor: round2(f.number.float({ min: 0, max: 80, fractionDigits: 2 })) },
      ];
      const folha = calcFolha(c.salario, c.dependentes, t, extras, descontosExtras);
      holerites.push({
        colaborador_id: c.id,
        competencia,
        salario_base: c.salario,
        proventos: [{ descricao: "Salário base", valor: c.salario }, ...extras],
        descontos: [{ descricao: "INSS", valor: folha.inss }, { descricao: "IRRF", valor: folha.irrf }, ...descontosExtras],
        total_proventos: folha.totalProventos,
        inss: folha.inss,
        irrf: folha.irrf,
        fgts: folha.fgts,
        total_descontos: folha.totalDescontos,
        liquido: folha.liquido,
        data_pagamento: iso(new Date(Date.UTC(comp.getUTCFullYear(), comp.getUTCMonth() + 1, 5))),
      });
    }
  }
  put("holerites", holerites);

  // Férias
  const ferias: Record<string, unknown>[] = [];
  for (const c of ativos) {
    const adm = new Date(`${c.data_admissao}T00:00:00Z`);
    const anos = Math.floor((hoje.getTime() - adm.getTime()) / (365.25 * 86_400_000));
    if (anos < 1) continue;
    const aqIni = new Date(Date.UTC(adm.getUTCFullYear() + anos - 1, adm.getUTCMonth(), adm.getUTCDate()));
    const status = c.status === "Férias" ? "Gozada" : f.helpers.weightedArrayElement([{ value: "Gozada", weight: 4 }, { value: "Aprovada", weight: 2 }, { value: "Solicitada", weight: 2 }, { value: "Agendada", weight: 1 }, { value: "Reprovada", weight: 1 }]);
    const inicio = c.status === "Férias" ? addDays(hoje, -f.number.int({ min: 1, max: 10 })) : status === "Gozada" ? addDays(hoje, -f.number.int({ min: 30, max: 300 })) : addDays(hoje, f.number.int({ min: 10, max: 90 }));
    const abono = f.datatype.boolean({ probability: 0.25 });
    const dias = abono ? 20 : f.helpers.arrayElement([30, 30, 15, 20, 10]);
    ferias.push({
      colaborador_id: c.id,
      periodo_aquisitivo_inicio: iso(aqIni),
      periodo_aquisitivo_fim: iso(addDays(new Date(Date.UTC(aqIni.getUTCFullYear() + 1, aqIni.getUTCMonth(), aqIni.getUTCDate())), -1)),
      inicio: iso(inicio),
      fim: iso(addDays(inicio, dias - 1)),
      dias,
      abono_pecuniario: abono,
      adiantamento_13: f.datatype.boolean({ probability: 0.3 }),
      status,
      aprovador_id: ["Solicitada", "Reprovada"].includes(status) && status === "Solicitada" ? null : c.gestor_id,
      valor_bruto: round2((c.salario / 30) * dias * (4 / 3) + (abono ? (c.salario / 3) * (4 / 3) : 0)),
    });
  }
  put("ferias", ferias);

  // Afastamentos
  const afastamentos: Record<string, unknown>[] = [];
  for (let i = 0; i < n(45); i++) {
    const c = f.helpers.arrayElement(ativos);
    const tipo = f.helpers.weightedArrayElement([{ value: "Doença", weight: 10 }, { value: "Acidente de trabalho", weight: 1 }, { value: c.sexo === "Feminino" ? "Licença maternidade" : "Licença paternidade", weight: 1 }, { value: "Licença casamento", weight: 1 }, { value: "Outros", weight: 1 }]);
    const dias = tipo === "Licença maternidade" ? 120 : tipo === "Licença paternidade" ? 5 : tipo === "Licença casamento" ? 3 : f.helpers.weightedArrayElement([{ value: 1, weight: 5 }, { value: 2, weight: 3 }, { value: 3, weight: 3 }, { value: 7, weight: 1 }, { value: 15, weight: 1 }]);
    const inicio = c.status === "Afastado" && !afastamentos.some((a) => a.colaborador_id === c.id) ? addDays(hoje, -f.number.int({ min: 0, max: Math.min(dias - 1, 10) })) : addDays(hoje, -f.number.int({ min: 15, max: 360 }));
    afastamentos.push({
      colaborador_id: c.id,
      tipo,
      cid: tipo === "Doença" || tipo === "Acidente de trabalho" ? f.helpers.arrayElement(CID) : null,
      inicio: iso(inicio),
      fim: iso(addDays(inicio, dias - 1)),
      dias,
      atestado: tipo !== "Outros",
      observacao: tipo === "Acidente de trabalho" ? "CAT emitida." : null,
    });
  }
  put("afastamentos", afastamentos);

  // Rescisões dos desligados + eventos do eSocial
  const rescisoes: Record<string, unknown>[] = [];
  const eventos: Record<string, unknown>[] = [];
  const recibo = () => `1.${f.string.numeric(1)}.${f.string.numeric(19)}`;
  for (const c of colaboradores) {
    if (c.data_admissao >= iso(addDays(hoje, -720))) {
      eventos.push({ evento: "S-2200", descricao: "Cadastramento inicial do vínculo e admissão", colaborador_id: c.id, data_evento: c.data_admissao, recibo: recibo(), status: "Processado", payload: { ideVinculo: { cpfTrab: c.cpf, matricula: c.matricula }, contrato: { dtAdm: c.data_admissao, vrSalFx: c.salario, undSalFixo: 5, codCBO: CARGOS[c.cargo_id - 1].cbo.replace("-", "") } } });
    }
    if (!desligados.has(c.id)) continue;
    const tipo = f.helpers.weightedArrayElement([{ value: "sem_justa_causa" as const, weight: 5 }, { value: "pedido_demissao" as const, weight: 4 }, { value: "acordo" as const, weight: 1 }, { value: "justa_causa" as const, weight: 1 }]);
    const aviso = tipo === "sem_justa_causa" || tipo === "acordo" ? "indenizado" : tipo === "pedido_demissao" ? "trabalhado" : "dispensado";
    const calc = calcRescisao({ salario: c.salario, admissao: c.data_admissao, desligamento: c.data_desligamento as string, tipo, avisoPrevio: aviso, dependentes: c.dependentes }, t);
    rescisoes.push({ colaborador_id: c.id, data_desligamento: c.data_desligamento, tipo, aviso_previo: aviso, verbas: calc.verbas, total_proventos: calc.totalProventos, total_descontos: calc.totalDescontos, liquido: calc.liquido, multa_fgts: calc.fgts.multa });
    eventos.push({ evento: "S-2299", descricao: "Desligamento", colaborador_id: c.id, data_evento: c.data_desligamento, recibo: recibo(), status: f.helpers.weightedArrayElement([{ value: "Processado", weight: 8 }, { value: "Erro", weight: 1 }, { value: "Pendente", weight: 1 }]), payload: { ideVinculo: { cpfTrab: c.cpf, matricula: c.matricula }, infoDeslig: { mtvDeslig: { sem_justa_causa: "02", pedido_demissao: "07", acordo: "33", justa_causa: "01", termino_contrato: "04" }[tipo], dtDeslig: c.data_desligamento, vrLiquido: calc.liquido } } });
  }
  for (const a of afastamentos.slice(0, n(20))) {
    eventos.push({ evento: "S-2230", descricao: "Afastamento temporário", colaborador_id: a.colaborador_id, data_evento: a.inicio, recibo: recibo(), status: "Processado", payload: { infoAfastamento: { iniAfastamento: { dtIniAfast: a.inicio, codMotAfast: a.tipo === "Doença" ? "01" : a.tipo === "Acidente de trabalho" ? "03" : "15" }, fimAfastamento: { dtTermAfast: a.fim } } } });
  }
  for (const c of f.helpers.arrayElements(ativos, Math.min(ativos.length, n(15)))) {
    eventos.push({ evento: "S-2206", descricao: "Alteração contratual (salário)", colaborador_id: c.id, data_evento: iso(addDays(hoje, -f.number.int({ min: 10, max: 200 }))), recibo: recibo(), status: f.helpers.arrayElement(["Processado", "Enviado"]), payload: { altContratual: { dtAlteracao: iso(hoje), vrSalFx: c.salario } } });
  }
  put("rescisoes", rescisoes);
  eventos.sort((a, b) => String(a.data_evento).localeCompare(String(b.data_evento)));
  put("esocial-eventos", eventos);
}
