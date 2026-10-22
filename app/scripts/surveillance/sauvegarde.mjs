import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

// Lecture GitHub uniquement : aucun accès aux archives, à la base ni aux clés de sauvegarde.
export function analyserSauvegardes(runs, maintenant = Date.now()) {
  const dates = runs.filter(r => r.status === "completed" && Number.isFinite(Date.parse(r.updated_at)))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const derniere = dates[0];
  const reussie = dates.find(r => r.conclusion === "success");
  const age = reussie ? (maintenant - Date.parse(reussie.updated_at)) / 3_600_000 : null;
  const echecs = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
  const motif = age === null ? "aucune_copie_confirmee"
    : age < -0.0834 ? "horodatage_incoherent"
    : age > 26 ? "copie_trop_ancienne"
    : derniere && echecs.has(derniere.conclusion) ? "dernier_passage_en_echec" : "copie_recente";
  return { ok: motif === "copie_recente", motif, age_heures: age === null ? null : Math.round(age * 100) / 100,
    derniere_reussite: reussie?.updated_at ?? null, execution: reussie?.id ?? null };
}

// Un workflow peut être vert alors que son unique travail a été ignoré
// (par exemple si SCW_BUCKET n'est plus configuré). Exiger la relecture.
export function confirmerCopieDistante(jobs, maintenant = Date.now()) {
  const travail = Array.isArray(jobs) && jobs.find(j => j.name === "sauvegarder");
  const preuve = travail?.steps?.find(s => s.name === "Vérifier la copie distante");
  if (travail?.status !== "completed" || travail.conclusion !== "success"
      || preuve?.status !== "completed" || preuve.conclusion !== "success") {
    return { ok: false, motif: "copie_distante_non_confirmee" };
  }
  const age = (maintenant - Date.parse(preuve.completed_at)) / 3_600_000;
  const motif = !Number.isFinite(age) || age < -0.0834 ? "horodatage_incoherent"
    : age > 26 ? "copie_trop_ancienne" : "copie_recente";
  return { ok: motif === "copie_recente", motif,
    age_heures: Number.isFinite(age) ? Math.round(age * 100) / 100 : null,
    derniere_reussite: preuve.completed_at ?? null };
}

export async function verifierSauvegarde({ jeton, requete = fetch, maintenant = Date.now() } = {}) {
  try {
    if (!jeton) return { ok: false, motif: "acces_controle_absent" };
    const options = () => ({
      headers: { Authorization: `Bearer ${jeton}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    const racine = "https://api.github.com/repos/GERIMMO/GERIMMO_V4/actions";
    const r = await requete(`${racine}/workflows/sauvegarde.yml/runs?branch=main&per_page=100`, options());
    if (!r.ok) return { ok: false, motif: "historique_indisponible", http: r.status };
    const body = await r.json();
    if (!Array.isArray(body.workflow_runs)) return { ok: false, motif: "historique_incomplet" };
    const bilan = analyserSauvegardes(body.workflow_runs, maintenant);
    if (!bilan.ok) return bilan;
    const passage = body.workflow_runs.find(p => p.id === bilan.execution);
    if (!Number.isSafeInteger(passage?.id) || passage.id < 1
        || !Number.isSafeInteger(passage.run_attempt) || passage.run_attempt < 1) {
      return { ok: false, motif: "historique_incomplet" };
    }
    const detail = await requete(`${racine}/runs/${passage.id}/attempts/${passage.run_attempt}/jobs?per_page=100`, options());
    if (!detail.ok) return { ok: false, motif: "preuve_indisponible", http: detail.status };
    const travaux = await detail.json();
    return { execution: passage.id, ...confirmerCopieDistante(travaux.jobs, maintenant) };
  } catch { return { ok: false, motif: "controle_indisponible" }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bilan = { date_utc: new Date().toISOString(), lecture_seule: true, ...await verifierSauvegarde({jeton:process.env.GITHUB_TOKEN}) };
  if (process.env.GERIMMO_BILAN_SAUVEGARDE) await writeFile(process.env.GERIMMO_BILAN_SAUVEGARDE, JSON.stringify(bilan, null, 2)+"\n");
  console.log(JSON.stringify(bilan));
  if (!bilan.ok) { console.error("::error::La sauvegarde indépendante nécessite une vérification."); process.exitCode=1; }
}
