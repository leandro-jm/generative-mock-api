// SVG → PNG com resvg. No Docker (Debian slim) o loadSystemFonts não acha as fontes sozinho:
// por isso as pastas conhecidas vão explícitas (a imagem instala a DejaVu).
import { Resvg } from "@resvg/resvg-js";
import { existsSync } from "node:fs";

const FONT_DIRS = ["/usr/share/fonts", "/usr/local/share/fonts", "/System/Library/Fonts", "/Library/Fonts", "C:\\Windows\\Fonts"].filter((d) => existsSync(d));

export function svgToPng(svg: string, width?: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: width ? { mode: "width", value: Math.min(Math.max(width, 16), 2000) } : { mode: "original" },
    font: { loadSystemFonts: true, fontDirs: FONT_DIRS, defaultFontFamily: "DejaVu Sans" },
  });
  return resvg.render().asPng();
}
