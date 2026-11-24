// Les échéances du propriétaire dans son agenda (audit palier 1, P2-06).
//
// L'agenda ne montrait que les rendez-vous d'artisans. Il porte maintenant ce qu'un bailleur guette au fil du mois :
// les loyers appelés (à leur jour d'échéance), les états des lieux datés, la fin d'un bail inscrite au contrat et le
// départ annoncé par un congé. Tout est LU dans ce que Gerimmo sait déjà : rien n'est créé, rien n'est calculé en droit
// (ni préavis, ni reconduction) — une date affichée ici est une date déjà enregistrée ailleurs.
//
// Décision Q34 du 24/11/2026 : le calendrier porte aussi la date limite pour demander la révision annuelle du loyer
// (un an après la date de révision, décision Q23), tant que cette révision n'est pas enregistrée.
//
// Ce module ne dépend d'aucune API serveur : il transforme des lignes lues en échéances affichables.

export type NatureEcheance = "loyer" | "edl" | "fin_bail" | "conge" | "limite_revision";

export type EcheanceAgenda = {
  cle: string;
  /** Jour civil, AAAA-MM-JJ. */
  jour: string;
  nature: NatureEcheance;
  titre: string;
  /** Qui et où : « Camille Fictif · Appartement T2 ». */
  detail: string;
  /** Où en est-on : « Reçu », « À recevoir », « Signé »… ; `null` quand Gerimmo ne peut pas le dire. */
  etat: string | null;
  /** Vrai quand la date est atteinte et qu'il reste un geste à faire. */
  aFaire: boolean;
  href: string;
};

export type LoyerLu = {
  appelId: string; bailId: string; jour: string; lotNom: string | null; locataire: string | null;
  duCentimes: number;
  /** `null` : l'état du règlement n'a pas pu être lu. */
  couvertCentimes: number | null;
};
export type EdlLu = { id: string; bailId: string; jour: string; type: string; signe: boolean; lotNom: string | null; locataire: string | null };
export type FinBailLue = { bailId: string; jour: string; lotNom: string | null; locataire: string | null };
/** `jour` : la date limite ; `revisionPrevueLe` : la date de révision (date anniversaire du bail) qu'elle clôt. */
export type LimiteRevisionLue = { bailId: string; jour: string; revisionPrevueLe: string; lotNom: string | null; locataire: string | null };
export type CongeLu = { id: string; bailId: string; jour: string; par: string; lotNom: string | null; locataire: string | null };

const euros = (centimes: number) =>
  `${(centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const quiEtOu = (locataire: string | null, lotNom: string | null) =>
  [locataire?.trim() || "Locataire non renseigné", lotNom?.trim() || "Logement du bail"].join(" · ");

const ORDRE: Record<NatureEcheance, number> = { loyer: 0, edl: 1, conge: 2, fin_bail: 3, limite_revision: 4 };

export function construireEcheances(
  base: string,
  aujourdHui: string,
  lu: { loyers: LoyerLu[]; edls: EdlLu[]; finsDeBail: FinBailLue[]; conges: CongeLu[]; limitesRevision?: LimiteRevisionLue[] },
): EcheanceAgenda[] {
  const liste: EcheanceAgenda[] = [];
  for (const l of lu.loyers) {
    const solde = l.couvertCentimes !== null && l.couvertCentimes >= l.duCentimes;
    const partiel = l.couvertCentimes !== null && l.couvertCentimes > 0 && !solde;
    liste.push({
      cle: `loyer-${l.appelId}`, jour: l.jour, nature: "loyer",
      titre: `Loyer attendu : ${euros(l.duCentimes)}`,
      detail: quiEtOu(l.locataire, l.lotNom),
      etat: l.couvertCentimes === null ? null
        : solde ? "Reçu"
        : partiel ? `Reçu en partie — reste ${euros(l.duCentimes - l.couvertCentimes!)}`
        : l.jour < aujourdHui ? "Pas encore reçu — échéance passée"
        : "À recevoir",
      aFaire: l.couvertCentimes !== null && !solde && l.jour <= aujourdHui,
      href: `${base}/baux/${l.bailId}#loyers`,
    });
  }
  for (const e of lu.edls) {
    liste.push({
      cle: `edl-${e.id}`, jour: e.jour, nature: "edl",
      titre: e.type === "sortie" ? "État des lieux de sortie" : "État des lieux d’entrée",
      detail: quiEtOu(e.locataire, e.lotNom),
      etat: e.signe ? "Signé" : e.jour < aujourdHui ? "Pas encore signé — date passée" : "À établir et signer",
      aFaire: !e.signe && e.jour <= aujourdHui,
      href: `${base}/baux/${e.bailId}/edl/${e.id}`,
    });
  }
  for (const c of lu.conges) {
    liste.push({
      cle: `conge-${c.id}`, jour: c.jour, nature: "conge",
      titre: c.par === "bailleur" ? "Départ prévu : congé donné par le bailleur" : "Départ prévu : congé donné par le locataire",
      detail: quiEtOu(c.locataire, c.lotNom),
      etat: null, aFaire: false,
      href: `${base}/baux/${c.bailId}`,
    });
  }
  for (const f of lu.finsDeBail) {
    liste.push({
      cle: `fin-${f.bailId}`, jour: f.jour, nature: "fin_bail",
      titre: "Date de fin inscrite au bail",
      detail: quiEtOu(f.locataire, f.lotNom),
      etat: null, aFaire: false,
      href: `${base}/baux/${f.bailId}`,
    });
  }
  // Décision Q34 : la date limite de la révision du loyer. Passé ce jour, la révision de cette année-là n'est plus
  // possible : l'agenda le dit sans rien demander (ce n'est plus « à faire »).
  for (const r of lu.limitesRevision ?? []) {
    const formater = (j: string) => j.slice(0, 10).split("-").reverse().join("/");
    liste.push({
      cle: `limite-revision-${r.bailId}-${r.jour}`, jour: r.jour, nature: "limite_revision",
      titre: "Date limite pour demander la révision du loyer",
      detail: quiEtOu(r.locataire, r.lotNom),
      etat: r.jour < aujourdHui
        ? `Révision prévue le ${formater(r.revisionPrevueLe)} : non demandée, délai passé`
        : `Révision prévue le ${formater(r.revisionPrevueLe)} : pas encore demandée`,
      aFaire: false,
      href: `${base}/baux/${r.bailId}#revision-loyer`,
    });
  }
  return liste.sort((x, y) => x.jour.localeCompare(y.jour) || ORDRE[x.nature] - ORDRE[y.nature] || x.detail.localeCompare(y.detail, "fr") || x.cle.localeCompare(y.cle));
}

export function echeancesParJour(liste: EcheanceAgenda[]): Map<string, EcheanceAgenda[]> {
  const parJour = new Map<string, EcheanceAgenda[]>();
  for (const e of liste) parJour.set(e.jour, [...(parJour.get(e.jour) ?? []), e]);
  return parJour;
}

/** « 1 échéance », « 3 échéances ». */
export function compteEcheances(n: number): string {
  return `${n} échéance${n > 1 ? "s" : ""}`;
}
