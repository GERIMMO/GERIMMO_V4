"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant, verifierLocataire } from "@/lib/ged-acces";
import { aujourdhuiParis } from "@/lib/ged";
import { sansJargon } from "@/lib/erreurs";
import { estUuid } from "@/lib/identifiants";
import { resoudreDepotsFormulaire } from "@/lib/depot-direct";
import { deposerFichierGed } from "@/lib/ged-depot";
import { saisieCompteur, saisieContrat, saisieFacture, texteConso, dateConso } from "@/lib/saisie-consommations";
import { indexEnMillUnites } from "@/lib/consommations";
import { lireCollectionConsommations } from "@/lib/lecture-consommations";

export type EtatConsommations = { erreur?: string; succes?: string; documentId?: string; documentEmpreinte?: string; synchronisationAReprendre?: boolean };
function actualiser(org: string) {
  revalidatePath(`/agence/${org}`, "layout");
  revalidatePath(`/espace/${org}`, "layout");
  revalidatePath(`/locataire/${org}`, "layout");
}
function id(f: FormData, cle: string, facultatif = false): string | null {
  const v = texteConso(f, cle);
  if (!v && facultatif) return null;
  if (!estUuid(v)) throw new Error("Cette fiche n’est plus disponible. Rechargez la page.");
  return v;
}

