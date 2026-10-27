"use server";
import { resoudreDepotsFormulaire } from "@/lib/depot-direct";


import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { deLEspaceDeGestion } from "@/lib/libelles";
import { deposerFichierGed } from "@/lib/ged-depot";
import { aujourdhuiParis, formaterDate, motifLitteral } from "@/lib/ged";
import { piecesHabituelles } from "@/lib/pieces";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { estUuid } from "@/lib/identifiants";
import { verifierAnneeConstruction, verifierCodePostalBien, verifierSurface } from "@/lib/validation-fiches";
import { erreurDuChamp, lireDecimal, lireDecimalFacultatif } from "@/lib/saisie-montant";
import {
  TYPES_BIEN,
  TYPES_DIAGNOSTIC,
  TYPES_NON_DECOUPABLES,
  ETATS_LOT,
} from "@/lib/parc";
import { baseEspace } from "@/lib/racine-espace";
import { erreurEcheanceDpe } from "@/lib/documents-bail";

export type EtatParc = {
  erreur?: string;
  succes?: string;
  repriseHref?: string;
  creationConfirmeeHref?: string;
  // Création de fiche réussie, mais détention refusée : reprendre cette
  // fiche précise sans en créer une seconde lors de la correction.
  personneCreee?: { id: string; nom: string; prenom: string | null };
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
  // Dépôt d'un diagnostic refusé parce que le MÊME rapport est déjà rangé : la pièce existante, que l'écran
  // propose d'utiliser pour ce lot (ou ce bien) au lieu de la déposer en double (X07, PROP-11).
  // `type` : « autre » ou « courrier » quand le même fichier a d'abord été rangé dans Documents sans être déclaré comme
  // rapport (DOC-02) — l'écran le dit, et la pièce sera reclassée en « Diagnostic » par la base.
  pieceExistante?: { id: string; titre: string | null; type?: string };
};

// Zone tendue saisie : « oui », « non » ou non vérifiée (NULL). Un ancien
// formulaire à case à cocher envoie « on » (audit gestion du 29/09).
function zoneTendueSaisie(formData: FormData): boolean | null {
  const v = String(formData.get("zone_tendue") ?? "");
  if (v === "oui" || v === "on") return true;
  if (v === "non") return false;
  return null;
}

// Code INSEE choisi dans le formulaire du bien, ou rien.
function communeSaisie(formData: FormData): string | null {
  const v = String(formData.get("commune_insee") ?? "").trim();
  return /^[0-9AB]{5}$/.test(v) ? v : null;
}

