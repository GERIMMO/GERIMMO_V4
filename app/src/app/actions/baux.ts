"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { detecterMimeReel, TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { cibleBlocage } from "@/lib/parc";
import { motifLitteral, eur } from "@/lib/ged";
import { TYPES_BAIL } from "@/lib/baux";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { envoyerEmail } from "@/lib/email";
import { headers } from "next/headers";

export type BlocageActionable = { message: string; href: string; libelle: string };
export type EtatBail = {
  erreur?: string;
  succes?: string;
  blocages?: BlocageActionable[];
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Créer un bail (brouillon) sur un lot.
export async function creerBail(
  orgId: string,
  lotId: string,
  bienId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireChampsBail(formData);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };
  const locataire = await resoudreLocatairePrincipal(supabase, orgId, formData);
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
  redirect(`/agence/${orgId}/baux/${data.id}`);
}

// Champs communs création / édition (recette 21/08 : le brouillon devient
// corrigeable, et la date d'entrée se saisit — elle tombait au jour du clic
// « Activer », faussant l'échéancier)
function lireChampsBail(
  formData: FormData
): { erreur: string } | { valeurs: Record<string, unknown> } {
  const locataire = String(formData.get("locataire_principal") ?? "");
  if (!locataire) return { erreur: "Choisissez le locataire principal." };
  const loyer = String(formData.get("loyer_hc") ?? "").trim();
  const charges = String(formData.get("charges") ?? "").trim();
  const depot = String(formData.get("depot_garantie") ?? "").trim();
  const jour = String(formData.get("jour_echeance") ?? "1").trim();
  const type = String(formData.get("type") ?? "nu");

  // Plafond légal du dépôt de garantie (audit 09/09, RM-2.1.1 / RM-2.1.2 —
  // wiki « Dépôt de garantie ») : 1 mois de loyer HORS CHARGES en nu et en
  // colocation, 2 mois en meublé. Refus dès la saisie — le contrôle
  // n'attendait que l'activation, un bail nu acceptait n'importe quel dépôt.
  if (loyer && depot) {
    const mois = type === "meuble" ? 2 : 1;
    const plafond = mois * Number(loyer);
    if (Number(depot) > plafond) {
      return {
        erreur: `Dépôt de garantie trop élevé : le plafond légal d'un bail ${
          (TYPES_BAIL[type] ?? type).toLowerCase()
        } est de ${mois} mois de loyer hors charges, soit ${eur(plafond)}.`,
      };
    }
  }

  return {
    valeurs: {
      type,
      locataire_principal: locataire,
      date_debut: String(formData.get("date_debut") ?? "").trim() || null,
      loyer_hc: loyer ? Number(loyer) : null,
      charges: charges ? Number(charges) : null,
      // Provision (régularisable) ou forfait (définitif — RM-3.9.8)
      charges_mode: formData.get("charges_mode") === "forfait" ? "forfait" : "provision",
      depot_garantie: depot ? Number(depot) : null,
      jour_echeance: jour ? Number(jour) : 1,
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
  formData: FormData
): Promise<{ id: string } | { erreur: string }> {
  const choix = String(formData.get("locataire_principal") ?? "");
  if (choix !== "nouvelle") return { id: choix };
  const nom = String(formData.get("nouveau_locataire_nom") ?? "").trim();
  const prenom = String(formData.get("nouveau_locataire_prenom") ?? "").trim();
  const email = String(formData.get("nouveau_locataire_email") ?? "").trim();
  if (!nom || !email) {
    return { erreur: "Nouveau locataire : le nom et l'adresse email sont obligatoires." };
  }
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
        "Cette adresse email appartient déjà à une fiche de l'agence — choisissez la personne dans la liste.",
    };
  }
  const { data: personne, error } = await supabase
    .from("persons")
    .insert({ organization_id: orgId, nom, prenom: prenom || null, email })
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
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireChampsBail(formData);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };

  // Seul un brouillon se corrige — vérifié AVANT de résoudre le locataire :
  // sinon « + Nouveau locataire… » créait une fiche personne orpheline alors
  // que la modification allait être refusée (audit vie du bail 09/09).
  const { data: bailActuel } = await supabase
    .from("baux")
    .select("etat")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (bailActuel?.etat !== "brouillon") {
    return { erreur: "Seul un bail en brouillon se corrige — celui-ci a déjà avancé.", valeurs };
  }

  const locataire = await resoudreLocatairePrincipal(supabase, orgId, formData);
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
  const nombre = (nom: string) => {
    const brut = String(formData.get(nom) ?? "").trim();
    return brut ? Number(brut) : null;
  };

  const { data: modifies, error } = await supabase
    .from("baux")
    .update({
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
      // Zone tendue : le formulaire n'envoie ces champs que si le bien y est —
      // absents, ils s'écrivent NULL (l'encadrement ne s'applique pas).
      loyer_reference: nombre("loyer_reference"),
      loyer_reference_majore: nombre("loyer_reference_majore"),
      complement_loyer: nombre("complement_loyer"),
      complement_justification: texte("complement_justification"),
      dernier_loyer: nombre("dernier_loyer"),
      dernier_loyer_versement: texte("dernier_loyer_versement"),
      dernier_loyer_revision: texte("dernier_loyer_revision"),
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
  return { succes: "Compléments enregistrés." };
}

// Blocages de mise en location, chacun transformé en action cliquable
// (bouton « Corriger » vers la bonne section de la fiche lot / bien).
async function blocagesActionables(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  bailId: string
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
    ...cibleBlocage(m, { orgId, bienId: lot.bien_id, lotId: lot.id }),
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
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le PDF." };
  if (fichier.size > TAILLE_MAX_OCTETS) return { erreur: "Fichier trop volumineux (10 Mo max)." };
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
        const blocages = await blocagesActionables(supabase, orgId, bailId);
        if (blocages.length > 0) return { erreur: "Mise en location bloquée — à corriger :", blocages };
      }
      // Mentions obligatoires du contrat (date d'effet, loyer, locataire) :
      // la fiche les annonce déjà et ferme le dépôt, on n'arrive ici qu'en
      // course. Chacune renvoie au brouillon, là où elle se saisit.
      if (error.message.includes("Mentions obligatoires")) {
        const { data: mentions } = await supabase.rpc("bail_mentions_manquantes", {
          p_bail: bailId,
        });
        if (Array.isArray(mentions) && mentions.length > 0) {
          return {
            erreur: "Mentions obligatoires du contrat manquantes — à compléter dans le brouillon :",
            blocages: (mentions as string[]).map((m) => ({
              message: m,
              href: `/agence/${orgId}/baux/${bailId}#corriger`,
              libelle: "Corriger",
            })),
          };
        }
      }
      return { erreur: sansJargon(error.message) };
    }
  }

  const res = await deposerFichierGed(supabase, user, orgId, fichier, piece.type, piece.titre);
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
      "Bail signé déposé — le bail est actif, le lot est loué." +
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

  const origine = (await headers()).get("origin") ?? "";
  const lot = (Array.isArray(bail.lot) ? bail.lot[0] : bail.lot) as { nom: string } | null;
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>Votre bail signé est disponible</h2>
      <p>Bonjour${loc.prenom ? " " + loc.prenom : ""},</p>
      <p>Votre bail${lot ? ` pour <strong>${lot.nom}</strong>` : ""} est signé : vous pouvez le consulter et le télécharger à tout moment depuis votre espace, rubrique « Mes documents ».</p>
      <p><a href="${origine}/locataire/${orgId}/documents">Ouvrir mes documents</a></p>
    </div>`;
  const envoi = await envoyerEmail({ to: loc.email, subject: "Votre bail signé est disponible", html });
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
  if (!date) return { erreur: "Indiquez la date de première présentation.", valeurs };

  // Préavis réduit du locataire : justificatif déposé en GED, transmis au contrôle base.
  let justificatif: string | null = null;
  let avertissementJustificatif: string | undefined;
  const fichier = formData.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    const res = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", "Justificatif de préavis réduit");
    if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt du justificatif.", valeurs };
    justificatif = res.documentId;
    avertissementJustificatif = res.avertissement;
  }

  const { error } = await supabase.rpc("enregistrer_conge", {
    p_bail: bailId,
    p_par: par,
    p_date_presentation: date,
    p_preavis_mois: preavis,
    p_motif: motif || null,
    p_justificatif: justificatif,
  });
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

// Clôture du bail (module 3.11) : préavis échu, EDL de sortie signé — le
// bail passe à « terminé », le lot redevient disponible, l'espace du
// locataire sorti passe en lecture (le RPC exige l'EDL signé).
export async function terminerBail(
  orgId: string,
  bailId: string
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("terminer_bail", { p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
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
  const { error } = await supabase
    .from("inventaire_lignes")
    .delete()
    .eq("id", ligneId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble retiré de l'inventaire." };
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

  const qp = String(formData.get("quote_part") ?? "").trim();
  const surf = String(formData.get("surface_privative") ?? "").trim();
  const garantDe = String(formData.get("garant_de") ?? "").trim();
  if (role === "garant" && !garantDe) {
    return { erreur: "Indiquez le colocataire couvert par ce garant.", valeurs };
  }

  const { error } = await supabase.from("bail_personnes").insert({
    organization_id: orgId,
    bail_id: bailId,
    person_id: personId,
    role,
    quote_part: role === "colocataire" && qp ? Number(qp) : null,
    surface_privative: role === "colocataire" && surf ? Number(surf) : null,
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
  const { error } = await supabase
    .from("bail_personnes")
    .delete()
    .eq("id", ligneId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Personne retirée du bail." };
}
