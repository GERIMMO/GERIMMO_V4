"use server";

import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { envoyerEmail } from "@/lib/email";
import { eur } from "@/lib/ged";

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

export type FicheLot = {
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
  const { data, error } = await supabase.rpc("fiche_lot", { p_lot: lotId });
  if (error) return { erreur: sansJargon(error.message) };
  const ligne = ((data ?? []) as FicheLot[])[0];
  // Une fiche absente n'est PAS une fiche vide : le lot peut appartenir à une
  // autre agence, et la base refuse alors de la rendre. Le dire ainsi évite
  // d'afficher un lot « sans locataire ni propriétaire » qui existe pourtant.
  if (!ligne) return { erreur: "Ce lot ne fait pas partie de votre portefeuille." };
  return { donnees: ligne };
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

export type EtatEnvoiRapport = { erreur?: string; succes?: string };

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
  if (rapport.envoye_le) {
    return {
      erreur: `Le rapport de ce mois est déjà parti le ${new Date(rapport.envoye_le).toLocaleDateString("fr-FR")}.`,
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

  const { error: erreurEnvoi } = await supabase.rpc("envoyer_rapport", {
    p_rapport: rapportId,
    p_commentaire: commentaire,
  });
  if (erreurEnvoi) return { erreur: sansJargon(erreurEnvoi.message) };

  // Le courrier au mandant. Le rapport est FIGÉ quoi qu'il arrive ensuite :
  // un échec d'envoi se dit, il n'annule rien — et il ne doit pas laisser
  // croire que le rapport reste à faire.
  const { data: releve } = await supabase
    .from("rapports_gestion")
    .select("net, mois")
    .eq("id", rapportId)
    .maybeSingle();
  const net = Number((releve as { net?: number } | null)?.net ?? 0);

  if (!rapport.mandant_email) {
    return {
      succes: `Rapport figé et validé. ${rapport.mandant} n’a pas d’adresse e-mail : la remise se fait hors plateforme.`,
    };
  }
  const html = `<div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.55">
      <h2 style="font-size:17px">Votre rapport de gestion</h2>
      <p>Bonjour,</p>
      <p>Votre rapport de gestion est disponible. Net à reverser :
         <strong>${eur(net)}</strong>${net < 0 ? " (appel de fonds)" : ""}.</p>
      ${commentaire ? `<p>${commentaire}</p>` : ""}
      <p style="color:#555">Il couvre ${rapport.lots_du_mandat > 1 ? `les ${rapport.lots_du_mandat} lots` : "le lot"} que vous nous avez confiés.</p>
      <p>— Votre agence</p>
    </div>`;
  const { erreur } = await envoyerEmail({
    to: rapport.mandant_email,
    subject: "Votre rapport de gestion",
    html,
  });
  if (erreur) {
    return {
      succes: `Rapport figé et validé, mais l’e-mail n’est pas parti : ${erreur}`,
    };
  }
  return {
    succes: `Rapport envoyé à ${rapport.mandant}${rapport.lots_du_mandat > 1 ? `, pour les ${rapport.lots_du_mandat} lots de son mandat` : ""}.`,
  };
}
