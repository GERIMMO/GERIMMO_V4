"use server";

// Gel de la suppression des pièces d'un bail en cas de litige (plan de conformité du 23/10/2026, lot 1E ; migration
// 20261024140000). La base décide de tout : droit sur le bail, douze mois au plus à partir d'aujourd'hui (jour de
// Paris), motif écrit, journal d'audit. Le geste est permis aussi quand l'abonnement est en lecture seule.

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { estUuid } from "@/lib/identifiants";
import { createClient } from "@/lib/supabase/server";

export type EtatGelConservation = { erreur?: string; succes?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « 2026-11-23 » → « 23/11/2026 ». */
const enFrancais = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Ce que la levée change, dit avec la date qui en résulte (relecture du 24/10) : la base ne supprime jamais moins de
 * trente jours après une levée (préavis), le temps de l'alerte et du téléchargement.
 */
function messageLevee(resultat: unknown): string {
  const r = (resultat ?? {}) as { echeance?: unknown; preavis?: unknown };
  const echeance = typeof r.echeance === "string" && DATE.test(r.echeance) ? r.echeance : null;
  if (!echeance) return "Gel levé. Rien n’est supprimé tant que le bail n’est pas terminé.";
  if (r.preavis === true) {
    return `Gel levé. Les pièces ont atteint leur durée de conservation : elles seront supprimées le ${enFrancais(echeance)}, après un préavis de trente jours. Vous serez prévenu par courriel ; téléchargez d’ici là celles que vous devez conserver.`;
  }
  return `Gel levé. Les pièces de ce bail seront supprimées à partir du ${enFrancais(echeance)} ; vous serez prévenu trente jours avant.`;
}

export async function gelerConservationBail(_: EtatGelConservation, form: FormData): Promise<EtatGelConservation> {
  const texte = (cle: string) => String(form.get(cle) ?? "").trim();
  const orgId = texte("orgId");
  const bailId = texte("bailId");
  const base = texte("base");
  if (!estUuid(orgId) || !estUuid(bailId)) return { erreur: "Bail introuvable : rechargez la page." };
  const lever = texte("geste") === "lever";
  const jusquAu = texte("jusqu_au");
  const motif = texte("motif");
  if (!lever) {
    if (!DATE.test(jusquAu)) return { erreur: "Indiquez la date de fin du gel." };
    if (motif.length < 5) return { erreur: "Décrivez le litige en cours en quelques mots (5 caractères au moins)." };
    if (motif.length > 500) return { erreur: "Le motif est trop long (500 caractères au plus)." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("geler_conservation_bail", {
    p_bail: bailId,
    p_jusqu_au: lever ? null : jusquAu,
    p_motif: lever ? null : motif,
  });
  if (error) {
    return { erreur: error.code === "42501" ? "Ce bail n’est pas accessible depuis votre compte." : sansJargon(error.message) };
  }
  // La base de l'espace (« /agence/<id> » ou « /espace/<id> ») vient de la page : seulement si elle désigne cet espace.
  if (/^\/(agence|espace)\/[0-9a-f-]{36}$/i.test(base) && base.endsWith(orgId)) revalidatePath(`${base}/baux/${bailId}`);
  return {
    succes: lever
      ? messageLevee(data)
      : "Suppression suspendue jusqu’à la date indiquée. Vous pouvez renouveler le gel si le litige continue.",
  };
}
