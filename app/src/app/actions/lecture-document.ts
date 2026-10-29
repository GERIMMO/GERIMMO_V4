"use server";
import { verifierGerant, verifierLocataire } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { lireDocumentIA, type LectureDocument } from "@/lib/lecture-document-ia";

export async function proposerLectureDocument(orgId: string, demandeId: string | null, f: FormData): Promise<{ lecture?: LectureDocument; erreur?: string }> {
  if (!estUuid(orgId) || (demandeId !== null && !estUuid(demandeId))) return { erreur: "Accès refusé." };
  const { supabase, user } = demandeId ? await verifierLocataire(orgId) : await verifierGerant(orgId, { geste: "suivi_consommations", cible: orgId });
  if (!user) return { erreur: "Accès refusé." };
  if (demandeId) {
    const { data, error } = await supabase.rpc("mes_releves_consommation", { p_org: orgId });
    if (error || !(data ?? []).some((d: { demande_id: string; peut_repondre: boolean }) => d.demande_id === demandeId && d.peut_repondre)) return { erreur: "Cette demande de relevé n’est plus ouverte." };
  }
  const fichier = f.get("fichier");
  if (!(fichier instanceof File)) return { erreur: "Choisissez d’abord le fichier à lire." };
  try {
    const lecture = await lireDocumentIA(fichier, demandeId ? "compteur" : "facture", async () => {
      const { data, error } = await supabase.rpc("reserver_appel_ia_prive", { p_org: orgId, p_usage: "lecture_document" });
      if (error || data !== "accorde") throw new Error(data === "plafond" ? "La limite de lectures assistées est atteinte pour aujourd’hui. Vous pouvez remplir les informations directement." : "La lecture assistée est momentanément indisponible. Vous pouvez remplir les informations directement.");
    });
    return { lecture };
  } catch (e) { return { erreur: e instanceof Error ? e.message : "La lecture assistée n’a pas pu aboutir." }; }
}
