"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { identifiantsOpposes, STATUTS_LISTE_ATTENTE, type StatutListeAttente } from "@/lib/liste-attente-agences";
import { JOURNAL_A_VERIFIER, journaliserSupervision } from "@/lib/journal-supervision";

export type EtatListeAttenteAdmin = { erreur?: string; succes?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ECRAN = "/admin/liste-attente";

// Console du dirigeant : noter où en est une agence de la liste d'attente (contactée, remise en attente, devenue
// cliente, retirée à sa demande). Le geste passe par le client de session : la RLS (politiques
// liste_attente_agences_select_sa / _update_sa, super-administrateur seulement) est la garde, et le droit d'écriture
// de `authenticated` ne porte que sur `statut` et `contactee_le`.
//
// Leçon de l'audit console du 27/09 (majeur 6) : une mise à jour refusée par la RLS touche 0 ligne SANS erreur. La
// ligne est donc relue d'abord, et la mise à jour rend les lignes touchées : 0 ligne n'est jamais un succès.
export async function changerStatutAgence(id: string, statut: string): Promise<EtatListeAttenteAdmin> {
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "Inscription introuvable." };
  if (typeof statut !== "string" || !Object.hasOwn(STATUTS_LISTE_ATTENTE, statut)) {
    return { erreur: "Ce statut n’existe pas : rechargez la page." };
  }
  const cible = statut as StatutListeAttente;
  const supabase = await createClient();
  const { data: avant, error: lecture } = await supabase
    .from("liste_attente_agences")
    .select("id, statut")
    .eq("id", id)
    .maybeSingle();
  if (lecture) return { erreur: sansJargon(lecture.message) };
  // Hors droits, la RLS ne rend rien : « introuvable » ne révèle pas si la ligne existe.
  if (!avant) return { erreur: "Inscription introuvable, ou geste refusé : rechargez la page." };
  if (avant.statut === cible) {
    revalidatePath(ECRAN);
    return { erreur: `Cette agence est déjà « ${STATUTS_LISTE_ATTENTE[cible]} » : rien n’a changé.` };
  }
  // Plan de conformité du 23/10 (R45, relecture du 24/10) : une agence retirée, ou dont l'adresse s'est opposée à nos
  // messages (« Stop » comme prospect), ne peut pas être notée « contactée » ; sans le contrôle, rien n'est noté.
  if (cible === "contactee") {
    const { data: opposees, error: controle } = await supabase.rpc("inscriptions_agences_opposees");
    if (controle) return { erreur: "Le contrôle des oppositions est indisponible : rien n’a été noté. Réessayez dans un instant." };
    if (identifiantsOpposes(opposees).has(id)) {
      return { erreur: "Cette agence s’est opposée à nos messages (retrait ou « Stop ») : elle ne peut pas être marquée comme contactée." };
    }
  }
  // `contactee_le` est posé au passage à « contactée » et conservé ensuite : il date le dernier contact noté.
  const champs = cible === "contactee" ? { statut: cible, contactee_le: new Date().toISOString() } : { statut: cible };
  // La mise à jour vise la ligne ET le statut relu : un changement fait entre-temps depuis un autre écran ne
  // s'écrase pas en silence.
  const { data: touchees, error } = await supabase
    .from("liste_attente_agences")
    .update(champs)
    .eq("id", id)
    .eq("statut", avant.statut)
    .select("id");
  if (error) return { erreur: sansJargon(error.message) };
  if (!touchees || touchees.length === 0) {
    revalidatePath(ECRAN);
    return { erreur: "Le statut a changé entre-temps, ou le geste a été refusé : rechargez la page." };
  }
  const trace = await journaliserSupervision(supabase, "liste_attente_statut_modifie", { avant: avant.statut, apres: cible });
  revalidatePath(ECRAN);
  return { succes: `Statut noté : ${STATUTS_LISTE_ATTENTE[cible]}.${trace ? "" : JOURNAL_A_VERIFIER}` };
}
