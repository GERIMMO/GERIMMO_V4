import test from "node:test";
import assert from "node:assert/strict";
import { signalerPassage } from "../../src/lib/signal-passage.mjs";

// Double du récepteur externe : son horloge continue même lorsque le producteur s'arrête.
function recepteurFictif(delai) {
  let maintenant = 0, dernier = null, ouvert = false;
  const incidents = [], appels = [];
  const ouvrir = motif => {
    if (!ouvert) incidents.push(motif);
    ouvert = true;
  };
  return {
    incidents, appels,
    async fetch(url, options) {
      appels.push({url, options});
      if (url.endsWith("/fail")) ouvrir("échec signalé");
      else { dernier = maintenant; ouvert = false; }
      return new Response(null);
    },
    avancer(ms) {
      maintenant += ms;
      if (dernier !== null && maintenant - dernier > delai) ouvrir("passage absent");
    },
  };
}
const env = {VERCEL_ENV: "production", GERIMMO_SIGNAL_SAUVEGARDE: "fictif_test"};
test("un refus confirmé ouvre un incident et une reprise clôt l’épisode", async () => {
  const r = recepteurFictif(26);
  await signalerPassage("sauvegarde", true, env, r.fetch);
  await signalerPassage("sauvegarde", false, env, r.fetch);
  await signalerPassage("sauvegarde", false, env, r.fetch);
  assert.deepEqual(r.incidents, ["échec signalé"]);
  assert.equal(r.appels[1].url, "https://incidents.betterstack.com/api/v1/heartbeat/fictif_test/fail");
  assert.equal(r.appels[1].options.redirect, "error");
  assert.equal(r.appels[1].options.body, undefined);
  await signalerPassage("sauvegarde", true, env, r.fetch);
  r.avancer(27);
  assert.deepEqual(r.incidents, ["échec signalé", "passage absent"]);
});
test("l’arrêt du producteur après un vrai passage ouvre un seul incident", async () => {
  const r = recepteurFictif(26);
  await signalerPassage("sauvegarde", true, env, r.fetch);
  r.avancer(25); assert.equal(r.incidents.length, 0);
  r.avancer(2); r.avancer(2);
  assert.deepEqual(r.incidents, ["passage absent"]);
});
test("en recette, sans jeton ou pour une autre tâche, aucun appel", async () => {
  const r = recepteurFictif(1);
  await signalerPassage("sauvegarde", true, {...env, VERCEL_ENV:"preview"}, r.fetch);
  await signalerPassage("sauvegarde", true, {VERCEL_ENV:"production"}, r.fetch);
  await signalerPassage("autre", true, env, r.fetch);
  assert.equal(r.appels.length, 0);
});
test("une panne du récepteur ne rejoue pas le travail métier", async () => {
  let appels = 0;
  await signalerPassage("sauvegarde", true, env, async () => { appels++; throw new Error(); });
  assert.equal(appels, 1);
});
