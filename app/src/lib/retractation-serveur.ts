import "server-only";
// La ligne de rétractation d'un espace (plan du 23/10, R01, R37) : par la session du responsable (`ma_retractation`,
// qui ne rend rien à un autre), ou, pour le super-administrateur permanent qui saisit une rétractation reçue par
// courriel, par la clé de service — APRÈS le contrôle de ce droit par l'appelant.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { lireContexteCourrier } from "@/lib/courriers-contrat-envoi";
import type { LigneRetractation } from "@/lib/retractation-etat";
import { clientStripe, configurationStripe } from "@/lib/stripe";

/**
 * La date de souscription relue chez Stripe quand la base ne la connaît pas encore (souscription antérieure au 24/10,
 * que le webhook n'a pas encore datée). Relecture adverse du 24/10 (M4) : « Mon abonnement » n'affiche plus le bloc
 * « Droit de rétractation » d'un délai échu. `null` : rien à relire (pas de souscription suivie, ou déjà datée) ;
 * `undefined` : Stripe illisible — l'appelant garde alors le bouton (la page de déclaration redira si le délai court).
 */
export async function conclusionRelueChezStripe(
  supabase: SupabaseClient,
  orgId: string,
  ligne: LigneRetractation | null | undefined
): Promise<Date | null | undefined> {
  if (!ligne?.abonnement_suivi || ligne.souscrit_le) return null;
  const reglages = configurationStripe();
  if (!reglages.pret) return undefined;
  const { data: sub, error } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
  if (error || typeof sub !== "string" || !sub) return undefined;
  try {
    const s = await clientStripe(reglages.config).subscriptions.retrieve(sub);
    return typeof s.start_date === "number" ? new Date(s.start_date * 1000) : undefined;
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return undefined;
  }
}

export async function ligneRetractationDuResponsable(supabase: SupabaseClient, orgId: string): Promise<LigneRetractation | null | undefined> {
  const { data, error } = await supabase.rpc("ma_retractation", { p_org: orgId });
  if (error) return undefined;
  return ((data ?? []) as LigneRetractation[])[0] ?? null;
}

export async function ligneRetractationParLeService(service: SupabaseClient, orgId: string): Promise<LigneRetractation | null> {
  const c = await lireContexteCourrier(service, orgId).catch(() => null);
  if (!c) return null;
  const { data } = await service
    .from("abonnements")
    .select("periodicite_suivante, passage_annuel_demande_le")
    .eq("organization_id", orgId)
    .maybeSingle();
  const a = (data ?? {}) as { periodicite_suivante?: "mensuel" | "annuel" | null; passage_annuel_demande_le?: string | null };
  const { data: decl } = await service
    .from("retractations_abonnement")
    .select("nature, declaree_le, passage_demande_le, passage_effectue")
    .eq("organization_id", orgId)
    .eq("subscription_id", c.stripe_subscription_id ?? "");
  const declarations = (decl ?? []) as { nature: string; declaree_le: string; passage_demande_le: string | null; passage_effectue: boolean | null }[];
  // Comparées à la milliseconde, comme `ma_retractation` (relecture adverse du 24/10, point 3).
  const demande = a.passage_annuel_demande_le ? new Date(a.passage_annuel_demande_le).getTime() : null;
  const passage = declarations.find((d) => d.nature === "passage_annuel" && d.passage_demande_le && new Date(d.passage_demande_le).getTime() === demande);
  return {
    souscrit_le: c.souscrit_le,
    abonnement_suivi: Boolean(c.stripe_subscription_id),
    stripe_statut: c.stripe_statut,
    essai_fin: c.essai_fin,
    periodicite: c.periodicite,
    periodicite_suivante: a.periodicite_suivante ?? null,
    passage_annuel_demande_le: a.passage_annuel_demande_le ?? null,
    formule: c.formule,
    organisation: c.organisation,
    destinataire: c.destinataire,
    retractation_abonnement_le: declarations.find((d) => d.nature === "abonnement")?.declaree_le ?? null,
    retractation_passage_le: passage?.declaree_le ?? null,
    retractation_passage_effectue: passage?.passage_effectue ?? null,
  };
}
