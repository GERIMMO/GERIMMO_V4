"use server";

import { revalidatePath } from "next/cache";
import { archiverConditionsPubliees, type ResultatArchivage } from "@/lib/conditions-versions-serveur";
import { adresseDuSite } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";

export type EtatArchivageConditions = { erreur?: string; resultats?: ResultatArchivage[] };

/**
 * « Archiver la version en vigueur des conditions » (/admin/sante, 24/10/2026, plan de conformité R12).
 *
 * Réservé au super-administrateur permanent, second facteur compris (`is_permanent_super_admin()` lit l'AAL de la
 * session). La clé de service ne sert qu'APRÈS ce contrôle, et pour un seul geste : appeler
 * `archiver_version_conditions`, qui n'insère qu'une version manquante et ne réécrit jamais une version archivée.
 * Le texte archivé est celui de la page publiée, lu en ligne par lib/conditions-versions-serveur.ts : rien de ce que
 * le navigateur envoie n'entre dans l'archive.
 */
export async function archiverConditionsEnVigueur(_: EtatArchivageConditions, _formulaire: FormData): Promise<EtatArchivageConditions> {
  const session = await createClient();
  const droit = await session.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) {
    return { erreur: "Réservé au compte de supervision permanent, avec second facteur." };
  }
  const site = adresseDuSite();
  if (!site) return { erreur: "L’adresse publique du site n’est pas configurée (NEXT_PUBLIC_SITE_URL) : la page publiée ne peut pas être lue." };
  const service = clientDeService();
  if (!service) return { erreur: "La clé de service n’est pas configurée sur ce serveur : l’archivage est impossible." };
  const resultats = await archiverConditionsPubliees({ service, site });
  revalidatePath("/conditions/versions");
  revalidatePath("/admin/sante");
  return { resultats };
}
