import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierEnvironnement } from "./verifier-environnement.mjs";

test("la production Vercel et les bancs locaux restent constructibles", () => {
  for (const env of [{}, { NODE_ENV: "production" }, { CI: "true" }, { VERCEL: "1", VERCEL_ENV: "production" }]) {
    assert.doesNotThrow(() => verifierEnvironnement(env));
  }
});

test("une prévisualisation est refusée même si son URL de site indique la production", () => {
  for (const env of [
    { VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://www.gerimmo.app" },
    { VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "" },
    { VERCEL: "1" },
    { VERCEL: "1", VERCEL_ENV: "development" },
  ]) {
    assert.throws(() => verifierEnvironnement(env), /Construction suspendue/);
  }
});

const preproduction = {
  VERCEL:"1", VERCEL_ENV:"preview", VERCEL_TARGET_ENV:"preproduction", GERIMMO_PREPRODUCTION_VALIDEE:"1",
  NEXT_PUBLIC_SUPABASE_URL:"https://hlkbvmfybxwqathchsdz.supabase.co", VERCEL_URL:"gerimmo-v4-verification-gerimmo.vercel.app",
  NEXT_PUBLIC_SITE_URL:"https://gerimmo-v4-verification-gerimmo.vercel.app",
};
test("seul l'environnement dédié, sans service externe, est autorisé",()=>{
  assert.doesNotThrow(()=>verifierEnvironnement(preproduction));
  for(const modification of [
    {NEXT_PUBLIC_SUPABASE_URL:"https://rddlxunppddzpsaatdaz.supabase.co"},
    {NEXT_PUBLIC_SITE_URL:"https://www.gerimmo.app"}, {VERCEL_TARGET_ENV:"preview"},
    {VERCEL_ENV:"production"}, {VERCEL_URL:"gerimmo-v4.vercel.app"},
    {STRIPE_SECRET_KEY:"valeur-de-test-unitaire"}, {RESEND_API_KEY:"valeur-de-test-unitaire"},
    {ZOHO_SIGN_REFRESH_TOKEN:"valeur-de-test-unitaire"}, {META_FACEBOOK_PAGE_ACCESS_TOKEN:"valeur-de-test-unitaire"},
    {OPENAI_API_KEY:"valeur-de-test-unitaire"}, {CRON_SECRET:"valeur-de-test-unitaire"},
    {SUPABASE_SERVICE_ROLE_KEY:"valeur-de-test-unitaire"}, {GERIMMO_CODEX_ENABLED:"true"},
  ]) assert.throws(()=>verifierEnvironnement({...preproduction,...modification}),/Construction suspendue/);
});
test("une mauvaise configuration ne révèle jamais les valeurs privées",()=>{
  try { verifierEnvironnement({...preproduction,RESEND_API_KEY:"ne-jamais-afficher"});assert.fail("doit refuser"); }
  catch(e) { assert.match(e.message,/Construction suspendue/);assert.doesNotMatch(e.message,/ne-jamais-afficher/); }
});

test("le premier déploiement dérive son origine sans dépendre du domaine de production", () => {
  const env = { ...preproduction, NEXT_PUBLIC_SITE_URL: undefined, VERCEL_PROJECT_PRODUCTION_URL: "www.gerimmo.app" };
  assert.equal(verifierEnvironnement(env), `https://${env.VERCEL_URL}`);
  for (const hote of ["", "www.gerimmo.app", "gerimmo-v4-x.vercel.app.evil.test", "gerimmo-v4-x.vercel.app/path"]) {
    assert.throws(() => verifierEnvironnement({ ...env, VERCEL_URL: hote }), /Construction suspendue/);
  }
});
