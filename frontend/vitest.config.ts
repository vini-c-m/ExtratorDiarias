import { defineConfig } from "vitest/config";

// Config separada do vite.config.ts (dev/build) para não carregar o plugin
// do Tailwind à toa nos testes. `environment: "node"` é o padrão (a maioria
// dos testes cobre `src/lib/`/`src/services/`, funções sem DOM); testes de
// componente (`*.test.tsx`) que precisam de DOM ligam jsdom por arquivo com
// o comentário mágico `// @vitest-environment jsdom` no topo do arquivo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts"],
  },
});
