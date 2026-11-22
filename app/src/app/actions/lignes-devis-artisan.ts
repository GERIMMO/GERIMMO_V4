"use server";

import { verifierArtisanAction } from "@/app/artisan/acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { lireLigneAGarder, type LigneGardee } from "@/lib/lignes-devis-gardees";

// LIGNES DE DEVIS GARDÉES PAR L'ARTISAN (audit palier 1 du 22/11/2026, P2-04).
// Deux gestes appelés depuis le formulaire de devis, sans l'envoyer : garder une ligne, la retirer de sa liste.
// Aucun n'accepte d'artisan en paramètre : la base ne connaît que celui de la session.

const REFUS = { erreur: "Votre fiche artisan est introuvable." };

export async function garderMaLigneDevis(saisie: { libelle: string; prix: string; tva: string }): Promise<{ erreur?: string; ligne?: LigneGardee }> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;
  const lue = lireLigneAGarder({ libelle: String(saisie?.libelle ?? ""), prix: String(saisie?.prix ?? ""), tva: String(saisie?.tva ?? "") });
  if ("erreur" in lue) return { erreur: lue.erreur };
  const { data, error } = await supabase.rpc("garder_ma_ligne_devis", { p_libelle: lue.libelle, p_prix_cents: lue.prixCents, p_tva_bps: lue.tvaBps });
  if (error) return { erreur: sansJargon(error.message) };
  if (typeof data !== "string" || !estUuid(data)) return { erreur: "La ligne n’a pas pu être gardée. Réessayez dans un instant." };
  return { ligne: { id: data, libelle: lue.libelle, prix_unitaire_ht_cents: lue.prixCents, tva_bps: lue.tvaBps } };
}

export async function retirerMaLigneDevis(ligneId: string): Promise<{ erreur?: string; retiree?: string }> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;
  if (!estUuid(ligneId)) return { erreur: "Ligne introuvable." };
  const { error } = await supabase.rpc("retirer_ma_ligne_devis", { p_ligne: ligneId });
  if (error) return { erreur: sansJargon(error.message) };
  return { retiree: ligneId };
}
