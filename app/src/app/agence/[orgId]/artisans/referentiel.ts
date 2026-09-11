// Référentiel du module artisan côté AGENCE — les libellés français des
// énumérations posées par la migration 20260911180000 (module 8/9/10/11).
//
// POURQUOI ICI ET PAS DANS src/lib. Le 2026-09-11, trois agents construisent
// en parallèle les trois faces du module (agence, artisan, locataire). Un
// `src/lib/artisans.ts` serait écrit trois fois sur le même chemin. Ce fichier
// est donc co-localisé avec l'écran qui en est propriétaire (le carnet
// d'agence) ; les écrans d'incidents l'importent par `../artisans/referentiel`.
// À la première occasion transverse, il remonte tel quel dans src/lib.
//
// Règle du projet : interface en français, identifiants de code en anglais —
// les CLÉS sont les valeurs de l'énumération SQL, les VALEURS sont ce que lit
// l'agent. Aucune règle métier n'est recopiée ici : la base les défend, cet
// écran les nomme.

// ── Métiers (liste fermée, enum public.artisan_metier) ────────────────────
// RM-8.3 : « un artisan n'est proposé que dans SON métier ». La liste est
// déduite des catégories d'incident déjà en base (voir le commentaire de la
// migration) ; elle n'est pas inventée ici.
export const METIERS_ARTISAN: Record<string, string> = {
  plomberie: "Plomberie",
  chauffage: "Chauffage",
  electricite: "Électricité",
  menuiserie: "Menuiserie",
  serrurerie: "Serrurerie",
  nuisibles: "Nuisibles",
  autre: "Autre",
};

// ── Nature des travaux (enum public.nature_travaux) ───────────────────────
// RM-8.2.9, décision révisée : la décennale s'exige selon la NATURE des
// travaux, pas selon le métier. Les cinq valeurs et leur conséquence viennent
// mot pour mot du module 8 — « entretien courant/réparation simple = pas de
// décennale requise ; remplacement d'équipement, clos et couvert, réseaux
// encastrés, gros œuvre = requise ».
export const NATURES_TRAVAUX: Record<string, string> = {
  entretien_courant: "Entretien courant ou réparation simple",
  remplacement_equipement: "Remplacement d'équipement",
  clos_et_couvert: "Clos et couvert",
  reseaux_encastres: "Réseaux encastrés",
  gros_oeuvre: "Gros œuvre",
};

// Miroir EXACT de public.decennale_requise(nature) — `nature <> 'entretien_courant'`.
// L'écran l'annonce ; la base le tient (colonne calculée sur la consultation,
// filtre sans interrupteur dans artisan_affectable, RM-8.3.1). Si les deux
// divergeaient un jour, c'est la base qui gagne : l'agent verrait simplement
// une mention inexacte, jamais un artisan sans décennale sur un chantier.
export function decennaleRequise(nature: string): boolean {
  return nature !== "entretien_courant";
}

// ── États du cycle devis / mission ────────────────────────────────────────
export const STATUTS_SOLLICITATION: Record<string, string> = {
  envoyee: "Demande envoyée",
  declinee: "A décliné",
  devis_depose: "Devis déposé",
  retenue: "Retenue",
  non_retenue: "Non retenue",
  expiree: "Expirée",
  annulee: "Annulée",
};

export const COULEURS_SOLLICITATION: Record<string, string> = {
  envoyee: "puce puce-prep",
  declinee: "puce puce-grise",
  devis_depose: "puce puce-encre",
  retenue: "puce puce-loue",
  non_retenue: "puce puce-grise",
  expiree: "puce puce-grise",
  annulee: "puce puce-grise",
};

export const STATUTS_DEVIS: Record<string, string> = {
  depose: "Reçu",
  retenu: "Retenu",
  non_retenu: "Non retenu",
  expire: "Expiré",
  annule: "Annulé",
};

export const COULEURS_DEVIS: Record<string, string> = {
  depose: "puce puce-encre",
  retenu: "puce puce-loue",
  non_retenu: "puce puce-grise",
  expire: "puce puce-rouge",
  annule: "puce puce-grise",
};

export const STATUTS_INTERVENTION: Record<string, string> = {
  proposee: "Confiée — l'artisan n'a pas encore répondu",
  acceptee: "Acceptée",
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  refusee: "Refusée — à réaffecter",
  annulee: "Annulée",
};

export const COULEURS_INTERVENTION: Record<string, string> = {
  proposee: "puce puce-prep",
  acceptee: "puce puce-encre",
  planifiee: "puce puce-encre",
  en_cours: "puce puce-encre",
  terminee: "puce puce-loue",
  refusee: "puce puce-rouge",
  annulee: "puce puce-grise",
};

// Une mission « vivante » : celle qui occupe l'incident. Miroir de l'index
// unique partiel incident_interventions_une_vivante — une seule à la fois.
export const STATUTS_MISSION_VIVANTE = ["proposee", "acceptee", "planifiee", "en_cours"];

