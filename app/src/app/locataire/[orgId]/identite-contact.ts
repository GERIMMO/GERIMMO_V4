import { cache } from "react";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { lireIdentiteContactLocataire } from "@/lib/interlocuteur-locataire-serveur";

/**
 * Même identité que l’attestation de loyer, avec la session et les droits existants. Lot 47 (reprise) : sans bail
 * actif, en préavis ou terminé, le type de l'espace la complète (`lireIdentiteContactLocataire`) — le locataire d'une
 * agence dont le bail est encore en brouillon lisait « Mon bailleur ».
 */
export const lireIdentiteContact = cache(async (orgId: string) => {
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  return lireIdentiteContactLocataire(supabase, orgId);
});
