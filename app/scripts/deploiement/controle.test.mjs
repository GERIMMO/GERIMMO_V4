import { test } from "node:test";
import assert from "node:assert/strict";
import { controlerPublication, optionsValides, santeConforme } from "./controle.mjs";
const nouveauSha = "a".repeat(40), ancienSha = "b".repeat(40);
const o = { sha: nouveauSha, deploymentId: "dpl_nouvelle123", ciRunId: "123", repository: "Gerimmo/app", projectId: "prj_gerimmo123", productionOrigin: "https://www.gerimmo.app", publish: true, databaseCompatible: true };
function scenario(modifier = {}) {
  let actuelle = "dpl_ancienne123";
  const appels = [];
  const version = (id) => ({ id, projectId: o.projectId, readyState: "READY", target: "production", url: id === o.deploymentId ? "gerimmo-new.vercel.app" : "gerimmo-old.vercel.app", meta: { githubCommitSha: id === o.deploymentId ? nouveauSha : ancienSha, githubCommitRef: "main" } });
  const p = {
    ci: async () => ({ id: 123, workflow_id: 9, head_sha: nouveauSha, head_branch: "main", head_repository: { full_name: o.repository }, event: "push", status: "completed", conclusion: "success" }),
    workflow: async () => ({ id: 9, path: ".github/workflows/ci.yml" }),
    onMain: async () => true,
    deployment: async id => version(id),
    current: async () => actuelle,
    health: async url => ({ ok: true, base: true, revision: url.includes("old") || (url === o.productionOrigin && actuelle !== o.deploymentId) ? ancienSha : nouveauSha }),
    approvalConfigured: async () => true,
    promote: async id => { appels.push(["promote", id]); actuelle = id; },
    rollback: async id => { appels.push(["rollback", id]); actuelle = id; },
    sleep: async () => {},
    ...modifier,
  };
  return { p, appels, changer: id => { actuelle = id; } };
}
test("révision courte, identifiant injecté et HTTP sont refusés avant appel externe", () => {
  for (const patch of [{ sha: "abc1234" }, { deploymentId: "dpl_x/../../projects" }, { productionOrigin: "http://localhost" }, { publish: true, databaseCompatible: false }]) assert.throws(() => optionsValides({ ...o, ...patch }));
});
test("un contrôle seul ne modifie rien", async () => {
  const s = scenario(); const r = await controlerPublication({ ...o, publish: false }, s.p);
  assert.equal(r.etat, "prete_a_valider"); assert.deepEqual(s.appels, []);
});
test("trois contrôles de production confirment la publication", async () => {
  const s = scenario(); const r = await controlerPublication(o, s.p);
  assert.equal(r.etat, "publiee_verifiee"); assert.deepEqual(s.appels, [["promote", o.deploymentId]]);
});
for (const patch of [{ event: "pull_request" }, { head_branch: "feature" }, { head_repository: { full_name: "fork/app" } }, { head_sha: ancienSha }, { workflow_id: 99 }, { conclusion: "failure" }]) {
  test(`CI non fiable refusée : ${JSON.stringify(patch)}`, async () => {
    const s = scenario(); const ci = await s.p.ci(); s.p.ci = async () => ({ ...ci, ...patch });
    assert.equal((await controlerPublication(o, s.p)).etat, "bloquee"); assert.deepEqual(s.appels, []);
  });
}
test("un autre projet ou SHA de déploiement est refusé", async () => {
  for (const patch of [{ projectId: "prj_autre123" }, { meta: { githubCommitSha: ancienSha, githubCommitRef: "main" } }, { url: "vercel.app.pirate.fr" }, { target: "preview" }]) {
    const s = scenario(); const deployment = s.p.deployment; s.p.deployment = async id => ({ ...await deployment(id), ...patch });
    assert.equal((await controlerPublication(o, s.p)).etat, "bloquee"); assert.deepEqual(s.appels, []);
  }
});
test("aucune approbation configurée signifie aucune publication", async () => {
  const s = scenario({ approvalConfigured: async () => false });
  assert.equal((await controlerPublication(o, s.p)).etat, "bloquee"); assert.deepEqual(s.appels, []);
});
test("un changement de production avant promotion annule le geste", async () => {
  const s = scenario(); let lectures = 0; s.p.current = async () => ++lectures === 1 ? "dpl_ancienne123" : "dpl_concurrent123";
  assert.equal((await controlerPublication(o, s.p)).etat, "bloquee"); assert.deepEqual(s.appels, []);
});
test("trois échecs ramènent à la version initiale saine", async () => {
  const s = scenario(); const health = s.p.health;
  s.p.health = async (url, prod) => prod && await s.p.current() === o.deploymentId ? { ok: false } : health(url);
  assert.equal((await controlerPublication(o, s.p)).etat, "retour_verifie");
  assert.deepEqual(s.appels, [["promote", o.deploymentId], ["rollback", "dpl_ancienne123"]]);
});
test("une panne partagée par la version de retour n'entraîne aucun rollback", async () => {
  const s = scenario(); let publiee = false; const promote = s.p.promote, health = s.p.health;
  s.p.promote = async id => { publiee = true; await promote(id); };
  s.p.health = async url => publiee ? { ok: false } : health(url);
  assert.equal((await controlerPublication(o, s.p)).etat, "intervention_requise");
  assert.equal(s.appels.filter(([a]) => a === "rollback").length, 0);
});
test("une publication concurrente est respectée, sans retour forcé", async () => {
  const s = scenario(); s.p.sleep = async () => s.changer("dpl_concurrent123");
  assert.equal((await controlerPublication(o, s.p)).etat, "intervention_requise");
  assert.equal(s.appels.filter(([a]) => a === "rollback").length, 0);
});
test("un délai de réponse perdu n'entraîne pas une seconde promotion", async () => {
  const s = scenario(); const promote = s.p.promote;
  s.p.promote = async id => { await promote(id); throw new Error("timeout"); };
  assert.equal((await controlerPublication(o, s.p)).etat, "publiee_verifiee");
  assert.equal(s.appels.length, 1);
});
test("santé d’une autre révision ou SHA abrégé ne suffit pas", () => {
  assert.equal(santeConforme({ ok: true, base: true, commit: nouveauSha.slice(0, 7) }, nouveauSha), false);
  assert.equal(santeConforme({ ok: true, base: true, revision: ancienSha }, nouveauSha), false);
});
