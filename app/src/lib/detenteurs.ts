// Le nom du bailleur d'un lot tel qu'il signe ses courriers chez un propriétaire direct : les détenteurs en cours, joints
// (« Moreau Claire, Moreau Jean »). Même règle que la quittance (`parties()` de lib/quittance-conforme.ts) et que les
// documents (`expediteurCourrier`) : jamais le nom du « parc », qui n'est pas une personne (audit final du 27/10, LOY-17).
//
// Tolérant : une lecture impossible rend une carte vide, et l'appelant garde le nom de l'espace — un courrier ne se
// bloque pas pour sa signature.

import type { SupabaseClient } from "@supabase/supabase-js";

type Personne = { nom: string; prenom: string | null };
type Ligne = { lot_id: string; person: Personne | Personne[] | null };

export async function nomsDetenteursParLot(supabase: SupabaseClient, orgId: string | null, lotIds: string[]): Promise<Map<string, string>> {
  const noms = new Map<string, string>();
  const lots = [...new Set(lotIds.filter(Boolean))];
  if (lots.length === 0) return noms;
  try {
    let requete = supabase
      .from("detentions")
      .select("lot_id, person:persons!detentions_person_id_fkey(nom,prenom)")
      .in("lot_id", lots)
      .is("date_fin", null);
    if (orgId) requete = requete.eq("organization_id", orgId);
    const { data, error } = await requete;
    if (error) return noms;
    const parLot = new Map<string, string[]>();
    for (const d of (data ?? []) as Ligne[]) {
      const p = Array.isArray(d.person) ? d.person[0] : d.person;
      const nom = p ? [p.nom, p.prenom].filter(Boolean).join(" ") : "";
      if (nom) parLot.set(d.lot_id, [...(parLot.get(d.lot_id) ?? []), nom]);
    }
    for (const [lot, liste] of parLot) noms.set(lot, liste.join(", "));
  } catch {
    // Lecture impossible : carte vide.
  }
  return noms;
}
