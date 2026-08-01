"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import {
  TYPES_BIEN,
  TYPES_DIAGNOSTIC,
  TYPES_NON_DECOUPABLES,
  ETATS_LOT,
} from "@/lib/parc";

export type EtatParc = { erreur?: string; succes?: string };

export async function creerBien(
  orgId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const adresse1 = String(formData.get("address_line1") ?? "").trim();
  const adresse2 = String(formData.get("address_line2") ?? "").trim();
  const codePostal = String(formData.get("postal_code") ?? "").trim();
  const ville = String(formData.get("city") ?? "").trim();
  const annee = String(formData.get("annee_construction") ?? "").trim();
  const surface = String(formData.get("surface_m2") ?? "").trim();
  const pieces = String(formData.get("pieces") ?? "").trim();

  if (!nom) return { erreur: "La référence du bien est obligatoire." };
  if (!(type in TYPES_BIEN)) return { erreur: "Type de bien invalide." };
  if (!adresse1 || !codePostal || !ville) {
    return { erreur: "L'adresse (voie, code postal, ville) est obligatoire." };
  }

  // Créer un bien = créer son lot unique (RM-0.1.2), atomique en base
  const { data: bienId, error } = await supabase.rpc("creer_bien_avec_lot", {
    p_org: orgId,
    p_nom: nom,
    p_type: type,
    p_address_line1: adresse1,
    p_address_line2: adresse2 || null,
    p_postal_code: codePostal,
    p_city: ville,
    p_annee: annee ? Number(annee) : null,
    p_copropriete: formData.get("copropriete") === "on",
    p_surface: surface ? Number(surface) : null,
    p_pieces: pieces ? Number(pieces) : null,
  });
  if (error) return { erreur: `Création impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/parc`);
  redirect(`/agence/${orgId}/parc/${bienId}`);
}

