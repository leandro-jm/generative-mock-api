// Documentos brasileiros: geração (para os dados fictícios) e validação (para os formatos do JSON Schema).
import type { Faker } from "@faker-js/faker";

const digits = (s: string) => s.replace(/\D/g, "");

function cpfDv(base: number[]): number[] {
  const calc = (arr: number[], factor: number) => {
    const sum = arr.reduce((acc, d, i) => acc + d * (factor - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base, 10);
  const d2 = calc([...base, d1], 11);
  return [d1, d2];
}

export function genCpf(f: Faker): string {
  const base = Array.from({ length: 9 }, () => f.number.int(9));
  const all = [...base, ...cpfDv(base)].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

export function isCpf(s: string): boolean {
  const d = digits(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const [a, b] = cpfDv(nums.slice(0, 9));
  return a === nums[9] && b === nums[10];
}

function cnpjDv(base: number[]): number {
  const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = base.reduce((acc, d, i) => acc + d * weights[i], 0);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function genCnpj(f: Faker): string {
  const base = [...Array.from({ length: 8 }, () => f.number.int(9)), 0, 0, 0, 1];
  const d1 = cnpjDv(base);
  const d2 = cnpjDv([...base, d1]);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 2)}.${all.slice(2, 5)}.${all.slice(5, 8)}/${all.slice(8, 12)}-${all.slice(12)}`;
}

export function isCnpj(s: string): boolean {
  const d = digits(s);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const d1 = cnpjDv(nums.slice(0, 12));
  const d2 = cnpjDv([...nums.slice(0, 12), d1]);
  return d1 === nums[12] && d2 === nums[13];
}

function pisDv(base: number[]): number {
  const w = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r = 11 - (base.reduce((acc, d, i) => acc + d * w[i], 0) % 11);
  return r === 10 || r === 11 ? 0 : r;
}

export function genPis(f: Faker): string {
  const base = [1, ...Array.from({ length: 9 }, () => f.number.int(9))];
  const all = [...base, pisDv(base)].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 8)}.${all.slice(8, 10)}-${all.slice(10)}`;
}

export function isPis(s: string): boolean {
  const d = digits(s);
  if (d.length !== 11) return false;
  const nums = d.split("").map(Number);
  return pisDv(nums.slice(0, 10)) === nums[10];
}

export function genIsbn13(f: Faker): string {
  const base = [9, 7, 8, 6, 5, ...Array.from({ length: 7 }, () => f.number.int(9))];
  const sum = base.reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  const dv = (10 - (sum % 10)) % 10;
  const all = [...base, dv].join("");
  return `${all.slice(0, 3)}-${all.slice(3, 5)}-${all.slice(5, 9)}-${all.slice(9, 12)}-${all.slice(12)}`;
}

export function isIsbn13(s: string): boolean {
  const d = digits(s);
  if (d.length !== 13) return false;
  const nums = d.split("").map(Number);
  const sum = nums.slice(0, 12).reduce((acc, n, i) => acc + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === nums[12];
}

/** ISBN-10 equivalente de um ISBN-13 com prefixo 978. */
export function isbn13to10(isbn13: string): string | null {
  const d = digits(isbn13);
  if (!d.startsWith("978")) return null;
  const core = d.slice(3, 12).split("").map(Number);
  const sum = core.reduce((acc, n, i) => acc + n * (10 - i), 0);
  const r = (11 - (sum % 11)) % 11;
  return core.join("") + (r === 10 ? "X" : String(r));
}

export function isIsbn10(s: string): boolean {
  const d = s.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length !== 10) return false;
  const sum = d.split("").reduce((acc, c, i) => acc + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

export const isCep = (s: string) => /^\d{5}-?\d{3}$/.test(s);
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Capitais com coordenadas reais para espalhar pontos fictícios em volta. */
export const CAPITAIS = [
  { cidade: "São Paulo", uf: "SP", lat: -23.5505, lng: -46.6333 },
  { cidade: "Rio de Janeiro", uf: "RJ", lat: -22.9068, lng: -43.1729 },
  { cidade: "Belo Horizonte", uf: "MG", lat: -19.9167, lng: -43.9345 },
  { cidade: "Curitiba", uf: "PR", lat: -25.4284, lng: -49.2733 },
  { cidade: "Porto Alegre", uf: "RS", lat: -30.0346, lng: -51.2177 },
  { cidade: "Florianópolis", uf: "SC", lat: -27.5954, lng: -48.548 },
  { cidade: "Salvador", uf: "BA", lat: -12.9777, lng: -38.5016 },
  { cidade: "Recife", uf: "PE", lat: -8.0476, lng: -34.877 },
  { cidade: "Fortaleza", uf: "CE", lat: -3.7319, lng: -38.5267 },
  { cidade: "Brasília", uf: "DF", lat: -15.7939, lng: -47.8828 },
  { cidade: "Goiânia", uf: "GO", lat: -16.6869, lng: -49.2648 },
  { cidade: "Manaus", uf: "AM", lat: -3.119, lng: -60.0217 },
  { cidade: "Belém", uf: "PA", lat: -1.4558, lng: -48.4902 },
  { cidade: "Vitória", uf: "ES", lat: -20.3155, lng: -40.3128 },
];

export function genCep(f: Faker): string {
  return `${f.string.numeric(5)}-${f.string.numeric(3)}`;
}

/** Ponto aleatório até ~raioKm de uma capital. */
export function pointNear(f: Faker, base = f.helpers.arrayElement(CAPITAIS), raioKm = 12): [number, number] {
  const r = (raioKm / 111) * Math.sqrt(f.number.float({ min: 0, max: 1 }));
  const t = f.number.float({ min: 0, max: Math.PI * 2 });
  return [Number((base.lng + r * Math.cos(t)).toFixed(6)), Number((base.lat + r * Math.sin(t)).toFixed(6))];
}

/** Polígono aproximadamente circular (cerca virtual) em volta de um ponto. */
export function circlePolygon([lng, lat]: [number, number], raioM: number, lados = 12): number[][][] {
  const ring: number[][] = [];
  for (let i = 0; i < lados; i++) {
    const t = (i / lados) * Math.PI * 2;
    const dLat = (raioM / 111_320) * Math.sin(t);
    const dLng = (raioM / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t);
    ring.push([Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))]);
  }
  ring.push(ring[0]);
  return [ring];
}
