// La quittance DÉLIVRÉE au locataire (page /quittance/[id] et e-mails) —
// audit PROPRIÉTAIRE ET LOCATAIRE du 27/09.
//
// Une seule mise en forme : celle du modèle conforme
// (src/lib/documents/modeles/quittance.ts — art. 21 de la loi du 6 juillet
// 1989, identité et adresse de l'émetteur, période « du … au … », « Fait
// à », signature, règlement). La page web en avait une à elle, sans adresse
// ni période, qui écrivait « représenté par » même chez un propriétaire
// direct. Ce module ne réécrit pas le modèle : il le nourrit depuis la
// fonction `quittance_document` (lisible par le locataire, que la RLS tient
// à l'écart des tables), et applique la MÊME RÈGLE que le PDF — un document
// dont un champ obligatoire est vide n'est pas délivré ([[Quittance
// conforme]] : « un courrier officiel sans l'identité et l'adresse de son
// auteur n'a aucune valeur »).

import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, type DocumentAssemble } from "@/lib/documents/gabarit";
import { construireQuittance, versementsDuTerme } from "@/lib/documents/modeles/quittance";
import { refusDocumentIncomplet } from "@/lib/documents/completude";

type Nom = { nom: string; prenom: string | null };

export type DonneesQuittanceDocument = {
  quittance_id: string;
  appel_id: string;
  organization_id: string;
  est_quittance: boolean;
  montant: number | string;
  date_emission: string;
  periode: string;
  loyer_hc: number | string | null;
  charges: number | string | null;
  montant_du: number | string;
  prorata: boolean;
  bail_id: string;
  bail_date_debut: string | null;
  bail_date_fin: string | null;
  charges_mode: string | null;
  organisation: {
    type: "agence" | "proprietaire_direct" | string;
    nom: string;
    siret: string | null;
    carte_pro: string | null;
    adresse: string | null;
    code_postal: string | null;
    ville: string | null;
    telephone: string | null;
    email: string | null;
  };
  bailleurs: Nom[];
  locataires: Nom[] | null;
  logement: {
    lot_nom: string;
    etage: string | null;
    adresse: string | null;
    code_postal: string | null;
    ville: string | null;
  };
  /** Les termes du bail — pour rejouer l'imputation. */
  appels: { id: string; periode: string; montant_du: number | string }[];
  /** Les versements du bail, dans l'ordre de paiement. */
  encaissements: {
    date_paiement: string;
    mode: string | null;
    montant: number | string;
    created_at: string | null;
  }[];
  vue_gestionnaire: boolean;
};

// Les codes enregistrés par « Payé par » (fiche du bail), en toutes lettres
// sur le document : « par virement », pas « par virement » brut ni « par caf ».
const MODES: Record<string, string> = {
  virement: "virement",
  cheque: "chèque",
  prelevement: "prélèvement",
  especes: "espèces",
  caf: "versement CAF / APL",
  autre: "autre moyen",
};

export function libelleMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  return MODES[mode] ?? mode;
}

function nomComplet(p: Nom): string {
  return [p.nom, p.prenom].filter(Boolean).join(" ").trim();
}

function joindre(noms: Nom[] | null | undefined): string | null {
  const liste = (noms ?? []).map(nomComplet).filter(Boolean);
  return liste.length ? liste.join(", ") : null;
}

