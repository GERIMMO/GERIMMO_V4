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
import { construireQuittance, libelleMode, signataireQuittance, versementsDuTerme } from "@/lib/documents/modeles/quittance";
import { mentionEtage } from "@/lib/documents/modeles/communs";
import { refusDocumentIncomplet } from "@/lib/documents/completude";

type Nom = { nom: string; prenom: string | null };
/**
 * Un bailleur du document. `representant` (SCI-3, migration 20261119200200) : pour une société dotée d'un pouvoir
 * actif au bail, le nom et le prénom de la personne physique qui signe pour elle ; clé absente sinon.
 */
export type BailleurQuittanceDocument = Nom & { representant?: Nom | null };

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
  bailleurs: BailleurQuittanceDocument[];
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

// Les libellés des modes de règlement vivent avec le modèle de quittance (documents/modeles/quittance.ts) depuis la phase 3
// (lot 36, C48) : la quittance du catalogue imprimait le code (« par cheque »). Ils restent exportés ici pour leurs lecteurs.
export { libelleMode };

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
    // Même règle que le PDF : « étage » ne complète qu'un numéro, et l'étage déjà dit par le nom du lot n'est pas redit
    // (phase 3, C63 et reprise du lot 35).
    mentionEtage(d.logement.etage, d.logement.lot_nom && d.logement.lot_nom !== "Lot unique" ? d.logement.lot_nom : null),
  ]
    .filter(Boolean)
    .join(", ");

  // Les noms passent par la fusion : échappés, et comptés manquants s'ils
  // sont vides — même barrière que le PDF.
  const bailleurHtml =
    f.champ(bailleur, "nom et prénom(s), ou dénomination") +
    (mandataire ? `, représenté par ${f.champ(mandataire, "mandataire")}` : "");
  // SCI-3 (audit du 19/11) : chez un propriétaire direct, une société bailleresse dotée d'un représentant actif au bail
  // déclare et signe par lui (« Je soussigné(e) Camille Martin, agissant pour le compte de SCI du Tilleul… »,
  // « SCI du Tilleul, représentée par Camille Martin ») — formulation à valider juridiquement. Le représentant vient
  // de `quittance_document`, que le locataire peut appeler ; il est facultatif et ne compte jamais parmi les manquants.
  // Une agence émet en mandataire : son texte ne change pas.
  const signataire = estProprietaireDirect(d) ? signataireQuittance(d.bailleurs) : null;

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
    soussigne: signataire?.soussigne,
    signataire: signataire?.signature,
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
      // Phase 3, lot 46 (second passage, T19) : l'adresse et la commune imprimées viennent du profil de l'espace
      // (quittance_document : organisation), même quand les bailleurs émettent. La liste « à renseigner » de la page y mène ;
      // elle envoyait, par déduction du lien au bail, vers la fiche du propriétaire, que cette quittance ne lit pas.
      // POINT OUVERT (reprise du lot 46, signalé, non tranché) : chez un propriétaire qui gère lui-même, cette page associe le
      // NOM des bailleurs à l'ADRESSE de l'espace, alors que le PDF de la même quittance (modeles/quittance.ts, expediteur)
      // imprime le nom ET l'adresse des détenteurs ; une SCI y paraît à l'adresse de l'espace. Aligner suppose que
      // quittance_document (lisible par le locataire, et source de l'empreinte des courriels de quittance) rende l'adresse
      // des bailleurs : migration et choix de données laissés au dirigeant (questions du lot 46) et au juriste.
      // Phase 3, lot 49 : une version alignée (lot 48, U07 : migration 20261123230000, commits a3f9440e et cf2142f7) a été
      // retirée avant publication, faute de décision : elle faisait lire au locataire, même ancien, les coordonnées des
      // détenteurs actuels, et bloquait des quittances déjà délivrées quand un détenteur n'avait pas d'adresse.
      emetteur: "espace",
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

export type DisponibiliteQuittance = "disponible" | "en_preparation" | "lecture_impossible";

/** Même contrôle que la page du document, avant de proposer son téléchargement.
 * Lots de six lectures pour ne pas saturer la connexion sur un long historique. */
export async function disponibilitesQuittances(
  db: SupabaseClient,
  ids: (string | null)[]
): Promise<Record<string, DisponibiliteQuittance>> {
  const uniques = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const resultat: Record<string, DisponibiliteQuittance> = {};
  for (let i = 0; i < uniques.length; i += 6) {
    await Promise.all(uniques.slice(i, i + 6).map(async id => {
      try {
        const donnees = await chargerQuittanceDocument(db, id);
        resultat[id] = !donnees ? "lecture_impossible"
          : manquantsQuittance(assemblerQuittanceDelivree(donnees)).length ? "en_preparation" : "disponible";
      } catch { resultat[id] = "lecture_impossible"; }
    }));
  }
  return resultat;
}
