// Imagens fictícias desenhadas no servidor: determinísticas pelo seed, sem serviço externo.
import { escapeXml, hashInt } from "../lib/util.ts";
import type { ImageKind } from "../engine/types.ts";

export interface ImageSpec {
  kind: ImageKind;
  title: string;
  subtitle?: string | null;
  footer?: string | null;
  tag?: string | null;
  seed: string;
  /** Chave de paleta (ex.: gênero). */
  palette?: string | null;
}

const FONT = "Inter, 'DejaVu Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'DejaVu Serif', Georgia, 'Times New Roman', serif";

const PALETTES: Record<string, [string, string, string]> = {
  "Ação": ["#3b0a0a", "#c0392b", "#f39c12"],
  "Aventura": ["#0b3d2e", "#1e8449", "#f4d03f"],
  "Animação": ["#1b2a6b", "#5dade2", "#f7dc6f"],
  "Comédia": ["#4a2300", "#f39c12", "#fdebd0"],
  "Crime": ["#0d0d0d", "#2c3e50", "#e74c3c"],
  "Documentário": ["#1c2833", "#566573", "#f4f6f6"],
  "Drama": ["#1a1033", "#6c3483", "#f5b7b1"],
  "Fantasia": ["#1b0f3b", "#7d3c98", "#a3e4d7"],
  "Ficção científica": ["#020b1f", "#1f618d", "#48c9b0"],
  "Romance": ["#3b0a1f", "#c2185b", "#fadbd8"],
  "Suspense": ["#0b0b14", "#34495e", "#d4ac0d"],
  "Terror": ["#050505", "#4a0000", "#b3b3b3"],
  "Musical": ["#2d0b3d", "#e91e63", "#ffd54f"],
  "Faroeste": ["#3e2312", "#a0522d", "#f5cba7"],
};

const GENERIC: [string, string, string][] = [
  ["#0f172a", "#2563eb", "#93c5fd"],
  ["#1e1b4b", "#7c3aed", "#ddd6fe"],
  ["#052e16", "#16a34a", "#bbf7d0"],
  ["#431407", "#ea580c", "#fed7aa"],
  ["#4c0519", "#e11d48", "#fecdd3"],
  ["#083344", "#0891b2", "#a5f3fc"],
  ["#422006", "#ca8a04", "#fef08a"],
  ["#1f2937", "#475569", "#e2e8f0"],
];

function palette(spec: ImageSpec): [string, string, string] {
  if (spec.palette && PALETTES[spec.palette]) return PALETTES[spec.palette];
  return GENERIC[hashInt(spec.palette ?? spec.seed) % GENERIC.length];
}

/** Quebra o texto em linhas de até maxChars, no máximo maxLines (com reticências). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,2}$/, "") + "…";
    return cut;
  }
  return lines;
}

/** Maior fonte (até max) em que a linha mais longa cabe na largura. ratio = largura média de um caractere em em
 * (folgado para a DejaVu Bold, que é a fonte do Docker e das mais largas). */
function fit(lines: string[], width: number, max: number, ratio: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return Math.floor(Math.min(max, width / (longest * ratio)));
}