function adresse(ligne: string | null, cp: string | null, ville: string | null): string | null {
  if (!ligne?.trim()) return null;
  return [ligne.trim(), [cp, ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function estProprietaireDirect(d: Pick<DonneesQuittanceDocument, "organisation">): boolean {
  return d.organisation.type === "proprietaire_direct";
}

/**
 * Qui émet et qui est bailleur, selon l'organisation :
 *  - PROPRIÉTAIRE DIRECT : le bailleur émet lui-même. L'en-tête et la
 *    signature portent SON nom (celui des détenteurs du lot) — jamais le nom
 *    du « parc », qui n'est pas une personne, et jamais « représenté par » :
 *    il n'y a pas de mandataire ;
 *  - AGENCE : l'agence émet, en mandataire ; le bailleur est « représenté
 *    par » elle, et son SIRET / sa carte professionnelle s'impriment
 *    lorsqu'ils sont renseignés.
 */
export function parties(d: DonneesQuittanceDocument): {
  emetteur: string | null;
  bailleur: string | null;
  mandataire: string | null;
  identiteLegale: string | null;
} {
  const bailleurs = joindre(d.bailleurs);
  if (estProprietaireDirect(d)) {
    return { emetteur: bailleurs, bailleur: bailleurs, mandataire: null, identiteLegale: null };
  }
  const identiteLegale =
    [
      d.organisation.siret ? `SIRET ${d.organisation.siret}` : null,
      d.organisation.carte_pro ? `carte professionnelle ${d.organisation.carte_pro}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  return { emetteur: d.organisation.nom, bailleur: bailleurs, mandataire: d.organisation.nom, identiteLegale };
}

function nombre(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  return Number(v);
}

/** Le document conforme, prêt à afficher ou à contrôler. */
export function assemblerQuittanceDelivree(d: DonneesQuittanceDocument): DocumentAssemble {
  const f = new Fusion();
  const { emetteur, bailleur, mandataire, identiteLegale } = parties(d);
  const adresseEmetteur = adresse(d.organisation.adresse, d.organisation.code_postal, d.organisation.ville);
  const logement = [
    adresse(d.logement.adresse, d.logement.code_postal, d.logement.ville),
    d.logement.lot_nom && d.logement.lot_nom !== "Lot unique" ? d.logement.lot_nom : null,
    d.logement.etage ? `étage ${d.logement.etage}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Les noms passent par la fusion : échappés, et comptés manquants s'ils
  // sont vides — même barrière que le PDF.
  const bailleurHtml =
    f.champ(bailleur, "nom et prénom(s), ou dénomination") +
    (mandataire ? `, représenté par ${f.champ(mandataire, "mandataire")}` : "");

  return construireQuittance({
    estQuittance: d.est_quittance,
    reference: `${d.est_quittance ? "QUIT" : "RECU"}-${d.quittance_id.slice(0, 8).toUpperCase()}`,
    dateEmission: d.date_emission,
    periode: d.periode,
    loyerHc: nombre(d.loyer_hc),
    charges: nombre(d.charges),
    montant: Number(d.montant),
    montantDu: Number(d.montant_du),
    prorata: d.prorata,
    dateFinBail: d.bail_date_fin,
    chargesMode: d.charges_mode,
    // Les seuls versements qui ont couvert CE terme — la même imputation que
    // le PDF (du plus ancien terme au plus récent).
    encaissements: versementsDuTerme(
      (d.appels ?? []).map((a) => ({ id: a.id, periode: a.periode, montant_du: Number(a.montant_du) })),
      (d.encaissements ?? []).map((e) => ({
        date_paiement: e.date_paiement,
        mode: e.mode,
        montant: Number(e.montant),
        created_at: e.created_at,
      })),
      d.appel_id
    ).map((e) => ({ ...e, mode: libelleMode(e.mode) })),
    bailleurNom: bailleurHtml,
    locatairesNoms: f.champ(joindre(d.locataires), "nom et prénom(s) du ou des locataires"),
    logementAdresse: logement,
    referenceBail: `BAIL-${d.bail_id.slice(0, 8).toUpperCase()}`,
    dateBail: d.bail_date_debut,
    exp: {
      nom: emetteur,
      // SIRET et carte professionnelle de l'agence sous son adresse, quand ils
      // sont renseignés — la signature, elle, ne porte que le nom.
      adresse: adresseEmetteur && identiteLegale ? `${adresseEmetteur} · ${identiteLegale}` : adresseEmetteur,
      email: d.organisation.email,
      telephone: d.organisation.telephone,
      ville: d.organisation.ville,
    },
    // La signature préenregistrée vit dans le stockage privé de
    // l'organisation, que le locataire ne lit pas : la zone reste à signer.
    signatureImg: null,
    f,
  });
}

/**
 * Les champs obligatoires encore vides — la même barrière que le PDF
 * (`refusDocumentIncomplet`). Vide : le document peut être délivré.
 */
export function manquantsQuittance(doc: Pick<DocumentAssemble, "manquants">): string[] {
  return refusDocumentIncomplet(doc)?.manquants ?? [];
}

/** Lecture sous l'identité de l'appelant (locataire, gérant ou tâche d'envoi). */
export async function chargerQuittanceDocument(
  db: SupabaseClient,
  quittanceId: string
): Promise<DonneesQuittanceDocument | null> {
  const { data, error } = await db.rpc("quittance_document", { p_quittance: quittanceId });
  if (error || !data) return null;
  return data as DonneesQuittanceDocument;
}

/**
 * Le motif d'un envoi refusé, en une phrase lisible par le gérant : ce qui
 * manque, et où le renseigner.
 */
export function motifQuittanceIncomplete(manquants: string[], estQuittance = true): string {
  const [nature, e, pronom] = estQuittance ? ["La quittance", "e", "la"] : ["Le reçu", "", "le"];
  return `${nature} n'est pas envoyé${e} : ${manquants.length > 1 ? "des informations obligatoires manquent" : "une information obligatoire manque"} (${manquants.join(" · ")}). Complétez le profil de l'organisation ou la fiche indiquée, puis renvoyez-${pronom}.`;
}
