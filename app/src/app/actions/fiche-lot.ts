"use server";

import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { remettreRapportMensuel } from "@/lib/rapports-mensuels";
import { verifierGerant } from "@/lib/ged-acces";
import { revalidatePath } from "next/cache";

// Ce que la fenêtre du lot va chercher, et QUAND.
//
// La fiche part à l'ouverture ; les documents, la comptabilité et le rapport
// n'arrivent que si on déroule leur volet. Tout ramener d'un coup ferait payer
// à chaque clic sur un lot le prix de ce qu'on ne regarde presque jamais — et
// sur un portefeuille de trois cents lots, ce prix se paie trois cents fois.
//
// LA PORTÉE VIENT DE LA BASE, PAS DE L'ÉCRAN (12/09). `fiche_lot` dit à quel
// titre l'appelant regarde ce lot et tait le reste : un locataire reçoit son
// logement et son bail, jamais le mandant ni le taux d'honoraires. L'écran
// n'a donc rien à masquer — il ne reçoit rien à masquer.

/** À quel titre on regarde ce lot. La base tranche ; l'écran s'y range. */
export type PorteeLot = "gerant" | "locataire";

export type ContratDuLot = { id: string; chambre: string; locataire: string; etat: string; loyer_hc: number; charges: number; date_fin: string | null; impaye_echu: number; termes_impayes: number };

export type FicheLot = {
  contrats?: ContratDuLot[];
  portee: PorteeLot;
  lot_id: string; lot_nom: string; lot_etat: string;
  surface_m2: number | null; pieces: number | null; etage: string | null; meuble: boolean;
  bien_id: string; bien_nom: string; bien_type: string;
  adresse: string; code_postal: string; ville: string; copropriete: boolean;
  bail_id: string | null; bail_etat: string | null; bail_type: string | null;
  locataire: string | null; locataire_email: string | null; locataire_telephone: string | null;
  loyer_hc: number | null; charges: number | null; depot_garantie: number | null;
  date_debut: string | null; date_fin: string | null; jour_echeance: number | null;
  mandat_id: string | null; mandat_etat: string | null; mandant: string | null;
  mandant_email: string | null; taux_honoraires: number | null; jour_rapport: number | null;
  proprietaires: string | null;
  /**
   * Le détenteur principal, par sa QUOTE-PART. `proprietaires` est un texte
   * — bon à lire, inutilisable pour ouvrir sa page. Sur un lot hors mandat, le
   * geste qui compte est justement d'en proposer un, et il se prépare depuis
   * la fiche du propriétaire.
   */
  proprietaire_id: string | null;
  blocages: string[] | null; incidents_ouverts: number;
  impaye_echu: number; termes_impayes: number; diagnostics_manquants: number;
};

export type DocumentDuLot = {
  document_id: string; titre: string; type: string;
  depose_le: string; expire_le: string | null; taille_octets: number | null;
  rattachement: string;
};

export type EcritureDuLot = {
  ecriture_id: string; date_piece: string; libelle: string; categorie: string;
  montant_signe: number; systeme: boolean; contre_passee: boolean;
};

export type TermeDuLot = {
  appel_id: string; periode: string; date_echeance: string;
  montant_du: number; montant_couvert: number; statut: string;
};

export type RapportDuLot = {
  mandat_id: string; mandant: string; mandant_email: string | null;
  lots_du_mandat: number; mois: string;
  rapport_id: string | null; statut: string | null; net: number | null;
  envoye_le: string | null;
};

export type Chargement<T> = { donnees?: T; erreur?: string };

