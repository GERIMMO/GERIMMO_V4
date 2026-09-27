"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { adresseDeRetour, origineDeRetour } from "@/lib/site";
import { CONDITIONS_VERSION } from "@/lib/editeur";
import { sansJargon } from "@/lib/erreurs";
import { classerErreurInscription } from "@/lib/inscription";

export type EtatInvitationProprietaire = { erreur?: string; succes?: string; lien?: string };

export async function preparerInvitationProprietaire(orgId: string, personId: string, _etat: EtatInvitationProprietaire, form: FormData): Promise<EtatInvitationProprietaire> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "admin_agence") return { erreur: "Seul le responsable de l’agence peut gérer cet accès." };
  if (!form.get("confirmation")) return { erreur: "Confirmez le destinataire et le périmètre avant de préparer le lien." };
  const { data, error } = await supabase.rpc("preparer_invitation_proprietaire", { p_org: orgId, p_person: personId });
  if (error) return { erreur: sansJargon(error.message) };
  const h = await headers();
  const origine = origineDeRetour(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")) ?? "";
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { lien: `${origine}/proprietaire-invite/accepter?invitation=${encodeURIComponent(String(data))}`, succes: "Lien prêt pour 7 jours. Copiez-le et transmettez-le au destinataire. Aucun e-mail n’a été envoyé. Tout ancien lien ou accès de cette fiche est remplacé." };
}

export async function revoquerInvitationProprietaire(orgId: string, personId: string, _etat: EtatInvitationProprietaire, form: FormData): Promise<EtatInvitationProprietaire> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "admin_agence") return { erreur: "Seul le responsable de l’agence peut gérer cet accès." };
  if (!form.get("confirmation")) return { erreur: "Confirmez la fermeture de cet accès." };
  const { error } = await supabase.rpc("revoquer_invitation_proprietaire", { p_org: orgId, p_person: personId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  revalidatePath(`/proprietaire-invite/${orgId}`);
  return { succes: "L’accès et le lien ont été fermés. Les données restent conservées par l’agence." };
}

export async function accepterInvitationProprietaire(jeton: string, _etat: EtatInvitationProprietaire, form: FormData): Promise<EtatInvitationProprietaire> {
  if (!form.get("confirmation")) return { erreur: "Confirmez l’ouverture de cet accès en consultation." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { erreur: "Connectez-vous avec l’adresse invitée pour continuer." };
  const { data: org, error } = await db.rpc("accepter_invitation_proprietaire", { p_jeton: jeton });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/espaces");
  redirect(`/proprietaire-invite/${String(org)}`);
}

/** Crée seulement le compte Auth demandé par l'invité, jamais une organisation. */
export async function creerCompteProprietaireInvite(jeton: string, _etat: EtatInvitationProprietaire, form: FormData): Promise<EtatInvitationProprietaire> {
  if (!/^[0-9a-f]{64}$/.test(jeton)) return { erreur: "Lien d’invitation invalide." };
  const nom = String(form.get("nom") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("mot_de_passe") ?? "");
  if (!nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: "Renseignez votre nom et l’adresse e-mail invitée." };
  if (password.length < 12) return { erreur: "Choisissez un mot de passe d’au moins 12 caractères." };
  if (password !== String(form.get("confirmation_mot_de_passe") ?? "")) return { erreur: "Les deux mots de passe ne correspondent pas." };
  if (!form.get("cgu")) return { erreur: "Acceptez les conditions d’utilisation pour créer votre compte." };
  const db = await createClient();
  const suite = `/proprietaire-invite/accepter?invitation=${jeton}`;
  const { data, error } = await db.auth.signUp({ email, password, options: {
    data: { nom, espace: "proprietaire_invite", cgu_version: CONDITIONS_VERSION, cgu_acceptee_le: new Date().toISOString() },
    emailRedirectTo: `${adresseDeRetour()}/auth/confirm?next=${encodeURIComponent(suite)}`,
  } });
  if (error) {
    const issue = classerErreurInscription(error);
    if (issue.type === "mot_de_passe_faible") return { erreur: issue.erreur };
    if (issue.type !== "adresse_deja_inscrite") return { erreur: `Inscription impossible : ${sansJargon(issue.message)}` };
  }
  if (data?.session) redirect(suite);
  return { succes: "Si une confirmation est nécessaire, consultez votre boîte mail pour vérifier votre adresse, puis revenez à ce lien. Si vous avez déjà un compte, utilisez « Me connecter ». Aucun abonnement personnel n’est ouvert." };
}
