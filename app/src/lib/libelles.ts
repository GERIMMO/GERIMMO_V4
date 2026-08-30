// Libellés français des référentiels transverses (rôles, statuts).
// Une seule source : les écrans ne doivent jamais afficher une valeur
// technique brute (« admin_agence (active) ») — RM langue de l'UI.

export const LIBELLES_ROLES: Record<string, string> = {
  super_admin: "Super admin",
  admin_agence: "Administrateur d'agence",
  agent: "Agent immobilier",
  proprietaire_direct: "Propriétaire direct",
  proprietaire_mandant: "Propriétaire mandant",
  locataire: "Locataire",
  artisan: "Artisan",
  garant: "Garant",
};

export const LIBELLES_STATUT_ADHESION: Record<string, string> = {
  active: "active",
  inactive: "inactive",
};

export const LIBELLES_STATUT_ORGANISATION: Record<string, string> = {
  essai: "Essai",
  active: "Active",
  suspendue: "Suspendue",
  archivee: "Archivée",
};

export function libelleRole(role: string): string {
  return LIBELLES_ROLES[role] ?? role;
}

export function libelleStatutAdhesion(statut: string): string {
  return LIBELLES_STATUT_ADHESION[statut] ?? statut;
}
