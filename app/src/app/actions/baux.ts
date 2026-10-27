"use server";
import { resoudreDepotsFormulaire, limiteFichierDepose } from "@/lib/depot-direct";


import { avertissementsCoherenceLoyer, type AvertissementLoyer } from "@/lib/coherence-loyer";
import { premier } from "@/lib/postgrest";
import { lireMentionsContrat, verifierHonorairesContrat } from "@/lib/mentions-contrat";
import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { detecterMimeReel } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deLEspaceDeGestion } from "@/lib/libelles";
import { abandonnerPieceGed, deposerFichierGed, preparerFichierGed } from "@/lib/ged-depot";
import { cibleBlocage } from "@/lib/parc";
import { aujourdhuiParis, motifLitteral, eur } from "@/lib/ged";
import { verifierCodePostalPersonne, verifierDateNaissance } from "@/lib/validation-fiches";
import { TYPES_BAIL, mentionsObligatoiresManquantes } from "@/lib/baux";
import { ETATS_INVENTAIRE, MOBILIER_DECRET_2015_981, mobilierDecretManquant } from "@/lib/inventaire-meuble";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { CODE_CONFIRMATION_CLOTURE, lireDateSortie } from "@/lib/cloture-bail";
import { envoyerEmail } from "@/lib/email";
import { echapperHtml } from "@/lib/quittance-email";
import { moisDepotGarantie } from "@/lib/depot-garantie";
import { adresseDeRetour, MESSAGE_SITE_NON_CONFIGURE } from "@/lib/site";
import { erreurDuChamp, lireDecimalFacultatif, lireMontantFacultatif } from "@/lib/saisie-montant";
import { baseEspace, racineEspace } from "@/lib/racine-espace";

export type BlocageActionable = { message: string; href: string; libelle: string };
export type EtatBail = {
  erreur?: string;
  succes?: string;
  avertissements?: AvertissementLoyer[];
  bailCree?: string;
  blocages?: BlocageActionable[];
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
  // La base demande une confirmation (clôture avant la fin du préavis, D34) :
  // le formulaire affiche alors la case à cocher, même si son propre calcul
  // n'avait pas vu l'écart.
  confirmationRequise?: boolean;
  // Parcours du brouillon : valeurs de l’étape après enregistrement, ou valeurs
  // enregistrées entre-temps ailleurs qui ont fait refuser la saisie (CB-01).
  valeursEnregistrees?: Record<string, string>;
  modifieesAilleurs?: Record<string, string>;
};

