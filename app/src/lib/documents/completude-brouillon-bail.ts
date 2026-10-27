import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion } from "./gabarit";
import { construireBailMeuble, type LigneInventaire } from "./modeles/bail-meuble";
import { construireBailNu } from "./modeles/bail-nu";
import { adresseOrganisation, adressePersonne, chargerContexteBail } from "./modeles/communs";

export type CompletudeBrouillonBail = { erreur?: string; manquants: string[] };
/** Mentions du profil de l’organisation (en-tête du contrat), à compléter depuis le profil. */
export const MANQUE_ADRESSE_PROFIL = "adresse de l’organisation (profil)";
export const MANQUE_EMAIL_PROFIL = "adresse électronique de l’organisation (profil)";

/** Le brouillon se contrôle avant de connaître tous ses signataires.
 * Les constructeurs partagés recensent les mentions absentes ; les assembleurs
 * de génération conservent séparément leurs prérequis pour produire un contrat.
 */
export async function verifierCompletudeBrouillonBail(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
): Promise<CompletudeBrouillonBail> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return { erreur: ctx.erreur, manquants: [] };
  const { bail } = ctx;
  if (!["nu", "meuble", "colocation"].includes(bail.type)) {
    return { erreur: "Ce type de bail ne peut pas être vérifié.", manquants: [] };
  }
  if (bail.etat !== "brouillon") {
    return { erreur: "Le contrat initial se prépare en brouillon. Pour un bail signé, préparez un avenant.", manquants: [] };
  }
  if (bail.chambre_id && (bail.type !== "colocation" || !ctx.chambre)) {
    return { erreur: "La chambre de ce contrat individuel ne peut pas être vérifiée.", manquants: [] };
  }
  // Une référence existante mais illisible est une erreur de source, pas un
  // locataire que l'utilisateur aurait simplement oublié de renseigner.
  if (bail.locataire_principal && !ctx.locataires.some((p) => p.id === bail.locataire_principal)) {
    return { erreur: "Le locataire principal ne peut pas être vérifié. Réessayez.", manquants: [] };
  }
  if (bail.chambre_id && ctx.locataires.length > 1) {
    return { erreur: "Le contrat individuel doit désigner un seul locataire.", manquants: [] };
  }

  const { data: dpe, error: erreurDpe } = await supabase.from("diagnostics").select("classe_dpe")
    .eq("lot_id", ctx.lot.id).eq("type", "dpe").is("archived_at", null)
    .order("date_realisation", { ascending: false }).limit(1).maybeSingle();
  if (erreurDpe) return { erreur: "Le diagnostic du logement ne peut pas être vérifié. Réessayez.", manquants: [] };

  const meuble = bail.type === "meuble" || (bail.type === "colocation" && ctx.lot.meuble);
  let inventaire: LigneInventaire[] = [];
  if (meuble) {
    const { data, error } = await supabase.from("inventaire_lignes")
      .select("piece, designation, quantite, etat, observation").eq("bail_id", bailId).order("ordre");
    if (error) return { erreur: "L'inventaire ne peut pas être vérifié. Réessayez.", manquants: [] };
    inventaire = data ?? [];
  }

  const options = { dpeClasse: dpe?.classe_dpe ?? null, inventaire, f: new Fusion() };
  const document = meuble ? construireBailMeuble(ctx, options) : construireBailNu(ctx, options);
  const manquants = new Set(document.manquants);
  // La première échéance se calcule avec la date d’entrée, déjà signalée :
  // le montant au prorata ne vise pas un loyer déjà saisi (CB-06).
  if (!bail.date_debut && bail.loyer_hc != null && bail.charges != null) manquants.delete("loyer + charges, montant au prorata");
  // L’en-tête reprend le profil de l’organisation sous les libellés des parties :
  // un manque du seul profil n’est imputé ni au propriétaire ni au locataire (CB-04).
  const bailleur = ctx.bailleurs[0] ?? null;
  if (!adresseOrganisation(ctx.organisation)) {
    if (adressePersonne(bailleur)) manquants.delete("domicile ou siège social");
    manquants.add(MANQUE_ADRESSE_PROFIL);
  }
  if (!ctx.organisation.email_contact) {
    if (bailleur?.email && ctx.locataires.every((p) => p.email)) manquants.delete("adresse électronique");
    manquants.add(MANQUE_EMAIL_PROFIL);
  }
  if (!bail.locataire_principal) manquants.add("nom et prénom(s)");
  if (bail.type === "colocation" && !bail.chambre_id && new Set(ctx.locataires.map((p) => p.id)).size < 2) {
    manquants.add("nom du colocataire 2");
  }
  return { manquants: [...manquants] };
}
