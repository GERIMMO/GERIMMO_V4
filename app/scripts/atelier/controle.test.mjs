import test from 'node:test';import assert from 'node:assert/strict';import {validerProposition} from './controle.mjs';
const proposition=(chemin,contenu='export const x=1')=>({resume:'Correction',fichiers:[{chemin,contenu}]});
test('accepte une proposition limitée aux composants',()=>assert.ok(validerProposition(proposition('app/src/components/avis.tsx'))));
test('refuse les accès, migrations, chemins détournés et fichiers exécutables',()=>{for(const c of ['.github/workflows/ci.yml','app/src/app/api/route.ts','app/src/components/../../proxy.ts','app/src/components/a.sh','app/.env','/tmp/f.ts'])assert.throws(()=>validerProposition(proposition(c)));});
test('refuse doublons, volumes et formats inattendus',()=>{assert.throws(()=>validerProposition({resume:'x',fichiers:[]}));const p=proposition('app/src/components/a.ts');p.fichiers.push(p.fichiers[0]);assert.throws(()=>validerProposition(p));assert.throws(()=>validerProposition(proposition('app/src/components/a.ts','x'.repeat(50001))));});

import { assurerProposition } from "./proposition-github.mjs";

function githubFictif() {
  const etat = { branche: null, pr: null, creations: 0, perdreConfirmation: false };
  async function gh(route, body) {
    if (route.startsWith("git/matching-refs/")) return [];
    if (route.startsWith("pulls?")) return etat.pr ? [etat.pr] : [];
    if (route === "git/ref/heads/main") return { object: { sha: "base" } };
    if (route.startsWith("git/ref/heads/")) return etat.branche;
    if (route === "git/commits/base") return { tree: { sha: "origine" } };
    if (route === "git/trees") return { sha: "arbre" };
    if (route === "git/commits") return { sha: "candidat" };
    if (route === "git/commits/candidat") return { tree: { sha: "arbre" }, parents: [{ sha: "base" }] };
    if (route === "git/refs") {
      if (etat.branche) throw new Error("Branche existante");
      etat.branche = { object: { sha: body.sha } };
      return etat.branche;
    }
    if (route === "pulls") {
      if (etat.pr) throw new Error("PR existante");
      assert.equal(body.draft, true);
      etat.pr = { number: ++etat.creations, state: "open" };
      if (etat.perdreConfirmation) throw new Error("Réponse perdue");
      return etat.pr;
    }
    throw new Error("Route inattendue : " + route);
  }
  return { etat, gh };
}

const dossier = { id: "proposition-fictive", base: "base", fichiers: [], resume: "Résumé" };
test("deux préparations simultanées retrouvent le même brouillon après une réponse perdue", async () => {
  const { etat, gh } = githubFictif();
  etat.perdreConfirmation = true;
  const resultats = await Promise.all([assurerProposition(gh, dossier), assurerProposition(gh, dossier)]);
  assert.deepEqual(resultats.map(pr => pr.number), [1, 1]);
  assert.equal(etat.creations, 1);
  etat.pr.state = "closed";
  assert.equal((await assurerProposition(gh, dossier)).state, "closed");
  assert.equal(etat.creations, 1);
});
test("une branche concurrente au contenu différent reste intacte", async () => {
  const { etat, gh } = githubFictif();
  etat.branche = { object: { sha: "differente" } };
  const autre = (route, ...args) => route === "git/commits/differente"
    ? { tree: { sha: "autre-arbre" }, parents: [{ sha: "base" }] }
    : gh(route, ...args);
  await assert.rejects(assurerProposition(autre, dossier), /branche différente/);
  assert.equal(etat.creations, 0);
  assert.equal(etat.branche.object.sha, "differente");
});

test("une proposition historique refusée reste close", async () => {
  const historique = { number: 12, state: "closed" };
  async function gh(route) {
    if (route.startsWith("git/matching-refs/"))
      return [{ ref: "refs/heads/gerimmo/proposition-proposition-fictive-100" }];
    if (route.startsWith("pulls?")) return route.endsWith("-100") ? [historique] : [];
    throw new Error("Écriture inattendue");
  }
  assert.deepEqual(await assurerProposition(gh, dossier), historique);
});
