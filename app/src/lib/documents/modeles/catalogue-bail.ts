import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cadreSignature, blocSignatureEmetteur, cartouches, enTete, faitA, faitALaSignature, section, tableau, titre, eur, nombreFr, pointFinal, facultatif, ouNeant, echapper, formaterDateFr } from "../gabarit";
import { CATALOGUE_DOCUMENTS } from "../catalogue";
import { signatureOrganisation, chargerContexteBail, expediteur, adresseLogement, adressePostaleLogement, nomsBailleurs, nomsLocataires, nomPersonne, liensLocataires, referenceCourte, referenceAvenant, libellePeriodeTerme, interlocuteurLocataire, libelleSignataireBailleur, coordonneesBancaires, demandeVirement } from "./communs";
import { TYPES_DIAGNOSTIC } from "@/lib/parc";
import { LIBELLE_ETAT_INVENTAIRE } from "@/lib/inventaire-meuble";
import { modeSignatureDocument } from "@/lib/politique-signature";
import type { Assemblage } from "./index";
import { verifierCourrierDuBail } from "@/lib/rappels-loyers";
import { aujourdhuiParis } from "@/lib/ged";
import { echeanceReglementaire } from "@/lib/documents-bail";

// Reprise du lot 38 (S09, C40) : la liste des dossiers du catalogue (catalogue-cibles) écarte les mêmes cas, avec le même motif.
// Inventaires : un logement meublé (case « meublé » du lot) ou un bail de type meublé.
export const REFUS_INVENTAIRE_NON_MEUBLE = "L’inventaire du mobilier concerne un logement meublé.";
export const REFUS_ACCUSE_APRES_SORTIE = "L’état des lieux de sortie est signé : la sortie du locataire est faite, l’accusé de réception du congé n’a plus lieu d’être.";
export const CODES_COMPLEMENTS_BAIL = ["bordereau_ddt", "inventaire_entree", "inventaire_sortie", "avenant_remplacement", "liste_dossier", "attestation_loyer", "attestation_caf", "relance_simple", "seconde_relance", "mise_en_demeure", "situation_dette", "protocole_apurement", "accuse_conge", "decompte_retenues", "attestation_fin_bail", "autorisation_travaux"] as const;
export type LigneDocument = Record<string, unknown>;
export class RefusDocument extends Error {}
/** Le plan d'apurement enregistré dont un protocole reprend les termes (C65, C66). */
type PlanProtocole = { date_arrete: string; dette_initiale: number; acompte: number; conditions: string | null; tolerance_jours: number; seuil_caducite: number; tranches: { date: string; montant: number }[] };
/** « À renseigner » d'un protocole sans plan enregistré : ou-renseigner.ts mène à la section du plan sur la fiche du bail. */
export const LIBELLE_PLAN_A_ENREGISTRER = "plan d’apurement à enregistrer sur la fiche du bail";
export const texte = (v: unknown) => v == null ? "" : String(v);
export const montant = (v: unknown) => Number(v ?? 0);
export const MESSAGE_CHARGEMENT_IMPOSSIBLE = "Les données du dossier n’ont pas pu être chargées. Réessayez avant de générer ce document.";
export async function lireLignes(requete: PromiseLike<{ data: unknown; error: unknown }>): Promise<LigneDocument[]> {
  const r = await requete;
  if (Array.isArray(r.data) && r.data.length >= 1000) throw new RefusDocument("Ce dossier contient trop de lignes pour un export intégral. Réduisez la période avant de générer le document.");
  if (r.error) throw new RefusDocument(MESSAGE_CHARGEMENT_IMPOSSIBLE);
  return (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as LigneDocument[];
}
// « lignes » : un texte de plusieurs lignes (description d'un devis) garde ses sauts de ligne, posés APRÈS l'échappement (phase 3, C78).
// « facultatif » : une cellule que l'écran de saisie dit facultative s'imprime « — » quand elle est vide, sans bloquer le PDF
// (phase 3, C04 : une ligne d'inventaire sans observation refusait tout l'inventaire).
export function lignesTableau(f: Fusion, lignes: LigneDocument[], colonnes: [string, string, "texte" | "lignes" | "date" | "montant" | "facultatif"][]): string {
  return tableau(colonnes.map(([libelle,, type]) => ({ libelle, droite: type === "montant" })), lignes.map(l => colonnes.map(([libelle, cle, type]) => type === "montant" ? f.montant(l[cle] as string | number | null, libelle) : type === "date" ? f.date(texte(l[cle]) || null, libelle) : type === "lignes" ? f.champ(texte(l[cle]).trim() || null, libelle).replace(/\r?\n/g, "<br>") : type === "facultatif" ? facultatif(texte(l[cle]).trim() || null) : f.champ(texte(l[cle]) || null, libelle))));
}
// L'année par défaut d'un document est celle du jour de PARIS : l'année du serveur (UTC) est encore la précédente le
// 1er janvier entre minuit et 1 h (audit du 23/10, TST-5).
export function anneeDocument(options?: Record<string,string>): number {
  const anneeParis = Number(aujourdhuiParis().slice(0, 4));
  const n = Number(options?.annee ?? anneeParis);
  if (!Number.isInteger(n) || n < 1970 || n > anneeParis + 1) throw new RefusDocument("Choisissez une année valide.");
  return n;
}

export async function assemblerComplementBail(code: typeof CODES_COMPLEMENTS_BAIL[number], supabase: SupabaseClient, orgId: string, bailId: string, options: Record<string,string> = {}): Promise<Assemblage> {
  try {
    const ctx = await chargerContexteBail(supabase, orgId, bailId);
    if ("erreur" in ctx) return ctx;
    const meta = CATALOGUE_DOCUMENTS.find(m => m.id === code)!;
    // Le jour à Paris (audit du 27/09) : toISOString donnait la veille entre 0 h et 2 h.
    const f = new Fusion(), exp = expediteur(ctx), aujourdhui = aujourdhuiParis();
    // Phase 3 (C41, C70, C71) : « votre gestionnaire » seulement dans un espace d'agence ; ailleurs, le bailleur.
    const interlocuteur = interlocuteurLocataire(ctx.organisation.type);
    let contenu = "", signatures = false, dateALaSignature = false;
    // Phase 3 (C21 à C25) : l'avenant de remplacement a sa propre référence (en-tête et pied), le contrat qu'il modifie avec sa
    // date de prise d'effet, une date laissée à compléter à la signature et un cadre par partie.
    let avenant: { reference: string; contrat: string; signatures: string } | null = null;
    // S39 : l'adresse postale du destinataire d'un courrier de recouvrement, ligne par ligne (`undefined` : pas un courrier ;
    // aucune ligne : inconnue).
    let adresseDestinataire: string[] | undefined;
    const opt = (cle: string, libelle: string) => f.champ(options[cle]?.trim() || null, libelle);
    if (["attestation_loyer", "attestation_caf"].includes(code) && !["actif","preavis"].includes(ctx.bail.etat)) return { erreur: "Cette attestation concerne un contrat actuellement en cours." };
    if (["attestation_loyer", "attestation_caf", "relance_simple", "seconde_relance", "mise_en_demeure", "protocole_apurement"].includes(code) && ctx.bail.etat === "brouillon") return { erreur: "Ce document se prépare pour un bail engagé, après la signature du contrat." };

    if (code === "bordereau_ddt") {
      // DOC-01 : la validité d'un DPE d'avant le 01/07/2021 est plafonnée (décret n° 2020-1610).
      const lignes = (await lireLignes(supabase.from("diagnostics").select("type, date_realisation, date_expiration, diagnostiqueur, document_id, classe_dpe").eq("organization_id", orgId).or(`lot_id.eq.${ctx.lot.id},bien_id.eq.${ctx.bien.id}`).is("archived_at", null).order("type")))
        // C02 : le libellé de l'écran (TYPES_DIAGNOSTIC), pas le code de la base ; un type inconnu s'imprime tel quel.
        // C05 : une échéance vide (amiante sans trace : validité illimitée, selon l'aide de la saisie) ou un diagnostiqueur non
        // saisi ne bloquent plus le bordereau : ils s'impriment tels quels, sans date ni nom inventés.
        // Reprise du lot 40 : seulement pour un diagnostic sans durée de validité fixée (amiante, plomb). Pour un DPE, un ERP, le
        // gaz ou l'électricité, l'échéance est obligatoire à la saisie : vide, elle reste « à renseigner » et bloque le PDF, comme
        // la fiche du bail dit « Date à compléter » (statutPieceDiagnostic, même règle).
        .map((l): LigneDocument => {
          const echeance = echeanceReglementaire(String(l.type), l.date_realisation as string | null, l.date_expiration as string | null);
          const validiteFixee = TYPES_DIAGNOSTIC[String(l.type)]?.validite_mois != null;
          return { ...l, libelle_type: TYPES_DIAGNOSTIC[String(l.type)]?.libelle ?? texte(l.type), date_expiration: echeance,
            validite: echeance ? formaterDateFr(echeance) : validiteFixee ? null : "sans date de fin indiquée au rapport",
            diagnostiqueur: texte(l.diagnostiqueur).trim() || "non renseigné" };
        });
      contenu = `${section("Diagnostics recensés")}${lignesTableau(f,lignes,[["Diagnostic","libelle_type","texte"],["Réalisé le","date_realisation","date"],["Validité","validite","texte"],["Diagnostiqueur","diagnostiqueur","texte"]])}
      <p>Pièces disponibles : ${lignes.filter(l=>l.document_id).length} sur ${lignes.length} diagnostics recensés.</p>
      ${lignes.some(l=>!l.document_id) ? `<p>${f.champ(null,"rapports de diagnostic à déposer avant remise du dossier")}</p>` : ""}
      <p>Ce bordereau décrit les pièces du dossier. Les rapports établis par les diagnostiqueurs doivent être joints ; il ne constitue pas un diagnostic du logement.</p>`;
      if (!lignes.length) f.champ(null,"diagnostics du logement et de l’immeuble");
    } else if (code === "inventaire_entree" || code === "inventaire_sortie") {
      if (!ctx.lot.meuble && ctx.bail.type !== "meuble") return { erreur: REFUS_INVENTAIRE_NON_MEUBLE };
      // C03 : l'état s'imprime comme dans l'annexe d'inventaire du bail meublé (LIBELLE_ETAT_INVENTAIRE : « Usagé », pas « usage »).
      const lignes = (await lireLignes(supabase.from("inventaire_lignes").select("piece, designation, quantite, etat, observation").eq("bail_id",bailId).eq("organization_id",orgId).order("ordre")))
        .map((l): LigneDocument => ({ ...l, etat: l.etat == null ? null : LIBELLE_ETAT_INVENTAIRE[String(l.etat)] ?? texte(l.etat) }));
      const sortie = code === "inventaire_sortie";
      if (sortie && !["preavis","termine"].includes(ctx.bail.etat)) return { erreur: "Préparez l’inventaire de sortie après l’enregistrement du congé." };
      // Reprise du lot 40 (S08) : une date de constat que les dates du contrat rendent impossible est refusée — un inventaire
      // d'entrée après la fin du contrat, un inventaire de sortie avant sa prise d'effet. Les autres écarts restent possibles
      // (clés remises avant l'entrée, départ effectif après la date de fin) : la date saisie s'imprime telle quelle.
      const saisieConstat = options.date_constat?.trim() ?? "";
      const dateConstat = /^\d{4}-\d{2}-\d{2}$/.test(saisieConstat) ? saisieConstat : null;
      if (dateConstat && !sortie && ctx.bail.date_fin && dateConstat > ctx.bail.date_fin) return { erreur: `La date du constat (${formaterDateFr(dateConstat)}) tombe après la fin du contrat (${formaterDateFr(ctx.bail.date_fin)}) : l’inventaire d’entrée se fait à l’entrée dans les lieux. Vérifiez la date du constat.` };
      if (dateConstat && sortie && ctx.bail.date_debut && dateConstat < ctx.bail.date_debut) return { erreur: `La date du constat (${formaterDateFr(dateConstat)}) précède la prise d’effet du contrat (${formaterDateFr(ctx.bail.date_debut)}) : l’inventaire de sortie se fait au départ du locataire. Vérifiez la date du constat.` };
      // C04 : la pièce et l'observation sont facultatives à la saisie de l'inventaire : vides, elles s'impriment « — ».
      // C07 : à la sortie, le tableau reprend l'inventaire ; le constat de sortie suit, sous son propre titre, tel qu'il a été
      // saisi (aucun état par élément n'est inventé). Reprise du lot 40 : les lignes de l'inventaire restent modifiables pendant
      // toute la location, sans date ni historique ; le tableau ne dit donc pas « à l'entrée » (une ligne modifiée à la sortie
      // s'imprimait « État à l'entrée ») : il dit l'inventaire tel qu'il est inscrit au dossier ce jour-là.
      contenu = `${section(sortie ? "Mobilier inscrit à l’inventaire du contrat" : "Mobilier mis à disposition")}
        ${lignesTableau(f,lignes,[["Pièce","piece","facultatif"],["Désignation","designation","texte"],["Quantité","quantite","texte"],[sortie ? "État inscrit" : "État","etat","texte"],[sortie ? "Observation inscrite" : "Observation","observation","facultatif"]])}
        ${sortie ? `<p>Ce tableau reprend l’inventaire tel qu’il est inscrit au dossier à la date d’établissement de ce document. Il ne constate pas l’état du mobilier à la sortie, qui suit.</p>${section("Constat de sortie")}<p>Constat contradictoire du mobilier à la sortie : ${opt("constat","état et quantité du mobilier à la sortie")}${pointFinal(options.constat)}</p>` : ""}
        <p>${/* Phase 3, lot 43 (T04, C07) : la sortie reprenait la phrase de l'entrée (« annexé au contrat, établi à la remise des
          clés »). Le constat de sortie se fait à la restitution des clés ; l'entrée garde sa phrase. */
          sortie ? "Constat de sortie établi contradictoirement lors de la restitution des clés." : "Inventaire annexé au contrat, établi contradictoirement à la remise des clés."} Date du constat : ${f.date(options.date_constat || null,"date du constat mobilier")}.</p>`;
      if (!lignes.length) f.champ(null,"mobilier du contrat à inventorier");
      signatures = true;
      // Reprise du lot 40 (C23, S08) : l'inventaire est un acte que les parties signent au constat ; il n'est plus daté du jour
      // de sa génération, au-dessus de cadres vides (et parfois AVANT le constat qu'il consigne) : la date se porte à la signature.
      dateALaSignature = true;
    } else if (code === "attestation_loyer" || code === "attestation_caf") {
      contenu = `${section("Situation locative")}
        <p>Le bailleur atteste que le locataire désigné est titulaire du contrat relatif aux locaux désignés, prenant effet le ${f.date(ctx.bail.date_debut)}.
        ${/* Phase 3 (C60, C61) : un bail en préavis a une fin connue ; l'attestation la dit (elle ne disait que la date d'effet). */
          ctx.bail.etat === "preavis" ? `Un congé est enregistré : le contrat prend fin le ${f.date(ctx.bail.date_fin, "date de fin du contrat (congé enregistré)")}.` : ""}
        Loyer mensuel hors charges : ${f.montant(ctx.bail.loyer_hc)} ; charges mensuelles : ${f.montant(ctx.bail.charges)} (${ctx.bail.charges_mode === "forfait" ? "forfait" : "provisions"}).
        ${ctx.chambre ? "Les montants concernent exclusivement la chambre et le droit d’usage des espaces partagés de ce contrat individuel." : ""}</p>
        <p>Destinataire : ${opt("destinataire","organisme ou destinataire")}${pointFinal(options.destinataire)}</p>
        <p>Cette attestation décrit les conditions du bail ; les paiements effectifs sont justifiés par les quittances ou reçus.</p>`;
      if (code === "attestation_caf") contenu += `${section("Informations pour l’attestation officielle")}
        <p>Numéro allocataire : ${opt("allocataire","numéro allocataire CAF ou MSA")} ; nombre d’occupants du contrat : ${ctx.locataires.length}.
        Logement ${ctx.lot.meuble ? "meublé" : "nu"} ; surface du logement : ${f.champ(ctx.lot.surface_m2 == null ? null : nombreFr(ctx.lot.surface_m2),"surface du logement")} m².
        ${ctx.chambre ? `Surface privative : ${f.champ(ctx.chambre.surface_m2 == null ? null : nombreFr(ctx.chambre.surface_m2),"surface privative")} m².` : ""}</p>
        <p>Le formulaire officiel Cerfa 10842*07 reste à compléter et signer par le bailleur. Ce récapitulatif prépare la saisie ; il ne vaut pas formulaire CAF/MSA homologué.</p>`;
      signatures = true;
    } else if (["relance_simple","seconde_relance","mise_en_demeure","situation_dette","protocole_apurement"].includes(code)) {
      const restitutions = await lireLignes(supabase.from("restitutions").select("id").eq("organization_id", orgId).eq("bail_id", bailId).eq("statut", "finalise"));
      if (restitutions.length) return { erreur: "Le solde de ce bail figure dans le décompte de départ. Consultez ce document avant toute demande de règlement." };
      const termes = await lireLignes(supabase.rpc("etat_loyers_bail", { p_bail: bailId }));
      const echus = termes.filter(l => texte(l.date_echeance).slice(0,10) < aujourdhui && montant(l.montant_du) > montant(l.montant_couvert));
      // Phase 3 (C73) : le reste dû de chaque échéance, au centime, et le solde échu qui en est la somme.
      const resteCentimes = (l: LigneDocument) => Math.max(0, Math.round(montant(l.montant_du)*100) - Math.round(montant(l.montant_couvert)*100));
      const soldeEchuCentimes = echus.reduce((s,l)=>s+resteCentimes(l),0);
      // Phase 3 (C65, C66, C74) : le protocole s'appuie sur un plan d'apurement ENREGISTRÉ — celui désigné (plan_id, depuis
      // l'écran du plan), à défaut le plan en cours du bail. Ses tranches, sa tolérance et son seuil de caducité sont ceux que
      // suit Gerimmo (migration 20261102224000) : le document n'annonce que ce que fait l'application. Sans plan, plus
      // d'échéancier calculé à l'écran ni de suspension promise : le PDF n'est pas produit, « À renseigner » mène au plan.
      let plan: PlanProtocole | null = null;
      if (code === "protocole_apurement") {
        const champsPlan = "id,bail_id,etat,date_arrete,dette_initiale,acompte,tolerance_jours,seuil_caducite,conditions";
        const [lu] = options.plan_id
          ? await lireLignes(supabase.from("plans_apurement").select(champsPlan).eq("id", options.plan_id).eq("organization_id", orgId))
          : await lireLignes(supabase.from("plans_apurement").select(champsPlan).eq("organization_id", orgId).eq("bail_id", bailId).in("etat", ["propose","actif","en_defaut"]).order("created_at", { ascending: false }).limit(1));
        if (options.plan_id && (!lu || texte(lu.bail_id) !== bailId)) return { erreur: "Ce plan d’apurement n’appartient pas à ce bail." };
        if (lu) {
          // Phase 3, lot 39 (reprise, C65) : un protocole ne se prépare que sur un plan vivant (proposé, actif ou en défaut), comme
          // la recherche sans plan_id et comme le rattachement en base (« Ce plan est clos »). Sur un plan caduc ou soldé, il
          // annonçait encore la suspension des relances, qui ne s'applique plus.
          if (texte(lu.etat) === "annule") return { erreur: "Ce plan d’apurement est annulé." };
          if (texte(lu.etat) === "caduc") return { erreur: "Ce plan d’apurement est caduc : un protocole ne se prépare plus sur ce plan." };
          if (texte(lu.etat) === "solde") return { erreur: "Ce plan d’apurement est soldé : un protocole ne se prépare plus sur ce plan." };
          if (!["propose", "actif", "en_defaut"].includes(texte(lu.etat))) return { erreur: "Ce plan d’apurement n’est plus en cours." };
          const tranches = await lireLignes(supabase.from("plan_apurement_tranches").select("rang,echeance,montant").eq("organization_id", orgId).eq("plan_id", texte(lu.id)).order("rang"));
          plan = { date_arrete: texte(lu.date_arrete), dette_initiale: montant(lu.dette_initiale), acompte: montant(lu.acompte), conditions: lu.conditions ? texte(lu.conditions) : null,
            tolerance_jours: montant(lu.tolerance_jours), seuil_caducite: montant(lu.seuil_caducite),
            tranches: tranches.map(t => ({ date: texte(t.echeance), montant: montant(t.montant) })) };
        }
      }
      const detteCentimes = plan ? Math.round(plan.dette_initiale * 100) : soldeEchuCentimes;
      if (code !== "situation_dette" && detteCentimes <= 0) return { erreur: "Aucune dette échue n’est constatée : ce courrier n’a pas lieu d’être généré." };
      // C67, C68 : la colonne « Période » écrit le mois (« novembre 2026 ») et signale un terme au prorata avec ses bornes réelles.
      // L'indicateur vient de l'appel lui-même (appels_loyer.prorata), le calcul des termes ne le rendant pas.
      const appelsAuProrata = new Set((await lireLignes(supabase.from("appels_loyer").select("id").eq("organization_id",orgId).eq("bail_id",bailId).eq("prorata",true))).map(a => texte(a.id)));
      const avecPeriodeLisible = (lignes: LigneDocument[]) => lignes.map((l): LigneDocument => ({ ...l, periode: libellePeriodeTerme(texte(l.periode), appelsAuProrata.has(texte(l.appel_id)), ctx.bail.date_debut, ctx.bail.date_fin), reste: resteCentimes(l) / 100 }));
      const lignesSituation = code === "situation_dette" ? termes : echus;
      // C73 : ce qui reste dû sur les échéances du tableau qui ne sont pas encore échues (relevé de situation seulement) : la somme
      // de la colonne « Reste dû » est le solde échu, plus ce montant.
      const aVenirCentimes = lignesSituation.filter(l => !echus.includes(l)).reduce((s,l)=>s+resteCentimes(l),0);
      contenu = `${section(code === "situation_dette" ? "Situation des échéances" : "Échéances restant dues")}
        ${lignesTableau(f,avecPeriodeLisible(lignesSituation),[["Période","periode","texte"],["Échéance","date_echeance","date"],["Appelé","montant_du","montant"],["Couvert","montant_couvert","montant"],["Reste dû","reste","montant"]])}
        <p><strong>Solde échu au ${f.date(aujourdhui)} : ${eur(soldeEchuCentimes/100)}.</strong> Les échéances à venir sont exclues de ce solde${aVenirCentimes > 0 ? ` : il reste ${eur(aVenirCentimes/100)} sur les échéances du tableau qui ne sont pas encore échues` : ""}.</p>`;
      if (code === "relance_simple") contenu += `<p>Sauf règlement intervenu depuis l’établissement de ce décompte, nous vous invitons à régulariser les sommes échues. En cas de difficulté ou de désaccord, contactez votre ${interlocuteur} afin d’examiner votre situation.</p>`;
      if (code === "mise_en_demeure" && (!/^\d+$/.test(options.delai ?? "") || Number(options.delai) < 1 || Number(options.delai) > 90)) return { erreur: "Indiquez un délai de règlement de 1 à 90 jours." };
      if (code === "relance_simple" || code === "seconde_relance" || code === "mise_en_demeure") {
        const niveau = code === "relance_simple" ? "relance_1" : code === "seconde_relance" ? "relance_2" : "recommande";
        const suivi = await verifierCourrierDuBail(supabase, orgId, bailId, echus, aujourdhui, niveau);
        if (suivi.erreur) return { erreur: suivi.erreur };
        // S39 : ces trois courriers portent l'adresse postale du locataire. Tant qu'il occupe les lieux, c'est le logement loué,
        // écrit comme une adresse postale (adressePostaleLogement : étage et porte, voie, code postal et commune en dernier) ;
        // après sa sortie (bail terminé, ou état des lieux de sortie signé), l'adresse laissée à l'état des lieux de sortie si
        // elle existe, telle que saisie (ses lignes conservées). Sinon, aucune adresse n'est inventée : le nom figure seul.
        const [edlSortie] = await lireLignes(supabase.from("etats_des_lieux").select("etat,adresse_restitution_depot").eq("organization_id",orgId).eq("bail_id",bailId).eq("type","sortie").limit(1));
        const sorti = ctx.bail.etat === "termine" || texte(edlSortie?.etat) === "signe";
        adresseDestinataire = sorti
          ? texte(edlSortie?.adresse_restitution_depot).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          : adressePostaleLogement(ctx.lot,ctx.bien);
        if (code === "seconde_relance") contenu += `<p>Notre précédent courrier du ${f.date(suivi.precedente)} reste sans régularisation complète à ce jour. Merci de régler ce solde ou de prendre contact avec votre ${interlocuteur}.</p>`;
      }
      if (code === "mise_en_demeure") contenu += `<p>Par le présent courrier, nous vous mettons en demeure de régler les sommes échues détaillées ci-dessus dans un délai de ${opt("delai","délai de règlement à compter de la réception")} jours à compter de sa réception, sous réserve des règlements intervenus depuis son établissement.</p><p>Ce courrier est à notifier avec preuve de réception. Il ne constitue ni un commandement de payer ni une décision de résiliation du bail.</p>`;
      // C72 : un règlement demandé par virement donne le compte où verser, comme l'avis d'échéance (même source, même règle).
      if (code !== "situation_dette") contenu += `<p>Modalités de règlement : ${f.champ(ctx.bail.lieu_paiement,"modalités de règlement")}${demandeVirement(ctx.bail.lieu_paiement) ? ` ; coordonnées bancaires : ${coordonneesBancaires(f, ctx.bail.lieu_paiement, ctx.organisation.iban)}` : ""} ; référence à rappeler : ${referenceCourte("BAIL",bailId)}.</p>`;
      if (code === "protocole_apurement") {
        if (!plan) {
          contenu += `${section("Échéancier convenu")}<p>Échéancier : ${f.champ(null, LIBELLE_PLAN_A_ENREGISTRER)}.</p>`;
        } else {
          if (!plan.tranches.length) return { erreur: "Ce plan d’apurement n’a aucune tranche." };
          const n = plan.tranches.length, tolerance = plan.tolerance_jours, seuil = plan.seuil_caducite;
          const pluriel = (k: number, mot: string) => `${k} ${mot}${k > 1 ? "s" : ""}`;
          const conditions = (plan.conditions ?? options.conditions)?.trim() || null;
          // Lot 39 (reprise, C65) : la suspension dure tant que le plan est actif ou en défaut (plan_apurement_suspend_relances) ;
          // « tant qu'il n'est ni caduc ni annulé » oubliait le plan soldé, qui ne suspend plus rien.
          contenu += `${section("Échéancier convenu")}
            <p>Dette arrêtée au ${f.date(plan.date_arrete)} : ${eur(plan.dette_initiale)}.${plan.acompte > 0 ? ` Acompte versé ou à verser à la signature : ${eur(plan.acompte)}.` : ""}
            Reste à étaler : ${eur(plan.dette_initiale - plan.acompte)}, en ${pluriel(n, "mensualité")}.</p>
            ${lignesTableau(f,plan.tranches,[["Date","date","date"],["Montant","montant","montant"]])}
            <p>Les mensualités d’apurement s’ajoutent au loyer et aux charges courants. Une mensualité est tenue pour réglée dès que la dette échue du bail, loyers courants compris, ne dépasse plus ce qui reste à étaler après elle : les règlements reçus depuis le ${f.date(plan.date_arrete)} sont pris en compte. Toute adaptation de l’accord est convenue par écrit entre les parties.</p>
            <p>Une mensualité qui n’est pas réglée ${tolerance > 0 ? `${pluriel(tolerance, "jour")} après son échéance` : "à son échéance"} est constatée comme manquée. À ${pluriel(seuil, "mensualité")} manquée${seuil > 1 ? "s" : ""} et non rattrapée${seuil > 1 ? "s" : ""}, l’accord devient caduc et les sommes restantes sont immédiatement exigibles.</p>
            <p>Les relances de loyer sont suspendues dès l’activation du plan, après l’accord du locataire, et jusqu’à sa fin : dette soldée, plan devenu caduc ou annulé. Après cette fin, toute somme impayée peut de nouveau être relancée. Le bailleur ne renonce à aucun droit, ni à la clause résolutoire du bail.</p>
            <p>Conditions particulières de suivi : ${ouNeant(conditions)}${conditions ? pointFinal(conditions) : ""}</p>`;
        }
        signatures = true;
        // Phase 3, lot 43 (T07, reste du lot 40) : le protocole est un accord que les parties signent (circuit de signature
        // électronique) ; comme les inventaires, il n'est plus daté du jour de sa génération au-dessus de cadres vides.
        dateALaSignature = true;
      }
    } else if (code === "accuse_conge" || code === "attestation_fin_bail") {
      if (code === "attestation_fin_bail" && ctx.bail.etat !== "termine") return { erreur: "L’attestation de fin de bail se génère après la clôture du contrat." };
      // Phase 3 (C40) : l'accusé de réception répond au congé reçu du locataire et annonce les étapes de sortie « à organiser » :
      // il se prépare pendant le préavis, avant la sortie. Sur un bail terminé, ces étapes étaient faites depuis longtemps.
      if (code === "accuse_conge" && ctx.bail.etat === "termine") return { erreur: "Ce bail est terminé : la sortie du locataire est faite, l’accusé de réception du congé n’a plus lieu d’être." };
      if (code === "accuse_conge" && ctx.bail.etat !== "preavis") return { erreur: "Aucun congé en cours n’est enregistré pour ce contrat." };
      const conges = await lireLignes(supabase.from("conges").select("date_premiere_presentation,date_effet,preavis_mois,par").eq("organization_id",orgId).eq("bail_id",bailId).is("annule_le",null).order("created_at",{ascending:false}).limit(1));
      if (!conges.length) return { erreur: "Aucun congé en cours n’est enregistré pour ce contrat." };
      const c = conges[0];
      if (code === "accuse_conge") {
        if (c.par !== "locataire") return { erreur: "Le congé enregistré a été donné par le bailleur : l’accusé de réception concerne un congé reçu du locataire." };
        const edlSortie = await lireLignes(supabase.from("etats_des_lieux").select("id").eq("organization_id",orgId).eq("bail_id",bailId).eq("type","sortie").eq("etat","signe").limit(1));
        if (edlSortie.length) return { erreur: REFUS_ACCUSE_APRES_SORTIE };
      }
      contenu = `${section(code === "accuse_conge" ? "Congé reçu" : "Fin du contrat")}
        <p>Congé donné par ${c.par === "locataire" ? "le locataire" : "le bailleur"}, reçu le ${f.date(texte(c.date_premiere_presentation))}.
        Durée du préavis : ${f.champ(texte(c.preavis_mois),"durée du préavis")} mois ; date d’effet enregistrée : ${f.date(texte(c.date_effet))}.</p>
        <p>${code === "accuse_conge" ? `L’état des lieux de sortie, la remise des clés et la transmission de la nouvelle adresse sont à organiser avec le ${interlocuteur}.` : "Le contrat est clôturé dans le dossier. Cette attestation ne constitue pas une quittance ni une renonciation au règlement des sommes restant dues."}</p>`;
      signatures = code === "attestation_fin_bail";
    } else if (code === "decompte_retenues") {
      const rs = await lireLignes(supabase.from("restitutions").select("id,statut").eq("bail_id",bailId).eq("organization_id",orgId).limit(1));
      if (!rs.length) return { erreur: "Préparez d’abord la restitution du dépôt de ce contrat." };
      const retenues = await lireLignes(supabase.from("retenues").select("libelle,cout,duree_vie_ans,age_ans,montant_retenu,justificatif_document").eq("restitution_id",rs[0].id).eq("organization_id",orgId));
      // Phase 3 (C37) : l'écran de restitution laisse l'âge et la durée de vie facultatifs (vides : coût retenu en intégralité, la
      // base ne calcule alors aucune décote). Vides, ils s'impriment « — », comme dans le décompte de restitution, sans bloquer le PDF.
      const sansDecote = retenues.some(l=>l.duree_vie_ans==null || l.age_ans==null);
      const lignesRetenues = retenues.map(l=>({...l,age_ans:l.age_ans==null?null:nombreFr(l.age_ans as number|string),duree_vie_ans:l.duree_vie_ans==null?null:nombreFr(l.duree_vie_ans as number|string)}));
      // Phase 3 (C35) : comme le décompte de restitution, les justificatifs sont tenus à disposition (aucune pièce n'est jointe au PDF).
      contenu = `${section("Retenues enregistrées")}${lignesTableau(f,lignesRetenues,[["Motif","libelle","texte"],["Coût","cout","montant"],["Âge (ans)","age_ans","facultatif"],["Durée de vie (ans)","duree_vie_ans","facultatif"],["Retenue","montant_retenu","montant"]])}
        ${sansDecote ? "<p>« — » : âge ou durée de vie non renseigné ; aucune décote de vétusté n’est appliquée, le coût est retenu en intégralité.</p>" : ""}
        <p>Total : ${eur(retenues.reduce((s,l)=>s+montant(l.montant_retenu),0))}. État du dossier : ${rs[0].statut === "finalise" ? "finalisé" : "en préparation"}.</p>
        <p>Les justificatifs déposés (devis, facture, constat comparé des états des lieux) sont tenus à la disposition du locataire sur demande. Les sommes ci-dessus sont propres à ce contrat.</p>`;
      if (retenues.some(l=>!l.justificatif_document)) f.champ(null,"justificatifs de retenues à déposer");
    } else if (code === "liste_dossier") {
      if (!ctx.bail.locataire_principal) return { erreur: "Choisissez d’abord la personne du dossier." };
      const pieces = await lireLignes(supabase.from("pieces_demandees").select("*").eq("organization_id",orgId).eq("person_id",ctx.bail.locataire_principal).order("demandee_le"));
      for (const p of pieces) p.statut = p.satisfaite_le ? "Reçue" : p.document_id ? "Déposée, à vérifier" : "À fournir";
      // C17 : sans demande, plus de tableau vide (en-têtes sans ligne) : la phrase qui le dit vient sous le titre.
      contenu = `${section("Pièces demandées dans le dossier")}${pieces.length ? lignesTableau(f,pieces,[["Pièce","libelle","texte"],["Statut","statut","texte"]]) : "<p>Aucune demande de pièce enregistrée à cette date.</p>"}
        <p>Les pièces déjà fournies restent consultables dans le dossier de la personne. Demandez uniquement les justificatifs nécessaires au dossier du locataire retenu et de son garant éventuel.</p>`;
    } else if (code === "avenant_remplacement") {
      if (ctx.bail.type !== "colocation" || ctx.bail.chambre_id) return { erreur: "L’avenant de remplacement concerne un contrat commun. En contrat individuel, clôturez le sortant et créez le contrat du nouvel occupant." };
      // Phase 3 (C19) : l'avenant remplace un colocataire dans un contrat commun signé et en cours ; sur un brouillon, le contrat
      // n'a jamais été conclu (« les autres clauses du contrat commun restent inchangées », « la solidarité cesse » étaient faux).
      if (ctx.bail.etat === "brouillon") return { erreur: "Le contrat commun est encore en préparation : modifiez les colocataires directement dans le brouillon avant sa signature, ou activez d’abord la location s’il est déjà signé." };
      if (ctx.bail.etat === "termine") return { erreur: "Ce contrat commun est terminé : aucun remplacement de colocataire n’est possible." };
      if (ctx.bail.etat !== "actif") return { erreur: "Un congé est enregistré pour ce contrat commun (préavis en cours) : le remplacement d’un colocataire se prépare tant que la location est en cours." };
      // C22 : le sortant est l'un des titulaires du contrat commun, choisi dans la liste de l'écran (son identifiant) ; une
      // personne étrangère au contrat est refusée. Un colocataire dont le départ est déjà enregistré ne signe pas comme
      // « restant ».
      const sortantId = options.sortant?.trim() ?? "";
      const sortant = sortantId ? ctx.locataires.find(p => p.id === sortantId) : undefined;
      if (sortantId && !sortant) return { erreur: "Le colocataire sortant doit être l’un des titulaires du contrat commun : choisissez-le dans la liste." };
      const partis = new Set((await lireLignes(supabase.from("bail_personnes").select("person_id,date_depart").eq("organization_id",orgId).eq("bail_id",bailId))).filter(p => p.date_depart).map(p => texte(p.person_id)));
      const restants = ctx.locataires.filter(p => p.id !== sortant?.id && !partis.has(p.id));
      const nomSortant = f.champ(nomPersonne(sortant), "identité du colocataire sortant");
      const entrant = opt("entrant","identité, adresse et état civil de l’entrant");
      // C21 : un cadre par partie — le bailleur, le sortant, l'entrant (qui devient partie au contrat) et les colocataires
      // qui restent ; C23 : la date est portée à la signature ; C25 : le contrat modifié, avec sa date de prise d'effet.
      avenant = {
        // Reprise du lot 40 (C18) : référence tirée du contenu du remplacement, la même à chaque génération de cet avenant.
        reference: referenceAvenant(bailId, { sortant: sortant?.id, entrant: options.entrant, date_effet: options.date_effet, depot: options.depot }),
        contrat: `Réf. ${referenceCourte("BAIL",bailId)} — prise d’effet le ${f.date(ctx.bail.date_debut, "date de prise d’effet du contrat")}`,
        signatures: `<div class="signatures">${cadreSignature(libelleSignataireBailleur(ctx.organisation.type),nomsBailleurs(f,ctx.bailleurs))}${cadreSignature("Le colocataire sortant",nomSortant)}${cadreSignature("Le colocataire entrant",entrant.replace(/\r?\n/g,"<br/>"))}${restants.length ? cadreSignature(restants.length > 1 ? "Les colocataires restants" : "Le colocataire restant",restants.map(p=>echapper(nomPersonne(p) ?? "")).join("<br/>")) : ""}</div>`,
      };
      contenu = `${section("Parties et remplacement convenu")}
        <p>Colocataire sortant : ${nomSortant} ; colocataire entrant : ${entrant}${pointFinal(options.entrant)}</p>
        <p>Date d’effet convenue : ${f.date(options.date_effet || null,"date d’effet du remplacement")}.</p>
        <p>Les parties conviennent de remplacer le colocataire sortant par l’entrant désigné, sous réserve de la signature de cet avenant par les parties concernées. Les autres clauses du contrat commun restent inchangées.</p>
        <p>La solidarité du sortant et de sa caution cesse à la date prévue par l’article 8-1 VI de la loi du 6 juillet 1989 : à la date d’effet du congé régulièrement délivré lorsqu’un nouveau colocataire figure au bail, ou au plus tard six mois après cette date à défaut de remplacement.</p>
        <p>Accord relatif au dépôt de garantie entre colocataires : ${opt("depot","modalités convenues concernant le dépôt de garantie")}${pointFinal(options.depot)}</p>`;
      signatures = true;
    } else if (code === "autorisation_travaux") {
      contenu = `${section("Travaux autorisés")}
        <p>Nature et périmètre : ${opt("travaux","description précise des travaux")}${pointFinal(options.travaux)}</p>
        <p>Intervenant : ${opt("intervenant","entreprise ou personne chargée des travaux")} ; période convenue : ${opt("periode","dates ou période des travaux")}${pointFinal(options.periode)}</p>
        ${section("Conditions de l’autorisation")}
        <p>Prise en charge et plafond convenus : ${opt("prise_en_charge","répartition des coûts et plafond autorisé")}${pointFinal(options.prise_en_charge)}</p>
        <p>Conditions d’accès, assurances et remise en état : ${opt("conditions","conditions convenues pour l’exécution et la remise en état")}${pointFinal(options.conditions)}</p>
        <p>L’autorisation porte uniquement sur les travaux décrits. Les autorisations administratives ou de copropriété éventuellement nécessaires doivent être obtenues avant leur réalisation. Tout changement de périmètre fait l’objet d’un accord écrit.</p>`;
      signatures = true;
      // Phase 3, lot 43 (T07) : accord signé par les parties ; la date se porte à la signature, comme pour les inventaires.
      dateALaSignature = true;
    }
    const signatureEmetteur = modeSignatureDocument(code)==="enregistree" ? blocSignatureEmetteur(exp.nom, await signatureOrganisation(supabase,orgId)) : null;
    const reference = avenant?.reference ?? referenceCourte(code.toUpperCase().replaceAll("_","-"), bailId);
    // C24 : plusieurs locataires au bail → « Locataires », « Les locataires » (le singulier valait pour deux colocataires).
    const plusieurs = ctx.locataires.length > 1;
    const caseLocataires = plusieurs ? "Locataires" : "Locataire";
    const corps = `${enTete(f,exp,avenant ? {libelle:"Avenant",reference:avenant.reference,etabliLe:aujourdhui} : {libelle:"Dossier",reference:referenceCourte("BAIL",bailId),etabliLe:aujourdhui})}${titre(meta.nom,avenant ? "Modification du contrat commun de location" : "Dossier de location",[])}
      ${cartouches([["Bailleur",nomsBailleurs(f,ctx.bailleurs)],adresseDestinataire === undefined ? [caseLocataires,nomsLocataires(f,ctx.locataires)] : [`${caseLocataires} (${plusieurs ? "destinataires" : "destinataire"})`,`${nomsLocataires(f,ctx.locataires)}${adresseDestinataire.map(ligne => `<div>${facultatif(ligne)}</div>`).join("")}`],["Locaux concernés",f.champ(adresseLogement(ctx.lot,ctx.bien),"adresse du logement")],["Contrat",avenant?.contrat ?? referenceCourte("BAIL",bailId)]])}
      ${contenu}${avenant ? `${faitALaSignature(f,exp.ville)}${avenant.signatures}` : `${dateALaSignature ? faitALaSignature(f,exp.ville) : faitA(f,exp.ville,aujourdhui)}${signatureEmetteur ?? (signatures ? `<div class="signatures">${cadreSignature(libelleSignataireBailleur(ctx.organisation.type),nomsBailleurs(f,ctx.bailleurs))}${cadreSignature(plusieurs ? "Les locataires" : "Le locataire",nomsLocataires(f,ctx.locataires))}</div>` : "")}`}`;
    return { document:assemblerPage({f,titreDocument:meta.nom,nomPied:meta.nom,reference,corps:`<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`}),titreGed:meta.nom,nomFichier:`${code}-${bailId.slice(0,8)}`,liens:[{entite:"bail",entiteId:bailId},{entite:"lot",entiteId:ctx.lot.id},...liensLocataires(ctx)] };
  } catch(e) { if(e instanceof RefusDocument) return {erreur:e.message}; throw e; }
}
