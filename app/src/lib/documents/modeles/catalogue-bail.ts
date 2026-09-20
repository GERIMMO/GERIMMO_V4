import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cadreSignature, cartouches, enTete, faitA, section, tableau, titre, eur } from "../gabarit";
import { CATALOGUE_DOCUMENTS } from "../catalogue";
import { chargerContexteBail, expediteur, adresseLogement, nomsBailleurs, nomsLocataires, liensLocataires, referenceCourte } from "./communs";
import type { Assemblage } from "./index";

export const CODES_COMPLEMENTS_BAIL = ["bordereau_ddt", "inventaire_entree", "inventaire_sortie", "avenant_remplacement", "liste_dossier", "attestation_loyer", "attestation_caf", "relance_simple", "seconde_relance", "mise_en_demeure", "situation_dette", "protocole_apurement", "accuse_conge", "decompte_retenues", "attestation_fin_bail", "autorisation_travaux"] as const;
export type LigneDocument = Record<string, unknown>;
export class RefusDocument extends Error {}
export const texte = (v: unknown) => v == null ? "" : String(v);
export const montant = (v: unknown) => Number(v ?? 0);
export async function lireLignes(requete: PromiseLike<{ data: unknown; error: unknown }>): Promise<LigneDocument[]> {
  const r = await requete;
  if (Array.isArray(r.data) && r.data.length >= 1000) throw new RefusDocument("Ce dossier contient trop de lignes pour un export intégral. Réduisez la période avant de générer le document.");
  if (r.error) throw new RefusDocument("Les données du dossier n’ont pas pu être chargées. Réessayez avant de générer ce document.");
  return (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as LigneDocument[];
}
export function lignesTableau(f: Fusion, lignes: LigneDocument[], colonnes: [string, string, "texte" | "date" | "montant"][]): string {
  return tableau(colonnes.map(([libelle,, type]) => ({ libelle, droite: type === "montant" })), lignes.map(l => colonnes.map(([libelle, cle, type]) => type === "montant" ? f.montant(l[cle] as string | number | null, libelle) : type === "date" ? f.date(texte(l[cle]) || null, libelle) : f.champ(texte(l[cle]) || null, libelle))));
}
export function anneeDocument(options?: Record<string,string>): number {
  const n = Number(options?.annee ?? new Date().getFullYear());
  if (!Number.isInteger(n) || n < 1970 || n > new Date().getFullYear() + 1) throw new RefusDocument("Choisissez une année valide.");
  return n;
}
function dateValide(v: string | undefined): boolean { return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v); }

