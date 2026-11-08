import type { RappelLoyer } from "./rappels-loyers";
import { dateParis } from "./heure-paris-calcul";

export const LIBELLES_PALIERS = {
  echeance: "Échéance du loyer",
  relance_1: "Première relance",
  relance_2: "Deuxième relance",
  recommande: "Recommandé",
  inconnu: "Suivi à vérifier",
} as const;

export type TermeSuivi = Omit<RappelLoyer, "lot_nom" | "locataire" | "periode">;
type Etape = keyof typeof LIBELLES_PALIERS;
export type PointReception = { etape: Etape; date: string; aConfirmer: boolean; confirmationExpiree?: boolean };

function decaler(jour: string, jours: number) {
  const date = new Date(jour.slice(0, 10) + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

/** Un point propriétaire ne déclenche jamais un envoi. Le calendrier suit les envois enregistrés. */
function pointDuTerme(ligne: TermeSuivi, jour: string, maintenant?: number): PointReception | null {
  const echeance = ligne.date_echeance.slice(0, 10);
  if (echeance > jour || Math.round(Number(ligne.montant_du) * 100) <= Math.round(Number(ligne.montant_couvert) * 100)) return null;
  const signal = ligne.non_recu_signale_le;
  const confirme = signal ? dateParis(new Date(signal)) : null;
  const dernier = ligne.derniere_relance;
  const regles = ligne.relances_automatiques;
  if (ligne.recommande_transmis || dernier?.niveau === "mise_en_demeure") return null;
  if (!regles || ligne.historique_relances_disponible === false || !Number.isInteger(regles.premierDelai) ||
      !Number.isInteger(regles.secondDelai) || regles.premierDelai < 1 || regles.secondDelai <= regles.premierDelai) {
    return { etape: "inconnu", date: echeance, aConfirmer: !confirme };
  }
  const intervalle = regles.secondDelai - regles.premierDelai;
  let etape: Etape, date: string;
  if (dernier?.niveau === "relance_2") {
    etape = "recommande";
    date = decaler(dernier.date_envoi, intervalle);
  } else if (dernier?.niveau === "relance_1") {
    etape = "relance_2";
    const prevue = decaler(echeance, regles.secondDelai);
    const espacee = decaler(dernier.date_envoi, intervalle);
    date = prevue > espacee ? prevue : espacee;
  } else {
    date = decaler(echeance, regles.premierDelai);
    if (jour < date && (!confirme || confirme < echeance)) return { etape: "echeance", date: echeance, aConfirmer: true };
    etape = "relance_1";
  }
  // Si le traitement automatique n'a finalement rien envoyé, son autorisation expire après 36 h.
  const expiree = regles.active && etape !== "recommande" && !!signal && !!confirme && confirme >= date &&
    maintenant !== undefined && maintenant - Date.parse(signal) > 36 * 3600_000;
  return { etape, date, aConfirmer: jour >= date && (!confirme || confirme < date || expiree),
    ...(expiree ? { confirmationExpiree: true } : {}) };
}

/** Les courriers portent sur le terme le plus ancien, même si une nouvelle mensualité réveille l’alerte. */
export function courrierDisponible(ligne: TermeSuivi, jour: string) {
  const point = pointDuTerme(ligne, jour);
  if (!point || point.date > jour || ligne.date_echeance.slice(0, 10) >= jour) return null;
  return point.etape === "relance_1" || point.etape === "relance_2" || point.etape === "recommande" ? point.etape : null;
}

export function pointReception(ligne: TermeSuivi, jour: string, maintenant?: number): PointReception | null {
  const point = pointDuTerme(ligne, jour, maintenant);
  const dernier = ligne.derniere_echeance_due;
  // Les règlements s’imputent au plus ancien terme, mais une nouvelle mensualité doit pouvoir réveiller le bail.
  if (!point?.aConfirmer && dernier && dernier > ligne.date_echeance.slice(0, 10) && dernier <= jour &&
      Number(ligne.montant_couvert) < Number(ligne.montant_du) &&
      (!ligne.non_recu_signale_le || dateParis(new Date(ligne.non_recu_signale_le)) < dernier)) {
    return { etape: "echeance", date: dernier, aConfirmer: true };
  }
  return point;
}

export function libellesPoints(points: (PointReception | null)[]) {
  const actifs = new Set(points.filter(p => p?.aConfirmer).map(p => p!.etape));
  return (["recommande", "relance_2", "relance_1", "echeance", "inconnu"] as const)
    .filter(etape => actifs.has(etape)).map(etape => LIBELLES_PALIERS[etape]).join(" · ");
}