export async function chargerFicheLot(lotId: string): Promise<Chargement<FicheLot>> {
  const supabase = await createClient();
  // Deux lectures EN PARALLÈLE plutôt qu'une colonne de plus : `fiche_lot` est
  // déjà en production et sert la fenêtre de tous les rôles ; lui changer son
  // type de retour pour un identifiant que seul le bouton « Proposer un
  // mandat » consomme coûterait plus cher que cet aller-retour simultané.
  const [{ data, error }, { data: proprietaire }, { data: contrats, error: erreurContrats }] = await Promise.all([
    supabase.rpc("fiche_lot", { p_lot: lotId }),
    supabase.rpc("detenteur_principal_du_lot", { p_lot: lotId }),
    supabase.rpc("contrats_du_lot", { p_lot: lotId }),
  ]);
  if (error || erreurContrats) return { erreur: "Les contrats du logement n’ont pas pu être chargés. Réessayez." };
  const ligne = ((data ?? []) as FicheLot[])[0];
  // Une fiche absente n'est PAS une fiche vide : le lot peut appartenir à une
  // autre agence, et la base refuse alors de la rendre. Le dire ainsi évite
  // d'afficher un lot « sans locataire ni propriétaire » qui existe pourtant.
  if (!ligne) return { erreur: "Ce lot ne fait pas partie de votre portefeuille." };
  const individuels = (contrats ?? []) as ContratDuLot[];
  const multiple = individuels.length > 1;
  return { donnees: { ...ligne, contrats: individuels, ...(multiple ? {
    bail_id: null, bail_etat: null, locataire: null, locataire_email: null, locataire_telephone: null,
    date_debut: null, date_fin: null, jour_echeance: null, depot_garantie: null,
    loyer_hc: individuels.reduce((s, c) => s + Number(c.loyer_hc), 0), charges: individuels.reduce((s, c) => s + Number(c.charges), 0),
    impaye_echu: individuels.reduce((s, c) => s + Number(c.impaye_echu), 0), termes_impayes: individuels.reduce((s, c) => s + Number(c.termes_impayes), 0),
  } : {}), proprietaire_id: (proprietaire as string | null) ?? null } };
}

export async function chargerDocumentsDuLot(
  lotId: string
): Promise<Chargement<DocumentDuLot[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("documents_du_lot", { p_lot: lotId });
  if (error) return { erreur: sansJargon(error.message) };
  return { donnees: (data ?? []) as DocumentDuLot[] };
}

/**
 * Le volet « comptabilité » de la fenêtre, en une seule fois.
 *
 * TROIS LECTURES, PAS TROIS ALLERS-RETOURS. Les écritures, le rapport du mois
 * et les termes de loyer se lisent ensemble parce qu'ils s'affichent ensemble :
 * les enchaîner ferait clignoter le volet trois fois.
 *
 * LES TERMES NE SONT PAS UN LUXE. En retirant la page « Loyers & charges » à
 * l'agent, on lui retire aussi le seul endroit d'où il encaissait un loyer —
 * son geste le plus fréquent. Il revient donc ici, sur le lot, à sa place. Le
 * bail vient de la fiche déjà chargée : un lot sans bail n'a pas de terme, et
 * n'en demande pas.
 */
export async function chargerComptabiliteDuLot(
  lotId: string,
  bailId: string | null
): Promise<
  Chargement<{ ecritures: EcritureDuLot[]; rapport: RapportDuLot | null; termes: TermeDuLot[] }>
