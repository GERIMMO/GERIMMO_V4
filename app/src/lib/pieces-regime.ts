import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { regimePieces, type RegimePieces } from "@/lib/pieces-decret-2015";

// Lot T3 (R19-A1) : la place de la personne, relue en base sous la session du gérant (règles de lecture ordinaires) :
// locataire d'un bail signé (titulaire, ou colocataire non parti), caution d'un bail vivant, bail en préparation.
// Reprise T3R-2 : aussi ce qui n'est pas un candidat — bail signé terminé (titulaire), départ enregistré d'un bail signé
// (colocataire), lot détenu ou mandat. La même lecture sert à l'action (qui refuse) et à la fiche de la personne (qui
// affiche la liste ou le nom libre) : elles ne peuvent plus diverger.
// Une lecture qui échoue ne laisse rien passer : la demande est refusée.
const VIVANTS = ["brouillon", "actif", "preavis"];
const SIGNES = ["actif", "preavis", "termine"];

export async function lireRegimePieces(supabase: SupabaseClient, orgId: string, personId: string): Promise<RegimePieces | { erreur: string }> {
  const echec = { erreur: "Impossible de vérifier la situation de cette personne (bail signé ou non). Réessayez." };
  const aujourdhui = aujourdhuiParis();
  const [liens, principal, detentions, mandats] = await Promise.all([
    supabase.from("bail_personnes").select("bail_id, role, date_depart").eq("organization_id", orgId).eq("person_id", personId),
    supabase.from("baux").select("id, etat").eq("organization_id", orgId).eq("locataire_principal", personId).in("etat", [...VIVANTS, "termine"]),
    supabase.from("detentions").select("id").eq("organization_id", orgId).eq("person_id", personId).or(`date_fin.is.null,date_fin.gte.${aujourdhui}`),
    supabase.from("mandats").select("id").eq("organization_id", orgId).eq("person_id", personId).in("etat", ["brouillon", "a_signer", "actif", "preavis"]),
  ]);
  if (liens.error || principal.error || detentions.error || mandats.error) return echec;
  const lignes = (liens.data ?? []) as { bail_id: string; role: string; date_depart?: string | null }[];
  const ids = [...new Set(lignes.map((l) => l.bail_id))];
  const lies = ids.length
    ? await supabase.from("baux").select("id, etat").eq("organization_id", orgId).in("id", ids).in("etat", [...VIVANTS, "termine"])
    : { data: [], error: null };
  if (lies.error) return echec;
  const etat = new Map(((lies.data ?? []) as { id: string; etat: string }[]).map((b) => [b.id, b.etat]));
  const titulaires = (principal.data ?? []) as { etat: string }[];
  // Une ligne « vivante » : personne encore au bail (aucun départ, ou un départ à venir). Mêmes règles qu'avant la reprise.
  const vivante = (l: { date_depart?: string | null }) => !l.date_depart || l.date_depart >= aujourdhui;
  const sur = (role: string, signe: boolean) => lignes.some((l) => l.role === role && vivante(l)
    && VIVANTS.includes(etat.get(l.bail_id) ?? "") && (etat.get(l.bail_id) !== "brouillon") === signe);
  const ancienColocataire = lignes.some((l) => l.role === "colocataire" && SIGNES.includes(etat.get(l.bail_id) ?? "")
    && (!vivante(l) || etat.get(l.bail_id) === "termine"));
  return regimePieces({
    locataireBailSigne: titulaires.some((b) => b.etat === "actif" || b.etat === "preavis") || sur("colocataire", true),
    caution: sur("garant", true) || sur("garant", false),
    locataireEnPreparation: titulaires.some((b) => b.etat === "brouillon") || sur("colocataire", false),
    ancienLocataireOuProprietaire: titulaires.some((b) => b.etat === "termine") || ancienColocataire
      || (detentions.data ?? []).length > 0 || (mandats.data ?? []).length > 0,
  });
}
