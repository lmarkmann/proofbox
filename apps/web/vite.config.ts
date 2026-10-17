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
    proxy: {
      "/api": {
        // a second worktree tunnels the VM API to another port, since the first holds :8000
        target: process.env.PROOFBOX_API ?? "http://127.0.0.1:8000",
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
