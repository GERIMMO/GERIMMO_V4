import { presentationArchivee, typographieArchivee, type OptionsContrat } from "./communs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion } from "../gabarit";
import { chargerContexteBail, liensLocataires, referenceCourte } from "./communs";
import { construireBailNu } from "./bail-nu";
import { construireBailMeuble, type LigneInventaire } from "./bail-meuble";
import type { Assemblage } from "./index";

export async function assemblerBailIndividuel(supabase: SupabaseClient, orgId: string, bailId: string, format: OptionsContrat = {}): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  if (ctx.bail.type !== "colocation" || !ctx.bail.chambre_id || !ctx.chambre) return { erreur: "Choisissez un contrat individuel rattaché à une chambre." };
  if (ctx.bail.etat !== "brouillon") return { erreur: "Le contrat initial se prépare en brouillon. Utilisez un avenant pour un contrat signé." };
  // Phase 3, lot 46 (reprise, T21) : sans locataire principal, le contrat est INCOMPLET (« nom et prénom(s) », comme le contrôle
  // du brouillon), plus refusé. Plusieurs locataires, ou un principal désigné qui n'est pas le locataire lu, restent un refus :
  // aucune saisie ne complète un contrat individuel qui en désigne deux.
  const f = new Fusion();
  if (ctx.locataires.length > 1 || (ctx.bail.locataire_principal && ctx.locataires[0]?.id !== ctx.bail.locataire_principal)) return { erreur: "Le contrat individuel doit désigner un seul locataire." };
  if (!ctx.bail.locataire_principal) f.champ(null, "nom et prénom(s)");
  const { data: dpe, error } = await supabase.from("diagnostics").select("classe_dpe").eq("lot_id", ctx.lot.id).eq("type", "dpe").is("archived_at", null).order("date_realisation", { ascending: false }).limit(1).maybeSingle();
  if (error) return { erreur: "Le diagnostic du logement ne peut pas être vérifié." };
  let inventaire: LigneInventaire[] = [];
  if (ctx.lot.meuble) {
    const { data, error } = await supabase.from("inventaire_lignes").select("piece, designation, quantite, etat, observation").eq("bail_id", bailId).order("ordre");
    if (error) return { erreur: "L’inventaire de ce contrat ne peut pas être chargé." };
    inventaire = data ?? [];
  }
  const options = { presentationAncienne: format[presentationArchivee], typographieArchivee: format[typographieArchivee], f, dpeClasse: dpe?.classe_dpe ?? null, inventaire };
  return {
    document: ctx.lot.meuble ? construireBailMeuble(ctx, options) : construireBailNu(ctx, options),
    titreGed: `Contrat individuel ${ctx.lot.meuble ? "meublé" : "nu"} — ${ctx.chambre.nom} (à faire signer)`,
    nomFichier: `contrat-individuel-${referenceCourte("BAIL", bailId).toLowerCase()}`,
    liens: [{ entite: "bail", entiteId: bailId }, { entite: "lot", entiteId: ctx.lot.id }, ...liensLocataires(ctx)],
  };
}
