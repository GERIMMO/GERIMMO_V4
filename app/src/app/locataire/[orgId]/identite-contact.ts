import { cache } from "react";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { identiteContactLocataire } from "@/lib/identite-contact-locataire";

/** Même identité que l’attestation de loyer, avec la session et les droits existants. */
export const lireIdentiteContact = cache(async (orgId: string) => {
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  const { data, error } = await supabase.rpc("attestation_emetteur_locataire", { p_org: orgId });
  return identiteContactLocataire(error ? null : data);
});
