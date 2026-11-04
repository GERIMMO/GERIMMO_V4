"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { saisieFacture, saisieContrat } from "@/lib/saisie-consommations";
import { enregistrerConsommation, type EtatConsommations } from "./consommations";

/** Une seule saisie : le fournisseur et le contexte du bien sont repris à la prochaine facture. */
export async function ajouterDepenseSimple(orgId: string, bienId: string, _etat: EtatConsommations, f: FormData): Promise<EtatConsommations> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: bienId });
  if (!user || ![orgId,bienId].every(estUuid)) return { erreur: "Accès refusé." };
  try {
    const scope = String(f.get("lot_id") ?? "").trim() || null;
    const bien = await supabase.from("biens").select("id").eq("organization_id",orgId).eq("id",bienId).is("archived_at",null).maybeSingle();
    if (bien.error || !bien.data) return { erreur: "Ce bien n’est pas accessible." };
    if (scope) {
      if (!estUuid(scope)) return { erreur: "Vérifiez le logement concerné." };
      const lot = await supabase.from("lots").select("id").eq("organization_id",orgId).eq("bien_id",bienId).eq("id",scope).neq("etat","archive").maybeSingle();
      if (lot.error || !lot.data) return { erreur: "Ce logement n’appartient pas à ce bien." };
    }
    const fichier = f.get("document");
    if (!(fichier instanceof File) || !fichier.size) return { erreur: "Joignez le justificatif de la dépense." };
    // Valider tout le formulaire avant de créer le moindre fournisseur.
    if (!String(f.get("reference") ?? "").trim()) f.set("reference", fichier.name.replace(/\.[^.]+$/, "").slice(0,140));
    saisieFacture(f);
    const contrat = saisieContrat(f);
    let q = supabase.from("contrats_fourniture").select("id").eq("organization_id",orgId).eq("bien_id",bienId).eq("fournisseur",contrat.fournisseur).eq("categorie",contrat.categorie).eq("actif",true);
    q = scope ? q.eq("lot_id",scope) : q.is("lot_id",null);
    const existant = await q.order("created_at").limit(1).maybeSingle();
    if (existant.error) return { erreur: "Les dépenses précédentes n’ont pas pu être vérifiées. Réessayez." };
    let contratId = existant.data?.id;
    if (!contratId) {
      const creation = await supabase.from("contrats_fourniture").insert({...contrat,organization_id:orgId,bien_id:bienId,lot_id:scope}).select("id").single();
      if (creation.error || !creation.data) return { erreur: sansJargon(creation.error?.message ?? "Le fournisseur n’a pas été enregistré.") };
      contratId = creation.data.id;
    }
    f.set("action","facture"); f.set("contrat_id",contratId);
    return await enregistrerConsommation(orgId,bienId,scope,{},f);
  } catch (e) { return { erreur: sansJargon(e instanceof Error ? e.message : "La dépense n’a pas été enregistrée.") }; }
}