export async function creerBien(
  orgId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const valeurs = valeursDuFormulaire(formData);
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé.", valeurs };
  const base = baseEspace(orgId, role === "proprietaire_direct"); // décision D27
  const nom = String(formData.get("nom") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const adresse1 = String(formData.get("address_line1") ?? "").trim();
  const adresse2 = String(formData.get("address_line2") ?? "").trim();
  const codePostal = String(formData.get("postal_code") ?? "").trim();
  const ville = String(formData.get("city") ?? "").trim();
  const annee = String(formData.get("annee_construction") ?? "").trim();
  const surface = String(formData.get("surface_m2") ?? "").trim();
  const pieces = String(formData.get("pieces") ?? "").trim();
  const partiesCommunes = String(formData.get("parties_communes") ?? "").trim();
  const accesTic = String(formData.get("acces_tic") ?? "").trim();

  if (!nom) return { erreur: "La référence du bien est obligatoire.", valeurs };
  if (!(type in TYPES_BIEN)) return { erreur: "Type de bien invalide.", valeurs };
  if (!adresse1 || !codePostal || !ville) {
    return { erreur: "L'adresse (voie, code postal, ville) est obligatoire.", valeurs };
  }
  if (!annee || !Number.isInteger(Number(annee)) || Number(annee) < 1000 || Number(annee) > 2100) {
    return { erreur: "L'année de construction est obligatoire pour déterminer les mentions et diagnostics du logement.", valeurs };
  }
  const refusBien =
    verifierCodePostalBien(codePostal) ??
    verifierAnneeConstruction(Number(annee), new Date().getFullYear());
  if (refusBien) return { erreur: refusBien, valeurs };
  if (!partiesCommunes || !accesTic) {
    return { erreur: "Les parties communes et l'accès aux technologies sont obligatoires. Indiquez « Néant » si nécessaire.", valeurs };
  }
  // Questionnaire progressif : un bien divisé arrive avec sa liste de lots.
  // Le serveur transmet une seule demande atomique, incluant tous les lots.
  type LotSaisi = { nom?: string; surface?: string; pieces?: string };
  let lotsSaisis: LotSaisi[] = [];
  const lotsBrut = String(formData.get("lots") ?? "").trim();
  if (lotsBrut) {
    try {
      const parse = JSON.parse(lotsBrut);
      if (!Array.isArray(parse) || parse.some(l => !l || typeof l !== "object" || Array.isArray(l))) {
        return { erreur: "Liste des lots illisible.", valeurs };
      }
      lotsSaisis = parse as LotSaisi[];
    } catch {
      return { erreur: "Liste des lots illisible.", valeurs };
    }
  }
  if ((TYPES_NON_DECOUPABLES as readonly string[]).includes(type) && lotsSaisis.length > 1) {
    return {
      erreur: `Un bien de type « ${TYPES_BIEN[type]} » est déjà l'unité locative : il ne se découpe pas en lots.`,
      valeurs,
    };
  }
  const lotsAValider = lotsSaisis.length > 0 ? lotsSaisis : [{ surface, pieces }];
  // La surface se lit sur le texte tel que tapé (« 45,5 » vaut 45,5) : le champ est en `type="text"`, jamais
  // `type="number"` qui donne 455 à un navigateur non francophone (VER-TS-02). Illisible, elle est refusée en le disant.
  const surfaces: number[] = [];
  for (const lot of lotsAValider) {
    const brute = String(lot.surface ?? "").trim();
    const lue = brute ? lireDecimal(brute) : null;
    if (lue && "erreur" in lue) return { erreur: erreurDuChamp("Surface habitable", lue.erreur), valeurs };
    surfaces.push(lue ? lue.valeur : 0);
  }
  if (lotsAValider.some((lot, i) => surfaces[i] <= 0 || !lot.pieces || !Number.isInteger(Number(lot.pieces)) || Number(lot.pieces) < 1 || (lot.nom !== undefined && typeof lot.nom !== "string"))) {
    return { erreur: "La surface habitable et le nombre de pièces sont obligatoires pour chaque lot.", valeurs };
  }
  const surfaceTropGrande = surfaces.map((valeur) => verifierSurface(valeur, "La surface d'un lot")).find(Boolean);
  if (surfaceTropGrande) return { erreur: surfaceTropGrande, valeurs };

  const creation = String(formData.get("creation_id") ?? _etat.valeurs?.creation_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creation)) {
    return { erreur: "La référence de cette demande manque. Rechargez le formulaire avant de créer le bien.", valeurs };
  }
  valeurs.creation_id = creation;
  let resultat: { bien_id: string; lot_unique_id: string | null; saisie_differente: boolean };
  try {
    const { data, error } = await supabase.rpc("creer_bien_complet", {
      p_org: orgId, p_creation: creation,
      p_saisie: {
        nom, type, address_line1: adresse1, address_line2: adresse2 || null,
        postal_code: codePostal, city: ville, annee_construction: Number(annee),
        copropriete: formData.get("copropriete") === "on", zone_tendue: zoneTendueSaisie(formData),
        parties_communes: partiesCommunes, acces_tic: accesTic, commune_insee: communeSaisie(formData),
        lots: lotsAValider.map((l, i) => ({ nom: l.nom?.trim() || null, surface_m2: surfaces[i], pieces: Number(l.pieces) })),
      },
    });
    if (error || !data?.bien_id) {
      return { erreur: `La création n’a pas pu être confirmée : ${sansJargon(error?.message ?? "réponse indisponible")}. Vos saisies sont conservées. Réessayez pour reprendre la même demande.`, valeurs };
    }
    resultat = data;
  } catch {
    return { erreur: "La confirmation est indisponible. Vos saisies sont conservées. Réessayez pour reprendre la même demande.", valeurs };
  }
  const bienId = resultat.bien_id;
  const lotUniqueId = resultat.lot_unique_id;
  const destination = lotUniqueId
    ? `${base}/parc/${bienId}/lots/${lotUniqueId}${formData.get("parcours") === "1" ? "?parcours=1&etape=lot" : ""}`
    : `${base}/parc/${bienId}`;
  if (resultat.saisie_differente) {
    return { erreur: "Cette demande a déjà créé le bien avec les saisies précédentes. Vos nouvelles saisies restent dans ce formulaire. Ouvrez le dossier enregistré pour y reporter vos modifications.", valeurs, repriseHref: destination };
  }

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");

  // Confirmation explicite pour effacer le brouillon uniquement après commit.
  if (formData.get("confirmation_creation") === "1") return { succes: "Lot enregistré.", creationConfirmeeHref: destination };
  redirect(destination);
}

