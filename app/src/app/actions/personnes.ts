"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { motifLitteral } from "@/lib/ged";

export type EtatPersonne = { erreur?: string; succes?: string; avertissement?: string };

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
    .ilike("email", motifLitteral(email))
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

  // Doublon probable (RM-0b, recette 13/08) : même date de naissance et mêmes
  // nom + prénom — y compris saisis dans l'autre sens (« Jean Francois » /
  // « Francois Jean »), accents et casse ignorés, fiches archivées exclues.
  const normaliser = (texte: string) =>
    texte.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let doublon = false;
  if (dateNaissance) {
    const { data } = await supabase
      .from("persons")
      .select("nom, prenom")
      .eq("organization_id", orgId)
      .eq("date_naissance", dateNaissance)
      .is("archived_at", null);
    const nomSaisi = normaliser(nom);
    const prenomSaisi = normaliser(prenom);
    doublon = ((data ?? []) as { nom: string; prenom: string | null }[]).some((p) => {
      const nomFiche = normaliser(p.nom ?? "");
      const prenomFiche = normaliser(p.prenom ?? "");
      return (
        (nomFiche === nomSaisi && prenomFiche === prenomSaisi) ||
        (nomFiche === prenomSaisi && prenomFiche === nomSaisi && prenomSaisi !== "")
      );
    });
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
        succes:
          `Fiche créée, mais le rattachement au lot a échoué : ${sansJargon(erreurDetention.message)} Faites-le depuis la fiche du lot.` +
          (doublon
            ? " Attention : un homonyme avec la même date de naissance existe déjà — à vérifier."
            : ""),
      };
    }
  }

  // Doublon = on reste sur la liste avec l'avertissement (non bloquant)
  if (doublon) {
    revalidatePath(`/agence/${orgId}/personnes`);
    return {
      succes: "Fiche créée.",
      avertissement:
        "Un homonyme avec la même date de naissance existe déjà (même en inversant nom et prénom) — vérifiez qu'il ne s'agit pas d'un doublon.",
    };
  }
  revalidatePath(`/agence/${orgId}/personnes`);
  redirect(`/agence/${orgId}/personnes/${cree.id}`);
}

// Archiver une fiche (recette 14/08 : le nettoyage des doublons se faisait en
// base à la main — jamais de suppression, RM « archivage plutôt que
// suppression »). Refusé tant que la fiche porte des liens vivants.
export async function archiverPersonne(
  orgId: string,
  personId: string,
  _etat: EtatPersonne,
  _formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: fiche } = await supabase
    .from("persons")
    .select("account_id, archived_at")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!fiche) return { erreur: "Fiche introuvable." };
  if (fiche.archived_at) return { erreur: "Cette fiche est déjà archivée." };
  if (fiche.account_id) {
    return {
      erreur:
        "Cette fiche est reliée à un compte (espace locataire) : elle ne peut pas être archivée.",
    };
  }

  const [{ data: detentions }, { data: mandats }, { data: baux }, { data: roles }] =
    await Promise.all([
      supabase
        .from("detentions")
        .select("id")
        .eq("organization_id", orgId)
        .eq("person_id", personId)
        .is("date_fin", null)
        .limit(1),
      supabase
        .from("mandats")
        .select("id")
        .eq("organization_id", orgId)
        .eq("person_id", personId)
        .neq("etat", "resilie")
        .limit(1),
      supabase
        .from("baux")
        .select("id")
        .eq("organization_id", orgId)
        .eq("locataire_principal", personId)
        .in("etat", ["actif", "preavis"])
        .limit(1),
      supabase
        .from("bail_personnes")
        .select("id")
        .eq("organization_id", orgId)
        .eq("person_id", personId)
        .limit(1),
    ]);
  if ((detentions ?? []).length > 0) {
    return { erreur: "Cette personne détient un lot : clore la détention avant d'archiver." };
  }
  if ((mandats ?? []).length > 0) {
    return { erreur: "Cette personne a un mandat non résilié : résilier avant d'archiver." };
  }
  if ((baux ?? []).length > 0 || (roles ?? []).length > 0) {
    return { erreur: "Cette personne figure sur un bail : la fiche reste active." };
  }

  const { error } = await supabase
    .from("persons")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", personId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Archivage impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/personnes`);
  redirect(`/agence/${orgId}/personnes`);
}

// Modifier l'identité et les coordonnées d'une personne (recette 13/08 : une
// fiche créée doit rester corrigeable — nom, prénom, email, date de naissance).
export async function modifierPersonne(
  orgId: string,
  personId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateNaissance = String(formData.get("date_naissance") ?? "").trim();

  if (!nom) return { erreur: "Le nom (ou la raison sociale) est obligatoire." };
  // Une personne physique (fiche avec prénom) garde un prénom — même règle
  // qu'à la création ; seule une raison sociale (sans prénom) s'en passe.
  const { data: actuelle } = await supabase
    .from("persons")
    .select("prenom")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!actuelle) return { erreur: "Fiche introuvable." };
  if (actuelle.prenom && !prenom) return { erreur: "Le prénom est obligatoire." };
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
    .update({
      nom,
      prenom: prenom || null,
      email,
      telephone: telephone || null,
      date_naissance: dateNaissance || null,
    })
    .eq("id", personId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Modification impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  revalidatePath(`/agence/${orgId}/personnes`);
  return { succes: "Fiche mise à jour." };
}