export async function enregistrerConsommation(orgId: string, bienId: string, lotId: string | null, _etat: EtatConsommations, f: FormData): Promise<EtatConsommations> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: lotId ?? bienId });
  if (!user || ![orgId, bienId, ...(lotId ? [lotId] : [])].every(estUuid)) return { erreur: "Accès refusé." };
  try {
    // Le contexte appartient au serveur ; les clés de formulaire n'accordent aucun droit.
    const { data: bien, error: erreurBien } = await supabase.from("biens").select("id").eq("id", bienId).eq("organization_id", orgId).maybeSingle();
    if (!bien || erreurBien) return { erreur: "Ce bien n’est pas accessible." };
    const action = texteConso(f, "action");
    const cible = id(f, "id", true);
    const scopeLot = lotId ?? id(f, "lot_id", true);
    if (scopeLot) {
      const l = await supabase.from("lots").select("id").eq("id", scopeLot).eq("organization_id", orgId).eq("bien_id", bienId).maybeSingle();
      if (l.error || !l.data) return { erreur: "Ce logement n’est pas accessible depuis cette fiche." };
    }
    // Vérifier le contexte avant toute mutation ou RPC, même si un autre identifiant du portefeuille est forgé.
    if (cible && ["compteur", "releve", "archiver_compteur", "contrat", "archiver_contrat", "facture_payee"].includes(action)) {
      let contratCible = cible;
      if (action === "facture_payee") {
        const facture = await supabase.from("factures_fourniture").select("contrat_id").eq("organization_id", orgId).eq("id", cible).maybeSingle();
        if (facture.error || !facture.data) return { erreur: "Cette facture n’est pas accessible." };
        contratCible = facture.data.contrat_id;
      }
      const table = ["compteur", "releve", "archiver_compteur"].includes(action) ? "compteurs_consommation" : "contrats_fourniture";
      let q = supabase.from(table).select("id,lot_id").eq("organization_id", orgId).eq("bien_id", bienId).eq("id", contratCible);
      if (lotId) q = q.eq("lot_id", lotId);
      const r = await q.maybeSingle();
      if (r.error || !r.data) return { erreur: "Cet élément n’est pas accessible depuis cette fiche." };
    }
    let erreur: { message: string } | null = null;
    if (action === "compteur") {
      const saisie = saisieCompteur(f, aujourdhuiParis());
      const bail = id(f, "bail_referent", true);
      let personne: string | null = null;
      if (bail) {
        const { data } = await supabase.from("baux").select("locataire_principal").eq("id", bail).eq("organization_id", orgId).eq("lot_id", scopeLot ?? "").in("etat", ["actif", "preavis"]).maybeSingle();
        if (!data?.locataire_principal) return { erreur: "Choisissez un bail en cours pour demander les relevés au locataire." };
        personne = data.locataire_principal;
      }
      const row = { ...saisie, organization_id: orgId, bien_id: bienId, lot_id: scopeLot, bail_referent: bail, personne_referente: personne };
      const q = cible ? supabase.from("compteurs_consommation").update(row).eq("id", cible).eq("organization_id", orgId).eq("bien_id", bienId) : supabase.from("compteurs_consommation").insert(row);
      const r = await q.select("id").single(); erreur = r.error;
      if (!erreur) {
        const r = await supabase.rpc("synchroniser_demandes_releves", { p_org: orgId });
        if (r.error) {
          actualiser(orgId);
          return { erreur: "Compteur enregistré. Les demandes n’ont pas pu être mises à jour : réessayez leur synchronisation.", synchronisationAReprendre: true };
        }
      }
    } else if (action === "contrat") {
      const row = { ...saisieContrat(f), organization_id: orgId, bien_id: bienId, lot_id: scopeLot };
      const q = cible ? supabase.from("contrats_fourniture").update(row).eq("id", cible).eq("organization_id", orgId).eq("bien_id", bienId) : supabase.from("contrats_fourniture").insert(row);
      erreur = (await q.select("id").single()).error;
    } else if (action === "facture") {
      const saisie = saisieFacture(f);
      const contrat = id(f, "contrat_id")!;
      const { data } = await supabase.from("contrats_fourniture").select("id,lot_id").eq("id", contrat).eq("organization_id", orgId).eq("bien_id", bienId).maybeSingle();
      if (!data || (lotId && data.lot_id !== lotId)) return { erreur: "Ce contrat n’est pas accessible depuis cette fiche." };
      // Le document peut être repris après une erreur de validation, sans dépôt en double.
      let docId = id(f, "document_id", true);
      if (!docId) {
        const e = await resoudreDepotsFormulaire(supabase, f); if (e) return { erreur: e };
        const fichier = f.get("document");
        if (!(fichier instanceof File) || !fichier.size) return { erreur: "Joignez la facture." };
        const dep = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", `Facture ${saisie.reference}`);
        if (!dep.documentId && !dep.doublonId) return { erreur: dep.erreur ?? "Le document n’a pas pu être enregistré." };
        docId = dep.documentId ?? dep.doublonId!;
      }
      const document = await supabase.from("documents").select("id,empreinte").eq("organization_id", orgId).eq("id", docId).is("purged_at", null).maybeSingle();
      if (document.error || !document.data) return { erreur: "Ce justificatif n’est pas accessible dans ce dossier." };
      const logements = data.lot_id ? { data: [{ id: data.lot_id }], error: null } : await lireCollectionConsommations<{ id: string }>((debut, fin) => supabase.from("lots").select("id", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", bienId).order("id").range(debut, fin));
      const reprise = { documentId: docId, documentEmpreinte: document.data.empreinte as string };
      if (logements.error) return { erreur: "Le document est conservé, mais les logements n’ont pas pu être vérifiés. Réessayez.", ...reprise };
      if (logements.data.length) {
        const liens = await supabase.from("document_liens").upsert(logements.data.map(l => ({ organization_id: orgId, document_id: docId, entite: "lot", entite_id: l.id })), { onConflict: "document_id,entite,entite_id", ignoreDuplicates: true });
        if (liens.error) return { erreur: `Le document est conservé, mais son classement dans le bien a échoué : ${sansJargon(liens.error.message)}`, ...reprise };
      }
      const { error } = await supabase.from("factures_fourniture").insert({ ...saisie, organization_id: orgId, contrat_id: contrat, document_id: docId });
      if (error) return { erreur: sansJargon(error.message), ...reprise };
    } else if (action === "releve" && cible) {
      const valeur = texteConso(f, "index").replace(",", "."); indexEnMillUnites(valeur);
      erreur = (await supabase.rpc("enregistrer_releve_compteur", { p_org: orgId, p_compteur: cible, p_index: valeur, p_date: dateConso(texteConso(f, "date")) })).error;
    } else if (["archiver_compteur", "archiver_contrat"].includes(action) && cible) {
      erreur = (await supabase.from(action === "archiver_compteur" ? "compteurs_consommation" : "contrats_fourniture").update({ actif: false }).eq("organization_id", orgId).eq("bien_id", bienId).eq("id", cible).select("id").single()).error;
    } else if (action === "facture_payee" && cible) {
      const date = dateConso(texteConso(f, "date"))!;
      if (date > aujourdhuiParis()) return { erreur: "La date de paiement ne peut pas être dans le futur." };
      erreur = (await supabase.rpc("payer_facture_fourniture", { p_org: orgId, p_facture: cible, p_date: date })).error;
    } else if (action === "synchroniser") {
      erreur = (await supabase.rpc("synchroniser_demandes_releves", { p_org: orgId })).error;
      if (erreur) return { erreur: "Les demandes n’ont pas pu être synchronisées. Le compteur est enregistré ; vous pouvez réessayer.", synchronisationAReprendre: true };
    } else return { erreur: "Action inconnue." };
    if (erreur) return { erreur: sansJargon(erreur.message) };
    actualiser(orgId);
    return { succes: action === "compteur" ? "Compteur enregistré. Les demandes suivront la fréquence choisie." : action === "facture_payee" ? "Paiement enregistré dans les finances." : "Enregistré." };
  } catch (e) { return { erreur: e instanceof Error ? sansJargon(e.message) : "L’enregistrement a échoué. Votre saisie est conservée." }; }
}

export async function transmettreReleve(orgId: string, demandeId: string, _etat: EtatConsommations, f: FormData): Promise<EtatConsommations> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user || !estUuid(demandeId)) return { erreur: "Accès refusé." };
  try {
    const valeur = texteConso(f, "index").replace(",", "."); indexEnMillUnites(valeur);
    const date = dateConso(texteConso(f, "date"))!;
    if (date > aujourdhuiParis()) return { erreur: "Un relevé ne peut pas être daté dans le futur." };
    // La fonction SQL vérifie l’attribution de cette demande à la personne connectée.
    let photo: string | null = null;
    const fichier = f.get("photo");
    if (fichier instanceof File && fichier.size > 0) {
      const { joindrePhotoReleve } = await import("@/lib/photo-releve");
      const dep = await joindrePhotoReleve(supabase, demandeId, fichier);
      if (dep.erreur) return { erreur: dep.erreur };
      photo = dep.documentId ?? null;
    }
    const { error } = await supabase.rpc("soumettre_releve_consommation", { p_demande: demandeId, p_index: valeur, p_date: date, p_photo: photo });
    if (error) return { erreur: sansJargon(error.message) };
    actualiser(orgId); return { succes: "Relevé transmis à votre gestionnaire." };
  } catch (e) { return { erreur: e instanceof Error ? sansJargon(e.message) : "Le relevé n’a pas pu être transmis." }; }
}
