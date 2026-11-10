import { defineConfig } from '@playwright/test';
import path from 'node:path';
import commun from './playwright.config';

// Passe distincte : le reste de la suite vérifie aussi le fournisseur absent.
// Même build, même base fictive ; seul le processus serveur utilise le transport local.
export default defineConfig({
  ...commun,
  testIgnore: [/recette-production\//],
  outputDir: './.results-courriels',
  workers: 1,
  timeout: 180_000,
  projects: [{name: 'mobile-courriels', testMatch: /lot2-(?:pilote|artisan|invitations)\.spec\.ts/}],
  webServer: [
    {cwd: path.resolve(__dirname, '..'), command: 'node e2e/local/boite-fictive.mjs', url: 'http://127.0.0.1:55520/messages', reuseExistingServer: false},
    {
      cwd: path.resolve(__dirname, '..'),
      command: 'npm run start -- -p 3100',
      url: 'http://localhost:3100/connexion',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        RESEND_API_KEY: 'fictif-sans-service',
        COURRIELS_CHIFFREMENT_CLE: 'cd'.repeat(32),
        NODE_OPTIONS: `--max-old-space-size=4096 --require=${JSON.stringify(path.resolve(__dirname, 'local/reseau-fictif.cjs'))}`,
      },
    },
  ],
});
