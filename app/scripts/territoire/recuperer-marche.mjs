// Remplir le fichier de marché depuis les sources publiques — sans rien inventer.
//
//   node scripts/territoire/recuperer-marche.mjs
//
// CE QUE CE SCRIPT FAIT ET NE FAIT PAS. Il lit src/data/territoires-marche.json,
// tente chaque source, écrit les chiffres obtenus avec la date, et laisse à
// `null` tout ce qu'il n'a pas pu obtenir — en consignant pourquoi dans
// `echecs`. Le score traite un null comme zéro ET le dit : une donnée absente
// n'est jamais remplacée par une estimation.
//
// Relevé du 19/09 : depuis l'environnement de développement distant, ces
// domaines ne répondent pas (politique réseau). Le script est fait pour tourner
// là où ils répondent — une machine locale, ou une session dont la politique
// réseau autorise recherche-entreprises.api.gouv.fr, api.insee.fr et
// www.data.gouv.fr.
//
// Seule la source SIRENE est câblée ici : son API est publique, sans clé, et sa
// réponse porte un `total_results` par requête. Les deux autres (INSEE,
// zones tendues) demandent d'abord d'identifier la ressource exacte, ce qui se
// fait à la main la première fois, puis se fige ici.

import { readFileSync, writeFileSync } from "node:fs";

const FICHIER = new URL("../../src/data/territoires-marche.json", import.meta.url);
const marche = JSON.parse(readFileSync(FICHIER, "utf-8"));
const aujourdhui = new Date().toISOString().slice(0, 10);
const echecs = [];

// Un total par requête ; on additionne les trois codes NAF de l'immobilier
// (agences 68.31Z, administration de biens 68.32A/B). Rythme prudent : l'API
// publique limite à quelques requêtes par seconde.
const NAF = ["68.31Z", "68.32A", "68.32B"];
async function agences(departement) {
  let total = 0;
  for (const naf of NAF) {
    const url = `https://recherche-entreprises.api.gouv.fr/search?activite_principale=${naf}&departement=${departement}&etat_administratif=A&page=1&per_page=1`;
    const r = await fetch(url, { headers: { "User-Agent": "gerimmo-territoire/0.1" } });
    if (!r.ok) throw new Error(`${naf} ${departement} : HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j.total_results !== "number") throw new Error(`${naf} ${departement} : total_results absent`);
    total += j.total_results;
    await new Promise((res) => setTimeout(res, 250));
  }
  return total;
}

let remplis = 0;
for (const code of Object.keys(marche.departements)) {
  try {
    marche.departements[code].agences = await agences(code);
    remplis += 1;
  } catch (e) {
    echecs.push({ cle: "agences", departement: code, erreur: String(e.message ?? e) });
  }
}
const src = marche.sources.find((s) => s.cle === "agences");
if (remplis > 0) src.recupere_le = aujourdhui;
marche.echecs = echecs;

writeFileSync(FICHIER, JSON.stringify(marche, null, 1) + "\n");
console.log(`agences : ${remplis} départements remplis, ${echecs.length} échecs`);
if (echecs.length > 0) console.log(echecs.slice(0, 3));
