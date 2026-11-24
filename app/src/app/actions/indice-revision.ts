"use server";

// L'indice de la révision annuelle, cherché dans la série officielle de l'Insee (audit palier 1, P1-13).
//
// Lecture seule : rien n'est écrit, ni sur le bail ni ailleurs. Le geste ne fait que remplir le formulaire de révision
// avec l'indice que publie l'Insee ; c'est « Réviser le loyer » qui enregistre, et la base qui juge.
//
// Appelé au clic, jamais à l'affichage de la fiche : quand l'Insee ne répond pas, la fiche du bail ne doit pas attendre.
// Sans réponse, le bailleur saisit l'indice lui-même, comme avant.

import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { aujourdhuiParis } from "@/lib/ged";
import { chargerSerieIrl } from "@/lib/outils/irl-insee";
import { proposerIndice, type PropositionIndice, type RevisionPassee } from "@/lib/indice-revision";

export type RetourPropositionIndice =
  | { erreur: string }
  | { proposition: PropositionIndice; /** Jour de la lecture chez l'Insee (jour de Paris). */ luLe: string };

/**
 * `dateDemande` : la date de la demande saisie dans le formulaire (troisième reprise du lot D2, 24/11/2026). Elle dit à
 * quelle date de révision la demande est rattachée, donc quel indice proposer ; absente ou illisible, c'est aujourd'hui.
 */
export async function chercherIndiceRevision(orgId: string, bailId: string, dateDemande?: string): Promise<RetourPropositionIndice> {
  if (!estUuid(orgId) || !estUuid(bailId)) return { erreur: "Accès refusé." };
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const [{ data: bail, error: erreurBail }, { data: revisions, error: erreurRevisions }] = await Promise.all([
    supabase.from("baux").select("id, revision_irl, irl_trimestre, irl_valeur, date_debut").eq("id", bailId).eq("organization_id", orgId).maybeSingle(),
    supabase.from("revisions_loyer").select("date_effet, irl_trimestre, irl_nouveau").eq("bail_id", bailId).eq("organization_id", orgId).order("date_effet", { ascending: true }),
  ]);
  if (erreurBail || erreurRevisions) return { erreur: "Le bail n’a pas pu être relu. Rechargez la page, ou saisissez l’indice vous-même." };
  if (!bail) return { erreur: "Accès refusé." };
  if (!bail.revision_irl) return { erreur: "Ce bail ne prévoit pas de révision annuelle du loyer." };

  // Ne lit l'Insee que si le bail dit quel trimestre chercher : sinon la réponse est déjà connue.
  const aujourdhui = aujourdhuiParis();
  const bailLu = {
    irlTrimestreBail: bail.irl_trimestre, irlValeurBail: bail.irl_valeur, revisions: (revisions ?? []) as RevisionPassee[],
    dateDebut: bail.date_debut, dateDemande: typeof dateDemande === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateDemande) ? dateDemande : aujourdhui,
  };
  const sansSerie = proposerIndice({ serie: [], ...bailLu });
  if (sansSerie.etat === "sans_reference") return { proposition: sansSerie, luLe: aujourdhui };

  const serie = await chargerSerieIrl();
  return { proposition: proposerIndice({ serie, ...bailLu }), luLe: aujourdhui };
}