// Créer un bail (brouillon) sur un lot.
export async function creerBail(
  orgId: string,
  lotId: string,
  bienId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const logement = await lireLogementPourDepot(supabase, orgId, lotId, formData);
  if ("erreur" in logement) return { erreur: logement.erreur, valeurs };
  const champs = lireChampsBail(formData, logement.meuble);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };
  const locataire = await resoudreLocatairePrincipal(supabase, orgId, formData, role);
  if ("erreur" in locataire) return { erreur: locataire.erreur, valeurs };
  champs.valeurs.locataire_principal = locataire.id;

  const { data, error } = await supabase
    .from("baux")
    .insert({
      organization_id: orgId,
      lot_id: lotId,
      etat: "brouillon",
      ...champs.valeurs,
    })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}`, valeurs };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Brouillon créé.", bailCree: data.id };
}

// Champs communs création / édition (recette 21/08 : le brouillon devient
// corrigeable, et la date d'entrée se saisit — elle tombait au jour du clic
// « Activer », faussant l'échéancier)
async function lireLogementPourDepot(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  lotId: string,
  formData: FormData
): Promise<{ meuble: boolean } | { erreur: string }> {
  if (!["colocation", "colocation_individuelle"].includes(String(formData.get("type")))) return { meuble: false };
  // Ne pas croire un indicateur envoyé par le navigateur : relire le lot
  // autorisé dans l'agence avant de calculer le plafond de la colocation.
  const { data, error } = await supabase.from("lots").select("meuble")
    .eq("id", lotId).eq("organization_id", orgId).maybeSingle();
  if (error || !data) return { erreur: "Le logement ne peut pas être vérifié. Rechargez le dossier avant d’enregistrer le bail." };
  return { meuble: data.meuble === true };
}

// Un montant obligatoire du bail, lu sur le texte tel que tapé (« 840,00 » vaut 840, voir lireMontant) : le champ
// est en `type="text"`, jamais `type="number"` qui donne 84000 à un navigateur non francophone (VFL-07). Vide :
// « obligatoire » ; zéro : admis, il se saisit quand le montant est nul.
function montantObligatoireDuBail(
  formData: FormData,
  champ: string,
  libelle: string,
  obligatoire: string
): { montant: number } | { erreur: string } {
  const lu = lireMontantFacultatif(formData.get(champ));
  if ("erreur" in lu) return { erreur: erreurDuChamp(libelle, lu.erreur) };
  if (lu.montant === null) return { erreur: obligatoire };
  return { montant: lu.montant };
}

function lireChampsBail(
  formData: FormData,
  logementMeuble: boolean
): { erreur: string } | { valeurs: Record<string, unknown> } {
  const locataire = String(formData.get("locataire_principal") ?? "");
  if (!locataire) return { erreur: "Choisissez le locataire principal." };
  const jour = String(formData.get("jour_echeance") ?? "1").trim();
  const choixType = String(formData.get("type") ?? "nu");
  if (!["nu", "meuble", "colocation", "colocation_individuelle"].includes(choixType)) return { erreur: "Choisissez un type de bail proposé." };
  const individuel = choixType === "colocation_individuelle";
  const chambre = String(formData.get("chambre_id") ?? "").trim();
  if (individuel && !/^[0-9a-f-]{36}$/i.test(chambre)) return { erreur: "Choisissez la chambre privative de ce contrat." };
  const type = individuel ? "colocation" : choixType;

  const dateDebut = String(formData.get("date_debut") ?? "").trim();
  if (!dateDebut) return { erreur: "La date d'entrée est obligatoire." };
  const loyerLu = montantObligatoireDuBail(formData, "loyer_hc", "Loyer hors charges", "Le loyer hors charges est obligatoire.");
  if ("erreur" in loyerLu) return loyerLu;
  const chargesLu = montantObligatoireDuBail(formData, "charges", "Charges", "Le montant des charges est obligatoire. Saisissez 0 s'il n'y en a pas.");
  if ("erreur" in chargesLu) return chargesLu;
  const depotLu = montantObligatoireDuBail(formData, "depot_garantie", "Dépôt de garantie", "Le dépôt de garantie est obligatoire. Saisissez 0 s'il n'y en a pas.");
  if ("erreur" in depotLu) return depotLu;
  const loyer = loyerLu.montant;
  const charges = chargesLu.montant;
  const depot = depotLu.montant;
  if (!/^\d+$/.test(jour) || Number(jour) < 1 || Number(jour) > 28) return { erreur: "Le jour d'échéance doit être compris entre 1 et 28." };

  // Plafond légal du dépôt de garantie (audit 09/09, RM-2.1.1 / RM-2.1.2 —
  // wiki « Dépôt de garantie ») : 1 mois HORS CHARGES en nu, 2 en meublé.
  // En colocation, le caractère du logement détermine le plafond du bail
  // entier (Service Public F34661/F31269, vérification du 14/09). Le contrôle
  // n'attendait que l'activation, un bail nu acceptait n'importe quel dépôt.
  const mois = moisDepotGarantie(type, logementMeuble);
  const plafond = mois * loyer;
  if (depot > plafond) {
    return {
      erreur: `Dépôt de garantie trop élevé : le plafond légal d'un bail ${
        (TYPES_BAIL[type] ?? type).toLowerCase()
      } est de ${mois} mois de loyer hors charges, soit ${eur(plafond)}.`,
    };
  }

  // Audit métier du 27/09 — wiki « Régularisation des charges » : sur un bail
  // nu, le forfait n'est ouvert qu'à la colocation (contrat type, IV.B). La
  // base le refuse aussi (baux_forfait_charges).
  if (type === "nu" && formData.get("charges_mode") === "forfait") {
    return {
      erreur:
        "Charges au forfait impossibles sur un bail nu : le forfait est réservé à la colocation et au meublé. Choisissez des provisions régularisables.",
    };
  }

  return {
    valeurs: {
      type,
      chambre_id: individuel ? chambre : null,
      locataire_principal: locataire,
      date_debut: dateDebut,
      loyer_hc: loyer,
      charges,
      // Provision (régularisable) ou forfait (définitif — RM-3.9.8)
      charges_mode: formData.get("charges_mode") === "forfait" ? "forfait" : "provision",
      depot_garantie: depot,
      jour_echeance: Number(jour),
      irl_trimestre: String(formData.get("irl_trimestre") ?? "").trim() || null,
      revision_irl: formData.get("revision_irl") === "on",
    },
  };
}

// Création rapide d'un locataire (recette Tahir 09/09) : le select du bail
// propose « + Nouveau locataire… » comme la détention propose un nouveau
// propriétaire — la fiche est créée AVEC le bail, mêmes règles que la
// détention (email obligatoire et unique dans l'agence, fiche complétable
// ensuite dans Personnes).
async function resoudreLocatairePrincipal(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  formData: FormData,
  role?: string | null
): Promise<{ id: string } | { erreur: string }> {
  const choix = String(formData.get("locataire_principal") ?? "");
  if (choix !== "nouvelle") return { id: choix };
  const nom = String(formData.get("nouveau_locataire_nom") ?? "").trim();
  const prenom = String(formData.get("nouveau_locataire_prenom") ?? "").trim();
  const email = String(formData.get("nouveau_locataire_email") ?? "").trim();
  const dateNaissance = String(formData.get("nouveau_locataire_date_naissance") ?? "").trim();
  const communeNaissance = String(formData.get("nouveau_locataire_commune_naissance") ?? "").trim();
  const adresse = String(formData.get("nouveau_locataire_adresse") ?? "").trim();
  const codePostal = String(formData.get("nouveau_locataire_code_postal") ?? "").trim();
  const ville = String(formData.get("nouveau_locataire_ville") ?? "").trim();
  if (!nom || !prenom || !email || !dateNaissance || !communeNaissance || !adresse || !codePostal || !ville) {
    return { erreur: "Nouveau locataire : l'identité, la naissance, l'adresse complète et l'email sont obligatoires." };
  }
  const refusIdentite =
    verifierDateNaissance(dateNaissance, aujourdhuiParis()) ?? verifierCodePostalPersonne(codePostal);
  if (refusIdentite) return { erreur: `Nouveau locataire : ${refusIdentite[0].toLowerCase()}${refusIdentite.slice(1)}` };
  const { data: existante } = await supabase
    .from("persons")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("email", motifLitteral(email))
    .is("archived_at", null)
    .limit(1);
  if ((existante ?? []).length > 0) {
    return {
      erreur:
        `Cette adresse email appartient déjà à une fiche ${deLEspaceDeGestion(role)} — choisissez la personne dans la liste.`,
    };
  }
  const { data: personne, error } = await supabase
    .from("persons")
    .insert({ organization_id: orgId, nom, prenom, email, date_naissance: dateNaissance, commune_naissance: communeNaissance, address_line1: adresse, postal_code: codePostal, city: ville, qualite: "Personne physique" })
    .select("id")
    .single();
  if (error || !personne) {
    return { erreur: `Création du locataire impossible : ${sansJargon(error?.message ?? "")}` };
  }
  revalidatePath(`/agence/${orgId}/personnes`);
  return { id: personne.id };
}

// Corriger un brouillon (recette 21/08 : la saisie initiale était figée dès
// la création — il fallait recréer un bail pour changer un montant).
export async function modifierBail(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  // Seul un brouillon se corrige — vérifié AVANT de résoudre le locataire :
  // sinon « + Nouveau locataire… » créait une fiche personne orpheline alors
  // que la modification allait être refusée (audit vie du bail 09/09).
  const { data: bailActuel } = await supabase
    .from("baux")
    .select("etat, lot_id")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (bailActuel?.etat !== "brouillon") {
    return { erreur: "Seul un bail en brouillon se corrige — celui-ci a déjà avancé.", valeurs };
  }

  const logement = await lireLogementPourDepot(supabase, orgId, bailActuel.lot_id, formData);
  if ("erreur" in logement) return { erreur: logement.erreur, valeurs };
  const champs = lireChampsBail(formData, logement.meuble);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };

  const locataire = await resoudreLocatairePrincipal(supabase, orgId, formData, role);
  if ("erreur" in locataire) return { erreur: locataire.erreur, valeurs };
  champs.valeurs.locataire_principal = locataire.id;

  // Seul un brouillon se corrige : signé, le bail est le contrat
  const { data: modifies, error } = await supabase
    .from("baux")
    .update(champs.valeurs)
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .eq("etat", "brouillon")
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if ((modifies ?? []).length === 0) {
    return { erreur: "Seul un bail en brouillon se corrige — celui-ci a déjà avancé.", valeurs };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Brouillon corrigé." };
}

// Les nombres du complément de contrat, et le libellé qui les nomme dans un refus (le formulaire en porte huit).
const NOMBRES_COMPLEMENTS_BAIL: [string, string][] = [
  ["irl_valeur", "Valeur de l'IRL"],
  ["travaux_recents_montant", "Montant des travaux récents"],
  ["honoraires_bailleur", "Honoraires du bailleur"],
  ["honoraires_locataire", "Honoraires du locataire"],
  ["loyer_reference", "Loyer de référence"],
  ["loyer_reference_majore", "Loyer de référence majoré"],
  ["complement_loyer", "Complément de loyer"],
  ["dernier_loyer", "Dernier loyer de l'ancien locataire"],
];

// Compléments du contrat (bail 100 % rempli, 09/09) : les conditions
// détaillées que le contrat type imprime — fixation et paiement du loyer,
// travaux, honoraires, encadrement en zone tendue, clauses particulières.
// Tous facultatifs : un champ vide s'écrit NULL, le modèle PDF imprime alors
// son libellé d'épreuve ou « — ». Même garde que modifierBail : seul un
// brouillon se corrige.
export async function modifierComplementsBail(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const texte = (nom: string) => String(formData.get(nom) ?? "").trim() || null;

  const situation = texte("precedente_location");
  if (situation && !["premiere", "ancienne", "recente"].includes(situation)) return { erreur: "Choisissez la situation de la précédente location.", valeurs };
  const revision = texte("precedent_loyer_revise");
  if (revision && !["true", "false"].includes(revision)) return { erreur: "Précisez si le précédent loyer a été révisé.", valeurs };
  const { mentions, erreur: erreurMentions } = lireMentionsContrat(formData);
  if (erreurMentions) return { erreur: erreurMentions, valeurs };
  // Chaque nombre est lu sur le texte tel que tapé (« 840,00 » vaut 840, « 145,17 » vaut 145,17) : ces champs sont
  // en `type="text"`, jamais `type="number"` qui donne 84000 à un navigateur non francophone (VFL-07). Vide : NULL.
  const nombres: Record<string, number | null> = {};
  for (const [champ, libelle] of NOMBRES_COMPLEMENTS_BAIL) {
    const brut = formData.get(champ);
    const lu = champ === "irl_valeur" ? lireDecimalFacultatif(brut) : lireMontantFacultatif(brut);
    if ("erreur" in lu) return { erreur: erreurDuChamp(libelle, lu.erreur), valeurs };
    nombres[champ] = "valeur" in lu ? lu.valeur : lu.montant;
  }
  const nombre = (nom: string) => nombres[nom] ?? null;
  const { data: contrat, error: erreurLecture } = await supabase.from("baux")
    .select("lot_id, loyer_hc, type, chambre_id, encadrement_loyer, lot:lots!baux_lot_meme_org_fk(surface_m2, bien_id)")
    .eq("id", bailId).eq("organization_id", orgId).eq("etat", "brouillon").maybeSingle();
  if (erreurLecture) return { erreur: "Le logement n’a pas pu être vérifié. Réessayez.", valeurs };
  if (!contrat) return { erreur: "Seul un bail en brouillon accessible peut être corrigé.", valeurs };
  const logement = premier(contrat.lot);
  const erreurHonoraires = verifierHonorairesContrat({ ...mentions, honoraires_bailleur: nombre("honoraires_bailleur"), honoraires_locataire: nombre("honoraires_locataire") }, logement?.surface_m2 ?? null);
  if (erreurHonoraires) return { erreur: erreurHonoraires, valeurs };


  const { data: modifies, error } = await supabase
    .from("baux")
    .update({
      ...mentions,
      fixation_loyer: texte("fixation_loyer"),
      paiement_echeance: formData.get("paiement_echeance") === "echu" ? "echu" : "echoir",
      lieu_paiement: texte("lieu_paiement"),
      irl_valeur: nombre("irl_valeur"),
      duree_reduite_evenement: texte("duree_reduite_evenement"),
      travaux_recents: texte("travaux_recents"),
      travaux_recents_montant: nombre("travaux_recents_montant"),
      travaux_locataire: texte("travaux_locataire"),
      honoraires_bailleur: nombre("honoraires_bailleur"),
      honoraires_locataire: nombre("honoraires_locataire"),
      clauses_particulieres: texte("clauses_particulieres"),
      // Encadrement explicitement activé : les champs masqués sont absents et s’écrivent NULL.
      loyer_reference: nombre("loyer_reference"),
      loyer_reference_majore: nombre("loyer_reference_majore"),
      complement_loyer: nombre("complement_loyer"),
      complement_justification: texte("complement_justification"),
      dernier_loyer: nombre("dernier_loyer"),
      dernier_loyer_versement: texte("dernier_loyer_versement"),
      dernier_loyer_revision: texte("dernier_loyer_revision"),
      ...(formData.has("precedente_location") ? { precedente_location: situation } : {}),
      ...(formData.has("precedent_loyer_revise") ? { precedent_loyer_revise: revision === null ? null : revision === "true" } : {}),
      meuble_etudiant: formData.get("meuble_etudiant") === "on",
    })
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .eq("etat", "brouillon")
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if ((modifies ?? []).length === 0) {
    return { erreur: "Seul un bail en brouillon se corrige — celui-ci a déjà avancé.", valeurs };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (logement?.bien_id) revalidatePath(`/agence/${orgId}/parc/${logement.bien_id}/lots/${contrat.lot_id}`);
  return { succes: "Compléments enregistrés.", valeurs, avertissements: avertissementsCoherenceLoyer({
    ...contrat, ...mentions, loyer_reference: nombre("loyer_reference"), loyer_reference_majore: nombre("loyer_reference_majore"),
    complement_loyer: nombre("complement_loyer"), complement_justification: texte("complement_justification"),
  }, logement?.surface_m2) };
}

// Blocages de mise en location, chacun transformé en action cliquable
// (bouton « Corriger » vers la bonne section de la fiche lot / bien).
async function blocagesActionables(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  bailId: string,
  racine: string
): Promise<BlocageActionable[]> {
  const { data: bail } = await supabase
    .from("baux")
    .select("lot_id")
    .eq("id", bailId)
    .maybeSingle();
  if (!bail) return [];
  const [{ data: lot }, { data: causes }] = await Promise.all([
    supabase.from("lots").select("id, bien_id").eq("id", bail.lot_id).maybeSingle(),
    supabase.rpc("lot_blocages_location", { p_lot: bail.lot_id }),
  ]);
  if (!lot || !Array.isArray(causes)) return [];
  return (causes as string[]).map((m) => ({
    message: m,
    ...cibleBlocage(m, { orgId, bienId: lot.bien_id, lotId: lot.id, racine }),
  }));
}

// Pièces PDF rattachées au bail : le bail signé et le règlement de
// copropriété (facultatif). Même contrôle : un PDF complet, une image d'une
// page ne vaut pas le document.
async function deposerPieceBail(
  orgId: string,
  bailId: string,
  formData: FormData,
  piece: {
    colonne: "document_signe" | "reglement_copropriete";
    type: string;
    titre: string;
    succes: string;
  }
): Promise<EtatBail> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const racine = racineEspace(role === "proprietaire_direct"); // décision D27

  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);

  if (erreurDepotDirect) return { erreur: erreurDepotDirect };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le PDF." };
  if (fichier.size > limiteFichierDepose(fichier)) return { erreur: `Fichier trop volumineux (${limiteFichierDepose(fichier) / 1024 / 1024} Mo max).` };
  // Recette 21/08 : un bail signé est un PDF — une photo de la première page
  // passait la GED (qui accepte les images) et valait document contractuel.
  const mime = detecterMimeReel(new Uint8Array(await fichier.arrayBuffer()));
  if (mime !== "application/pdf") {
    return { erreur: `${piece.titre} se dépose en PDF complet — une image d'une page ne vaut pas le document.` };
  }

  // Le bail signé active le bail (sprint « Alertes & documents ») : les
  // contrôles de mise en location passent AVANT le dépôt — un PDF refusé ne
  // laisse rien derrière lui.
  const activation = piece.colonne === "document_signe";
  if (activation) {
    const { error } = await supabase.rpc("controler_mise_en_location", { p_bail: bailId });
    if (error) {
      if (error.message.includes("Mise en location bloquée")) {
        const blocages = await blocagesActionables(supabase, orgId, bailId, racine);
        if (blocages.length > 0) return { erreur: "Mise en location bloquée — à corriger :", blocages };
      }
      // Mentions obligatoires du contrat (date d'effet, loyer, locataire) :
      // la fiche les annonce déjà et ferme le dépôt, on n'arrive ici qu'en
      // course. Chacune renvoie au brouillon, là où elle se saisit.
      if (error.message.includes("Mentions obligatoires")) {
        const { data: aCompleter } = await supabase
          .from("baux")
          .select("locataire_principal, date_debut, loyer_hc")
          .eq("id", bailId)
          .eq("organization_id", orgId)
          .maybeSingle();
        const mentions = aCompleter ? mentionsObligatoiresManquantes(aCompleter) : [];
        if (mentions.length > 0) {
          return {
            erreur: "Mentions obligatoires du contrat manquantes — à compléter dans le brouillon :",
            blocages: mentions.map((m) => ({
              message: m,
              href: `${baseEspace(orgId, role === "proprietaire_direct")}/baux/${bailId}#corriger`,
              libelle: "Corriger",
            })),
          };
        }
      }
      return { erreur: sansJargon(error.message) };
    }
  }

  const res = await deposerFichierGed(supabase, user, orgId, fichier, piece.type, piece.titre, { reutiliserReglement: piece.colonne === "reglement_copropriete" });
  if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt." };

  const { error } = await supabase
    .from("baux")
    .update({ [piece.colonne]: res.documentId })
    .eq("id", bailId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };

  let succes = piece.succes;
  if (activation) {
    const { error: erreurActivation } = await supabase.rpc("activer_bail", { p_bail: bailId });
    if (erreurActivation) {
      // Les contrôles venaient de passer : un refus ici est une course (un
      // autre bail activé entre-temps). Le PDF est détaché, rien n'est à
      // moitié fait — le document reste en GED.
      await supabase
        .from("baux")
        .update({ document_signe: null })
        .eq("id", bailId)
        .eq("organization_id", orgId);
      return { erreur: sansJargon(erreurActivation.message) };
    }
    const { count } = await supabase
      .from("etats_des_lieux")
      .select("id", { count: "exact", head: true })
      .eq("bail_id", bailId)
      .eq("type", "entree")
      .eq("etat", "signe");
    succes =
      "Bail signé déposé — le contrat est actif, l’occupation du logement est actualisée." +
      (count ? "" : " L'état des lieux d'entrée reste à signer : une alerte le rappelle.");
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: res.avertissement ? `${succes} ${res.avertissement}` : succes };
}

