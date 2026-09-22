// This controller never builds, imports, or runs the candidate revision.
// It receives immutable Vercel deployment IDs and verifies provider evidence.
export const SHA = /^[0-9a-f]{40}$/;
const ID = /^dpl_[A-Za-z0-9]{8,80}$/;
function exiger(condition, message) { if (!condition) throw new Error(message); }
export function optionsValides(o) {
  exiger(SHA.test(o.sha), "La révision doit comporter exactement 40 caractères.");
  exiger(ID.test(o.deploymentId), "La référence de la version préparée est invalide.");
  exiger(/^\d{1,20}$/.test(o.ciRunId), "La référence des tests est invalide.");
  exiger(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o.repository), "Le dépôt n’est pas identifié.");
  exiger(/^prj_[A-Za-z0-9]{8,80}$/.test(o.projectId), "Le projet Vercel n’est pas configuré.");
  const u = new URL(o.productionOrigin);
  exiger(u.protocol === "https:" && !u.username && !u.password && !u.port && u.pathname === "/" && !u.search && !u.hash && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname), "L’adresse de production est invalide.");
  exiger(typeof o.publish === "boolean" && typeof o.databaseCompatible === "boolean", "Le mode de publication est invalide.");
  exiger(!o.publish || o.databaseCompatible, "Vérifiez que la base reste compatible avec la version précédente avant de publier.");
  return o;
}
export function verifierCI(run, workflow, o) {
  exiger(run.id?.toString() === o.ciRunId && run.workflow_id === workflow.id && workflow.path === ".github/workflows/ci.yml", "Les résultats ne correspondent pas au contrôle complet de Gerimmo.");
  exiger(run.event === "push" && run.head_branch === "main" && run.head_repository?.full_name === o.repository, "Les tests doivent provenir de la branche principale du dépôt Gerimmo.");
  exiger(run.head_sha === o.sha && run.status === "completed" && run.conclusion === "success", "Les tests complets n’ont pas réussi pour cette révision exacte.");
}
export function verifierVersion(d, o, sha = null) {
  exiger(ID.test(d?.id) && d.projectId === o.projectId, "La version ne correspond pas au projet Gerimmo.");
  exiger(d.readyState === "READY" && d.target === "production", "La version doit être construite avec les réglages de production et prête.");
  const revision = d.meta?.githubCommitSha;
  exiger(SHA.test(revision) && (!sha || revision === sha), "La révision de la version préparée ne correspond pas à la révision demandée.");
  exiger(d.meta?.githubCommitRef === "main", "Seules les versions issues de la branche principale sont publiables.");
  const host = d.url;
  exiger(typeof host === "string" && /^[a-z0-9-]+\.vercel\.app$/.test(host), "L’adresse de contrôle de la version est invalide.");
  return revision;
}
export function santeConforme(resultat, sha) { return resultat?.ok === true && resultat.base === true && resultat.revision === sha; }

/**
 * `ports` isolates every external effect for failure/race tests.
 * Any uncertainty around provider routing aborts automatic action.
 */
export async function controlerPublication(o, ports) {
  optionsValides(o);
  const rapport = { revision: o.sha, deploymentId: o.deploymentId, mode: o.publish ? "publication" : "verification", etat: "verification", controles: [] };
  const noter = (texte) => { rapport.controles.push(texte); ports.report?.(rapport); };
  try {
    verifierCI(await ports.ci(o.ciRunId), await ports.workflow(), o);
    exiger(await ports.onMain(o.sha), "La révision n’appartient plus à l’historique principal.");
    noter("Les tests complets ont réussi pour la révision demandée.");
    const cible = await ports.deployment(o.deploymentId);
    verifierVersion(cible, o, o.sha);
    const initialId = await ports.current();
    exiger(initialId !== cible.id, "Cette version est déjà en production : utilisez le suivi de santé, sans la republier.");
    const initial = await ports.deployment(initialId);
    const ancienneRevision = verifierVersion(initial, o);
    rapport.versionPrecedente = initial.id;
    rapport.revisionPrecedente = ancienneRevision;
    exiger(santeConforme(await ports.health(`https://${initial.url}`, false), ancienneRevision), "La version de retour n’est pas saine : publication suspendue.");
    exiger(santeConforme(await ports.health(`https://${cible.url}`, false), o.sha), "La version préparée ne passe pas le contrôle de santé.");
    noter("La version préparée et la version de retour répondent correctement.");
    if (!o.publish) { rapport.etat = "prete_a_valider"; return rapport; }
    exiger(await ports.approvalConfigured(), "La validation du responsable n’est pas configurée dans GitHub.");
    exiger(await ports.current() === initial.id, "La production a changé pendant les vérifications. Recommencez sur son nouvel état.");
    // One request only: on timeout, inspect routing rather than retry blindly.
    let promotionIncertaine = false;
    try { await ports.promote(cible.id); } catch { promotionIncertaine = true; }
    noter(promotionIncertaine ? "La demande de publication doit être confirmée par la réponse du site." : "La publication a été demandée.");
    let echecs = 0, succes = 0;
    for (let i = 0; i < 12; i++) {
      await ports.sleep(10000);
      const actuel = await ports.current();
      if (actuel !== initial.id && actuel !== cible.id) {
        rapport.etat = "intervention_requise";
        noter("Une autre version a pris la main. Aucune annulation automatique effectuée.");
        return rapport;
      }
      if (actuel === initial.id) continue;
      const sain = santeConforme(await ports.health(o.productionOrigin, true), o.sha);
      if (sain) { succes++; echecs = 0; } else { echecs++; succes = 0; }
      if (succes >= 3) { rapport.etat = "publiee_verifiee"; noter("La nouvelle version est confirmée par trois contrôles successifs."); return rapport; }
      if (echecs >= 3) break;
    }
    if (await ports.current() !== cible.id) {
      rapport.etat = "intervention_requise";
      noter("La nouvelle version n’a pas été confirmée en production. Aucun retour appliqué.");
      return rapport;
    }
    // Recheck the old version against the CURRENT database before switching back.
    if (!santeConforme(await ports.health(`https://${initial.url}`, false), ancienneRevision)) {
      rapport.etat = "intervention_requise";
      noter("Le retour n’est plus sain. Aucun changement supplémentaire appliqué.");
      return rapport;
    }
    if (await ports.current() !== cible.id) {
      rapport.etat = "intervention_requise";
      noter("La production vient de changer. Le retour automatique est suspendu.");
      return rapport;
    }
    await ports.rollback(initial.id);
    rapport.etat = "retour_demande";
    noter("La version précédente a été demandée après l’échec des contrôles.");
    for (let i = 0; i < 12; i++) {
      await ports.sleep(10000);
      const actuel = await ports.current();
      if (actuel !== initial.id && actuel !== cible.id) { rapport.etat = "intervention_requise"; noter("Une autre version a pris la main après la demande de retour."); return rapport; }
      if (actuel === initial.id && santeConforme(await ports.health(o.productionOrigin, true), ancienneRevision)) {
        rapport.etat = "retour_verifie";
        noter("Le retour à la version précédente est confirmé. La correction doit être réexaminée.");
        return rapport;
      }
    }
    rapport.etat = "intervention_requise";
    noter("Le rétablissement n’a pas pu être confirmé. Une vérification est nécessaire.");
    return rapport;
  } catch (error) {
    rapport.etat = "bloquee";
    noter(error instanceof Error ? error.message : "Le contrôle a été interrompu.");
    return rapport;
  } finally { ports.report?.(rapport); }
}
