import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Em dev, o Vite repassa API, docs e imagens para o servidor (porta 4310).
const target = process.env.API_URL ?? "http://localhost:4310";
const proxy = Object.fromEntries(["/api", "/admin-api", "/openapi", "/docs", "/health"].map((p) => [p, { target, changeOrigin: false }]));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
