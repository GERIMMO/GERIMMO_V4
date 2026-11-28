import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const db = process.env.SUPALOCAL_DB;
if (!/^postgres(?:ql)?:\/\/postgres(?::gerimmo-ci-local)?@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_demo_vente_api$/.test(db ?? "")) {
  throw new Error("Indiquez SUPALOCAL_DB pour la base fictive gerimmo_ci_demo_vente_api.");
}
for (const fichier of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  if (existsSync(fichier)) throw new Error(`Rejouez la démo depuis une copie sans ${fichier}.`);
}
const web = "http://127.0.0.1:3286";
const api = "http://127.0.0.1:54386";
const fichierApi = "e2e/local/serveur-supabase-local.mjs";
const secret = (await readFile(fichierApi, "utf8")).match(/^const SECRET = "(gerimmo-local-[a-z]+)";$/m)?.[1];
if (!secret) throw new Error("Secret fictif de l’émulateur introuvable.");
const encoder = valeur => Buffer.from(JSON.stringify(valeur)).toString("base64url");
const jeton = encoder({ alg: "HS256", typ: "JWT" }) + "." + encoder({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 });
const stockage = await mkdtemp(join(tmpdir(), "gerimmo-demo-stockage-"));
// Aucun secret fournisseur hérité. L’alerte est consultée dans l’application.
const env = {
  PATH: process.env.PATH,
  HOME: homedir(),
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SITE_URL: web,
  NEXT_PUBLIC_SUPABASE_URL: api,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "recette-locale",
  SUPABASE_SERVICE_ROLE_KEY: jeton + "." + createHmac("sha256", secret).update(jeton).digest("base64url"),
  SUPALOCAL_PORT: "54386",
  SUPALOCAL_DB: db,
  SUPALOCAL_STORAGE: stockage,
  E2E_BASE_URL: web,
  PLAYWRIGHT_CHROMIUM: process.env.PLAYWRIGHT_CHROMIUM ?? "",
  GERIMMO_CHROME: process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath(),
  GERIMMO_MODE: "simulation",
  RESEND_API_KEY: "fictif-sans-service",
  COURRIELS_CHIFFREMENT_CLE: "cd".repeat(32),
};
const enfants = [];
function lancer(args, vars = env) {
  const processus = spawn(process.execPath, args, { env: vars, stdio: "inherit" });
  enfants.push(processus);
  return processus;
}
function terminer(processus) {
  return new Promise((resolve, reject) => {
    processus.once("exit", code => resolve(code ?? 1));
    processus.once("error", reject);
  });
}
async function attendre(url, processus) {
  const limite = Date.now() + 360_000;
  while (Date.now() < limite && processus.exitCode === null) {
    if (await fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => r.ok).catch(() => false)) return;
    await setTimeout(500);
  }
  throw new Error("Service local indisponible " + url);
}
try {
  // Le banc utilise des ports fixes. Refuser un service déjà présent évite de
  // jouer le scénario sur un autre serveur local.
  for (const url of [web, api]) {
    if (await fetch(url, { signal: AbortSignal.timeout(1500) }).then(() => true).catch(() => false)) {
      throw new Error("Port déjà utilisé " + url);
    }
  }
  await attendre(api + "/health", lancer([fichierApi]));
  const seed = await terminer(lancer(["e2e/local/seed-parcours.mjs"]));
  if (seed !== 0) throw new Error("Préparation des comptes fictifs en échec.");
  const next = lancer(["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3286"],
    { ...env, NODE_OPTIONS: "--require=./e2e/local/reseau-demo-parcours-a-trois.cjs" });
  await attendre(web + "/connexion", next);
  const test = lancer(["node_modules/@playwright/test/cli.js", "test",
    "--config", "e2e/local/demo-parcours-a-trois.config.ts", "--trace", "off", ...process.argv.slice(2)]);
  process.exitCode = await terminer(test);
} finally {
  for (const enfant of enfants.reverse()) if (enfant.exitCode === null) enfant.kill();
}