export async function modifierBien(
  orgId: string,
  bienId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  const annee = String(formData.get("annee_construction") ?? "").trim();
  const adresse1 = String(formData.get("address_line1") ?? "").trim();
  const codePostal = String(formData.get("postal_code") ?? "").trim();
  const ville = String(formData.get("city") ?? "").trim();
  if (!nom) return { erreur: "La référence du bien est obligatoire.", valeurs };
  if (!adresse1 || !codePostal || !ville) return { erreur: "L'adresse complète du bien est obligatoire.", valeurs };
  if (!annee || !Number.isInteger(Number(annee)) || Number(annee) < 1000 || Number(annee) > 2100) {
    return { erreur: "L'année de construction est obligatoire.", valeurs };
  }
  const refusBien =
    verifierCodePostalBien(codePostal) ??
    verifierAnneeConstruction(Number(annee), new Date().getFullYear());
  if (refusBien) return { erreur: refusBien, valeurs };

  // L'adresse est verrouillée en base si un lot est loué (trigger RM-0.5.1)
  const { error } = await supabase
    .from("biens")
    .update({
      nom,
      address_line1: adresse1,
      address_line2: String(formData.get("address_line2") ?? "").trim() || null,
      postal_code: codePostal,
      city: ville,
      annee_construction: Number(annee),
      copropriete: formData.get("copropriete") === "on",
      zone_tendue: zoneTendueSaisie(formData),
      // Commune du réseau : posée si choisie ; sinon la base garde celle déjà
      // confirmée tant qu'elle reste cohérente avec l'adresse (audit 29/09).
      ...(communeSaisie(formData) ? { commune_insee: communeSaisie(formData) } : {}),
      // Désignation du bail (art. 3 loi 89-462) — saisis en édition seulement
      parties_communes: String(formData.get("parties_communes") ?? "").trim() || null,
      acces_tic: String(formData.get("acces_tic") ?? "").trim() || null,
    })
    .eq("id", bienId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Bien mis à jour.", valeurs };
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

  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  // Tantième lu sur le texte tel que tapé (« 125,5 » vaut 125,5) : champ en `type="text"` (VER-TS-02).
  const tantiemeLu = lireDecimalFacultatif(formData.get("tantieme"));
  if ("erreur" in tantiemeLu) return { erreur: erreurDuChamp("Tantième", tantiemeLu.erreur), valeurs };
  if (!nom) return { erreur: "Le nom du lot est obligatoire.", valeurs };
  for (const champ of ["identifiant_fiscal", "description", "chauffage", "eau_chaude", "locaux_privatifs"]) {
    if (!String(formData.get(champ) ?? "").trim()) {
      return { erreur: "Renseignez tous les champs du logement destinés au bail. Indiquez « Néant » lorsqu'un élément ne s'applique pas.", valeurs };
    }
  }
  if (["surface_m2", "pieces"].some((champ) => formData.has(champ) && !String(formData.get(champ) ?? "").trim())) {
    return { erreur: "La surface habitable et le nombre de pièces sont obligatoires.", valeurs };
  }

  // Surface, Carrez et pièces sont verrouillées en base si le lot est loué
  // (trigger RM-0.5.1) : le formulaire les désactive alors, elles sont donc
  // absentes du FormData — on ne les inclut que si elles sont soumises, pour
  // que renommer/décrire un lot loué reste possible.
  const maj: Record<string, unknown> = {
    nom,
    meuble: formData.get("meuble") === "on",
    etage: String(formData.get("etage") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    tantieme: tantiemeLu.valeur,
    identifiant_fiscal: String(formData.get("identifiant_fiscal") ?? "").trim() || null,
    // Désignation du bail (art. 3 loi 89-462) : chauffage, eau chaude, accessoires
    chauffage: String(formData.get("chauffage") ?? "").trim() || null,
    eau_chaude: String(formData.get("eau_chaude") ?? "").trim() || null,
    locaux_privatifs: String(formData.get("locaux_privatifs") ?? "").trim() || null,
  };
  for (const champ of ["surface_m2", "surface_carrez", "pieces"]) {
    if (!formData.has(champ)) continue;
    if (champ === "pieces") {
      const valeur = String(formData.get(champ) ?? "").trim();
      maj[champ] = valeur ? Number(valeur) : null;
      continue;
    }
    // Les surfaces se lisent sur le texte tel que tapé (« 45,5 » vaut 45,5) : champs en `type="text"`, jamais
    // `type="number"` qui donne 455 à un navigateur non francophone (VER-TS-02).
    const nomSurface = champ === "surface_carrez" ? "Surface Carrez" : "Surface habitable";
    const lue = lireDecimalFacultatif(formData.get(champ));
    if ("erreur" in lue) return { erreur: erreurDuChamp(nomSurface, lue.erreur), valeurs };
    maj[champ] = lue.valeur;
    if (lue.valeur !== null) {
      // Le minimum que le champ numérique portait (min 0,01) : le serveur le dit, la base le garde aussi.
      if (lue.valeur <= 0) return { erreur: `La ${nomSurface.charAt(0).toLowerCase()}${nomSurface.slice(1)} doit être supérieure à zéro.`, valeurs };
      const refus = verifierSurface(lue.valeur, champ === "surface_carrez" ? "La surface Carrez" : "La surface habitable");
      if (refus) return { erreur: refus, valeurs };
    }
  }
  const { error } = await supabase
    .from("lots")
    .update(maj)
    .eq("id", lotId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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
  // La surface, facultative, se lit sur le texte tel que tapé (« 45,5 » vaut 45,5) : champ en `type="text"`, jamais
  // `type="number"` qui donne 455 à un navigateur non francophone (VER-TS-02). Vide, elle reste vide pour la base.
  const lots: { nom: string; surface_m2: number | "" }[] = [];
  for (const [i, nom] of noms.entries()) {
    if (nom.length === 0) continue;
    const lue = lireDecimalFacultatif(surfaces[i] ?? "");
    if ("erreur" in lue) return { erreur: erreurDuChamp("Surface d'un lot", lue.erreur) };
    if (lue.valeur !== null && lue.valeur <= 0) return { erreur: "La surface d'un lot doit être supérieure à zéro." };
    lots.push({ nom, surface_m2: lue.valeur ?? "" });
  }
  if (lots.length === 0) return { erreur: "Renseigner au moins un lot à créer." };

  const { error } = await supabase.rpc("decouper_bien", {
    p_bien: bienId,
    p_lots: lots,
  });
  if (error) return { erreur: `Découpage impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  // Quote-part lue sur le texte tel que tapé (« 33,5 » vaut 33,5) : champ en `type="text"`, jamais `type="number"`
  // qui donne 335 à un navigateur non francophone (VER-TS-02). Vide, elle ne passe pas la borne ci-dessous.
  const quotePartBrute = String(formData.get("quote_part") ?? "").trim();
  const quotePartLue = quotePartBrute ? lireDecimal(quotePartBrute) : { valeur: 0 };
  if ("erreur" in quotePartLue) return { erreur: erreurDuChamp("Quote-part", quotePartLue.erreur), valeurs };
  const quotePart = quotePartLue.valeur;
  const dateDebut = String(formData.get("date_debut") ?? "");
  if (!(quotePart > 0 && quotePart <= 100)) {
    return { erreur: "La quote-part doit être comprise entre 0 et 100.", valeurs };
  }

  // Propriétaire : une personne existante, ou une fiche minimale créée à la
  // volée (les fiches complètes arrivent au S3)
  let personId = String(formData.get("person_id") ?? "");
  let personneCreee: EtatParc["personneCreee"];
  if (personId === "nouvelle") {
    // Pop-up « le propriétaire n'existe pas » (recette 08/08) : fiche créée à
    // la volée avec le rôle propriétaire mandant — mêmes règles que
    // l'assistant : nom, prénom et email obligatoires, email unique.
    const nom = String(formData.get("nouveau_nom") ?? "").trim();
    const prenom = String(formData.get("nouveau_prenom") ?? "").trim();
    const email = String(formData.get("nouveau_email") ?? "").trim();
    const dateNaissance = String(formData.get("nouveau_date_naissance") ?? "").trim();
    const communeNaissance = String(formData.get("nouveau_commune_naissance") ?? "").trim();
    const adresse = String(formData.get("nouveau_adresse") ?? "").trim();
    const codePostal = String(formData.get("nouveau_code_postal") ?? "").trim();
    const ville = String(formData.get("nouveau_ville") ?? "").trim();
    if (!nom) return { erreur: "Le nom du nouveau propriétaire est obligatoire.", valeurs };
    if (!email) return { erreur: "L'adresse email du propriétaire est obligatoire.", valeurs };
    if (!adresse || !codePostal || !ville) return { erreur: "L'adresse complète du propriétaire est obligatoire.", valeurs };
    if (prenom && (!dateNaissance || !communeNaissance)) return { erreur: "La date et la commune de naissance du propriétaire sont obligatoires.", valeurs };
    const { data: memeEmail } = await supabase
      .from("persons")
      .select("id")
      .eq("organization_id", orgId)
      .ilike("email", motifLitteral(email))
      .is("archived_at", null);
    if ((memeEmail ?? []).length > 0) {
      return {
        erreur:
          `Cette adresse email est déjà portée par une fiche ${deLEspaceDeGestion(role)} — choisissez la personne existante dans la liste.`,
        valeurs,
      };
    }
    const { data: personne, error: erreurPersonne } = await supabase
      .from("persons")
      .insert({ organization_id: orgId, nom, prenom: prenom || null, email, date_naissance: dateNaissance || null, commune_naissance: communeNaissance || null, address_line1: adresse, postal_code: codePostal, city: ville, qualite: prenom ? "Personne physique" : "Personne morale" })
      .select("id, nom, prenom")
      .single();
    if (erreurPersonne) return { erreur: sansJargon(erreurPersonne.message), valeurs };
    personId = personne.id;
    personneCreee = personne;
    revalidatePath(`/agence/${orgId}/personnes`);
    revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  }
  if (!personId) return { erreur: "Choisir un propriétaire.", valeurs };

  // La somme des quote-parts actives ≤ 100 % est garantie par trigger (RM-0.2.1)
  const { error } = await supabase.from("detentions").insert({
    lot_id: lotId,
    organization_id: orgId,
    person_id: personId,
    quote_part: quotePart,
    ...(dateDebut ? { date_debut: dateDebut } : {}),
  });
  if (error) {
    if (personneCreee) {
      revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
      revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
      return {
        erreur: `La fiche propriétaire a été créée, mais la détention n'a pas été enregistrée : ${sansJargon(error.message)} Corrigez la détention puis réessayez avec cette fiche.`,
        valeurs: { ...valeurs, person_id: personneCreee.id },
        personneCreee,
      };
    }
    return { erreur: sansJargon(error.message), valeurs };
  }

  // Les blocages « détention » s'affichent aussi sur la fiche bien, le parc et
  // le tableau de bord : mêmes chemins que changerEtatLot.
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}`);
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

  const aujourdhui = aujourdhuiParis();

  // Recette 08/08 : clore une détention qui n'a pas encore commencé posait
  // date_fin < date_debut — la contrainte SQL claquait en jargon. Une
  // détention future ne se clôt pas : c'est une erreur de saisie, on la
  // supprime.
  const { data: detention } = await supabase
    .from("detentions")
    .select("date_debut")
    .eq("id", detentionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (detention && detention.date_debut > aujourdhui) {
    return {
      erreur:
        "Cette détention n'a pas encore débuté : elle ne peut pas être close. " +
        "S'il s'agit d'une erreur de saisie, utilisez « Corriger » (suppression).",
    };
  }

  const { error } = await supabase
    .from("detentions")
    .update({ date_fin: aujourdhui })
    .eq("id", detentionId)
    .eq("organization_id", orgId)
    .is("date_fin", null);
  if (error) return { erreur: sansJargon(error.message) };

  // Mêmes chemins que changerEtatLot : le blocage « détention » peut renaître
  // sur la fiche bien, le parc et le tableau de bord.
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  revalidatePath(`/agence/${orgId}`);
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
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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

  const valeurs = valeursDuFormulaire(formData);
  const type = String(formData.get("type") ?? "");
  const realisation = String(formData.get("date_realisation") ?? "");
  const expiration = String(formData.get("date_expiration") ?? "");
  const diagnostiqueur = String(formData.get("diagnostiqueur") ?? "").trim();

  const referentiel = TYPES_DIAGNOSTIC[type];
  if (!referentiel) return { erreur: "Type de diagnostic invalide.", valeurs };
  if (!realisation) return { erreur: "La date de réalisation est obligatoire.", valeurs };
  if (referentiel.validite_mois != null && !expiration) return { erreur: "La date d’expiration de ce diagnostic est obligatoire.", valeurs };
  const erreurEcheance = erreurEcheanceDpe(type, realisation, expiration);
  if (erreurEcheance) return { erreur: erreurEcheance, valeurs };
  // DOC-07 : un CREP qui relève du plomb doit dater de moins de six ans à la signature du bail (art. R. 1334-11 du
  // code de la santé publique) : son échéance n'est plus facultative.
  if (type === "plomb" && formData.get("plomb_resultat") === "presence" && !expiration) {
    return { erreur: "Un constat qui relève du plomb vaut six ans pour la location : indiquez son échéance.", valeurs };
  }

  // Rattachement bien OU lot selon la nature du diagnostic (RM-0.6.2) ;
  // le dépôt archive l'ancien du même type et lève seul le blocage (RM-0.8.5)
  const auLot = referentiel.niveau === "lot";
  if (auLot && !lotId) {
    return { erreur: "Ce diagnostic se rattache à un lot : le déposer depuis la fiche lot.", valeurs };
  }

  const ceNiveau = auLot ? "ce lot" : "ce bien";
  let documentId: string;
  let avertissement: string | undefined;
  let pieceReutilisee: string | null = null;
  let pieceReclassee = false;

  // X07 (PROP-11) : un diagnostic collectif (DPE d'un immeuble) vaut pour plusieurs lots avec LE MÊME rapport.
  // « Utiliser cette pièce » rattache le diagnostic de ce lot à la pièce déjà rangée : aucun nouveau dépôt,
  // aucune nouvelle fiche document. La pièce se relit sous les droits de l'utilisateur (accès par ligne) ET
  // filtrée sur l'organisation ; la base interdit en plus un diagnostic qui pointe vers la pièce d'une autre
  // organisation (clé étrangère « même organisation »).
  const pieceDemandee = String(formData.get("piece_existante") ?? "").trim();
  if (pieceDemandee) {
    const piece = estUuid(pieceDemandee) ? await lirePieceDiagnostic(supabase, orgId, pieceDemandee) : null;
    if (!piece) {
      return { erreur: "Cette pièce n’est plus disponible dans votre dossier. Choisissez à nouveau le rapport à déposer.", valeurs };
    }
    let dejaUtilisee = supabase
      .from("diagnostics")
      .select("id")
      .eq("organization_id", orgId)
      .eq("document_id", piece.id)
      .eq("type", type)
      .is("archived_at", null);
    dejaUtilisee = auLot ? dejaUtilisee.eq("lot_id", lotId) : dejaUtilisee.eq("bien_id", bienId);
    const { data: usages } = await dejaUtilisee.limit(1);
    if (usages && usages.length > 0) {
      return { erreur: `Cette pièce est déjà utilisée pour ${ceNiveau} : rien à ajouter.`, valeurs };
    }
    documentId = piece.id;
    pieceReutilisee = piece.titre ?? "sans titre";
    pieceReclassee = piece.type !== "diagnostic";
  } else {
    // PDF du rapport OBLIGATOIRE (arbitrage 2026-08-01) : le diagnostic est annexé
    // au bail, on exige son rapport dès le dépôt. Déposé dans la GED (type réel
    // vérifié, anti-doublon, accès tracés) et lié au diagnostic.
    const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);
    if (erreurDepotDirect) return { erreur: erreurDepotDirect };
    const fichier = formData.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) {
      return { erreur: "Le rapport (PDF) du diagnostic est obligatoire : il est annexé au bail.", valeurs };
    }
    const depot = await deposerFichierGed(
      supabase,
      user,
      orgId,
      fichier,
      "diagnostic",
      `${referentiel.libelle} — ${formaterDate(realisation)}`
    );
    if (depot.erreur || !depot.documentId) {
      // Le même rapport est déjà rangé : si c'est bien un rapport de diagnostic de cette organisation, on le
      // propose (« Utiliser cette pièce pour ce lot ») au lieu de laisser l'utilisateur dans une impasse.
      const offre = depot.doublonId ? await lirePieceDiagnostic(supabase, orgId, depot.doublonId) : null;
      return {
        erreur: depot.erreur ?? "Échec du dépôt du fichier.",
        valeurs,
        ...(offre ? { pieceExistante: offre } : {}),
      };
    }
    documentId = depot.documentId;
    avertissement = depot.avertissement;
  }

  // Classe énergétique (DPE uniquement) — sert au blocage « classe G interdite »
  const classe = String(formData.get("classe_dpe") ?? "").trim().toUpperCase();
  const classeDpe = type === "dpe" && /^[A-G]$/.test(classe) ? classe : null;

  const { error } = await supabase.from("diagnostics").insert({
    organization_id: orgId,
    bien_id: auLot ? null : bienId,
    lot_id: auLot ? lotId : null,
    type,
    date_realisation: realisation,
    date_expiration: expiration || null,
    diagnostiqueur: diagnostiqueur || null,
    document_id: documentId,
    classe_dpe: classeDpe,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  for (const racine of ["agence", "espace"]) {
    revalidatePath(`/${racine}/${orgId}/parc/${bienId}`);
    if (lotId) revalidatePath(`/${racine}/${orgId}/parc/${bienId}/lots/${lotId}`);
    revalidatePath(`/${racine}/${orgId}/parc`);
    revalidatePath(`/${racine}/${orgId}/documents`);
    revalidatePath(`/${racine}/${orgId}/baux`, "layout");
  }
  if (pieceReutilisee !== null) {
    return { succes: `${referentiel.libelle} enregistré pour ${ceNiveau} avec la pièce déjà déposée (« ${pieceReutilisee} »), sans copie supplémentaire.${pieceReclassee ? " Elle est désormais classée en « Diagnostic » dans vos documents." : ""}` };
  }
  const base = `${referentiel.libelle} déposé.`;
  return { succes: avertissement ? `${base} ${avertissement}` : base };
}

// Un rapport de diagnostic vivant de CETTE organisation, relu sous les droits de l'utilisateur (un agent restreint
// ne voit pas les pièces hors de son portefeuille). `null` : introuvable, d'une autre organisation, d'un autre
// type (pièce d'identité, quittance…) ou effacé.
// DOC-02 : le même rapport d'abord rangé dans Documents en « Autre » ou « Courrier » (seuls types proposés au dépôt
// libre, avec les pièces personnelles) ou joint au bail comme annexe (« Autre ») s'utilise aussi : sinon l'anti-doublon
// le refuse sans issue. La base le reclasse en « Diagnostic » dans la transaction du diagnostic, pour qu'il suive la
// conservation des diagnostics (fin de gestion du bien) et non celle d'un document quelconque.
const TYPES_PIECE_DIAGNOSTIC = ["diagnostic", "autre", "courrier"];
async function lirePieceDiagnostic(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  documentId: string
): Promise<{ id: string; titre: string | null; type: string } | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, titre, type")
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .in("type", TYPES_PIECE_DIAGNOSTIC)
    .is("purged_at", null)
    .maybeSingle();
  return data ? { id: data.id as string, titre: (data.titre as string | null) ?? null, type: data.type as string } : null;
}

// Pièces du lot : la vraie liste (Séjour, Chambre 1…) qui sert à générer la
// grille d'état des lieux pièce par pièce (le champ lots.pieces reste le compteur).
export async function ajouterPieceLot(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { erreur: "Le nom de la pièce est obligatoire.", valeurs };
  // La colonne `ordre` restait nulle : les pièces remontaient alors par ordre
  // alphabétique, « Chambre » avant « Entrée ». On ajoute à la suite.
  const { error } = await supabase
    .from("lot_pieces")
    .insert({ lot_id: lotId, organization_id: orgId, nom, ordre: await prochainOrdre(supabase, lotId) });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: `Pièce « ${nom} » ajoutée.` };
}

async function prochainOrdre(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  lotId: string
): Promise<number> {
  const { data } = await supabase
    .from("lot_pieces")
    .select("ordre")
    .eq("lot_id", lotId)
    .order("ordre", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return ((data?.ordre as number | null) ?? -1) + 1;
}

// Proposer les pièces habituelles plutôt que la page blanche. L'agent qui doit
// tout écrire à la main saute l'étape, et la grille d'état des lieux retombe sur
// sept lignes génériques — un document qui tient mal face à une contestation.
export async function proposerPiecesLot(
  orgId: string,
  bienId: string,
  lotId: string
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: lot } = await supabase
    .from("lots")
    .select("pieces")
    .eq("id", lotId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { data: existantes } = await supabase
    .from("lot_pieces")
    .select("nom")
    .eq("lot_id", lotId);
  const deja = new Set(
    ((existantes ?? []) as { nom: string }[]).map((p) => p.nom.toLocaleLowerCase("fr"))
  );

  const depart = await prochainOrdre(supabase, lotId);
  const aCreer = piecesHabituelles(lot?.pieces as number | null)
    .filter((nom) => !deja.has(nom.toLocaleLowerCase("fr")))
    .map((nom, i) => ({ lot_id: lotId, organization_id: orgId, nom, ordre: depart + i }));

  if (aCreer.length === 0)
    return { succes: "Ces pièces sont déjà là — ajustez la liste si besoin." };

  const { error } = await supabase.from("lot_pieces").insert(aCreer);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return {
    succes: `${aCreer.length} pièces proposées. Retirez celles qui n'existent pas, ajoutez les autres.`,
  };
}

