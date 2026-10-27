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
  const bauxAvecEchu = new Set(loyersIndisponibles ? [] : lignesLoyers
    .filter(l => Number(l.montant_du) > Number(l.montant_couvert) && l.date_echeance.slice(0,10) < aujourdHui).map(l => l.bail_id));
  // Le rappel du bail porte déjà la dette. Sans terme échu à recevoir, l'alerte d'impayé est périmée (la base la
  // ferme à l'encaissement, audit du 27/10) : elle ne devient jamais l'action prioritaire d'un bail à jour.
  const alerteImpayeVisible = (bailId: string) => loyersIndisponibles || (!bauxPresentes.has(bailId) && bauxAvecEchu.has(bailId));
  const sansDoublonsLoyers = actions.filter(action => {
    if (impayesPresentes.has(action.cle)) return false;
    if (action.source !== "alerte" || action.type !== "loyer_impaye") return true;
    const bailId = action.alerte.details?.bail_id;
    return typeof bailId !== "string" || alerteImpayeVisible(bailId);
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
  // Chaque échéance due compte, comme « N à confirmer » de la section des loyers et la carte de l'accueil : un bail
  // présente ses mois l'un après l'autre, chacun demande sa confirmation (audit du 27/10, LAT-03).
  return { actions: uniques, rappels, total: uniques.length + rappels.totalEcheancesDues, critiques, premiere, alerteImpayeVisible };
}
