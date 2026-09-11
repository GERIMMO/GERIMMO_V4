import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * LE MODÈLE D'ACCÈS DU PORTAIL ARTISAN — pourquoi il est sûr.
 *
 * L'artisan est l'exception du produit : tous les autres rôles vivent DANS une
 * organisation, lui travaille pour plusieurs agences et son agenda les mélange
 * (RM-19.3.3). Trois conséquences, qui expliquent la forme de tout ce dossier :
 *
 * 1. AUCUNE ROUTE DU PORTAIL NE PORTE D'IDENTIFIANT D'AGENCE. `/artisan/…` n'a
 *    pas de `[orgId]`, contrairement à `/agence/[orgId]` et `/locataire/[orgId]`.
 *    Ce n'est pas une commodité d'URL : c'est la traduction du fait qu'aucune
 *    des RPC qu'il appelle n'accepte d'organisation en paramètre. On ne peut
 *    pas demander « l'agenda de telle agence », donc on ne peut pas demander
 *    celui d'une agence où l'on n'a rien à faire.
 *
 * 2. LE PORTAIL NE LIT AUCUNE TABLE. Pas un seul `.from(...)` dans ce dossier :
 *    tout passe par les RPC `mon_artisan`, `mes_sollicitations`,
 *    `mon_agenda_artisan`, `mes_pieces_artisan`, `ma_note_artisan`. Ce n'est
 *    pas un choix de style — la migration du socle (20260911180000) pose que
 *    AUCUNE politique RLS du produit ne nomme le rôle `artisan` : une session
 *    d'artisan qui interrogerait `incidents`, `baux` ou `incident_interventions`
 *    recevrait zéro ligne. Il n'y a pas de porte à mal fermer : il n'y a pas
 *    de porte. Les RPC SECURITY DEFINER sont la seule, et elles déduisent son
 *    identité de `auth.uid()` (`mon_artisan_id()`), jamais d'un paramètre.
 *
 * 3. LA GARDE CI-DESSOUS NE PROTÈGE QUE LA NAVIGATION. Elle vérifie qu'une
 *    fiche artisan existe pour ce compte, afin d'envoyer un visiteur sans
 *    fiche vers l'inscription plutôt que sur des écrans vides. La protection
 *    des données, elle, est en base et y reste : cette garde retirée, le
 *    portail n'afficherait rien de plus.
 *
 * Constat daté du 2026-09-11 : le rôle `artisan` existait dans l'énumération
 * `membership_role` et portait un libellé dans /espaces, mais ne menait nulle
 * part — ce dossier est cette destination.
 */

export type FicheArtisan = {
  artisan_id: string;
  raison_sociale: string;
  siret: string;
  siret_etat: "verifie" | "non_verifie" | "invalide";
  telephone: string | null;
  email: string | null;
  visibilite: "privee" | "publique";
  statut_plateforme: "en_attente" | "valide" | "refuse";
  statut_motif: string | null;
  metiers: string[] | null;
  codes_postaux: string[] | null;
  decennale_valide: boolean;
  decennale_expire_le: string | null;
};

export type LigneAgenda = {
  intervention_id: string;
  organization_id: string;
  agence_nom: string;
  incident_numero: string;
  statut: "proposee" | "acceptee" | "planifiee" | "en_cours" | "terminee";
  debut_prevu: string | null;
  fin_prevue: string | null;
  categorie: string;
  description: string | null;
  urgence: "normale" | "urgente";
  piece: string | null;
  nature_travaux: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  lot_nom: string | null;
  etage: string | null;
  // Ni avant l'acceptation, ni après la fin : la base ne rend le contact de
  // l'occupant que pendant la mission vivante. L'écran n'a donc rien à cacher —
  // il affiche ce qu'il reçoit, et ce qu'il reçoit est déjà la règle.
  occupant_nom: string | null;
  occupant_prenom: string | null;
  occupant_telephone: string | null;
  montant_ttc_cents: number | null;
  compte_rendu_depose: boolean;
  photo_apres_deposee: boolean;
};

export type LigneSollicitation = {
  sollicitation_id: string;
  organization_id: string;
  agence_nom: string;
  incident_numero: string;
  categorie: string;
  description: string | null;
  urgence: "normale" | "urgente";
  metier: string;
  nature_travaux: string;
  decennale_requise: boolean;
  code_postal: string | null;
  ville: string | null;
  envoyee_le: string;
  statut:
    | "envoyee"
    | "declinee"
    | "devis_depose"
    | "retenue"
    | "non_retenue"
    | "expiree"
    | "annulee";
  valide_jusqu_au: string | null;
  montant_ttc_cents: number | null;
};

