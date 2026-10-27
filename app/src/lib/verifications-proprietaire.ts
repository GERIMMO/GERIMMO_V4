import type { ActionDuJour } from "@/lib/actions-du-jour";
import { organiserRappelsLoyers, type RappelLoyer } from "@/lib/rappels-loyers";

/** La synthèse de l'accueil : un seul geste par information ou bail concerné. */
export function preparerVerificationsProprietaire({
  actions,
  lignesLoyers,
  aujourdHui,
  loyersIndisponibles,
}: {
  actions: ActionDuJour[];
  lignesLoyers: RappelLoyer[];
  aujourdHui: string;
  loyersIndisponibles: boolean;
}) {
  // Une lecture incomplète ne permet ni de compter les loyers, ni de retirer
  // les alertes qui les signalent. L'écran conserve son état d'indisponibilité.
  const rappels = organiserRappelsLoyers(loyersIndisponibles ? [] : lignesLoyers, aujourdHui);
  const bauxPresentes = new Set(rappels.dus.map(ligne => ligne.bail_id));
  const impayesPresentes = new Set([...bauxPresentes].map(id => `impaye-${id}`));
  const sansDoublonsLoyers = actions.filter(action => {
    if (impayesPresentes.has(action.cle)) return false;
    if (action.source !== "alerte" || action.type !== "loyer_impaye") return true;
    const bailId = action.alerte.details?.bail_id;
    return typeof bailId !== "string" || !bauxPresentes.has(bailId);
  });
  const triees = sansDoublonsLoyers.sort((a, b) => {
    const criticite = Number(b.criticite === "critique") - Number(a.criticite === "critique");
    if (criticite) return criticite;
    if (a.echeance && b.echeance) {
      const date = a.echeance.localeCompare(b.echeance);
      if (date) return date;
    } else if (a.echeance !== b.echeance) {
      return a.echeance ? -1 : 1;
    }
    return a.cle.localeCompare(b.cle);
  });
  const clesVues = new Set<string>();
  const uniques = triees.filter(action => {
    if (clesVues.has(action.cle)) return false;
    clesVues.add(action.cle);
    return true;
  });
  const critiques = uniques.filter(action => action.criticite === "critique").length;
  let premiere: { titre: string; source: "action" | "loyer" } | null = null;
  if (critiques) {
    premiere = { titre: uniques[0].titre, source: "action" };
  } else if (rappels.dus.length) {
    premiere = {
      titre: rappels.dus.length === 1 ? "Réception du loyer à confirmer" : "Réception des loyers à confirmer",
      source: "loyer",
    };
  } else if (uniques.length) {
    premiere = { titre: uniques[0].titre, source: "action" };
  }
  return { actions: uniques, rappels, total: uniques.length + rappels.dus.length, critiques, premiere };
}