export async function modifierBien(
  orgId: string,
  bienId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  const annee = String(formData.get("annee_construction") ?? "").trim();
  if (!nom) return { erreur: "La référence du bien est obligatoire." };

  // L'adresse est verrouillée en base si un lot est loué (trigger RM-0.5.1)
  const { error } = await supabase
    .from("biens")
    .update({
      nom,
      address_line1: String(formData.get("address_line1") ?? "").trim(),
      address_line2: String(formData.get("address_line2") ?? "").trim() || null,
      postal_code: String(formData.get("postal_code") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      annee_construction: annee ? Number(annee) : null,
      copropriete: formData.get("copropriete") === "on",
    })
    .eq("id", bienId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  return { succes: "Bien mis à jour." };
}

export async function modifierLot(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  const tantieme = String(formData.get("tantieme") ?? "").trim();
  if (!nom) return { erreur: "Le nom du lot est obligatoire." };

  // Surface, Carrez et pièces sont verrouillées en base si le lot est loué
  // (trigger RM-0.5.1) : le formulaire les désactive alors, elles sont donc
  // absentes du FormData — on ne les inclut que si elles sont soumises, pour
  // que renommer/décrire un lot loué reste possible.
  const maj: Record<string, unknown> = {
    nom,
    meuble: formData.get("meuble") === "on",
    etage: String(formData.get("etage") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    tantieme: tantieme ? Number(tantieme) : null,
  };
  for (const champ of ["surface_m2", "surface_carrez", "pieces"]) {
    if (formData.has(champ)) {
      const valeur = String(formData.get(champ) ?? "").trim();
      maj[champ] = valeur ? Number(valeur) : null;
    }
  }
  const { error } = await supabase
    .from("lots")
    .update(maj)
    .eq("id", lotId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Lot mis à jour." };
}

// Machine à états (module 0) : la transition est validée en base par trigger ;
// le passage brouillon → disponible revérifie tous les blocages de location.
export async function changerEtatLot(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const cible = String(formData.get("etat") ?? "");
  if (!(cible in ETATS_LOT)) return { erreur: "État inconnu." };

  const { error } = await supabase
    .from("lots")
    .update({ etat: cible })
    .eq("id", lotId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: `Lot passé en « ${ETATS_LOT[cible]} ».` };
}

// Découpage (parcours 0.3) : nouveaux lots héritant des propriétaires actifs,
// clé invalidée, lots disponibles renvoyés en brouillon — tout est fait en base.
export async function decouperBien(
  orgId: string,
  bienId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  // Un appartement ou un parking ne se découpe pas (retour recette S2)
  const { data: bien } = await supabase
    .from("biens")
    .select("type")
    .eq("id", bienId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bien) return { erreur: "Bien introuvable." };
  if ((TYPES_NON_DECOUPABLES as readonly string[]).includes(bien.type)) {
    return {
      erreur: `Un bien de type « ${TYPES_BIEN[bien.type]} » ne se découpe pas en lots.`,
    };
  }

  const noms = formData.getAll("lot_nom").map((n) => String(n).trim());
  const surfaces = formData.getAll("lot_surface").map((s) => String(s).trim());
  const lots = noms
    .map((nom, i) => ({ nom, surface_m2: surfaces[i] || "" }))
    .filter((l) => l.nom.length > 0);
  if (lots.length === 0) return { erreur: "Renseigner au moins un lot à créer." };

  const { error } = await supabase.rpc("decouper_bien", {
    p_bien: bienId,
    p_lots: lots,
  });
  if (error) return { erreur: `Découpage impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  return {
    succes: `${lots.length} lot(s) créé(s) — la clé de répartition est à (re)valider.`,
  };
}

export async function ajouterDetention(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const quotePart = Number(String(formData.get("quote_part") ?? ""));
  const dateDebut = String(formData.get("date_debut") ?? "");
  if (!(quotePart > 0 && quotePart <= 100)) {
    return { erreur: "La quote-part doit être comprise entre 0 et 100." };
  }

  // Propriétaire : une personne existante, ou une fiche minimale créée à la
  // volée (les fiches complètes arrivent au S3)
  let personId = String(formData.get("person_id") ?? "");
  if (personId === "nouvelle") {
    const nom = String(formData.get("nouveau_nom") ?? "").trim();
    const prenom = String(formData.get("nouveau_prenom") ?? "").trim();
    if (!nom) return { erreur: "Le nom du nouveau propriétaire est obligatoire." };
    const { data: personne, error: erreurPersonne } = await supabase
      .from("persons")
      .insert({ organization_id: orgId, nom, prenom: prenom || null })
      .select("id")
      .single();
    if (erreurPersonne) return { erreur: erreurPersonne.message };
    personId = personne.id;
  }
  if (!personId) return { erreur: "Choisir un propriétaire." };

  // La somme des quote-parts actives ≤ 100 % est garantie par trigger (RM-0.2.1)
  const { error } = await supabase.from("detentions").insert({
    lot_id: lotId,
    organization_id: orgId,
    person_id: personId,
    quote_part: quotePart,
    ...(dateDebut ? { date_debut: dateDebut } : {}),
  });
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Détention enregistrée." };
}

// Fin de détention (RM-0.2.3) : jamais de suppression, on pose date_fin —
// les rapports passés restent justes.
export async function cloreDetention(
  orgId: string,
  bienId: string,
  lotId: string,
  detentionId: string
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  // Date du jour en heure de Paris (toISOString donnerait la veille avant 2 h)
  const aujourdhui = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Paris",
  });
  const { error } = await supabase
    .from("detentions")
    .update({ date_fin: aujourdhui })
    .eq("id", detentionId)
    .eq("organization_id", orgId)
    .is("date_fin", null);
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Détention close." };
}

// Corriger une erreur de saisie : supprime la détention (en base, uniquement si
// le lot n'a aucun bail — sinon RM-0.2.4 : on clôt, on ne supprime pas).
export async function supprimerDetention(
  orgId: string,
  bienId: string,
  lotId: string,
  detentionId: string
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("supprimer_detention", { p_detention: detentionId });
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Détention corrigée (supprimée)." };
}

// Rouvrir une détention close par erreur (clore accidentel). Garde-fou somme
// ≤ 100 % + trace horodatée en base (audit_log).
export async function rouvrirDetention(
  orgId: string,
  bienId: string,
  lotId: string,
  detentionId: string
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("rouvrir_detention", { p_detention: detentionId });
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Détention rouverte." };
}

export async function deposerDiagnostic(
  orgId: string,
  bienId: string,
  lotId: string | null,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const type = String(formData.get("type") ?? "");
  const realisation = String(formData.get("date_realisation") ?? "");
  const expiration = String(formData.get("date_expiration") ?? "");
  const diagnostiqueur = String(formData.get("diagnostiqueur") ?? "").trim();

  const referentiel = TYPES_DIAGNOSTIC[type];
  if (!referentiel) return { erreur: "Type de diagnostic invalide." };
  if (!realisation) return { erreur: "La date de réalisation est obligatoire." };

  // Rattachement bien OU lot selon la nature du diagnostic (RM-0.6.2) ;
  // le dépôt archive l'ancien du même type et lève seul le blocage (RM-0.8.5)
  const auLot = referentiel.niveau === "lot";
  if (auLot && !lotId) {
    return { erreur: "Ce diagnostic se rattache à un lot : le déposer depuis la fiche lot." };
  }

  // PDF du rapport (retour recette S2) : déposé dans la GED (type réel vérifié,
  // anti-doublon, accès tracés) et lié au diagnostic
  let documentId: string | null = null;
  const fichier = formData.get("fichier");
  if (fichier instanceof File && fichier.size > 0) {
    const depot = await deposerFichierGed(
      supabase,
      user,
      orgId,
      fichier,
      "diagnostic",
      `${referentiel.libelle} — ${realisation}`
    );
    if (depot.erreur || !depot.documentId) {
      return { erreur: depot.erreur ?? "Échec du dépôt du fichier." };
    }
    documentId = depot.documentId;
  }

  const { error } = await supabase.from("diagnostics").insert({
    organization_id: orgId,
    bien_id: auLot ? null : bienId,
    lot_id: auLot ? lotId : null,
    type,
    date_realisation: realisation,
    date_expiration: expiration || null,
    diagnostiqueur: diagnostiqueur || null,
    document_id: documentId,
  });
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  if (lotId) revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/documents`);
  return { succes: `${referentiel.libelle} déposé.` };
}

// Clé de répartition (parcours 0.4) : validation stricte (= 100,00 exactement,
// tous les lots actifs couverts) et immuabilité assurées en base.
export async function validerCle(
  orgId: string,
  bienId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const mode = String(formData.get("mode") ?? "surface");
  const lotIds = formData.getAll("ligne_lot_id").map(String);
  const pourcentages = formData.getAll("ligne_pourcentage").map(String);
  const lignes = lotIds.map((lot_id, i) => ({
    lot_id,
    pourcentage: Number(pourcentages[i] ?? 0),
  }));

  const { error } = await supabase.rpc("valider_cle_repartition", {
    p_bien: bienId,
    p_mode: mode,
    p_lignes: lignes,
  });
  if (error) return { erreur: `Validation impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  return { succes: "Clé de répartition validée." };
}

// Liste fermée des équipements (RM-0.5.5) : le catalogue est géré par l'admin
// agence (la politique RLS refuse l'insert aux agents).
export async function ajouterEquipementCatalogue(
  orgId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { erreur: "Le nom de l'équipement est obligatoire." };

  const { error } = await supabase
    .from("equipements_catalogue")
    .insert({ organization_id: orgId, nom });
  if (error) {
    return {
      erreur:
        error.code === "23505"
          ? "Cet équipement existe déjà."
          : error.code === "42501"
            ? "Le catalogue est géré par l'admin de l'agence."
            : error.message,
    };
  }

  revalidatePath(`/agence/${orgId}/parc`);
  return { succes: "Équipement ajouté au catalogue." };
}

export async function definirEquipementsLot(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const retenus = formData.getAll("equipement_id").map(String);
  const { error: erreurPurge } = await supabase
    .from("lot_equipements")
    .delete()
    .eq("lot_id", lotId);
  if (erreurPurge) return { erreur: erreurPurge.message };
  if (retenus.length > 0) {
    const { error } = await supabase
      .from("lot_equipements")
      .insert(retenus.map((id) => ({ lot_id: lotId, equipement_id: id })));
    if (error) return { erreur: error.message };
  }

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Équipements du lot enregistrés." };
}
