// Ligne du RPC mon_bail_locataire (v4 — migration espace_locataire_v10)
export type BailLocataire = {
  bail_id: string;
  type: string;
  etat: string;
  loyer_hc: number | null;
  charges: number | null;
  date_debut: string | null;
  date_fin: string | null;
  lot_nom: string;
  document_signe: string | null;
  charges_mode: string | null;
  jour_echeance: number | null;
  surface_m2: number | null;
  pieces: number | null;
  etage: string | null;
  meuble: boolean | null;
  adresse: string | null;
  ville: string | null;
  zone_tendue: boolean | null;
};
