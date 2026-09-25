import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CATALOGUE, comparer, complete, controlerValeur, horsVercel, lireEnv, planifier, rapport } from "./variables.mjs";

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
const envs = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", target: ["production", "preview", "development"] },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", target: ["production", "preview"] },
  { key: "SUPABASE_SERVICE_ROLE_KEY", target: ["production"] },
  { key: "RESEND_API_KEY", target: ["preview"], gitBranch: "recette" },
  { key: "SUPABASE_DB_URL", target: ["production"] },
  { key: "GERIMMO_CHROME", target: "production" },
  { key: "VERCEL_AUTOMATION_BYPASS_SECRET", target: ["production", "preview"] },
  { pas: "une variable" },
];

test("le catalogue ne nomme que des variables documentées dans .env.example, et jamais une variable hors Vercel", () => {
  const exemple = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.example"), "utf8");
  for (const v of CATALOGUE) {
    assert.match(exemple, new RegExp(`^${v.cle}=`, "m"), `${v.cle} manque dans .env.example`);
    assert.equal(horsVercel(v.cle), null, `${v.cle} est à la fois au catalogue et hors Vercel`);
  }
  assert.equal(new Set(CATALOGUE.map((v) => v.cle)).size, CATALOGUE.length);
});

test("la comparaison dit ce qui manque par cible, sans compter une preview limitée à une branche", () => {
  const c = comparer(envs, ["production", "preview"]);
  const ligne = (cle) => c.lignes.find((l) => l.cle === cle);
  assert.deepEqual(ligne("NEXT_PUBLIC_SUPABASE_URL").manquante, []);
  assert.deepEqual(ligne("SUPABASE_SERVICE_ROLE_KEY"), { ...ligne("SUPABASE_SERVICE_ROLE_KEY"), presente: ["production"], manquante: ["preview"] });
  assert.deepEqual(ligne("RESEND_API_KEY").manquante, ["production", "preview"]);
  assert.deepEqual(ligne("CRON_SECRET").manquante, ["production", "preview"]);
  assert.deepEqual(c.indesirables.map((i) => i.cle), ["SUPABASE_DB_URL"]);
  assert.deepEqual(c.inconnues, [{ cle: "GERIMMO_CHROME", cibles: ["production"] }]);
  assert.equal(complete(c), false);
});

test("un projet complet sur la production seule est complet, les facultatives n'y changent rien", () => {
  const tout = CATALOGUE.filter((v) => v.groupe !== "facultative").map((v) => ({ key: v.cle, target: ["production"] }));
  assert.equal(complete(comparer(tout, ["production"])), true);
  assert.equal(complete(comparer(tout, ["production", "preview"])), false);
});

test("le fichier .env se lit avec commentaires, guillemets et export", () => {
  const v = lireEnv([
    "# commentaire",
    "",
    "export STRIPE_SECRET_KEY=sk_test_abc # fin de ligne",
    'RESEND_EXPEDITEUR="Gerimmo <no-reply@gerimmo.app>"',
    "NEXT_PUBLIC_SITE_URL='https://www.gerimmo.app/'",
    "VIDE=",
    "pas une ligne env",
  ].join("\n"));
  assert.deepEqual([...v], [
    ["STRIPE_SECRET_KEY", "sk_test_abc"],
    ["RESEND_EXPEDITEUR", "Gerimmo <no-reply@gerimmo.app>"],
    ["NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app/"],
  ]);
});

test("les inversions de clés Supabase sont refusées avant tout appel", () => {
  assert.match(controlerValeur("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", jwt("service_role")).erreur, /SECRÈTE/);
  assert.match(controlerValeur("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_abc").erreur, /SECRÈTE/);
  assert.equal(controlerValeur("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc").erreur, undefined);
  assert.equal(controlerValeur("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", jwt("anon")).erreur, undefined);
  assert.match(controlerValeur("SUPABASE_SERVICE_ROLE_KEY", jwt("anon")).erreur, /publiable/);
  assert.match(controlerValeur("SUPABASE_SERVICE_ROLE_KEY", "sb_publishable_abc").erreur, /publiable/);
  assert.equal(controlerValeur("SUPABASE_SERVICE_ROLE_KEY", jwt("service_role")).erreur, undefined);
  assert.match(controlerValeur("SUPABASE_SERVICE_ROLE_KEY", "n'importe quoi").erreur, /service_role/);
});

test("l'adresse du site doit être publique, en https, sans barre oblique finale", () => {
  assert.match(controlerValeur("NEXT_PUBLIC_SITE_URL", "http://localhost:3000").erreur, /locale/);
  assert.match(controlerValeur("NEXT_PUBLIC_SITE_URL", "http://www.gerimmo.app").erreur, /https/);
  assert.match(controlerValeur("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app/agence").erreur, /chemin/);
  assert.equal(controlerValeur("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app/").valeur, "https://www.gerimmo.app");
  assert.equal(controlerValeur("NEXT_PUBLIC_SUPABASE_URL", "https://rddlxunppddzpsaatdaz.supabase.co/").valeur, "https://rddlxunppddzpsaatdaz.supabase.co");
  assert.match(controlerValeur("NEXT_PUBLIC_SUPABASE_URL", "https://example.com").erreur, /supabase/);
});

