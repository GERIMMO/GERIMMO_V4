"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { creerPersonne, modifierPersonne, type EtatPersonne } from "./personnes";
import { supprimerBailPersonne } from "./baux";
import { estMineur } from "@/lib/validation-fiches";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";

export type EtatPersonnesBail = EtatPersonne & {
  personneCreee?: { id: string };
  /** La fiche créée depuis l'assistant a été rattachée au bail dans le même geste (BAIL-24). */
  rattachee?: boolean;
};

const ROLES_BAIL = ["principal", "colocataire", "garant"];
const libelleRole = (role: string) => (role === "garant" ? "Garant ajouté au bail." : "Locataire enregistré dans le bail.");

// Un locataire ou un garant mineur : avertissement fort, pas un refus (règle de capacité non documentée dans le
// wiki ; un mineur émancipé peut contracter) — audit final, BAIL-07.
function avertissementMineur(personne: { nom: string; prenom: string | null; date_naissance: string | null }, role: string): string | undefined {
  if (!estMineur(personne.date_naissance, aujourdhuiParis())) return undefined;
  return `${nomComplet(personne)} est mineur·e (né·e le ${formaterDate(personne.date_naissance)}). ${role === "garant" ? "Un garant" : "Un locataire"} doit en principe être majeur pour s’engager par contrat : vérifiez sa situation avant de poursuivre.`;
}

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
  const { data: fiche } = await ctx.supabase.from("persons").select("nom, prenom, date_naissance").eq("id", personne).eq("organization_id", orgId).maybeSingle();
  return { succes: libelleRole(role), avertissement: fiche ? avertissementMineur(fiche, role) : undefined };
}

export async function creerPersonneBail(orgId: string, bailId: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  const ctx = await contexte(orgId, bailId);
  if (!ctx) return { erreur: "Ce brouillon n’est pas accessible ou a déjà été signé." };
  // Le rôle au bail demandé par l'assistant : la fiche est créée ET rattachée dans le même geste, pour qu'un
  // rechargement ne laisse pas une fiche orpheline sans garant au bail (audit final, BAIL-24).
  const role = String(form.get("role") ?? "");
  const rattachement = ROLES_BAIL.includes(role) ? {
    p_role: role, p_garant_de: String(form.get("garant_de") ?? "") || null, p_principal_attendu: String(form.get("principal_attendu") ?? "") || null,
  } : null;
  // Réutiliser les validations de l’annuaire, sans déclencher un rattachement
  // propriétaire hors du formulaire dédié ni quitter l’assistant.
  form.delete("role"); form.delete("lot_id"); form.delete("garant_de"); form.delete("principal_attendu");
  form.set("rester_dans_parcours", "1");
  const retour = await creerPersonne(orgId, {}, form);
  if (!retour.succes) return retour;
  actualiser(orgId, bailId);
  const fiche = { nom: String(form.get("nom") ?? ""), prenom: String(form.get("prenom") ?? "") || null, date_naissance: String(form.get("date_naissance") ?? "") || null };
  const mineur = rattachement ? avertissementMineur(fiche, role) : undefined;
  if (!rattachement || !retour.personneCreee?.id) return { ...retour, avertissement: [retour.avertissement, mineur].filter(Boolean).join(" ") || undefined };
  const { error } = await ctx.supabase.rpc("choisir_personne_bail", { p_bail: bailId, p_person: retour.personneCreee.id, ...rattachement });
  if (error) {
    // La fiche existe : on le dit, et l'assistant la propose à la sélection plutôt que de la recréer.
    return { ...retour, avertissement: [retour.avertissement, `La fiche est créée mais n’a pas pu être ajoutée au bail : ${sansJargon(error.message)} Choisissez-la dans la liste.`, mineur].filter(Boolean).join(" ") };
  }
  return { ...retour, rattachee: true, succes: `Fiche créée. ${libelleRole(role)}`, avertissement: [retour.avertissement, mineur].filter(Boolean).join(" ") || undefined };
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
