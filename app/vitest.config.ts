import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // L'alias `@/` de tsconfig, pour que les tests importent le code applicatif
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` n'est pas un paquet installé : Next le résout lui-même à
      // la compilation (et refuse tout import côté navigateur). Sous vitest,
      // le code serveur est testé côté serveur : la version neutre de Next.
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
