// Vérifie les variables du projet Vercel et pose ce qui manque (25/09).
//
//   node scripts/vercel/verifier.mjs                          état sur production et preview
//   node scripts/vercel/verifier.mjs --poser .env.local       pose en production ce qui manque, depuis le fichier
//   node scripts/vercel/verifier.mjs --poser .env.local --cibles production,preview
//
// Lit VERCEL_TOKEN (jeton avec droits sur le projet), VERCEL_PROJECT_ID et,
// pour un projet d'équipe, VERCEL_TEAM_ID — les mêmes noms que la publication
// contrôlée (docs/publication-controlee.md). Aucune valeur n'est jamais
// affichée ; seules les variables manquantes sont créées, rien n'est écrasé.
// Sort avec le code 1 tant qu'une variable du socle ou d'un prestataire manque.
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { CIBLES, comparer, complete, lireEnv, planifier, rapport } from "./variables.mjs";

const env = process.env;
const args = process.argv.slice(2);
if (args.includes("--aide") || args.includes("--help")) {
  console.log("node scripts/vercel/verifier.mjs [--poser <fichier .env>] [--cibles production,preview]");
  process.exit(0);
}
function option(nom) {
  const i = args.indexOf(nom);
  return i === -1 ? null : args[i + 1] ?? "";
}
const fichier = option("--poser");
if (fichier === "") throw new Error("--poser attend le chemin d'un fichier .env (jamais commité).");
const cibles = (option("--cibles") || (fichier ? "production" : "production,preview")).split(",").map((s) => s.trim()).filter(Boolean);
for (const c of cibles) if (!CIBLES.includes(c)) throw new Error(`Cible inconnue : ${c} (attendu : ${CIBLES.join(", ")}).`);
if (!env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN manque : un jeton Vercel avec droits sur le projet.");
const projet = env.VERCEL_PROJECT_ID || "";
if (!/^prj_[A-Za-z0-9]+$/.test(projet)) throw new Error("VERCEL_PROJECT_ID manque ou n'a pas la forme prj_….");
const equipe = env.VERCEL_TEAM_ID || "";
if (equipe && !/^team_[A-Za-z0-9]+$/.test(equipe)) throw new Error("Équipe Vercel invalide.");

async function vercel(chemin, method = "GET", corps) {
  const u = new URL(chemin, "https://api.vercel.com");
  if (u.origin !== "https://api.vercel.com") throw new Error("Adresse du prestataire refusée.");
  if (equipe) u.searchParams.set("teamId", equipe);
  const headers = { Authorization: `Bearer ${env.VERCEL_TOKEN}` };
  if (corps) headers["Content-Type"] = "application/json";
  const r = await fetch(u, { method, headers, body: corps ? JSON.stringify(corps) : undefined, redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" });
  const texte = await r.text();
  let json = {};
  try { json = texte ? JSON.parse(texte) : {}; } catch { /* réponse non JSON : le statut suffit */ }
  if (!r.ok) throw new Error(`Vercel a répondu ${r.status}${json?.error?.message ? ` : ${json.error.message}` : ""}.`);
  return json;
}

const { envs } = await vercel(`/v10/projects/${projet}/env`);
const comparaison = comparer(envs, cibles);
console.log(rapport(comparaison));

if (!fichier) process.exit(complete(comparaison) ? 0 : 1);

const plan = planifier(comparaison, lireEnv(await readFile(fichier, "utf8")), { cronSecret: () => randomBytes(32).toString("hex") });
console.log("");
for (const r of plan.refusees) console.log(`  ✘ ${r.cle} : refusée — ${r.erreur}`);
for (const s of plan.sansValeur) console.log(`  · ${s.cle} : absente du fichier — ${s.chez} : ${s.usage}`);
if (!plan.aPoser.length) {
  console.log("Rien à poser.");
  process.exit(plan.refusees.length ? 1 : 0);
}
for (const p of plan.aPoser) {
  console.log(`  → ${p.cle} sur ${p.cibles.join(", ")}${p.generee ? " (valeur aléatoire générée, jamais affichée)" : ""}${p.avertissement ? ` — attention : ${p.avertissement}` : ""}`);
}
const reponse = await vercel(
  `/v10/projects/${projet}/env`,
  "POST",
  plan.aPoser.map(({ cle, valeur, cibles: target, type }) => ({ key: cle, value: valeur, type, target }))
);
const creees = [].concat(reponse.created ?? []).map((e) => e?.key).filter(Boolean);
const echecs = [].concat(reponse.failed ?? []).map((f) => `${f?.error?.key ?? "?"} : ${f?.error?.message ?? f?.error?.code ?? "refus"}`);
console.log("");
console.log(`Posées : ${creees.length ? creees.join(", ") : "aucune"}.`);
for (const e of echecs) console.log(`  ✘ ${e}`);
if (creees.length) console.log("Un nouveau déploiement est nécessaire pour que la production lise les nouvelles valeurs (Vercel > Deployments > Redeploy).");
process.exit(echecs.length || plan.refusees.length ? 1 : 0);