> {
  const supabase = await createClient();
  const [
    { data: ecritures, error: erreurEcritures },
    { data: rapport, error: erreurRapport },
    { data: termes },
  ] = await Promise.all([
    supabase.rpc("comptabilite_du_lot", { p_lot: lotId, p_depuis: null }),
    supabase.rpc("rapport_du_lot", { p_lot: lotId, p_mois: null }),
    bailId
      ? supabase.rpc("etat_loyers_bail", { p_bail: bailId })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (erreurEcritures) return { erreur: sansJargon(erreurEcritures.message) };
  // Le rapport peut manquer sans que la comptabilité manque : un lot hors
  // mandat n'en a pas. On rend les écritures quand même.
  return {
    donnees: {
      ecritures: (ecritures ?? []) as EcritureDuLot[],
      rapport: erreurRapport ? null : (((rapport ?? []) as RapportDuLot[])[0] ?? null),
      termes: (termes ?? []) as TermeDuLot[],
    },
  };
}

/** Un terme de l'échéancier du locataire — sa dette à lui, telle qu'il la voit. */
export type TermeLocataire = {
  periode: string; montant_du: number; montant_couvert: number;
  statut: string; quittance_id: string | null;
};

/**
 * L'échéancier du locataire, pour le volet « Mes loyers » de SA fenêtre.
 *
 * Il ne passe pas par `comptabilite_du_lot` : la comptabilité d'un lot est
 * celle de l'agence (honoraires, travaux, reversements au propriétaire) et ne
 * regarde pas l'occupant. `mon_echeancier_locataire` est la vue que le produit
 * lui sert déjà sur « Mes paiements » — c'est la même, au même endroit.
 */
export async function chargerEcheancierLocataire(
  orgId: string
): Promise<Chargement<TermeLocataire[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mon_echeancier_locataire", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  return { donnees: (data ?? []) as TermeLocataire[] };
}

/** Un barreau de l'échelle de relance — franchi quand `envoye_le` est posé. */
export type EchelonRelance = {
  niveau: string; rang: number; libelle: string;
  envoye_le: string | null; premiere_presentation: string | null; recommande: string | null;
};

/** Un fait du passé du lot. Le montant sort NU : l'écran le met en forme. */
export type EvenementDuLot = {
  survenu_le: string; nature: string; titre: string;
  detail: string | null; montant: number | null;
  /** Un code métier à habiller côté écran (catégorie d'incident, par ex.). */
  code: string | null;
};

export async function chargerRelancesDuLot(
  lotId: string
): Promise<Chargement<EchelonRelance[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("relances_du_lot", { p_lot: lotId });
  if (error) return { erreur: sansJargon(error.message) };
  return { donnees: (data ?? []) as EchelonRelance[] };
}

export async function chargerHistoriqueDuLot(
  lotId: string
): Promise<Chargement<EvenementDuLot[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("historique_du_lot", {
    p_lot: lotId,
    p_limite: 40,
  });
  if (error) return { erreur: sansJargon(error.message) };
  return { donnees: (data ?? []) as EvenementDuLot[] };
}

export type EtatEnvoiRapport = { erreur?: string; succes?: string; documentId?: string };

/**
 * Envoyer le rapport de gestion au propriétaire, depuis le lot.
 *
 * DEUX TEMPS EN UN GESTE. Le rapport se génère puis s'envoie — deux fonctions
 * distinctes en base, parce qu'un rapport se relit avant de partir. Depuis un
 * lot, l'agent ne veut qu'une chose : que le propriétaire le reçoive. On
 * enchaîne donc les deux, et on ne génère que s'il n'existe pas déjà.
 *
 * LE RAPPORT PORTE SUR LE MANDAT, PAS SUR LE LOT. Un mandat couvre parfois
 * plusieurs lots ; le rapport les couvre tous. L'écran le dit avant le clic —
 * ici on se contente de le refaire dire dans le message de retour, pour que
 * celui qui a cliqué sache ce qu'il vient d'envoyer.
 */
export async function envoyerRapportDuLot(
  lotId: string,
  _etat: EtatEnvoiRapport,
  formData: FormData
): Promise<EtatEnvoiRapport> {
  const supabase = await createClient();
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;

  const { data: brut, error: erreurLecture } = await supabase.rpc("rapport_du_lot", {
    p_lot: lotId,
    p_mois: null,
  });
  if (erreurLecture) return { erreur: sansJargon(erreurLecture.message) };
  const rapport = ((brut ?? []) as RapportDuLot[])[0];
  if (!rapport) {
    return {
      erreur:
        "Ce lot n’est couvert par aucun mandat actif : il n’y a pas de propriétaire à qui adresser un rapport.",
    };
  }

  let rapportId = rapport.rapport_id;
  if (!rapportId) {
    const { error } = await supabase.rpc("generer_rapport", {
      p_mandat: rapport.mandat_id,
      p_mois: rapport.mois,
    });
    if (error) return { erreur: sansJargon(error.message) };
    const { data: relu } = await supabase.rpc("rapport_du_lot", { p_lot: lotId, p_mois: null });
    rapportId = ((relu ?? []) as RapportDuLot[])[0]?.rapport_id ?? null;
    if (!rapportId) {
      return { erreur: "Le rapport a été généré mais n’a pas pu être relu. Rechargez la page." };
    }
  }

  // Le RPC du lot impose déjà le portefeuille. Recontrôler la session et
  // l'organisation avant la remise documentaire partagée avec la comptabilité.
  const { data: fiche, error: erreurFiche } = await supabase.from("rapports_gestion")
    .select("organization_id").eq("id", rapportId).maybeSingle();
  if (erreurFiche || !fiche) return { erreur: "Rapport introuvable ou inaccessible." };
  const acces = await verifierGerant(fiche.organization_id);
  if (!acces.user) return { erreur: "Accès refusé." };
  const resultat = await remettreRapportMensuel(acces.supabase, acces.user, fiche.organization_id, rapportId, commentaire, acces.role ?? "");
  revalidatePath(`/agence/${fiche.organization_id}/comptabilite`);
  revalidatePath(`/agence/${fiche.organization_id}/mandats`);
  revalidatePath(`/agence/${fiche.organization_id}/documents`);
  return resultat;
}