export async function assemblerComplementBail(code: typeof CODES_COMPLEMENTS_BAIL[number], supabase: SupabaseClient, orgId: string, bailId: string, options: Record<string,string> = {}): Promise<Assemblage> {
  try {
    const ctx = await chargerContexteBail(supabase, orgId, bailId);
    if ("erreur" in ctx) return ctx;
    const meta = CATALOGUE_DOCUMENTS.find(m => m.id === code)!;
    const f = new Fusion(), exp = expediteur(ctx), aujourdhui = new Date().toISOString().slice(0,10);
    let contenu = "", signatures = false;
    const opt = (cle: string, libelle: string) => f.champ(options[cle]?.trim() || null, libelle);
    if (["attestation_loyer", "attestation_caf"].includes(code) && !["actif","preavis"].includes(ctx.bail.etat)) return { erreur: "Cette attestation concerne un contrat actuellement en cours." };
    if (["attestation_loyer", "attestation_caf", "relance_simple", "seconde_relance", "mise_en_demeure", "protocole_apurement"].includes(code) && ctx.bail.etat === "brouillon") return { erreur: "Ce document se prépare pour un bail engagé, après la signature du contrat." };

    if (code === "bordereau_ddt") {
      const lignes = await lireLignes(supabase.from("diagnostics").select("type, date_realisation, date_expiration, diagnostiqueur, document_id, classe_dpe").eq("organization_id", orgId).or(`lot_id.eq.${ctx.lot.id},bien_id.eq.${ctx.bien.id}`).is("archived_at", null).order("type"));
      contenu = `${section("Diagnostics recensés")}${lignesTableau(f,lignes,[["Diagnostic","type","texte"],["Réalisé le","date_realisation","date"],["Validité","date_expiration","date"],["Diagnostiqueur","diagnostiqueur","texte"]])}
      <p>Pièces disponibles : ${lignes.filter(l=>l.document_id).length} sur ${lignes.length} diagnostics recensés.</p>
      ${lignes.some(l=>!l.document_id) ? `<p>${f.champ(null,"rapports de diagnostic à déposer avant remise du dossier")}</p>` : ""}
      <p>Ce bordereau décrit les pièces du dossier. Les rapports établis par les diagnostiqueurs doivent être joints ; il ne constitue pas un diagnostic du logement.</p>`;
      if (!lignes.length) f.champ(null,"diagnostics du logement et de l’immeuble");
    } else if (code === "inventaire_entree" || code === "inventaire_sortie") {
      if (!ctx.lot.meuble && ctx.bail.type !== "meuble") return { erreur: "L’inventaire du mobilier concerne un logement meublé." };
      const lignes = await lireLignes(supabase.from("inventaire_lignes").select("piece, designation, quantite, etat, observation").eq("bail_id",bailId).eq("organization_id",orgId).order("ordre"));
      const sortie = code === "inventaire_sortie";
      if (sortie && !["preavis","termine"].includes(ctx.bail.etat)) return { erreur: "Préparez l’inventaire de sortie après l’enregistrement du congé." };
      contenu = `${section(sortie ? "Mobilier de référence et constat de sortie" : "Mobilier mis à disposition")}
        ${lignesTableau(f,lignes,[["Pièce","piece","texte"],["Désignation","designation","texte"],["Quantité","quantite","texte"],[sortie ? "État de référence" : "État","etat","texte"],["Observation","observation","texte"]])}
        ${sortie ? `<p>Constat contradictoire de sortie : ${opt("constat","état et quantité du mobilier à la sortie")}</p>` : ""}
        <p>Inventaire annexé au contrat, établi contradictoirement à la remise des clés. Date du constat : ${f.date(options.date_constat || null,"date du constat mobilier")}.</p>`;
      if (!lignes.length) f.champ(null,"mobilier du contrat à inventorier");
      signatures = true;
    } else if (code === "attestation_loyer" || code === "attestation_caf") {
      contenu = `${section("Situation locative")}
        <p>Le bailleur atteste que le locataire désigné est titulaire du contrat relatif aux locaux désignés, prenant effet le ${f.date(ctx.bail.date_debut)}.
        Loyer mensuel hors charges : ${f.montant(ctx.bail.loyer_hc)} ; charges mensuelles : ${f.montant(ctx.bail.charges)} (${ctx.bail.charges_mode === "forfait" ? "forfait" : "provisions"}).
        ${ctx.chambre ? "Les montants concernent exclusivement la chambre et le droit d’usage des espaces partagés de ce contrat individuel." : ""}</p>
        <p>Destinataire : ${opt("destinataire","organisme ou destinataire")}.</p>
        <p>Cette attestation décrit les conditions du bail ; les paiements effectifs sont justifiés par les quittances ou reçus.</p>`;
      if (code === "attestation_caf") contenu += `${section("Informations pour l’attestation officielle")}
        <p>Numéro allocataire : ${opt("allocataire","numéro allocataire CAF ou MSA")} ; nombre d’occupants du contrat : ${ctx.locataires.length}.
        Logement ${ctx.lot.meuble ? "meublé" : "nu"} ; surface du logement : ${f.champ(ctx.lot.surface_m2,"surface du logement")} m².
        ${ctx.chambre ? `Surface privative : ${f.champ(ctx.chambre.surface_m2,"surface privative")} m².` : ""}</p>
        <p>Le formulaire officiel Cerfa 10842*07 reste à compléter et signer par le bailleur. Ce récapitulatif prépare la saisie ; il ne vaut pas formulaire CAF/MSA homologué.</p>`;
      signatures = true;
    } else if (["relance_simple","seconde_relance","mise_en_demeure","situation_dette","protocole_apurement"].includes(code)) {
      const termes = await lireLignes(supabase.rpc("etat_loyers_bail", { p_bail: bailId }));
      const echus = termes.filter(l => texte(l.date_echeance).slice(0,10) < aujourdhui && montant(l.montant_du) > montant(l.montant_couvert));
      const detteCentimes = echus.reduce((s,l)=>s+Math.round((montant(l.montant_du)-montant(l.montant_couvert))*100),0);
      if (code !== "situation_dette" && detteCentimes <= 0) return { erreur: "Aucune dette échue n’est constatée : ce courrier n’a pas lieu d’être généré." };
      contenu = `${section(code === "situation_dette" ? "Situation des échéances" : "Échéances restant dues")}
        ${lignesTableau(f,code === "situation_dette" ? termes : echus,[["Période","periode","texte"],["Échéance","date_echeance","date"],["Appelé","montant_du","montant"],["Couvert","montant_couvert","montant"]])}
        <p><strong>Solde échu au ${f.date(aujourdhui)} : ${eur(detteCentimes/100)}.</strong> Les échéances à venir sont exclues de ce solde.</p>`;
      if (code === "relance_simple") contenu += `<p>Sauf règlement intervenu depuis l’établissement de ce décompte, nous vous invitons à régulariser les sommes échues. En cas de difficulté ou de désaccord, contactez votre gestionnaire afin d’examiner votre situation.</p>`;
      if (code === "seconde_relance") {
        const relances = await lireLignes(supabase.from("relances").select("date_envoi").eq("organization_id",orgId).eq("bail_id",bailId).order("date_envoi",{ascending:false}).limit(1));
        if (!relances.length) return { erreur: "Enregistrez la première relance avant de préparer une seconde relance." };
        contenu += `<p>Notre précédent courrier du ${f.date(texte(relances[0].date_envoi))} reste sans régularisation complète à ce jour. Merci de régler ce solde ou de prendre contact avec votre gestionnaire.</p>`;
      }
      if (code === "mise_en_demeure" && (!/^\d+$/.test(options.delai ?? "") || Number(options.delai) < 1 || Number(options.delai) > 90)) return { erreur: "Indiquez un délai de règlement de 1 à 90 jours." };
      if (code === "mise_en_demeure") contenu += `<p>Par le présent courrier, nous vous mettons en demeure de régler les sommes échues détaillées ci-dessus dans un délai de ${opt("delai","délai de règlement à compter de la réception")} jours à compter de sa réception, sous réserve des règlements intervenus depuis son établissement.</p><p>Ce courrier est à notifier avec preuve de réception. Il ne constitue ni un commandement de payer ni une décision de résiliation du bail.</p>`;
      if (code !== "situation_dette") contenu += `<p>Modalités de règlement : ${f.champ(ctx.bail.lieu_paiement,"modalités de règlement")} ; référence à rappeler : ${referenceCourte("BAIL",bailId)}.</p>`;
      if (code === "protocole_apurement") {
        const n = Number(options.mensualites);
        if (!Number.isInteger(n) || n < 1 || n > 60 || !dateValide(options.premiere_echeance)) return { erreur: "Précisez 1 à 60 mensualités et la date de première échéance de l’accord." };
        const premiere = new Date(options.premiere_echeance+"T12:00:00Z");
        const base = Math.floor(detteCentimes/n), reste = detteCentimes % n;
        const lignes = Array.from({length:n},(_,i)=>{
          const date = new Date(Date.UTC(premiere.getUTCFullYear(),premiere.getUTCMonth()+i,1));
          const max = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
          date.setUTCDate(Math.min(premiere.getUTCDate(),max));
          return { date:date.toISOString().slice(0,10), montant:(base+(i<reste?1:0))/100 };
        });
        contenu += `${section("Échéancier convenu")}${lignesTableau(f,lignes,[["Date","date","date"],["Montant","montant","montant"]])}
          <p>Les mensualités d’apurement s’ajoutent au loyer et aux charges courants. Les règlements déjà intervenus sont à déduire avant signature de cet accord. Toute adaptation de l’accord est convenue par écrit entre les parties.</p>
          <p>Conditions particulières de suivi : ${opt("conditions","conditions convenues pour le suivi de l’accord")}.</p>`;
        signatures = true;
      }
    } else if (code === "accuse_conge" || code === "attestation_fin_bail") {
      if (code === "attestation_fin_bail" && ctx.bail.etat !== "termine") return { erreur: "L’attestation de fin de bail se génère après la clôture du contrat." };
      const conges = await lireLignes(supabase.from("conges").select("date_premiere_presentation,date_effet,preavis_mois,par").eq("organization_id",orgId).eq("bail_id",bailId).is("annule_le",null).order("created_at",{ascending:false}).limit(1));
      if (!conges.length) return { erreur: "Aucun congé en cours n’est enregistré pour ce contrat." };
      const c = conges[0];
      contenu = `${section(code === "accuse_conge" ? "Congé reçu" : "Fin du contrat")}
        <p>Congé donné par ${c.par === "locataire" ? "le locataire" : "le bailleur"}, reçu le ${f.date(texte(c.date_premiere_presentation))}.
        Durée du préavis : ${f.champ(texte(c.preavis_mois),"durée du préavis")} mois ; date d’effet enregistrée : ${f.date(texte(c.date_effet))}.</p>
        <p>${code === "accuse_conge" ? "L’état des lieux de sortie, la remise des clés et la transmission de la nouvelle adresse sont à organiser avec le gestionnaire." : "Le contrat est clôturé dans le dossier. Cette attestation ne constitue pas une quittance ni une renonciation au règlement des sommes restant dues."}</p>`;
      signatures = code === "attestation_fin_bail";
    } else if (code === "decompte_retenues") {
      const rs = await lireLignes(supabase.from("restitutions").select("id,statut").eq("bail_id",bailId).eq("organization_id",orgId).limit(1));
      if (!rs.length) return { erreur: "Préparez d’abord la restitution du dépôt de ce contrat." };
      const retenues = await lireLignes(supabase.from("retenues").select("libelle,cout,duree_vie_ans,age_ans,montant_retenu,justificatif_document").eq("restitution_id",rs[0].id).eq("organization_id",orgId));
      contenu = `${section("Retenues enregistrées")}${lignesTableau(f,retenues,[["Motif","libelle","texte"],["Coût","cout","montant"],["Âge (ans)","age_ans","texte"],["Durée de vie (ans)","duree_vie_ans","texte"],["Retenue","montant_retenu","montant"]])}
        <p>Total : ${eur(retenues.reduce((s,l)=>s+montant(l.montant_retenu),0))}. État du dossier : ${rs[0].statut === "finalise" ? "finalisé" : "en préparation"}.</p>
        <p>Les justificatifs des retenues sont joints au décompte de restitution. Les sommes ci-dessus sont propres à ce contrat.</p>`;
      if (retenues.some(l=>!l.justificatif_document)) f.champ(null,"justificatifs de retenues à joindre");
    } else if (code === "liste_dossier") {
      if (!ctx.bail.locataire_principal) return { erreur: "Choisissez d’abord la personne du dossier." };
      const pieces = await lireLignes(supabase.from("pieces_demandees").select("*").eq("organization_id",orgId).eq("person_id",ctx.bail.locataire_principal).order("demandee_le"));
      for (const p of pieces) p.statut = p.satisfaite_le ? "Reçue" : p.document_id ? "Déposée, à vérifier" : "À fournir";
      contenu = `${section("Pièces demandées dans le dossier")}${lignesTableau(f,pieces,[["Pièce","libelle","texte"],["Statut","statut","texte"]])}
        <p>Les pièces déjà fournies restent consultables dans le dossier de la personne. Demandez uniquement les justificatifs nécessaires au dossier du locataire retenu et de son garant éventuel.</p>`;
      if (!pieces.length) contenu += "<p>Aucune demande de pièce enregistrée à cette date.</p>";
    } else if (code === "avenant_remplacement") {
      if (ctx.bail.type !== "colocation" || ctx.bail.chambre_id) return { erreur: "L’avenant de remplacement concerne un contrat commun. En contrat individuel, clôturez le sortant et créez le contrat du nouvel occupant." };
      contenu = `${section("Parties et remplacement convenu")}
        <p>Colocataire sortant : ${opt("sortant","identité du colocataire sortant")} ; colocataire entrant : ${opt("entrant","identité, adresse et état civil de l’entrant")}.</p>
        <p>Date d’effet convenue : ${f.date(options.date_effet || null,"date d’effet du remplacement")}.</p>
        <p>Les parties conviennent de remplacer le colocataire sortant par l’entrant désigné, sous réserve de la signature de cet avenant par les parties concernées. Les autres clauses du contrat commun restent inchangées.</p>
        <p>La solidarité du sortant et de sa caution cesse à la date prévue par l’article 8-1 VI de la loi du 6 juillet 1989 : à la date d’effet du congé régulièrement délivré lorsqu’un nouveau colocataire figure au bail, ou au plus tard six mois après cette date à défaut de remplacement.</p>
        <p>Accord relatif au dépôt de garantie entre colocataires : ${opt("depot","modalités convenues concernant le dépôt de garantie")}.</p>`;
      signatures = true;
    } else if (code === "autorisation_travaux") {
      contenu = `${section("Travaux autorisés")}
        <p>Nature et périmètre : ${opt("travaux","description précise des travaux")}.</p>
        <p>Intervenant : ${opt("intervenant","entreprise ou personne chargée des travaux")} ; période convenue : ${opt("periode","dates ou période des travaux")}.</p>
        ${section("Conditions de l’autorisation")}
        <p>Prise en charge et plafond convenus : ${opt("prise_en_charge","répartition des coûts et plafond autorisé")}.</p>
        <p>Conditions d’accès, assurances et remise en état : ${opt("conditions","conditions convenues pour l’exécution et la remise en état")}.</p>
        <p>L’autorisation porte uniquement sur les travaux décrits. Les autorisations administratives ou de copropriété éventuellement nécessaires doivent être obtenues avant leur réalisation. Tout changement de périmètre fait l’objet d’un accord écrit.</p>`;
      signatures = true;
    }
    const reference = referenceCourte(code.toUpperCase().replaceAll("_","-"), bailId);
    const corps = `${enTete(f,exp,{libelle:"Dossier",reference:referenceCourte("BAIL",bailId),etabliLe:aujourdhui})}${titre(meta.nom,"Dossier de location",[])}
      ${cartouches([["Bailleur",nomsBailleurs(f,ctx.bailleurs)],["Locataire",nomsLocataires(f,ctx.locataires)],["Locaux concernés",f.champ(adresseLogement(ctx.lot,ctx.bien),"adresse du logement")],["Contrat",referenceCourte("BAIL",bailId)]])}
      ${contenu}${faitA(f,exp.ville,aujourdhui)}${signatures ? `<div class="signatures">${cadreSignature("Le bailleur / mandataire",nomsBailleurs(f,ctx.bailleurs))}${cadreSignature("Le locataire",nomsLocataires(f,ctx.locataires))}</div>` : ""}`;
    return { document:assemblerPage({f,titreDocument:meta.nom,nomPied:meta.nom,reference,corps:`<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`}),titreGed:meta.nom,nomFichier:`${code}-${bailId.slice(0,8)}`,liens:[{entite:"bail",entiteId:bailId},{entite:"lot",entiteId:ctx.lot.id},...liensLocataires(ctx)] };
  } catch(e) { if(e instanceof RefusDocument) return {erreur:e.message}; throw e; }
}