export async function supprimerPieceLot(
  orgId: string,
  bienId: string,
  lotId: string,
  pieceId: string
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("lot_pieces")
    .delete()
    .eq("id", pieceId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Pièce retirée." };
}

// Informations pratiques du logement/immeuble (destinées au locataire) :
// consignes libres saisies par le gérant, une fiche par bien (upsert).
export async function enregistrerInfosPratiques(
  orgId: string,
  bienId: string,
  _etat: EtatParc,
  formData: FormData
): Promise<EtatParc> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champ = (nom: string) => {
    const v = String(formData.get(nom) ?? "").trim();
    return v || null;
  };
  const { error } = await supabase.from("bien_infos_pratiques").upsert(
    {
      bien_id: bienId,
      organization_id: orgId,
      sortie_poubelles: champ("sortie_poubelles"),
      local_poubelles: champ("local_poubelles"),
      gardien: champ("gardien"),
      travaux: champ("travaux"),
      stationnement: champ("stationnement"),
      autres: champ("autres"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bien_id" }
  );
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Informations pratiques enregistrées." };
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
  // Chaque pourcentage est lu sur le texte tel que tapé (« 33,5 » vaut 33,5) : le champ est en `type="text"`, jamais
  // `type="number"` qui donne 335 à un navigateur non francophone (VER-TS-02). Un champ vide ou illisible est refusé,
  // plus lu « 0 » : la base valide ensuite le 100,00 exact.
  const lignes: { lot_id: string; pourcentage: number }[] = [];
  for (const [i, lot_id] of lotIds.entries()) {
    const lue = lireDecimal(pourcentages[i] ?? "");
    if ("erreur" in lue) return { erreur: erreurDuChamp("Pourcentage d'un lot", lue.erreur) };
    lignes.push({ lot_id, pourcentage: lue.valeur });
  }

  const { error } = await supabase.rpc("valider_cle_repartition", {
    p_bien: bienId,
    p_mode: mode,
    p_lignes: lignes,
  });
  if (error) return { erreur: `Validation impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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

  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { erreur: "Le nom de l'équipement est obligatoire.", valeurs };

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
            : sansJargon(error.message),
      valeurs,
    };
  }

  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
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
  // Purge + réinsertion dans une seule transaction côté base : un insert
  // refusé ne laisse plus le lot sans équipements (audit vie du bail 09/09).
  const { error } = await supabase.rpc("definir_equipements_lot", {
    p_lot: lotId,
    p_equipements: retenus,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Équipements du lot enregistrés." };
}