export type PieceArtisan = {
  piece_id: string;
  type: "decennale" | "rc_pro" | "urssaf" | "kbis" | "certification";
  storage_path: string;
  emise_le: string | null;
  expire_le: string | null;
  jours_avant_echeance: number | null;
  expiree: boolean;
};

export type NoteArtisan = {
  note_publiee: number | null;
  nb_evaluations: number;
  publiable: boolean;
  delai_acceptation_heures: number | null;
  delai_intervention_jours: number | null;
  taux_refus: number | null;
  rdv_manques: number;
  pieces_expirees: number;
};

/**
 * La fiche de l'artisan connecté, ou `null` s'il n'en a pas encore.
 *
 * `cache()` : le gabarit et la page l'appellent dans la même requête — une
 * seule exécution, comme `verifierAccesEspace` le fait pour l'agence.
 *
 * `erreur` est distingué de « pas de fiche » : une lecture tombée ne doit pas
 * expédier un artisan inscrit sur le formulaire d'inscription, où il lirait
 * « Ce SIRET est déjà inscrit » sans comprendre (même défaut que celui relevé
 * le 11/09 sur les pièces du locataire, où une lecture en échec annonçait au
 * locataire que sa pièce n'existait pas).
 */
export const chargerFicheArtisan = cache(async function chargerFicheArtisan() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, fiche: null, erreur: false };

  const { data, error } = await supabase.rpc("mon_artisan");
  const fiche = ((data ?? []) as FicheArtisan[])[0] ?? null;
  return { supabase, user, fiche, erreur: Boolean(error) };
});

/**
 * Les quatre lectures du portail, mémorisées à la requête.
 *
 * Le gabarit compte ce qui attend (badges des onglets) et la page affiche le
 * détail : sans `cache()`, chaque écran interrogerait deux fois la même RPC —
 * sur le réseau d'une cage d'escalier, cela se voit. Même mécanique que
 * `verifierAccesEspace` côté agence.
 *
 * Chacune distingue l'échec de la lecture du résultat vide : un agenda tombé
 * ne doit pas s'afficher comme « aucune intervention », ce qui ferait rentrer
 * l'artisan chez lui.
 */
export const chargerAgenda = cache(async function chargerAgenda() {
  const { supabase, fiche } = await chargerFicheArtisan();
  if (!fiche) return { lignes: [] as LigneAgenda[], erreur: false };
  const { data, error } = await supabase.rpc("mon_agenda_artisan", {
    p_du: null,
    p_au: null,
  });
  return { lignes: (data ?? []) as LigneAgenda[], erreur: Boolean(error) };
});

export const chargerSollicitations = cache(async function chargerSollicitations() {
  const { supabase, fiche } = await chargerFicheArtisan();
  if (!fiche) return { lignes: [] as LigneSollicitation[], erreur: false };
  const { data, error } = await supabase.rpc("mes_sollicitations");
  return { lignes: (data ?? []) as LigneSollicitation[], erreur: Boolean(error) };
});

export const chargerPieces = cache(async function chargerPieces() {
  const { supabase, fiche } = await chargerFicheArtisan();
  if (!fiche) return { lignes: [] as PieceArtisan[], erreur: false };
  const { data, error } = await supabase.rpc("mes_pieces_artisan");
  return { lignes: (data ?? []) as PieceArtisan[], erreur: Boolean(error) };
});

export const chargerNote = cache(async function chargerNote() {
  const { supabase, fiche } = await chargerFicheArtisan();
  if (!fiche) return { note: null as NoteArtisan | null, erreur: false };
  const { data, error } = await supabase.rpc("ma_note_artisan");
  return { note: ((data ?? []) as NoteArtisan[])[0] ?? null, erreur: Boolean(error) };
});

/** Garde des pages du portail : session, puis fiche artisan. */
export async function verifierAccesArtisan() {
  const { supabase, user, fiche, erreur } = await chargerFicheArtisan();
  if (!user) redirect("/connexion?suite=%2Fartisan");
  if (erreur) redirect("/artisan/panne");
  if (!fiche) redirect("/artisan/inscription");
  return { supabase, user, fiche };
}

/**
 * Garde des actions serveur. Elle ne redirige pas : une action rend un état de
 * formulaire, et c'est le formulaire qui parle. Elle ne remplace jamais la
 * garde de la base — chaque RPC appelée revérifie `mon_artisan_id()`.
 */
export async function verifierArtisanAction() {
  const { supabase, user, fiche } = await chargerFicheArtisan();
  if (!user || !fiche) return { supabase, fiche: null as FicheArtisan | null };
  return { supabase, fiche };
}
