"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { piecesHabituelles } from "@/lib/pieces";
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
  const { supabase, user, role } = await verifierGerant(orgId);
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

  // Questionnaire progressif : un bien divisé arrive avec sa liste de lots.
  // Le premier lot devient le « lot unique » créé par RM-0.1.2, les suivants
  // passent par le découpage (héritage des détentions, clé invalidée).
  type LotSaisi = { nom?: string; surface?: string; pieces?: string };
  let lotsSaisis: LotSaisi[] = [];
  const lotsBrut = String(formData.get("lots") ?? "").trim();
  if (lotsBrut) {
    try {
      const parse = JSON.parse(lotsBrut);
      if (Array.isArray(parse)) lotsSaisis = parse as LotSaisi[];
    } catch {
      return { erreur: "Liste des lots illisible." };
    }
  }
  if ((TYPES_NON_DECOUPABLES as readonly string[]).includes(type) && lotsSaisis.length > 1) {
    return {
      erreur: `Un bien de type « ${TYPES_BIEN[type]} » est déjà l'unité locative : il ne se découpe pas en lots.`,
    };
  }
  const premier = lotsSaisis[0];

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
    p_surface: premier?.surface ? Number(premier.surface) : surface ? Number(surface) : null,
    p_pieces: premier?.pieces ? Number(premier.pieces) : pieces ? Number(pieces) : null,
  });
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}` };

  // Espace propriétaire direct (recette 08/08) : le propriétaire d'un bien,
  // c'est lui — le champ propriétaire est masqué à l'écran mais la détention
  // est bel et bien posée en base, sur sa propre fiche (créée au besoin).
  // Posée AVANT le découpage : les lots supplémentaires en héritent.
  if (role === "proprietaire_direct" && bienId) {
    let { data: fiche } = await supabase
      .from("persons")
      .select("id")
      .eq("organization_id", orgId)
      .eq("account_id", user.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!fiche) {
      const { data: creee } = await supabase
        .from("persons")
        .insert({
          organization_id: orgId,
          account_id: user.id,
          nom: user.email?.split("@")[0] ?? "Propriétaire",
          email: user.email ?? null,
        })
        .select("id")
        .single();
      fiche = creee;
    }
    if (fiche) {
      const { data: lotUnique } = await supabase
        .from("lots")
        .select("id")
        .eq("bien_id", bienId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (lotUnique) {
        await supabase.from("detentions").insert({
          lot_id: lotUnique.id,
          organization_id: orgId,
          person_id: fiche.id,
          quote_part: 100,
        });
      }
    }
  }

  if (lotsSaisis.length > 0 && bienId) {
    // Le lot d'origine porte le nom saisi pour le premier lot
    if (premier?.nom?.trim()) {
      await supabase
        .from("lots")
        .update({ nom: premier.nom.trim() })
        .eq("bien_id", bienId)
        .eq("organization_id", orgId);
    }
    const suivants = lotsSaisis.slice(1).map((l, i) => ({
      nom: l.nom?.trim() || `Lot ${i + 2}`,
      surface_m2: l.surface ?? "",
      pieces: l.pieces ?? "",
    }));
    if (suivants.length > 0) {
      const { error: erreurDecoupe } = await supabase.rpc("decouper_bien", {
        p_bien: bienId,
        p_lots: suivants,
      });
      if (erreurDecoupe) {
        return {
          erreur: `Bien créé, mais les lots supplémentaires ont échoué : ${sansJargon(erreurDecoupe.message)}`,
        };
      }
    }
  }

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
      zone_tendue: formData.get("zone_tendue") === "on",
    })
    .eq("id", bienId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };

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
    identifiant_fiscal: String(formData.get("identifiant_fiscal") ?? "").trim() || null,
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
  if (error) return { erreur: sansJargon(error.message) };

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
  if (error) return { erreur: sansJargon(error.message) };

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
  if (error) return { erreur: `Découpage impossible : ${sansJargon(error.message)}` };

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
    // Pop-up « le propriétaire n'existe pas » (recette 08/08) : fiche créée à
    // la volée avec le rôle propriétaire mandant — mêmes règles que
    // l'assistant : nom, prénom et email obligatoires, email unique.
    const nom = String(formData.get("nouveau_nom") ?? "").trim();
    const prenom = String(formData.get("nouveau_prenom") ?? "").trim();
    const email = String(formData.get("nouveau_email") ?? "").trim();
    if (!nom) return { erreur: "Le nom du nouveau propriétaire est obligatoire." };
    if (!email) return { erreur: "L'adresse email du propriétaire est obligatoire." };
    const { data: memeEmail } = await supabase
      .from("persons")
      .select("id")
      .eq("organization_id", orgId)
      // % et _ sont des jokers pour ilike : on les échappe (les emails
      // contiennent souvent des _) pour comparer l'adresse littérale.
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .is("archived_at", null);
    if ((memeEmail ?? []).length > 0) {
      return {
        erreur:
          "Cette adresse email est déjà portée par une fiche de l'agence — choisissez la personne existante dans la liste.",
      };
    }
    const { data: personne, error: erreurPersonne } = await supabase
      .from("persons")
      .insert({ organization_id: orgId, nom, prenom: prenom || null, email })
      .select("id")
      .single();
    if (erreurPersonne) return { erreur: sansJargon(erreurPersonne.message) };
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
  if (error) return { erreur: sansJargon(error.message) };

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
  if (error) return { erreur: sansJargon(error.message) };

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
  if (error) return { erreur: sansJargon(error.message) };

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

  // PDF du rapport OBLIGATOIRE (arbitrage 2026-08-01) : le diagnostic est annexé
  // au bail, on exige son rapport dès le dépôt. Déposé dans la GED (type réel
  // vérifié, anti-doublon, accès tracés) et lié au diagnostic.
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Le rapport (PDF) du diagnostic est obligatoire : il est annexé au bail." };
  }
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
  const documentId = depot.documentId;

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
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  if (lotId) revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/documents`);
  const base = `${referentiel.libelle} déposé.`;
  return { succes: depot.avertissement ? `${base} ${depot.avertissement}` : base };
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
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { erreur: "Le nom de la pièce est obligatoire." };
  // La colonne `ordre` restait nulle : les pièces remontaient alors par ordre
  // alphabétique, « Chambre » avant « Entrée ». On ajoute à la suite.
  const { error } = await supabase
    .from("lot_pieces")
    .insert({ lot_id: lotId, organization_id: orgId, nom, ordre: await prochainOrdre(supabase, lotId) });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
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
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
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
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
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
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
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
  const lignes = lotIds.map((lot_id, i) => ({
    lot_id,
    pourcentage: Number(pourcentages[i] ?? 0),
  }));

  const { error } = await supabase.rpc("valider_cle_repartition", {
    p_bien: bienId,
    p_mode: mode,
    p_lignes: lignes,
  });
  if (error) return { erreur: `Validation impossible : ${sansJargon(error.message)}` };

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
    if (error) return { erreur: sansJargon(error.message) };
  }

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Équipements du lot enregistrés." };
}
