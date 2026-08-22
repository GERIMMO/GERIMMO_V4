"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { envoyerEmail } from "@/lib/email";
import { aujourdhuiParis, eur } from "@/lib/ged";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatCompta = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
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
  return { succes: "Rapport généré (à valider)." };
}

// Valider et envoyer le rapport au mandant (fige + email + alerte versement J+15).
export async function envoyerRapport(
  orgId: string,
  rapportId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;
  const { error } = await supabase.rpc("envoyer_rapport", { p_rapport: rapportId, p_commentaire: commentaire });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  // Email au mandant (best-effort : le rapport est figé quoi qu'il arrive)
  const { data: rap } = await supabase
    .from("rapports_gestion")
    .select("net, mois, mandat:mandats(person:persons(email, nom, prenom))")
    .eq("id", rapportId)
    .maybeSingle();
  const mandant = (rap as { mandat?: { person?: { email?: string; nom?: string; prenom?: string } } } | null)?.mandat?.person;
  let noteEmail = "";
  if (mandant?.email) {
    const net = Number((rap as { net: number }).net);
    const html = `<div style="font-family:sans-serif"><h2>Rapport de gestion</h2>
      <p>Bonjour${mandant.prenom ? " " + mandant.prenom : ""},</p>
      <p>Votre rapport de gestion est disponible. Net à reverser : <strong>${eur(net)}</strong>${net < 0 ? " (appel de fonds)" : ""}.</p>
      ${commentaire ? `<p>${commentaire}</p>` : ""}<p>— Votre agence</p></div>`;
    const env = await envoyerEmail({ to: mandant.email, subject: "Votre rapport de gestion", html });
    noteEmail = env.erreur ? ` (email non envoyé : ${env.erreur})` : " Email envoyé au mandant.";
  } else {
    noteEmail = " (mandant sans email — remise hors plateforme.)";
  }
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: `Rapport envoyé et figé.${noteEmail}` };
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
  const montant = Number(String(formData.get("montant") ?? "").trim());
  const date = String(formData.get("date") ?? "").trim();
  if (!montant || !date) return { erreur: "Montant et date du versement obligatoires.", valeurs };
  const { error } = await supabase.rpc("enregistrer_versement", {
    p_rapport: rapportId,
    p_montant: montant,
    p_date: date,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
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
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!categorie) return { erreur: "Catégorie obligatoire.", valeurs };
  if (sens !== "recette" && sens !== "depense") return { erreur: "Sens invalide.", valeurs };
  if (!montant || montant <= 0) return { erreur: "Montant invalide.", valeurs };
  const { error } = await supabase.from("ecritures").insert({
    organization_id: orgId,
    categorie,
    sens,
    montant,
    date_piece: String(formData.get("date_piece") ?? "").trim() || undefined,
    date_imputation: String(formData.get("date_imputation") ?? "").trim() || undefined,
    libelle: String(formData.get("libelle") ?? "").trim() || null,
    lot_id: String(formData.get("lot_id") ?? "").trim() || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/comptabilite`);
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
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!bienId) return { erreur: "Choisissez le bien.", valeurs };
  if (!categorie) return { erreur: "Catégorie obligatoire.", valeurs };
  if (!montant || montant <= 0) return { erreur: "Montant invalide.", valeurs };
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
  return { succes: "Mois clôturé." };
}
