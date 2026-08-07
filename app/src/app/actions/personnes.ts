"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatPersonne = { erreur?: string; succes?: string };

// L'email est-il déjà porté par une fiche vivante de l'agence ? (l'index
// unique le garantit en base ; on vérifie avant pour un message clair)
async function emailDejaPris(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  email: string,
  saufPersonId?: string
) {
  let requete = supabase
    .from("persons")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("email", email)
    .is("archived_at", null);
  if (saufPersonId) requete = requete.neq("id", saufPersonId);
  const { data } = await requete;
  return (data ?? []).length > 0;
}

// Créer une fiche personne (retour recette 08/08) : nom, prénom (sauf raison
// sociale) et email obligatoires ; email unique par agence. Le rôle choisi à
// l'étape 1 de l'assistant oriente le rattachement — un propriétaire mandant
// peut être rattaché à un lot dès la création (détention). Doublon nom + date
// de naissance : alerté, non bloquant (RM-0b).
export async function creerPersonne(
  orgId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const morale = formData.get("morale") === "on";
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateNaissance = String(formData.get("date_naissance") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const lotId = String(formData.get("lot_id") ?? "").trim();

  if (!nom) {
    return {
      erreur: morale
        ? "La raison sociale est obligatoire."
        : "Le nom est obligatoire.",
    };
  }
  if (!morale && !prenom) return { erreur: "Le prénom est obligatoire." };
  if (!email) return { erreur: "L'adresse email est obligatoire." };
  if (await emailDejaPris(supabase, orgId, email)) {
    return {
      erreur:
        "Cette adresse email est déjà portée par une autre fiche de l'agence — une adresse ne peut appartenir qu'à une seule personne.",
    };
  }

  let doublon = false;
  if (dateNaissance) {
    const { data } = await supabase
      .from("persons")
      .select("id")
      .eq("organization_id", orgId)
      .ilike("nom", nom)
      .eq("date_naissance", dateNaissance);
    doublon = (data ?? []).length > 0;
  }

  const { data: cree, error } = await supabase
    .from("persons")
    .insert({
      organization_id: orgId,
      nom,
      prenom: morale ? null : prenom,
      email,
      telephone: telephone || null,
      date_naissance: dateNaissance || null,
    })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}` };

  // Rattachement immédiat (facultatif) : un propriétaire mandant devient
  // détenteur du lot choisi, à 100 % — les quote-parts fines se règlent sur
  // la fiche du lot. Un échec (lot déjà détenu…) ne défait pas la fiche.
  if (role === "proprietaire_mandant" && lotId) {
    const { data: lot } = await supabase
      .from("lots")
      .select("id")
      .eq("id", lotId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const { error: erreurDetention } = lot
      ? await supabase.from("detentions").insert({
          lot_id: lotId,
          organization_id: orgId,
          person_id: cree.id,
          quote_part: 100,
        })
      : { error: { message: "Lot introuvable." } };
    if (erreurDetention) {
      revalidatePath(`/agence/${orgId}/personnes`);
      return {
        succes: `Fiche créée, mais le rattachement au lot a échoué : ${sansJargon(erreurDetention.message)} Faites-le depuis la fiche du lot.`,
      };
    }
  }

  // Doublon = on reste sur la liste avec l'avertissement (non bloquant)
  if (doublon) {
    revalidatePath(`/agence/${orgId}/personnes`);
    return {
      succes:
        "Fiche créée. Un homonyme avec la même date de naissance existe déjà — à vérifier.",
    };
  }
  revalidatePath(`/agence/${orgId}/personnes`);
  redirect(`/agence/${orgId}/personnes/${cree.id}`);
}

// Modifier l'email d'une personne (rattachement au compte, RM-0b) — modifiable
// par l'agent.
export async function modifierContactPersonne(
  orgId: string,
  personId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();

  // L'email reste obligatoire et unique dans l'agence (recette 08/08)
  if (!email) return { erreur: "L'adresse email est obligatoire." };
  if (await emailDejaPris(supabase, orgId, email, personId)) {
    return {
      erreur:
        "Cette adresse email est déjà portée par une autre fiche de l'agence.",
    };
  }

  const { error } = await supabase
    .from("persons")
    .update({ email, telephone: telephone || null })
    .eq("id", personId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Modification impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Coordonnées mises à jour." };
}
