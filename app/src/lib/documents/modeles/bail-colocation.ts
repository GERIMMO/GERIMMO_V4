// Contrat commun : le régime dépend du logement, jamais d'une option du navigateur.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion } from "../gabarit";
import { chargerContexteBail, liensLocataires, referenceCourte } from "./communs";
import { construireBailNu } from "./bail-nu";
import { construireBailMeuble, type LigneInventaire } from "./bail-meuble";
import type { Assemblage } from "./index";

export async function assemblerBailColocation(supabase: SupabaseClient, orgId: string, bailId: string): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  if (ctx.bail.type !== "colocation") return { erreur: "Ce modèle est réservé au contrat commun de colocation." };
  if (ctx.bail.etat !== "brouillon") return { erreur: "Le contrat initial se prépare en brouillon. Pour un bail signé, préparez un avenant." };
  if (!ctx.bail.locataire_principal || !ctx.locataires.some(p => p.id === ctx.bail.locataire_principal)) {
    return { erreur: "Renseignez d'abord le locataire principal du bail." };
  }
  if (new Set(ctx.locataires.map(p => p.id)).size < 2) {
    return { erreur: "Ajoutez au moins un colocataire au locataire principal dans la carte Colocation." };
  }
  const { data: dpe, error: erreurDpe } = await supabase.from("diagnostics").select("classe_dpe")
    .eq("lot_id", ctx.lot.id).eq("type", "dpe").is("archived_at", null)
    .order("date_realisation", { ascending: false }).limit(1).maybeSingle();
  if (erreurDpe) return { erreur: "Le diagnostic ne peut pas être vérifié. Réessayez avant de générer le contrat." };
  let inventaire: LigneInventaire[] = [];
  if (ctx.lot.meuble) {
    const { data, error } = await supabase.from("inventaire_lignes")
      .select("piece, designation, quantite, etat, observation").eq("bail_id", bailId).order("ordre");
    if (error) return { erreur: "L'inventaire ne peut pas être lu. Réessayez avant de générer le contrat." };
    inventaire = data ?? [];
  }
  const options = { dpeClasse: dpe?.classe_dpe ?? null, f: new Fusion(), inventaire };
  const document = ctx.lot.meuble ? construireBailMeuble(ctx, options) : construireBailNu(ctx, options);
  const regime = ctx.lot.meuble ? "meublé" : "nu";
  return {
    document,
    titreGed: `Colocation — bail commun ${regime} (à faire signer)`,
    nomFichier: `colocation-${ctx.lot.meuble ? "meuble" : "nu"}-${referenceCourte("BAIL", bailId).toLowerCase()}`,
    liens: [{ entite: "bail", entiteId: bailId }, { entite: "lot", entiteId: ctx.lot.id }, ...liensLocataires(ctx)],
  };
}