export const STATUTS_CRENEAU: Record<string, string> = {
  propose: "Proposé",
  retenu: "Retenu",
  refuse: "Refusé",
  caduc: "Caduc",
};

export const AUTEURS_CRENEAU: Record<string, string> = {
  artisan: "Artisan",
  locataire: "Locataire",
  agence: "Agence",
};

export const MOMENTS_PHOTO: Record<string, string> = {
  avant: "Avant",
  pendant: "Pendant",
  apres: "Après",
};

// ── Profil global de l'artisan ────────────────────────────────────────────
export const STATUTS_PLATEFORME: Record<string, string> = {
  en_attente: "En attente de validation Gerimmo",
  valide: "Validé par Gerimmo",
  refuse: "Refusé par Gerimmo",
};

export const COULEURS_PLATEFORME: Record<string, string> = {
  en_attente: "puce puce-prep",
  valide: "puce puce-loue",
  refuse: "puce puce-rouge",
};

export const ETATS_SIRET: Record<string, string> = {
  verifie: "SIRET vérifié",
  non_verifie: "SIRET non vérifié",
  invalide: "SIRET invalide",
};

export const COULEURS_SIRET: Record<string, string> = {
  verifie: "puce puce-loue",
  non_verifie: "puce puce-prep",
  invalide: "puce puce-rouge",
};

export const VISIBILITES_ARTISAN: Record<string, string> = {
  privee: "Profil privé",
  publique: "Profil public",
};

// ── artisan_scope : d'OÙ vient l'artisan sollicité ────────────────────────
//
// Le wiki ([[Artisan]], « Deux approbations distinctes ») nomme la notion
// `artisan_scope` sur une sollicitation : `prive` = artisan privé de l'agence,
// `gerimmo_valide` = artisan validé par la plateforme. Le socle du 11/09 ne
// porte AUCUNE colonne de ce nom : il porte les deux faits qui la composent —
// `artisan_agences` (le rattachement, donc la relation d'agence) et
// `artisans.statut_plateforme` + `visibilite` (le profil global).
//
// On la DÉDUIT donc plutôt que de l'inventer en base :
//   · rattaché à cette agence            → « Votre carnet »   (scope privé)
//   · lisible seulement parce que public → « Annuaire Gerimmo » (scope validé)
//
// Depuis le pivot du 2026-09-04, TOUT artisan affectable est validé par la
// plateforme (artisan_affectable exige statut_plateforme = 'valide') : le
// scope ne dit donc plus « validé ou pas », il dit « de mon carnet ou de
// l'annuaire ». C'est l'information qui reste utile à l'agent.
//
// LIMITE ASSUMÉE, à dire au rapport : le scope est relu du rattachement
// COURANT, pas figé au moment de la sollicitation. Si la trace historique est
// exigée (« d'où venait-il le jour où on l'a sollicité »), il faut une colonne
// sur incident_sollicitations — décision qui n'est pas la nôtre.
export type ArtisanScope = "prive" | "gerimmo_valide";

export function scopeArtisan(rattache: boolean): ArtisanScope {
  return rattache ? "prive" : "gerimmo_valide";
}

export const LIBELLES_SCOPE: Record<ArtisanScope, string> = {
  prive: "Votre carnet",
  gerimmo_valide: "Annuaire Gerimmo",
};

export const COULEURS_SCOPE: Record<ArtisanScope, string> = {
  prive: "puce puce-encre",
  gerimmo_valide: "puce puce-grise",
};

// ── Montants ──────────────────────────────────────────────────────────────
// Les montants du module vivent en CENTIMES (montant_ttc_cents,
// montant_final_cents) : un seul endroit pour les ramener à l'euro, sinon
// chaque écran refait la division et l'un d'eux l'oublie.
export function centsEnEuros(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : cents / 100;
}

// ── Zone d'intervention ───────────────────────────────────────────────────
// Correspondance EXACTE de code postal (contrainte de artisan_zones : cinq
// chiffres, clé primaire (artisan_id, code_postal)). Ni préfixe départemental,
// ni rayon : rien dans le wiki ne les autorise.
export function codesPostauxValides(saisie: string): { erreur?: string; codes?: string[] } {
  const codes = saisie
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const fautif = codes.find((c) => !/^[0-9]{5}$/.test(c));
  if (fautif) {
    return { erreur: `« ${fautif} » n'est pas un code postal à cinq chiffres.` };
  }
  return { codes: [...new Set(codes)] };
}

// Le SIRET : quatorze chiffres, espaces tolérés à la saisie (les artisans le
// dictent « 123 456 789 00012 »). La base contrôle la forme, jamais
// l'existence — la vérification en ligne est hors périmètre du module 8.
export function siretNormalise(saisie: string): string {
  return saisie.replace(/\s/g, "");
}
