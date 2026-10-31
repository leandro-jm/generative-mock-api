const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");

export const money = (v: unknown) => (typeof v === "number" ? brl.format(v) : "—");
export const number = (v: unknown) => (typeof v === "number" ? num.format(v) : "—");
export const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : "—");
export const dateTime = (v: unknown) => (typeof v === "string" ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function compact(v: number, unit?: string | null): string {
  if (unit === "BRL") return v >= 1_000_000 ? `R$ ${num.format(Math.round(v / 100_000) / 10)} mi` : v >= 10_000 ? `R$ ${num.format(Math.round(v / 100) / 10)} mil` : brl.format(v);
  if (unit === "%") return `${num.format(v)}%`;
  return v >= 10_000 ? `${num.format(Math.round(v / 100) / 10)} mil` : num.format(v);
}

/** Aplica máscara 0-dígito (ex.: 000.000.000-00) ao que foi digitado. */
export function applyMask(mask: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let out = "";
  let i = 0;
  for (const ch of mask) {
    if (i >= digits.length) break;
    if (ch === "0") out += digits[i++];
    else out += ch;
  }
  return out;
}

export const SOURCE_LABEL: Record<string, string> = { builtin: "Pronto", ai: "IA", manual: "Manual" };
export const VIEW_LABEL: Record<string, string> = { table: "Table", card: "Card", form: "Form", plan: "Plan", map: "Map", chart: "Chart", diagram: "Diagram" };
