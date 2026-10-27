"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { deLEspaceDeGestion } from "@/lib/libelles";
import { aujourdhuiParis, motifLitteral } from "@/lib/ged";
import { verifierCodePostalPersonne, verifierDateNaissance, verifierTelephone } from "@/lib/validation-fiches";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { QUALITES_BAILLEUR, estQualiteBailleur, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { baseEspace } from "@/lib/racine-espace";

export type EtatPersonne = {
  personneCreee?: { id: string };
  // Décision D31 : la clé de cette demande a déjà créé une fiche, mais avec d'autres informations que celles
  // renvoyées maintenant. Rien n'est écrit ; l'écran propose d'ouvrir la fiche existante.
  ficheExistante?: { id: string };
  erreur?: string;
  succes?: string;
  avertissement?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08 :
  // React réinitialise les champs après l'action — un refus vidait tout).
  valeurs?: Record<string, string>;
};

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Les colonnes que la création écrit, dans la forme où elle les écrit : sert à insérer, puis à reconnaître la MÊME
// demande quand elle revient avec la même clé.
type LigneFiche = {
  nom: string;
  prenom: string | null;
  email: string;
  telephone: string | null;
  date_naissance: string | null;
  commune_naissance: string | null;
  address_line1: string;
  postal_code: string;
  city: string;
  qualite: string;
};
const COLONNES_FICHE = "id, nom, prenom, email, telephone, date_naissance, commune_naissance, address_line1, postal_code, city, qualite";

// Décision D31 (PR178-A-03) : la fiche déjà créée par la demande de cette clé, s'il y en a une. La lecture passe par
// la RLS de l'appelant : un agent restreint ne retrouve pas une fiche hors de son portefeuille.
async function ficheDeLaCle(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  cle: string
): Promise<{ fiche: (LigneFiche & { id: string }) | null; indisponible: boolean }> {
  const { data, error } = await supabase
    .from("persons")
    .select(COLONNES_FICHE)
    .eq("organization_id", orgId)
    .eq("creation_cle", cle)
    .maybeSingle();
  if (error) return { fiche: null, indisponible: true };
  return { fiche: (data as (LigneFiche & { id: string }) | null) ?? null, indisponible: false };
}

// Même demande ? Une valeur absente et une valeur vide sont la même chose (la création enregistre NULL).
function memeDemande(fiche: LigneFiche, ligne: LigneFiche): boolean {
  return (Object.keys(ligne) as (keyof LigneFiche)[]).every(
    (colonne) => (fiche[colonne] ?? null) === (ligne[colonne] ?? null)
  );
}

// La clé a déjà créé une fiche, avec d'autres informations que celles qui reviennent : rien n'est écrit, pour ne
// pas faire croire que la correction est enregistrée.
function refusSaisieDifferente(ficheId: string): EtatPersonne {
  return {
    erreur: "Cette demande a déjà créé la fiche avec les informations précédentes. Ouvrez la fiche enregistrée pour y reporter vos modifications.",
    ficheExistante: { id: ficheId },
  };
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
  const { supabase, user, role: roleGerant } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const morale = formData.get("morale") === "on";
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateNaissance = String(formData.get("date_naissance") ?? "").trim();
  const communeNaissance = String(formData.get("commune_naissance") ?? "").trim();
  const adresse = String(formData.get("address_line1") ?? "").trim();
  const codePostal = String(formData.get("postal_code") ?? "").trim();
  const ville = String(formData.get("city") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const lotId = String(formData.get("lot_id") ?? "").trim();

  if (!nom) {
    return {
      erreur: morale
        ? "La raison sociale est obligatoire."
        : "Le nom est obligatoire.",
      valeurs,
    };
  }
  if (!morale && !prenom) return { erreur: "Le prénom est obligatoire.", valeurs };
  if (!email) return { erreur: "L'adresse email est obligatoire.", valeurs };
  if (!morale && (!dateNaissance || !communeNaissance)) {
    return { erreur: "La date et la commune de naissance sont obligatoires pour établir les contrats.", valeurs };
  }
  if (!adresse || !codePostal || !ville) {
    return { erreur: "L'adresse complète (voie, code postal et ville) est obligatoire pour les documents.", valeurs };
  }
  const refusFiche =
    verifierTelephone(telephone) ??
    verifierCodePostalPersonne(codePostal) ??
    (morale ? null : verifierDateNaissance(dateNaissance, aujourdhuiParis()));
  if (refusFiche) return { erreur: refusFiche, valeurs };

  // Décision D31 (PR178-A-03) : clé d'idempotence de la demande, tirée par l'écran et conservée avec sa copie
  // locale, y compris dans l'étape « Personnes » du bail. Facultative pour les anciens formulaires.
  const cle = String(formData.get("creation_id") ?? "").trim();
  if (cle && !UUID.test(cle)) {
    return { erreur: "La référence de cette demande est illisible. Rechargez le formulaire avant de créer la fiche.", valeurs };
  }
  const ligne: LigneFiche = {
    nom,
    prenom: morale ? null : prenom,
    email,
    telephone: telephone || null,
    date_naissance: morale ? null : dateNaissance,
    commune_naissance: morale ? null : communeNaissance,
    address_line1: adresse,
    postal_code: codePostal,
    city: ville,
    qualite: morale ? "Personne morale" : "Personne physique",
  };
  // Rejeu : cette demande a peut-être déjà créé la fiche (réponse perdue, renvoi, double clic). On la retrouve AVANT
  // le contrôle de l'adresse email, que cette fiche porte déjà.
  let cree: { id: string } | null = null;
  if (cle) {
    const deja = await ficheDeLaCle(supabase, orgId, cle);
    if (deja.indisponible) {
      return { erreur: "La vérification de cette demande n'a pas pu être faite. Réessayez : la fiche ne sera pas créée deux fois.", valeurs };
    }
    if (deja.fiche) {
      if (!memeDemande(deja.fiche, ligne)) return { ...refusSaisieDifferente(deja.fiche.id), valeurs };
      cree = { id: deja.fiche.id };
    }
  }
  let rejoue = cree !== null;
  if (!cree && (await emailDejaPris(supabase, orgId, email))) {
    return {
      erreur:
        `Cette adresse email est déjà portée par une autre fiche ${deLEspaceDeGestion(roleGerant)} — une adresse ne peut appartenir qu'à une seule personne.`,
      valeurs,
    };
  }

  // Doublon probable (RM-0b, recette 13/08) : même date de naissance et mêmes
  // nom + prénom — y compris saisis dans l'autre sens (« Jean Francois » /
  // « Francois Jean »), accents et casse ignorés, fiches archivées exclues.
  const normaliser = (texte: string) =>
    texte.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let doublon = false;
  if (dateNaissance) {
    let homonymes = supabase
      .from("persons")
      .select("nom, prenom")
      .eq("organization_id", orgId)
      .eq("date_naissance", dateNaissance)
      .is("archived_at", null);
    // Rejeu : la fiche déjà créée par cette demande n'est pas son propre homonyme.
    if (cree) homonymes = homonymes.neq("id", cree.id);
    const { data } = await homonymes;
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

  if (!cree) {
    const { data: insere, error } = await supabase
      .from("persons")
      .insert({ organization_id: orgId, ...ligne, ...(cle ? { creation_cle: cle } : {}) })
      .select("id")
      .single();
    if (error) {
      // Deux envois de la même demande en même temps (double clic, renvoi pendant que le premier finit) : le second
      // attend le premier, puis l'index unique le refuse. Ce n'est pas un échec mais un rejeu : on reprend la fiche
      // du premier. (L'index de l'adresse email peut être celui que le message cite : on ne lit pas le message.)
      if (cle && error.code === "23505") {
        const relue = await ficheDeLaCle(supabase, orgId, cle);
        if (relue.fiche) {
          if (!memeDemande(relue.fiche, ligne)) return { ...refusSaisieDifferente(relue.fiche.id), valeurs };
          cree = { id: relue.fiche.id };
          rejoue = true;
        }
      }
      if (!cree) return { erreur: `Création impossible : ${sansJargon(error.message)}`, valeurs };
    } else {
      cree = insere;
    }
  }
  // Le compilateur ne suit pas ces affectations : ici la fiche existe forcément (créée ou retrouvée).
  const ficheId = cree!.id;

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
    // Rejeu : le rattachement a peut-être déjà été posé par l'envoi dont la réponse s'est perdue.
    const { data: dejaDetenu } = rejoue && lot
      ? await supabase.from("detentions").select("person_id").eq("lot_id", lotId).eq("person_id", ficheId).maybeSingle()
      : { data: null };
    const { error: erreurDetention } = dejaDetenu
      ? { error: null }
      : lot
        ? await supabase.from("detentions").insert({
            lot_id: lotId,
            organization_id: orgId,
            person_id: ficheId,
            quote_part: 100,
          })
        : { error: { message: "Lot introuvable." } };
    if (erreurDetention) {
      revalidatePath(`/agence/${orgId}/personnes`);
      return {
        personneCreee: { id: ficheId },
        succes:
          `Fiche créée, mais le rattachement au lot a échoué : ${sansJargon(erreurDetention.message)} Faites-le depuis la fiche du lot.` +
          (doublon
            ? " Attention : un homonyme avec la même date de naissance existe déjà — à vérifier."
            : ""),
      };
    }
  }

  if (formData.get("rester_dans_parcours") === "1") {
    revalidatePath(`/agence/${orgId}/personnes`);
    return {
      succes: "Fiche créée.", personneCreee: { id: ficheId },
      ...(doublon ? { avertissement: "Une personne de mêmes nom et date de naissance existe déjà. Vérifiez votre annuaire." } : {}),
    };
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
  if (formData.get("rester_dans_parcours") === "1") return { succes: "Fiche créée. Vous pouvez sélectionner cette personne à l’étape Bail." };
  redirect(`${baseEspace(orgId, roleGerant === "proprietaire_direct")}/personnes/${ficheId}`);
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
  const { supabase, user, role } = await verifierGerant(orgId);
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
  redirect(`${baseEspace(orgId, role === "proprietaire_direct")}/personnes`);
}

// Modifier l'identité et les coordonnées d'une personne (recette 13/08 : une
// fiche créée doit rester corrigeable — nom, prénom, email, date de naissance).
// Étendu à l'état civil et l'adresse du contrat : commune de naissance, adresse
// postale, qualité (bail) — champs facultatifs, vide → null.
export async function modifierPersonne(
  orgId: string,
  personId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateNaissance = String(formData.get("date_naissance") ?? "").trim();
  const communeNaissance = String(formData.get("commune_naissance") ?? "").trim();
  const adresse = String(formData.get("address_line1") ?? "").trim();
  const codePostal = String(formData.get("postal_code") ?? "").trim();
  const ville = String(formData.get("city") ?? "").trim();
  // Liste fermée (audit 29/09) : la durée du bail nu en dépend.
  const qualite = normaliserQualiteBailleur(String(formData.get("qualite") ?? ""));
  if (qualite !== null && !estQualiteBailleur(qualite)) {
    return { erreur: `Qualité inconnue : choisissez parmi ${QUALITES_BAILLEUR.join(", ")}.`, valeurs };
  }

  if (!nom) return { erreur: "Le nom (ou la raison sociale) est obligatoire.", valeurs };
  // Une personne physique (fiche avec prénom) garde un prénom — même règle
  // qu'à la création ; seule une raison sociale (sans prénom) s'en passe.
  const { data: actuelle } = await supabase
    .from("persons")
    .select("prenom")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!actuelle) return { erreur: "Fiche introuvable.", valeurs };
  if (actuelle.prenom && !prenom) return { erreur: "Le prénom est obligatoire.", valeurs };
  // L'email reste obligatoire et unique dans l'agence (recette 08/08)
  if (!email) return { erreur: "L'adresse email est obligatoire.", valeurs };
  if (actuelle.prenom && (!dateNaissance || !communeNaissance)) {
    return { erreur: "La date et la commune de naissance sont obligatoires pour établir les contrats.", valeurs };
  }
  if (!adresse || !codePostal || !ville) {
    return { erreur: "L'adresse complète (voie, code postal et ville) est obligatoire pour les documents.", valeurs };
  }
  const refusFiche =
    verifierTelephone(telephone) ??
    verifierCodePostalPersonne(codePostal) ??
    verifierDateNaissance(dateNaissance, aujourdhuiParis());
  if (refusFiche) return { erreur: refusFiche, valeurs };
  if (await emailDejaPris(supabase, orgId, email, personId)) {
    return {
      erreur:
        `Cette adresse email est déjà portée par une autre fiche ${deLEspaceDeGestion(role)}.`,
      valeurs,
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
      commune_naissance: communeNaissance || null,
      address_line1: adresse || null,
      postal_code: codePostal || null,
      city: ville || null,
      qualite: qualite || null,
    })
    .eq("id", personId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Modification impossible : ${sansJargon(error.message)}`, valeurs };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  revalidatePath(`/agence/${orgId}/personnes`);
  return { succes: "Fiche mise à jour." };
}
