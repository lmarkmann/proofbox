import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".claude/skills/**", "docs/vast/**"],
    sortTailwindcss: {
      stylesheet: "apps/web/src/index.css",
      functions: ["cn", "cva", "clsx"],
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