function rng(seed: string) {
  let s = hashInt(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function textLines(lines: string[], x: number, y: number, size: number, opts: { anchor?: string; weight?: number; fill: string; family?: string; lh?: number; spacing?: number }) {
  const lh = opts.lh ?? 1.15;
  return lines
    .map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-family="${opts.family ?? FONT}" font-size="${size}" font-weight="${opts.weight ?? 700}" fill="${opts.fill}" text-anchor="${opts.anchor ?? "start"}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ""}>${escapeXml(l)}</text>`)
    .join("");
}

function poster(spec: ImageSpec): string {
  const [dark, mid, light] = palette(spec);
  const r = rng(spec.seed);
  const W = 500, H = 750;
  const shapes: string[] = [];
  // Silhueta: sol/lua, montanhas e uma figura, variando pelo seed.
  const cx = 120 + r() * 260, cy = 180 + r() * 160, rad = 60 + r() * 90;
  shapes.push(`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${light}" opacity="0.85"/>`);
  for (let layer = 0; layer < 3; layer++) {
    let d = `M0 ${H}`;
    const base = 420 + layer * 70;
    for (let x = 0; x <= W; x += 50) d += ` L${x} ${base - r() * (120 - layer * 30)}`;
    d += ` L${W} ${H} Z`;
    shapes.push(`<path d="${d}" fill="${layer === 2 ? dark : mid}" opacity="${0.45 + layer * 0.25}"/>`);
  }
  const fx = 150 + r() * 200;
  shapes.push(`<g fill="${dark}"><circle cx="${fx}" cy="455" r="16"/><path d="M${fx - 22} 560 Q${fx} 470 ${fx + 22} 560 Z"/></g>`);
  const title = wrap(spec.title.toUpperCase(), 16, 3);
  const size = fit(title, W - 48, title.length > 2 ? 44 : 52, 0.74);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark}" stop-opacity="0"/><stop offset="1" stop-color="${dark}" stop-opacity="0.95"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>${shapes.join("")}
<rect y="${H - 300}" width="${W}" height="300" fill="url(#f)"/>
${spec.tag ? `<text x="${W / 2}" y="52" font-family="${FONT}" font-size="16" font-weight="600" fill="${light}" text-anchor="middle" letter-spacing="4">${escapeXml(spec.tag.toUpperCase())}</text>` : ""}
${textLines(title, W / 2, H - 200 - (title.length - 1) * size * 0.6, size, { anchor: "middle", weight: 800, fill: "#ffffff", spacing: 1 })}
${spec.subtitle ? textLines(wrap(spec.subtitle, 38, 2), W / 2, H - 92, 17, { anchor: "middle", weight: 500, fill: light }) : ""}
${spec.footer ? `<text x="${W / 2}" y="${H - 34}" font-family="${FONT}" font-size="12" fill="#ffffff" opacity="0.75" text-anchor="middle" letter-spacing="2">${escapeXml(spec.footer.toUpperCase())}</text>` : ""}
</svg>`;
}

function backdrop(spec: ImageSpec): string {
  const [dark, mid, light] = palette(spec);
  const r = rng(spec.seed + "bd");
  const W = 1280, H = 720;
  const shapes: string[] = [];
  for (let i = 0; i < 4; i++) {
    let d = `M0 ${H}`;
    const base = 380 + i * 80;
    for (let x = 0; x <= W; x += 80) d += ` L${x} ${base - r() * 140}`;
    d += ` L${W} ${H} Z`;
    shapes.push(`<path d="${d}" fill="${i % 2 ? mid : dark}" opacity="${0.35 + i * 0.18}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="s" cx="${0.2 + r() * 0.6}" cy="0.3" r="0.6"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mid}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/>${shapes.join("")}
<rect width="${W}" height="${H}" fill="${dark}" opacity="0.25"/>
${(() => { const t = wrap(spec.title, 30, 2); return textLines(t, 64, H - 110, fit(t, W - 128, 56, 0.66), { weight: 800, fill: "#ffffff" }); })()}
${spec.subtitle ? `<text x="64" y="${H - 50}" font-family="${FONT}" font-size="22" fill="${light}">${escapeXml(spec.subtitle)}</text>` : ""}
</svg>`;
}

function cover(spec: ImageSpec): string {
  const [dark, mid, light] = palette(spec);
  const r = rng(spec.seed);
  const W = 400, H = 600;
  const variant = hashInt(spec.seed) % 3;
  const art: string[] = [];
  if (variant === 0) {
    for (let i = 0; i < 7; i++) art.push(`<circle cx="${200}" cy="${250}" r="${150 - i * 20}" fill="none" stroke="${i % 2 ? light : mid}" stroke-width="${4 + r() * 8}" opacity="0.7"/>`);
  } else if (variant === 1) {
    for (let i = 0; i < 9; i++) art.push(`<rect x="${40 + r() * 260}" y="${110 + r() * 220}" width="${30 + r() * 90}" height="${30 + r() * 90}" fill="${i % 2 ? light : mid}" opacity="${0.4 + r() * 0.5}" transform="rotate(${r() * 40 - 20} 200 260)"/>`);
  } else {
    for (let i = 0; i < 12; i++) art.push(`<line x1="0" y1="${120 + i * 22}" x2="${W}" y2="${80 + i * 26 + r() * 30}" stroke="${i % 3 ? mid : light}" stroke-width="${2 + r() * 6}" opacity="0.8"/>`);
  }
  const title = wrap(spec.title, 18, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${dark}"/>
<rect x="0" y="0" width="14" height="${H}" fill="#000" opacity="0.25"/>
${art.join("")}
<rect x="28" y="${H - 210}" width="${W - 56}" height="170" fill="${light}" opacity="0.95"/>
${textLines(title, W / 2, H - 170 + (3 - title.length) * 10, fit(title, W - 80, 28, 0.6), { anchor: "middle", weight: 700, fill: dark, family: SERIF })}
${spec.subtitle ? `<text x="${W / 2}" y="${H - 60}" font-family="${FONT}" font-size="15" font-weight="600" fill="${mid}" text-anchor="middle" letter-spacing="2">${escapeXml(spec.subtitle.toUpperCase())}</text>` : ""}
${spec.footer ? `<text x="${W / 2}" y="${H - 14}" font-family="${FONT}" font-size="11" fill="${light}" text-anchor="middle" letter-spacing="3">${escapeXml(spec.footer.toUpperCase())}</text>` : ""}
${spec.tag ? `<text x="${W / 2}" y="48" font-family="${FONT}" font-size="13" fill="${light}" text-anchor="middle" letter-spacing="3">${escapeXml(spec.tag.toUpperCase())}</text>` : ""}
</svg>`;
}

function avatar(spec: ImageSpec): string {
  const [dark, mid, light] = palette(spec);
  const r = rng(spec.seed);
  const S = 400;
  const initials = spec.title.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const skins = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#a1665e"];
  const hairs = ["#2c1b10", "#4a2f1b", "#090806", "#b55239", "#d6b370", "#71635a"];
  const skin = skins[Math.floor(r() * skins.length)];
  const hair = hairs[Math.floor(r() * hairs.length)];
  const longHair = r() > 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<rect width="${S}" height="${S}" fill="${mid}"/>
<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 10}" fill="${light}" opacity="0.25"/>
${longHair ? `<path d="M110 200 Q100 330 130 360 L270 360 Q300 330 290 200 Z" fill="${hair}"/>` : ""}
<path d="M80 ${S} Q80 290 200 290 Q320 290 320 ${S} Z" fill="${dark}"/>
<rect x="178" y="240" width="44" height="50" fill="${skin}"/>
<ellipse cx="200" cy="190" rx="78" ry="92" fill="${skin}"/>
<path d="M122 175 Q130 92 200 92 Q272 92 278 175 Q250 130 200 128 Q150 130 122 175 Z" fill="${hair}"/>
<circle cx="172" cy="196" r="7" fill="#1f1f1f"/><circle cx="228" cy="196" r="7" fill="#1f1f1f"/>
<path d="M176 238 Q200 ${250 + r() * 8} 224 238" stroke="#7a3b2e" stroke-width="5" fill="none" stroke-linecap="round"/>
${initials ? `<rect x="${S - 92}" y="${S - 62}" width="76" height="44" rx="22" fill="${dark}"/><text x="${S - 54}" y="${S - 32}" font-family="${FONT}" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">${escapeXml(initials)}</text>` : ""}
</svg>`;
}

function generic(spec: ImageSpec): string {
  const [dark, mid, light] = palette(spec);
  const r = rng(spec.seed);
  const W = 800, H = 600;
  const blobs = Array.from({ length: 6 }, () => `<circle cx="${r() * W}" cy="${r() * H}" r="${60 + r() * 160}" fill="${r() > 0.5 ? mid : light}" opacity="${0.25 + r() * 0.35}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${dark}"/>${blobs}
<rect x="0" y="${H - 170}" width="${W}" height="170" fill="${dark}" opacity="0.7"/>
${(() => { const t = wrap(spec.title, 28, 2); return textLines(t, 48, H - 105, fit(t, W - 96, 44, 0.66), { weight: 800, fill: "#ffffff" }); })()}
${spec.subtitle ? `<text x="48" y="${H - 30}" font-family="${FONT}" font-size="22" fill="${light}">${escapeXml(spec.subtitle)}</text>` : ""}
</svg>`;
}

export function renderSvg(spec: ImageSpec): string {
  switch (spec.kind) {
    case "poster": return poster(spec);
    case "backdrop": return backdrop(spec);
    case "cover": return cover(spec);
    case "avatar": return avatar(spec);
    default: return generic(spec);
  }
}