export async function deposerBailSigne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  return deposerPieceBail(orgId, bailId, formData, {
    colonne: "document_signe",
    type: "bail",
    titre: "Bail signé",
    succes: "Bail signé déposé.",
  });
}

export async function deposerReglementCopropriete(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  return deposerPieceBail(orgId, bailId, formData, {
    colonne: "reglement_copropriete",
    type: "reglement_copropriete",
    titre: "Règlement de copropriété",
    succes: "Règlement de copropriété déposé.",
  });
}

// « Corriger » : le bail tout juste activé revient en brouillon (la base
// refuse dès qu'un loyer a été appelé ou encaissé) ; le PDF est détaché.
export async function corrigerBail(orgId: string, bailId: string): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("devalider_bail", { p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Bail remis en brouillon — corrigez-le, puis redéposez le PDF signé." };
}

// « Envoyer » : le bail signé est déjà dans « Mes documents » du locataire ;
// l'email l'en avertit avec le lien vers son espace. L'envoi est mémorisé.
export async function envoyerBailSigne(orgId: string, bailId: string): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: bail } = await supabase
    .from("baux")
    .select("etat, document_signe, locataire_principal, lot:lots(nom)")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bail?.document_signe) return { erreur: "Aucun bail signé déposé." };
  if (bail.etat === "brouillon") return { erreur: "Le bail n'est pas actif." };
  const { data: loc } = bail.locataire_principal
    ? await supabase
        .from("persons")
        .select("email, prenom")
        .eq("id", bail.locataire_principal)
        .maybeSingle()
    : { data: null };
  if (!loc?.email) return { erreur: "Le locataire n'a pas d'email renseigné." };

  // Audit du 30/09 (B4) : sans adresse configurée, le lien serait relatif —
  // mort dans un e-mail. On ne l'envoie pas, on dit quoi configurer.
  const origine = adresseDeRetour();
  if (!origine) return { erreur: MESSAGE_SITE_NON_CONFIGURE };
  const lot = (Array.isArray(bail.lot) ? bail.lot[0] : bail.lot) as { nom: string } | null;
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>Votre bail signé est disponible</h2>
      <p>Bonjour${loc.prenom ? " " + echapperHtml(loc.prenom) : ""},</p>
      <p>Votre bail${lot ? ` pour <strong>${echapperHtml(lot.nom)}</strong>` : ""} est signé : vous pouvez le consulter et le télécharger à tout moment depuis votre espace, rubrique « Mes documents ».</p>
      <p><a href="${origine}/locataire/${orgId}/documents">Ouvrir mes documents</a></p>
    </div>`;
  const envoi = await envoyerEmail({ organisation: { db: supabase, id: orgId }, to: loc.email, subject: "Votre bail signé est disponible", html });
  if (envoi.erreur) {
    return {
      erreur: `${envoi.erreur} Le bail reste disponible dans « Mes documents » du locataire.`,
    };
  }
  const { error: erreurMemo } = await supabase
    .from("baux")
    .update({ signe_envoye_le: new Date().toISOString() })
    .eq("id", bailId)
    .eq("organization_id", orgId);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (erreurMemo) {
    return { succes: `Bail envoyé à ${loc.email}, mais l'envoi n'a pas pu être mémorisé.` };
  }
  return { succes: `Bail envoyé à ${loc.email}.` };
}

// Enregistrer un congé (bail actif → préavis).
export async function enregistrerConge(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const par = String(formData.get("par") ?? "locataire");
  const date = String(formData.get("date_presentation") ?? "").trim();
  const preavis = Number(formData.get("preavis_mois") ?? 3);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!date) return { erreur: "Indiquez la date de réception du congé.", valeurs };

  const conge: Record<string, unknown> = {
    p_bail: bailId,
    p_par: par,
    p_date_presentation: date,
    p_preavis_mois: preavis,
    p_motif: motif || null,
  };
  // Audit métier du 27/09 (wiki « Bail » § 1.11) : un congé pour vente porte
  // son prix (il vaut offre), un congé pour reprise son bénéficiaire. La base
  // les exige selon le motif ; l'action les transmet.
  if (par === "bailleur") {
    // Lu sur le texte tel que tapé (« 250000,50 » vaut 250000,5) : stricte comme tous les montants (VER-TS-02). Ni
    // espace ni point de milliers, ni exposant : `Number("1e5")` valait 100000.
    const prixLu = lireMontantFacultatif(formData.get("prix_vente"));
    if ("erreur" in prixLu) return { erreur: erreurDuChamp("Prix de vente proposé", prixLu.erreur), valeurs };
    if (prixLu.montant !== null && prixLu.montant <= 0)
      return { erreur: "Le prix de vente proposé est invalide.", valeurs };
    conge.p_prix_vente = prixLu.montant;
    conge.p_beneficiaire = String(formData.get("beneficiaire") ?? "").trim() || null;
  }

  // Préavis réduit du locataire : justificatif transmis au contrôle base.
  // Audit agence 27/09 : il n'existe en GED que si le congé existe. Déposé
  // avant la fonction, chaque refus laissait une pièce rattachée à rien, dont
  // l'empreinte bloquait ensuite le nouvel essai avec le même fichier. L'octet
  // monte au Storage, la fiche naît dans la transaction du congé.
  let avertissementJustificatif: string | undefined;
  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);
  if (erreurDepotDirect) return { erreur: erreurDepotDirect };
  const fichier = formData.get("justificatif");
  let error: { message: string } | null;
  if (fichier instanceof File && fichier.size > 0) {
    const prep = await preparerFichierGed(supabase, orgId, fichier);
    if (prep.erreur || !prep.fichier) return { erreur: prep.erreur ?? "Échec du dépôt du justificatif.", valeurs };
    const piece = prep.fichier;
    avertissementJustificatif = prep.avertissement;
    ({ error } = await supabase.rpc("enregistrer_conge_avec_justificatif", {
      ...conge,
      p_storage_path: piece.chemin,
      p_mime: piece.mime,
      p_taille: piece.taille,
      p_empreinte: piece.empreinte,
    }));
    if (error) await abandonnerPieceGed(supabase, piece);
  } else {
    ({ error } = await supabase.rpc("enregistrer_conge", { ...conge, p_justificatif: null }));
  }
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  const baseConge = "Congé enregistré — bail en préavis.";
  return { succes: avertissementJustificatif ? `${baseConge} ${avertissementJustificatif}` : baseConge };
}

// Le locataire se rétracte : le congé s'annule tant que le départ n'a pas eu
// lieu. La base remet le bail en actif, le lot en loué, referme l'alerte de
// sortie — et garde le congé annulé au dossier.
export async function annulerConge(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  const { error } = await supabase.rpc("annuler_conge", {
    p_bail: bailId,
    p_motif: motif || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Congé annulé — le bail reprend son cours." };
}

// Clôture du bail (module 3.11) : EDL de sortie signé — le bail passe à
// « terminé », le lot redevient disponible, l'espace du locataire sorti passe
// en lecture (le RPC exige l'EDL signé). Décision D34 : la date de sortie
// réelle est enregistrée ; avant la fin du préavis, la clôture se confirme
// (la base refuse sinon, code GRC01). Aucun montant ni la date de fin du bail
// ne changent.
export async function terminerBail(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const brute = String(formData.get("date_sortie") ?? "").trim();
  const dateSortie = lireDateSortie(brute);
  if (brute && !dateSortie) {
    return { erreur: "La date de sortie réelle n'est pas une date valide.", valeurs };
  }
  const { error } = await supabase.rpc("terminer_bail", {
    p_bail: bailId,
    // Vide : la base prend le jour de Paris
    p_date_sortie: dateSortie,
    p_confirmer_anticipee: formData.get("confirmer_anticipee") === "on",
  });
  if (error) {
    return {
      erreur: sansJargon(error.message),
      valeurs,
      ...(error.code === CODE_CONFIRMATION_CLOTURE ? { confirmationRequise: true } : {}),
    };
  }
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/parc`);
  return {
    succes:
      "Bail clôturé — le lot est de nouveau disponible et l'espace du locataire passe en consultation.",
  };
}