test("formes attendues des prestataires, avec avertissement pour les modes d'essai", () => {
  assert.match(controlerValeur("CRON_SECRET", "court").erreur, /32/);
  assert.equal(controlerValeur("CRON_SECRET", "a".repeat(64)).erreur, undefined);
  assert.match(controlerValeur("STRIPE_SECRET_KEY", "sk_test_abc").avertissement, /test/);
  assert.equal(controlerValeur("STRIPE_SECRET_KEY", "sk_live_abc").avertissement, null);
  assert.match(controlerValeur("STRIPE_SECRET_KEY", "pk_live_abc").erreur, /sk_live/);
  assert.match(controlerValeur("STRIPE_WEBHOOK_SECRET", "abc").erreur, /whsec_/);
  assert.match(controlerValeur("STRIPE_PRIX_BIEN", "prod_abc").erreur, /price_/);
  assert.match(controlerValeur("RESEND_API_KEY", "abc").erreur, /re_/);
  assert.match(controlerValeur("RESEND_EXPEDITEUR", "Gerimmo <onboarding@resend.dev>").avertissement, /test/);
  assert.equal(controlerValeur("RESEND_EXPEDITEUR", "Gerimmo <no-reply@gerimmo.app>").avertissement, null);
  assert.match(controlerValeur("RESEND_EXPEDITEUR", "sans arobase").erreur, /Nom/);
  assert.match(controlerValeur("YOUTRUST_ENV", "prod").erreur, /sandbox/);
  assert.match(controlerValeur("GERIMMO_CODEX_ENABLED", "oui").erreur, /true/);
  assert.match(controlerValeur("META_AD_ACCOUNT_ID", "123").erreur, /act_/);
  assert.match(controlerValeur("OPENAI_API_KEY", "").erreur, /vide/);
  assert.match(controlerValeur("OPENAI_API_KEY", "a\nb").erreur, /contrôle/);
  assert.equal(controlerValeur("OPENAI_API_KEY", " sk-abc ").valeur, "sk-abc");
});

test("le plan ne vise que les cibles où la variable manque, génère CRON_SECRET et refuse les mauvaises valeurs", () => {
  const c = comparer(envs, ["production", "preview"]);
  const valeurs = new Map([
    ["SUPABASE_SERVICE_ROLE_KEY", jwt("service_role")],
    ["NEXT_PUBLIC_SITE_URL", "http://localhost:3000"],
    ["STRIPE_SECRET_KEY", "sk_test_abc"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://autre.supabase.co"],
  ]);
  const plan = planifier(c, valeurs, { cronSecret: () => "s".repeat(64) });
  const p = (cle) => plan.aPoser.find((x) => x.cle === cle);
  assert.deepEqual(p("SUPABASE_SERVICE_ROLE_KEY").cibles, ["preview"]);
  assert.equal(p("SUPABASE_SERVICE_ROLE_KEY").type, "encrypted");
  assert.equal(p("NEXT_PUBLIC_SUPABASE_URL"), undefined, "déjà posée partout : rien à écraser");
  assert.deepEqual(p("CRON_SECRET"), { cle: "CRON_SECRET", valeur: "s".repeat(64), cibles: ["production", "preview"], type: "encrypted", avertissement: null, generee: true });
  assert.match(p("STRIPE_SECRET_KEY").avertissement, /test/);
  assert.deepEqual(plan.refusees, [{ cle: "NEXT_PUBLIC_SITE_URL", erreur: "adresse locale : les liens des e-mails ne mèneraient nulle part" }]);
  assert.ok(plan.sansValeur.some((s) => s.cle === "RESEND_API_KEY"));
  assert.ok(!plan.sansValeur.some((s) => s.cle === "CRON_SECRET"));
  const sansGeneration = planifier(c, valeurs);
  assert.ok(sansGeneration.sansValeur.some((s) => s.cle === "CRON_SECRET"));
});

test("le rapport nomme les manques et ce qui est à retirer, sans jamais une valeur", () => {
  const c = comparer(envs, ["production", "preview"]);
  const r = rapport(c);
  assert.match(r, /✘ CRON_SECRET\s+manque : production, preview/);
  assert.match(r, /✘ SUPABASE_SERVICE_ROLE_KEY\s+manque : preview \(présente : production\)/);
  assert.match(r, /✔ NEXT_PUBLIC_SUPABASE_URL\s+production, preview/);
  assert.match(r, /À retirer[\s\S]*! SUPABASE_DB_URL\s+production — chaîne Postgres/);
  assert.match(r, /hors catalogue : GERIMMO_CHROME \(production\)/);
  assert.match(r, /Bilan : 3 manquante\(s\) sur le socle, 8 chez les prestataires/);
  assert.doesNotMatch(r, /VERCEL_AUTOMATION_BYPASS_SECRET/);
});
