"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "@/lib/editeur";
import { estUuid } from "@/lib/identifiants";
import { CASE_CONDITIONS_ARTISANS, versionArtisansPubliee } from "@/lib/conditions-acceptation";
import { ERREUR_ACCEPTATION_CONDITIONS, ERREUR_CONDITIONS_PERIMEES } from "@/lib/garde-souscription";
import { abonnementCourant } from "@/lib/conditions-acceptation-serveur";
import { messageAccordEnregistre } from "@/lib/nouvelle-version-conditions";
import { chargerFicheArtisan } from "@/app/artisan/acces";

// Les deux acceptations qui se donnent APRÈS l'inscription (plan de conformité du 23/10/2026, lot 1A) :
//  · la nouvelle version des conditions clients, depuis l'écran « Nos conditions générales évoluent » (R19) ;
//  · les conditions de l'espace artisan, depuis la garde de l'espace artisan, une fois publiées (R10).
// La version acceptée est celle que l'écran a AFFICHÉE (champ `cgu_version`) : si elle n'est plus celle du serveur (page
// restée ouverte pendant un déploiement), on refuse plutôt que d'enregistrer l'accord sur un texte que la personne n'a
// pas lu. `accepter_cgu` écrit à l'heure du serveur, pour le compte connecté, en ajout seul.

export type EtatAcceptationConditions = { erreur?: string; succes?: string };

const RECONNEXION = "Votre session a expiré : reconnectez-vous, puis acceptez de nouveau.";

/** « J'accepte la nouvelle version » : les conditions clients en vigueur, pour le responsable de l'espace `orgId`. */
export async function accepterNouvelleVersionConditions(
  orgId: string,
  _etat: EtatAcceptationConditions,
  formData: FormData
): Promise<EtatAcceptationConditions> {
  if (!estUuid(orgId)) return { erreur: "Espace introuvable." };
  if (formData.get("cgu_version") !== CONDITIONS_VERSION) return { erreur: ERREUR_CONDITIONS_PERIMEES };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: RECONNEXION };
  const { error } = await supabase.rpc("accepter_cgu", {
    p_version: CONDITIONS_VERSION,
    p_source: "compte",
    p_document: "conditions_clients",
  });
  if (error) return { erreur: ERREUR_ACCEPTATION_CONDITIONS };
  // L'accord ne relance pas de lui-même un abonnement déjà programmé pour finir : la confirmation le dit, et « Mon
  // abonnement » permet de le poursuivre. Une lecture en échec ne change que la phrase.
  return { succes: messageAccordEnregistre(CONDITIONS_DATE, await abonnementCourant(supabase, orgId)) };
}

/** La case de la garde de l'espace artisan : les conditions de l'espace artisan en vigueur. */
export async function accepterConditionsArtisans(
  _etat: EtatAcceptationConditions,
  formData: FormData
): Promise<EtatAcceptationConditions> {
  const version = versionArtisansPubliee();
  if (!version) return { erreur: "Aucune condition propre à l’espace artisan n’est à accepter pour le moment." };
  if (formData.get("cgu_version") !== version) return { erreur: ERREUR_CONDITIONS_PERIMEES };
  if (!formData.get("cgu")) return { erreur: CASE_CONDITIONS_ARTISANS.refus };
  // Seul un artisan inscrit (fiche) accepte ces conditions : un locataire ou un gérant arrivé sur une URL de l'espace
  // artisan n'enregistre aucun accord à un texte qui ne le concerne pas (audit final, DOC-01).
  const { supabase, user, fiche, erreur } = await chargerFicheArtisan();
  if (!user) return { erreur: RECONNEXION };
  if (erreur) return { erreur: ERREUR_ACCEPTATION_CONDITIONS };
  if (!fiche) return { erreur: "Cette acceptation est réservée aux artisans inscrits." };
  const { error } = await supabase.rpc("accepter_cgu", {
    p_version: version,
    p_source: "compte",
    p_document: "conditions_artisans",
  });
  if (error) return { erreur: ERREUR_ACCEPTATION_CONDITIONS };
  // La garde du gabarit relit l'acceptation : l'espace s'ouvre au rendu qui suit.
  revalidatePath("/artisan", "layout");
  return { succes: "Votre acceptation des conditions de l’espace artisan est enregistrée." };
}
