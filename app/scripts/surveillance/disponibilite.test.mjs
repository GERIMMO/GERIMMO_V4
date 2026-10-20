import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierDisponibilite } from "./disponibilite.mjs";

const sante = () => Response.json({ ok: true, base: true, revision: "a".repeat(40) });
const attendre = async () => {};

test("contrôle uniquement quatre adresses publiques, sans secret ni écriture", async () => {
  const appels = [];
  const bilan = await verifierDisponibilite({
    attendre,
    requete: async (url, options) => {
      appels.push({ url, options });
      return url.endsWith("/api/sante") ? sante() : new Response("Page publique");
    },
  });
  assert.equal(bilan.ok, true);
  assert.equal(appels.length, 4);
  assert.ok(appels.every(a => a.url.startsWith("https://www.gerimmo.app/")));
  assert.ok(appels.every(a => a.options.method === "GET" && a.options.redirect === "error" && !a.options.body));
  assert.ok(appels.every(a => !("Authorization" in a.options.headers)));
});

test("une panne transitoire est retentée sans masquer un échec durable", async () => {
  const appels = new Map();
  const bilan = await verifierDisponibilite({
    attendre,
    requete: async url => {
      const n = (appels.get(url) ?? 0) + 1;
      appels.set(url, n);
      if (url.endsWith("/connexion")) return new Response("", { status: 503 });
      if (url.endsWith("/api/sante")) return n === 1 ? new Response("", { status: 502 }) : sante();
      return new Response("OK");
    },
  });
  assert.equal(bilan.ok, false);
  assert.equal(bilan.controles.find(c => c.chemin === "/connexion").tentatives, 2);
  assert.equal(bilan.controles.find(c => c.chemin === "/api/sante").ok, true);
});

test("un 200 ne suffit pas : base indisponible, HTML et réponse excessive sont refusés", async () => {
  for (const reponse of [
    () => Response.json({ ok: true, base: false, revision: "a".repeat(40) }),
    () => Response.json({ ok: true, base: true }),
    () => new Response("<html>Connexion</html>"),
    () => new Response("x".repeat(4097), { headers: { "content-type": "application/json" } }),
    () => new Response("{", { headers: { "content-type": "application/json" } }),
  ]) {
    const bilan = await verifierDisponibilite({ attendre, requete: async url => url.endsWith("/api/sante") ? reponse() : new Response("OK") });
    assert.equal(bilan.ok, false);
    assert.equal(bilan.controles.at(-1).tentatives, 2);
  }
});

test("les erreurs réseau restent bornées et ne sont jamais recopiées dans le bilan", async () => {
  let appels = 0;
  const bilan = await verifierDisponibilite({
    attendre,
    requete: async () => { appels++; throw new Error("information-fournisseur-confidentielle"); },
  });
  assert.equal(bilan.ok, false);
  assert.equal(appels, 8);
  assert.ok(!JSON.stringify(bilan).includes("confidentielle"));
});
