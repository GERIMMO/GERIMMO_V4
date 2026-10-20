import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

const ORIGINE = "https://www.gerimmo.app";
const CHEMINS = ["/", "/connexion", "/mentions-legales", "/api/sante"];

// Un seul petit objet public est lu. Aucun secret, session ni donnée métier.
async function lireSante(reponse) {
  if (!/application\/json/i.test(reponse.headers.get("content-type") ?? "")) return false;
  const lecteur = reponse.body?.getReader();
  if (!lecteur) return false;
  const morceaux = [];
  let taille = 0;
  try {
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > 4096) return false;
      morceaux.push(value);
    }
    const objet = JSON.parse(Buffer.concat(morceaux).toString("utf8"));
    return objet.ok === true && objet.base === true && /^[a-f0-9]{40}$/i.test(objet.revision ?? "");
  } finally {
    await lecteur.cancel().catch(() => {});
  }
}

export async function verifierDisponibilite({ requete = fetch, attendre = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const controles = [];
  for (const chemin of CHEMINS) {
    let resultat;
    for (let tentative = 1; tentative <= 2; tentative++) {
      const debut = Date.now();
      let reponse;
      try {
        reponse = await requete(`${ORIGINE}${chemin}`, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "Gerimmo-Disponibilite/1.0", "Cache-Control": "no-cache" },
        });
        const ok = reponse.status === 200 && (chemin !== "/api/sante" || await lireSante(reponse));
        resultat = { chemin, ok, http: reponse.status, tentatives: tentative, duree_ms: Date.now() - debut };
      } catch {
        // Ni corps de réponse, ni erreur fournisseur brute dans les journaux.
        resultat = { chemin, ok: false, http: null, tentatives: tentative, duree_ms: Date.now() - debut };
      } finally {
        if (reponse?.body && !reponse.body.locked) await reponse.body.cancel().catch(() => {});
      }
      if (resultat.ok) break;
      if (tentative === 1) await attendre(5_000);
    }
    controles.push(resultat);
  }
  return {
    date_utc: new Date().toISOString(),
    ok: controles.every(c => c.ok),
    lecture_seule: true,
    controles,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bilan = await verifierDisponibilite();
  if (process.env.GERIMMO_BILAN_DISPONIBILITE) {
    await writeFile(process.env.GERIMMO_BILAN_DISPONIBILITE, JSON.stringify(bilan, null, 2) + "\n");
  }
  console.log(JSON.stringify(bilan));
  if (!bilan.ok) {
    console.error("::error::Gerimmo : une page publique ou la connexion à la base ne répond pas correctement après deux tentatives.");
    process.exitCode = 1;
  }
}
