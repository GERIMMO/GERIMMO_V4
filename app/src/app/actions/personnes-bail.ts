"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { creerPersonne, modifierPersonne, type EtatPersonne } from "./personnes";
import { supprimerBailPersonne } from "./baux";

export type EtatPersonnesBail = EtatPersonne & { personneCreee?: { id: string } };

async function contexte(orgId: string, bailId: string) {
  const acces = await verifierGerant(orgId);
  if (!acces.user) return null;
  const { data, error } = await acces.supabase.from("baux").select("id,lot_id,etat")
    .eq("id", bailId).eq("organization_id", orgId).maybeSingle();
  if (error || data?.etat !== "brouillon") return null;
  return { ...acces, bail: data };
}
function actualiser(orgId: string, bailId: string) {
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/parc`, "layout");
  revalidatePath(`/agence/${orgId}/personnes`);
}

export async function choisirPersonneBail(orgId: string, bailId: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  const ctx = await contexte(orgId, bailId);
  if (!ctx) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  const role = String(form.get("role") ?? "");
  const personne = String(form.get("person_id") ?? "");
  if (!personne) return { erreur: "Choisissez une personne." };
  const { error } = await ctx.supabase.rpc("choisir_personne_bail", {
    p_bail: bailId, p_person: personne, p_role: role,
    p_garant_de: String(form.get("garant_de") ?? "") || null,
    p_principal_attendu: String(form.get("principal_attendu") ?? "") || null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  actualiser(orgId, bailId);
  return { succes: role === "garant" ? "Garant ajouté au bail." : "Locataire enregistré dans le bail." };
}

export async function creerPersonneBail(orgId: string, bailId: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  if (!await contexte(orgId, bailId)) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  // Réutiliser les validations de l’annuaire, sans déclencher un rattachement
  // propriétaire hors du formulaire dédié ni quitter l’assistant.
  form.delete("role"); form.delete("lot_id");
  form.set("rester_dans_parcours", "1");
  const retour = await creerPersonne(orgId, {}, form);
  if (retour.succes) actualiser(orgId, bailId);
  return retour;
}

export async function modifierPersonneBail(orgId: string, bailId: string, personId: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  if (!await contexte(orgId, bailId)) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  const retour = await modifierPersonne(orgId, personId, {}, form);
  if (retour.succes) actualiser(orgId, bailId);
  return retour;
}

export async function retirerPersonneBail(orgId: string, bailId: string, ligneId: string): Promise<EtatPersonnesBail> {
  if (!await contexte(orgId, bailId)) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  return supprimerBailPersonne(orgId, bailId, ligneId);
}

export async function enregistrerProprietairesBail(orgId: string, bailId: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  const ctx = await contexte(orgId, bailId);
  if (!ctx) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  let proprietaires: unknown, attendus: unknown;
  try {
    proprietaires = JSON.parse(String(form.get("proprietaires") ?? "null"));
    attendus = JSON.parse(String(form.get("attendus") ?? "[]"));
  } catch { return { erreur: "La répartition est illisible. Rechargez le dossier." }; }
  const { error } = await ctx.supabase.rpc("enregistrer_proprietaires_bail", {
    p_bail: bailId, p_proprietaires: proprietaires, p_attendus: attendus,
  });
  if (error) return { erreur: sansJargon(error.message) };
  actualiser(orgId, bailId);
  return { succes: "Propriétaires enregistrés." };
}
