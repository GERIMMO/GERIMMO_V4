"use server";

import { ventilerTeom } from "@/lib/ventilation-teom";
import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { remettreRapportMensuel } from "@/lib/rapports-mensuels";
import { aujourdhuiParis } from "@/lib/ged";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { erreurDuChamp, lireMontant, lireMontantFacultatif } from "@/lib/saisie-montant";
import { estRejeuCleEnvoi, lireCleEnvoi, messageDejaEnregistre } from "@/lib/cle-envoi";

export type EtatCompta = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
  documentId?: string;
  // D05, PR178-B-06 : cet envoi (même clé) était déjà enregistré. `succes` le dit ; rien n'a été écrit de plus.
  dejaEnregistre?: boolean;
};

// Générer le rapport de gestion d'un mandat pour un mois (clôture requise).
export async function genererRapport(
  orgId: string,
  mandatId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const mois = String(formData.get("mois") ?? "").trim();
  if (!mois) return { erreur: "Choisissez le mois.", valeurs };
  const { error } = await supabase.rpc("generer_rapport", { p_mandat: mandatId, p_mois: `${mois}-01` });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  revalidatePath(`/agence/${orgId}/mandats`);
  return { succes: "Rapport généré (à valider)." };
}

// Valider et envoyer le rapport au mandant (fige + email + alerte versement J+15).
export async function envoyerRapport(
  orgId: string,
  rapportId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;
  const resultat = await remettreRapportMensuel(supabase, user, orgId, rapportId, commentaire, role ?? "");
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  revalidatePath(`/agence/${orgId}/mandats`);
  revalidatePath(`/agence/${orgId}/documents`);
  return { ...resultat, ...(resultat.erreur ? { valeurs } : {}) };
}

