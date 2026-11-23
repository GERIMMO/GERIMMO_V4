import type { SupabaseClient } from "@supabase/supabase-js";
import { interlocuteurLocataire, type InterlocuteurLocataire } from "./interlocuteur-locataire";
import { identiteContactLocataire, type IdentiteContactLocataire } from "./identite-contact-locataire";

/**
 * Lot 47 : l'interlocuteur du locataire, lu avec le client de la session (locataire compris) dans la vue
 * `organisations_portail`, déjà ouverte à chaque membre de l'espace (type, nom, apparence ; aucun droit nouveau).
 * Une lecture en échec donne « bailleur », comme le titre « Mon bailleur » de l'espace locataire. Elle ne lève jamais :
 * les actions la lisent pour composer leur message APRÈS leur écriture, qu'un libellé ne doit pas faire passer pour un
 * échec.
 */
export async function lireInterlocuteurLocataire(db: SupabaseClient, orgId: string): Promise<InterlocuteurLocataire> {
  try {
    const { data, error } = await db.from("organisations_portail").select("type").eq("id", orgId).maybeSingle();
    return interlocuteurLocataire(error ? null : (data as { type?: string | null } | null)?.type);
  } catch {
    return interlocuteurLocataire(null);
  }
}

/**
 * Lot 47 (reprise) : l'identité que les écrans du locataire nomment (titre « Mon gestionnaire » / « Mon bailleur », et
 * l'interlocuteur qui en découle), lue avec le client de la session.
 *
 * Elle vient de `attestation_emetteur_locataire`, qui ne rend une ligne qu'au locataire d'un bail actif, en préavis ou
 * terminé. Le locataire d'une agence invité avant la signature (bail en brouillon : l'invitation ne dépend pas de l'état
 * du bail), ou dont la lecture échoue, recevait une identité vide, lue « Mon bailleur » : faux dans un espace d'agence,
 * où c'est l'agence qui lui répond. Sans ligne, le type de l'espace se lit donc dans `organisations_portail`, déjà
 * ouverte à chaque membre actif (aucun droit nouveau) : « gestionnaire » et le nom de l'agence dans un espace d'agence.
 * Chez un propriétaire, le nom reste celui des bailleurs du lot, jamais le nom interne du parc : sans bail, il reste
 * inconnu. Ne lève jamais ; rien de lisible : « Mon bailleur », comme avant.
 */
export async function completerIdentiteContact(db: SupabaseClient, orgId: string, brut: unknown): Promise<IdentiteContactLocataire> {
  if (brut) return identiteContactLocataire(brut);
  try {
    const { data, error } = await db.from("organisations_portail").select("type, name").eq("id", orgId).maybeSingle();
    const espace = error ? null : (data as { type?: string | null; name?: string | null } | null);
    return identiteContactLocataire(espace?.type ? { type: espace.type, nom: espace.name ?? null } : null);
  } catch {
    return identiteContactLocataire(null);
  }
}

/** L'identité de contact du locataire dans un espace : `attestation_emetteur_locataire`, complétée comme ci-dessus. */
export async function lireIdentiteContactLocataire(db: SupabaseClient, orgId: string): Promise<IdentiteContactLocataire> {
  try {
    const { data, error } = await db.rpc("attestation_emetteur_locataire", { p_org: orgId });
    return completerIdentiteContact(db, orgId, error ? null : data);
  } catch {
    return completerIdentiteContact(db, orgId, null);
  }
}
