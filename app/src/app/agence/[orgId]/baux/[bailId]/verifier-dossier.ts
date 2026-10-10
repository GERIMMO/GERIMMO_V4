"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { MODELES } from "@/lib/documents/modeles";
export async function verifierDossierBail(orgId: string, bailId: string): Promise<{ erreur?: string; manquants: string[] }> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé.", manquants: [] };
  const { data: bail, error } = await supabase.from("baux").select("type,chambre_id").eq("id", bailId).eq("organization_id", orgId).maybeSingle();
  if (error || !bail) return { erreur: "Le bail ne peut pas être vérifié.", manquants: [] };
  const code = bail.chambre_id ? "bail_individuel" : bail.type === "colocation" ? "bail_colocation" : bail.type === "meuble" ? "bail_meuble" : "bail_nu";
  try {
    const resultat = await MODELES[code].assembler(supabase, orgId, bailId);
    if ("erreur" in resultat) return { erreur: resultat.erreur, manquants: [] };
    return { manquants: [...new Set(resultat.document.manquants)] };
  } catch { return { erreur: "La vérification est indisponible. Réessayez.", manquants: [] }; }
}
