import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // `just tunnel` serves this dev server on a random *.trycloudflare.com host
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/printer": {
        target: "http://127.0.0.1:8001",
        rewrite: (path) => path.replace(/^\/printer/, ""),
      },
      "/vision": {
        target: "http://127.0.0.1:8002",
        ws: true,
        rewrite: (path) => path.replace(/^\/vision/, ""),
      },
    },
  },
});