// Inventaire du mobilier (annexe obligatoire du bail meublé, décret 2015-981).
export async function ajouterInventaireLigne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const designation = String(formData.get("designation") ?? "").trim();
  if (!designation) return { erreur: "La désignation du meuble est obligatoire.", valeurs };
  const piece = String(formData.get("piece") ?? "").trim() || null;
  const quantite = Math.max(1, Math.floor(Number(formData.get("quantite") ?? 1)) || 1);
  const etat = String(formData.get("etat") ?? "").trim() || null;
  const observation = String(formData.get("observation") ?? "").trim() || null;

  const { error } = await supabase.from("inventaire_lignes").insert({
    bail_id: bailId,
    organization_id: orgId,
    designation,
    piece,
    quantite,
    etat,
    observation,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble ajouté à l'inventaire." };
}

export async function supprimerInventaireLigne(
  orgId: string,
  bailId: string,
  ligneId: string
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase
    .from("inventaire_lignes")
    .delete()
    .eq("id", ligneId)
    .eq("bail_id", bailId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message) };
  if (!data?.length) return { erreur: "Ce meuble n'a pas pu être retiré de ce bail. Rechargez l'inventaire avant de réessayer." };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble retiré de l'inventaire." };
}

// Décision du 27/10 (CB-14) : les onze éléments du décret 2015-981 en un geste.
// Chaque ligne naît en un exemplaire, sans état ni pièce — à compléter ensuite.
// Idempotent : les désignations déjà présentes (casse et accents ignorés) sont
// sautées et comptées dans le message ; `ordre` suit celui du décret, après les
// meubles saisis à la main (ordre 0).
export async function ajouterMobilierDecret(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  _formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: existantes, error: erreurLecture } = await supabase
    .from("inventaire_lignes")
    .select("designation")
    .eq("bail_id", bailId)
    .eq("organization_id", orgId);
  if (erreurLecture) return { erreur: sansJargon(erreurLecture.message) };

  const manquants = mobilierDecretManquant((existantes ?? []).map((l) => l.designation));
  const dejaPresents = MOBILIER_DECRET_2015_981.length - manquants.length;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const rappelPresents = dejaPresents ? ` ${pluriel(dejaPresents, "élément")} déjà présent${dejaPresents > 1 ? "s" : ""}.` : "";
  if (!manquants.length) return { succes: `Aucun élément ajouté :${rappelPresents}` };

  const { error } = await supabase.from("inventaire_lignes").insert(
    manquants.map((designation) => ({
      bail_id: bailId,
      organization_id: orgId,
      designation,
      quantite: 1,
      ordre: MOBILIER_DECRET_2015_981.indexOf(designation as (typeof MOBILIER_DECRET_2015_981)[number]) + 1,
    }))
  );
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `${pluriel(manquants.length, "élément")} ajouté${manquants.length > 1 ? "s" : ""} à l'inventaire : précisez l'état et la quantité de chacun.${rappelPresents}` };
}

