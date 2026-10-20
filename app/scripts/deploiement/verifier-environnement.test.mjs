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
