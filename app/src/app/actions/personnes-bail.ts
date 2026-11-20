"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { estUuid } from "@/lib/identifiants";
import { LONGUEUR_MAX } from "@/lib/limites-saisie";
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
  for (const espace of ["agence", "espace"]) {
    revalidatePath(`/${espace}/${orgId}/baux/${bailId}`);
    revalidatePath(`/${espace}/${orgId}/parc`, "layout");
    revalidatePath(`/${espace}/${orgId}/personnes`);
  }
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
  // Le formulaire de l'étape dit pour qui la fiche est créée ; seul « locataire » est repris (décision du 20/11/2026 :
  // sa naissance est facultative sur la fiche, le contrat rédigé par Gerimmo la réclame). Ce rôle ne rattache rien.
  const pourLocataire = form.get("usage_bail") === "locataire";
  form.delete("role"); form.delete("lot_id"); form.delete("usage_bail");
  if (pourLocataire) form.set("role", "locataire");
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

/** Complète la fiche ancienne de la gérance depuis le bail, sans créer de pouvoir. */
export async function completerPrenomRepresentantBail(org: string, bail: string, personne: string, _etat: EtatPersonnesBail, form: FormData): Promise<EtatPersonnesBail> {
  const prenom = String(form.get("prenom") ?? "").trim();
  if (!prenom || [...prenom].length > LONGUEUR_MAX.prenom) {
    return { erreur: `Indiquez un prénom de ${LONGUEUR_MAX.prenom} caractères au plus.` };
  }
  if (!estUuid(personne)) return { erreur: "Fiche introuvable." };
  const ctx = await contexte(org, bail);
  if (!ctx || ctx.role !== "proprietaire_direct") return { erreur: "Ce brouillon n’est plus accessible." };

  const { data: fiche, error: lecture } = await ctx.supabase.from("persons")
    .select("prenom,qualite").eq("id", personne).eq("organization_id", org).is("archived_at", null).maybeSingle();
  if (lecture || !fiche || (fiche.qualite ?? "Personne physique") !== "Personne physique") {
    return { erreur: "La fiche de cette personne n’est plus disponible." };
  }
  if (fiche.prenom?.trim()) return { erreur: "Le prénom est déjà renseigné. Rechargez le bail pour sélectionner cette personne." };

  // La RLS de l’annuaire s’applique aussi à cette mise à jour. La valeur lue
  // empêche un deuxième envoi d’écraser un prénom renseigné entre-temps.
  const modification = ctx.supabase.from("persons").update({ prenom })
    .eq("id", personne).eq("organization_id", org).is("archived_at", null);
  const qualite = fiche.qualite === null ? modification.is("qualite", null) : modification.eq("qualite", fiche.qualite);
  const valeur = fiche.prenom === null ? qualite.is("prenom", null) : qualite.eq("prenom", fiche.prenom);
  const { data, error } = await valeur.select("id").maybeSingle();
  if (error || !data) return { erreur: "Le prénom n’a pas pu être enregistré. Rechargez le bail avant de réessayer." };
  actualiser(org, bail);
  for (const espace of ["agence", "espace"]) revalidatePath(`/${espace}/${org}/personnes/${personne}`);
  return { succes: "Prénom enregistré." };
}

export async function designerRepresentantBail(org:string,bail:string,societe:string,_etat:EtatPersonnesBail,form:FormData):Promise<EtatPersonnesBail>{
  const ctx=await contexte(org,bail);
  if(!ctx) return {erreur:"Ce brouillon n’est plus accessible."};
  const retrait=form.get("operation")==="retirer";
  if(!retrait && (!form.has("verifie") || !form.get("personne") || !form.get("justificatif"))) return {erreur:"Choisissez la personne et son justificatif, puis confirmez la vérification."};
  const {error}=await ctx.supabase.rpc("designer_representant_bail",{p_bail:bail,p_societe:societe,p_personne:retrait?null:form.get("personne"),p_justificatif:retrait?null:form.get("justificatif"),p_fin:retrait?null:form.get("fin")||null});
  if(error)return {erreur:sansJargon(error.message)};
  actualiser(org,bail);
  return {succes:retrait?"Pouvoir retiré.":"Pouvoir enregistré pour ce bail."};
}