export async function enregistrerVersement(
  orgId: string,
  rapportId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const montantSaisi = String(formData.get("montant") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!montantSaisi || !date) return { erreur: "Montant et date du versement obligatoires.", valeurs };
  // Lu sur le texte tel que tapé (« 840,00 » vaut 840) : le champ est en `type="text"`, jamais `type="number"`
  // qui donne 84000 à un navigateur non francophone (VFL-07).
  const lu = lireMontant(montantSaisi);
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  const { error } = await supabase.rpc("enregistrer_versement", {
    p_rapport: rapportId,
    p_montant: lu.montant,
    p_date: date,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  revalidatePath(`/agence/${orgId}/mandats`);
  return { succes: "Versement enregistré." };
}

export async function ajouterEcriture(
  orgId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const categorie = String(formData.get("categorie") ?? "").trim();
  const sens = String(formData.get("sens") ?? "");
  const lu = lireMontant(formData.get("montant"));
  if (!categorie) return { erreur: "Catégorie obligatoire.", valeurs };
  if (sens !== "recette" && sens !== "depense") return { erreur: "Sens invalide.", valeurs };
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  const montant = lu.montant;
  // La part de TEOM se lit sur le texte tel que tapé (« 168,50 » vaut 168,5) : champ en `type="text"` (VER-TS-02).
  // Vide : pas de TEOM, zéro. Un texte illisible est refusé en disant quoi écrire.
  const teomLue = lireMontantFacultatif(formData.get("teom"));
  if ("erreur" in teomLue) return { erreur: erreurDuChamp("Part de TEOM", teomLue.erreur), valeurs };
  let parts;
  try {
    parts = ventilerTeom(montant, teomLue.montant ?? 0, categorie, sens);
  } catch (erreur) {
    return { erreur: (erreur as Error).message, valeurs };
  }
  // D05 (PR178-B-06) : la même saisie ne s'écrit qu'une fois. La clé du formulaire est posée sur la PREMIÈRE ligne
  // (une saisie ventilée en écrit deux, dans une seule instruction : le rejeu est refusé tout entier).
  const cleLue = lireCleEnvoi(formData.get("cle_envoi"));
  if ("erreur" in cleLue) return { erreur: cleLue.erreur, valeurs };
  const cle = cleLue.cle;
  const dejaEnregistree = async (): Promise<EtatCompta> => {
    const { data: ligne } = await supabase
      .from("ecritures")
      .select("montant, date_piece")
      .eq("organization_id", orgId)
      .eq("cle_envoi", cle)
      .maybeSingle();
    revalidatePath(`/agence/${orgId}/comptabilite`);
    revalidatePath(`/agence/${orgId}/loyers`);
    return {
      succes: messageDejaEnregistre({
        objet: "Cette écriture",
        feminin: true,
        // Une saisie ventilée porte la clé sur sa première ligne seulement : son montant n'est pas celui de la saisie.
        montant: ligne && parts.length === 1 ? Number(ligne.montant) : null,
        date: ligne && parts.length === 1 ? ligne.date_piece : null,
      }),
      dejaEnregistre: true,
    };
  };
  const { data: connue, error: erreurLecture } = await supabase
    .from("ecritures")
    .select("montant")
    .eq("organization_id", orgId)
    .eq("cle_envoi", cle)
    .maybeSingle();
  if (erreurLecture) {
    return { erreur: "Impossible de vérifier que cette écriture n'est pas déjà enregistrée. Réessayez.", valeurs };
  }
  if (connue) return dejaEnregistree();
  const { error } = await supabase.from("ecritures").insert(parts.map((part, rang) => ({
    organization_id: orgId,
    ...part,
    sens,
    date_piece: String(formData.get("date_piece") ?? "").trim() || undefined,
    date_imputation: String(formData.get("date_imputation") ?? "").trim() || undefined,
    libelle: String(formData.get("libelle") ?? "").trim() || null,
    lot_id: String(formData.get("lot_id") ?? "").trim() || null,
    cle_envoi: rang === 0 ? cle : null,
  })));
  if (error) {
    // Deux envois de la même clé se sont croisés : l'autre a gagné, celui-ci n'a rien écrit.
    if (estRejeuCleEnvoi(error)) return dejaEnregistree();
    return { erreur: sansJargon(error.message), valeurs };
  }
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  // Le journal alimente aussi le récapitulatif fiscal du propriétaire direct.
  revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);
  return { succes: "Écriture enregistrée." };
}

export async function passerContreEcriture(
  orgId: string,
  ecritureId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  const { error } = await supabase.rpc("contre_ecriture", { p_ecriture: ecritureId, p_motif: motif });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);
  return { succes: "Contre-écriture passée." };
}

// Ventiler une dépense au niveau du bien : une écriture par lot via la clé.
export async function ventilerDepense(
  orgId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const bienId = String(formData.get("bien_id") ?? "");
  const categorie = String(formData.get("categorie") ?? "").trim();
  const lu = lireMontant(formData.get("montant"));
  if (!bienId) return { erreur: "Choisissez le bien.", valeurs };
  if (!categorie) return { erreur: "Catégorie obligatoire.", valeurs };
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  const montant = lu.montant;
  const { data, error } = await supabase.rpc("ventiler_depense_bien", {
    p_bien: bienId,
    p_categorie: categorie,
    p_montant: montant,
    p_date_piece: String(formData.get("date_piece") ?? "").trim() || aujourdhuiParis(),
    p_date_imputation: String(formData.get("date_imputation") ?? "").trim() || aujourdhuiParis(),
    p_libelle: String(formData.get("libelle") ?? "").trim() || categorie,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);
  return { succes: `Dépense ventilée en ${data ?? 0} écriture(s).` };
}

export async function cloturerMois(
  orgId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const mois = String(formData.get("mois") ?? "").trim();
  if (!mois) return { erreur: "Mois obligatoire.", valeurs };
  const { error } = await supabase.rpc("cloturer_mois", { p_org: orgId, p_mois: `${mois}-01` });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/loyers`);
  return { succes: "Mois clôturé." };
}
