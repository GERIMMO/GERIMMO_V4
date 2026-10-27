"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { verifierCompletudeBrouillonBail } from "@/lib/documents/completude-brouillon-bail";
export async function verifierDossierBail(orgId: string, bailId: string): Promise<{ erreur?: string; manquants: string[] }> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé.", manquants: [] };
  try {
    return await verifierCompletudeBrouillonBail(supabase, orgId, bailId);
  } catch { return { erreur: "La vérification est indisponible. Réessayez.", manquants: [] }; }
}