// Compléter une ligne (quantité, état) sans la retirer puis la ressaisir.
export async function modifierInventaireLigne(
  orgId: string,
  bailId: string,
  ligneId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const quantite = Math.floor(Number(formData.get("quantite") ?? 1));
  if (!Number.isFinite(quantite) || quantite < 1) return { erreur: "La quantité doit être au moins 1.", valeurs };
  const etat = String(formData.get("etat") ?? "").trim();
  if (etat && !(ETATS_INVENTAIRE as readonly string[]).includes(etat)) return { erreur: "Cet état n'est pas reconnu.", valeurs };

  const { data, error } = await supabase
    .from("inventaire_lignes")
    .update({ quantite, etat: etat || null })
    .eq("id", ligneId)
    .eq("bail_id", bailId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if (!data?.length) return { erreur: "Ce meuble n'a pas pu être modifié dans ce bail. Rechargez l'inventaire avant de réessayer.", valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble mis à jour." };
}

// Colocation (bail unique) : ajouter un colocataire (quote-part) ou un garant
// (nominatif — quel colocataire il couvre, RM-1.3.8 + loi/pratique).
export async function ajouterBailPersonne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);

  // Un bail terminé ne se complète plus (audit vie du bail 09/09)
  const { data: bail } = await supabase
    .from("baux")
    .select("etat")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (bail?.etat === "termine") {
    return { erreur: "Le bail est terminé — plus d'ajout possible.", valeurs };
  }

  const personId = String(formData.get("person_id") ?? "");
  const role = String(formData.get("role") ?? "colocataire");
  if (!personId) return { erreur: "Choisissez la personne.", valeurs };
  if (role !== "colocataire" && role !== "garant") return { erreur: "Rôle invalide.", valeurs };

  const garantDe = String(formData.get("garant_de") ?? "").trim();
  if (role === "garant" && !garantDe) {
    return { erreur: "Indiquez le colocataire couvert par ce garant.", valeurs };
  }
  // Quote-part et surface privative d'un colocataire, lues sur le texte tel que tapé (« 33,5 » vaut 33,5) : les
  // champs sont en `type="text"`, jamais `type="number"` qui donne 335 à un navigateur non francophone (VER-TS-02).
  // Un texte illisible est refusé : converti en NaN, il serait parti en JSON comme « non renseigné ».
  let quotePart: number | null = null;
  let surfacePrivative: number | null = null;
  if (role === "colocataire") {
    const qpLue = lireDecimalFacultatif(formData.get("quote_part"));
    if ("erreur" in qpLue) return { erreur: erreurDuChamp("Quote-part", qpLue.erreur), valeurs };
    const surfLue = lireDecimalFacultatif(formData.get("surface_privative"));
    if ("erreur" in surfLue) return { erreur: erreurDuChamp("Surface privative", surfLue.erreur), valeurs };
    quotePart = qpLue.valeur;
    surfacePrivative = surfLue.valeur;
    // Les bornes que le champ numérique portait (min 0,01, max 100) : le serveur les dit, la base les garde aussi.
    if (quotePart !== null && !(quotePart > 0 && quotePart <= 100)) {
      return { erreur: "La quote-part doit être comprise entre 0 et 100 %.", valeurs };
    }
    if (surfacePrivative !== null && !(surfacePrivative > 0)) {
      return { erreur: "La surface privative doit être supérieure à zéro.", valeurs };
    }
  }

  const { error } = await supabase.from("bail_personnes").insert({
    organization_id: orgId,
    bail_id: bailId,
    person_id: personId,
    role,
    quote_part: quotePart,
    surface_privative: surfacePrivative,
    garant_de: role === "garant" ? garantDe : null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: role === "garant" ? "Garant ajouté." : "Colocataire ajouté." };
}

export async function supprimerBailPersonne(
  orgId: string,
  bailId: string,
  ligneId: string
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  // Audit 29/09 : seul un brouillon se corrige. Sur un bail signé, retirer un
  // colocataire ou un garant effaçait la solidarité de six mois (art. 8-1) :
  // on enregistre son départ (la base refuse aussi la suppression).
  const { data: bail } = await supabase
    .from("baux")
    .select("etat")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bail) return { erreur: "Bail introuvable." };
  if (bail.etat !== "brouillon") {
    return {
      erreur:
        "Le bail est signé : la personne ne se retire plus. Enregistrez le départ du colocataire — sa solidarité et celle de son garant courent encore six mois (art. 8-1 de la loi du 6 juillet 1989).",
    };
  }
  const { data, error } = await supabase
    .from("bail_personnes")
    .delete()
    .eq("id", ligneId)
    .eq("bail_id", bailId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message) };
  if (!data?.length) return { erreur: "Cette personne n'a pas pu être retirée du bail. Rechargez la page." };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Personne retirée du bail." };
}

// Départ d'un colocataire d'un bail signé (art. 8-1 de la loi du 6 juillet
// 1989) : la ligne reste au bail ; sa solidarité — et l'engagement du garant
// qui le couvre — s'éteignent six mois après la date d'effet de son congé, ou
// à cette date si un nouveau colocataire, figurant au bail, le remplace.
export async function enregistrerDepartColocataire(
  orgId: string,
  bailId: string,
  ligneId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const dateEffet = String(formData.get("date_effet_conge") ?? "").trim();
  const remplacant = String(formData.get("remplacant") ?? "").trim();
  if (!dateEffet) return { erreur: "Indiquez la date d'effet du congé du colocataire.", valeurs };
  const { data, error } = await supabase.rpc("enregistrer_depart_colocataire", {
    p_ligne: ligneId,
    p_date_effet_conge: dateEffet,
    p_remplacant: remplacant || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  const fin = typeof data === "string" ? data.split("-").reverse().join("/") : null;
  return {
    succes: fin
      ? `Départ enregistré — solidarité (et garant lié) jusqu'au ${fin}.`
      : "Départ enregistré.",
  };
}
