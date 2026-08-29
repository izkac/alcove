import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  // ponytail: node_modules/.vite has broken ACLs (undeletable without elevation); park the cache next door
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite-cache",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  clearScreen: false,
  server: {
    host: host || "127.0.0.1",
    port: 43147,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 43148,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
})
