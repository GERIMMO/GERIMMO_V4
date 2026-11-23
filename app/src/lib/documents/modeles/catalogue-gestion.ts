import { detailRapportGestion } from "./detail-rapport-gestion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cadreSignature, cartouches, enTete, faitA, section, tableau, titre, eur, facultatif, nombreFr, pointFinal, moisEnToutesLettres, formaterDateFr } from "../gabarit";
import { ETATS_INCIDENT_DOCUMENT, IMPUTATIONS_INCIDENT, URGENCES_INCIDENT, categorieIncident } from "@/lib/incidents";
import { libelleCategorieEcriture } from "@/lib/categories-ecriture";
import { ETATS_MANDAT } from "@/lib/baux";
import { NATURES_TRAVAUX, STATUTS_DEVIS, STATUTS_INTERVENTION_DOCUMENT } from "@/app/agence/[orgId]/artisans/referentiel";
import { descriptionDevisLisible } from "@/lib/devis-structure";
import { CATALOGUE_DOCUMENTS } from "../catalogue";
import { lireLignes, lignesTableau, RefusDocument, texte, montant, anneeDocument, MESSAGE_CHARGEMENT_IMPOSSIBLE, type LigneDocument } from "./catalogue-bail";
import { chargerContexteBail, chargerDetenteursBien, chargerDetenteursLot, expediteur, libelleSignataireBailleur, nomsLocataires, adresseLogement, referenceCourte } from "./communs";
import { LIBELLE_DEPENSES_EXCLUES, LIBELLE_RECETTES_EXCLUES, phrasePerimetreFiscal, phrasePiecesAQualifier, recapitulatifFiscal, type ComposantesFiscales, type EcritureFiscale, type ExerciceFiscalLot, type QualificationFiscale, type RecapitulatifFiscal } from "@/lib/fiscal";
import type { Assemblage, LienDocument } from "./index";
import { aujourdhuiParis } from "@/lib/ged";
import { erreurDuChamp, lireMontantFacultatif } from "@/lib/saisie-montant";
import { identifiantsDesEcritures, lectureTronquee, lireParIdentifiants, messageDocumentLectureTronquee } from "@/lib/lectures-fiscales";
import { lireCadreFiscal } from "@/lib/lecture-profils-fiscaux";

export const CODES_COMPLEMENTS_GESTION = ["regularisation_charges", "decompte_charges", "consultation_charges", "restitution_cles", "ordre_intervention", "comparatif_devis", "compte_rendu_intervention", "recap_incident", "cloture_mensuelle", "ecriture_rectificative", "recap_fiscal_nu", "recap_fiscal_meuble", "avenant_mandat", "avenant_perimetre", "rapport_gestion", "bordereau_versement", "resiliation_mandat", "recap_fiscal_agence"] as const;

// Sens du solde d'une régularisation (audit métier du 27/09, BLOQUANT).
// La base enregistre `ecart = provisions − charges réelles` (regulariser_charges) :
// un écart POSITIF est un trop-perçu qui revient au locataire, un écart
// NÉGATIF un complément qu'il doit. Le PDF disait l'inverse (« Solde à
// régler » pour un trop-perçu). Wiki « Régularisation des charges » : le solde
// se fait dans le bon sens, remboursement ou complément.
export function libelleSoldeRegularisation(ecart: number): string {
  if (ecart > 0) return `Trop-perçu en faveur du locataire : ${eur(ecart)}`;
  if (ecart < 0) return `Complément à régler par le locataire : ${eur(-ecart)}`;
  return "Charges équilibrées : aucun solde";
}

// « septembre 2026 » : l'utilitaire vit dans le gabarit (phase 3, lot 36) ; il reste exporté ici pour ses lecteurs existants.
export { moisEnToutesLettres };

// Phase 3, lot 42 (C77) : le jour qui tombe un mois après `jour` (AAAA-MM-JJ), à la manière de la base
// (`jour + interval '1 month'`) : le 31/01 donne le 28/02 (ou le 29), jamais le 03/03.
export function unMoisApres(jour: string): string {
  const [a, m, j] = jour.slice(0, 10).split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(j, dernier))).toISOString().slice(0, 10);
}

// Phase 3, lot 42 (C77) : le courrier de régularisation annonçait le décompte « communiqué un mois avant la régularisation »
// alors que la première mensualité d'un étalement tombait le 1er du mois suivant, parfois huit jours après.
// Reprise du lot 42 (C77) : la phrase restait imprimée sans étalement, sur un courrier daté du jour même où la régularisation
// est enregistrée (« Date du dossier : 23/11/2026 », « Fait à Lyon, le 23/11/2026 ») : le document affirmait un délai que ses
// propres dates démentent, et tranchait un point ouvert chez le juriste (régularisation validée le jour de l'envoi du décompte).
// La phrase n'est plus imprimée que si les dates du dossier la permettent TOUTES : la régularisation enregistrée (date
// d'émission) et, en cas d'étalement, sa première mensualité tombent au moins un mois après l'envoi du document. Une date
// d'émission absente ne permet pas de le dire. `regulariser_charges` enregistre la régularisation au jour même : son courrier
// ne prétend donc plus au délai, quelle que soit la lecture du mot « régularisation » (enregistrement ou règlement).
export function delaiDecompteRespecte(etalement: unknown, envoi: string, emission: unknown): boolean {
  const borne = unMoisApres(envoi), emise = texte(emission).slice(0, 10);
  if (!emise || emise < borne) return false;
  if (!Array.isArray(etalement) || !etalement.length) return true;
  const premiere = texte((etalement[0] as Record<string, unknown> | null)?.echeance).slice(0, 10);
  return premiere !== "" && premiere >= borne;
}

// Phase 3, lot 42 (C79) : un rendez-vous est un INSTANT. Il s'imprime au jour et à l'heure de Paris, comme sur les écrans
// (« le 26/11/2026 de 9 h à 11 h ») ; `f.date` n'en gardait que le jour (« 26/11/2026 au 26/11/2026 »). Un jour seul
// (AAAA-MM-JJ, sans heure) s'imprime sans heure. Espaces insécables dans l'heure : « 11 h » ne se coupe pas en fin de ligne.
const HEURE_PARIS = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" });
// Phase 3, lot 43 (T01) : l'heure « 09 » perd son zéro par une lecture de texte, pas par Number() (garde
// lecture-saisies-sans-number : aucune valeur `.value` n'est convertie par Number, même une partie de date d'Intl).
function heureParis(instant: string): string {
  const parties = HEURE_PARIS.formatToParts(new Date(instant));
  const h = (parties.find(p => p.type === "hour")?.value ?? "0").replace(/^0(?=\d)/, ""), m = parties.find(p => p.type === "minute")?.value ?? "00";
  return m === "00" ? `${h}\u00a0h` : `${h}\u00a0h\u00a0${m}`;
}
export function creneauParis(debut: string, fin?: string | null): string {
  if (debut.length <= 10) return fin && fin.slice(0, 10) !== debut ? `du ${formaterDateFr(debut)} au ${formaterDateFr(fin.slice(0, 10))}` : `le ${formaterDateFr(debut)}`;
  if (!fin) return `le ${formaterDateFr(debut)} à ${heureParis(debut)}`;
  return formaterDateFr(debut) === formaterDateFr(fin)
    ? `le ${formaterDateFr(debut)} de ${heureParis(debut)} à ${heureParis(fin)}`
    : `du ${formaterDateFr(debut)} à ${heureParis(debut)} au ${formaterDateFr(fin)} à ${heureParis(fin)}`;
}

// Phase 3, lot 42 (C95) : un récapitulatif d'une année qui n'est pas terminée (au jour de Paris) le dit, comme le journal d'un
// mois ouvert (« Mois ouvert — document provisoire »). Il portait « Exercice 2026 », établi en novembre sur onze mois.
export function mentionExerciceProvisoire(annee: number, aujourdhui: string): string {
  const anneeEnCours = Number(aujourdhui.slice(0, 4));
  if (annee > anneeEnCours) return "<p>Exercice non commencé — document provisoire.</p>";
  return annee === anneeEnCours ? "<p>Exercice en cours — document provisoire.</p>" : "";
}

// Phase 3 (C81, C92) : les documents de gestion impriment les libellés que les écrans affichent, jamais les valeurs de la base
// (« chauffage_panne », « planifiee », « proprietaire », « non_retenu », « depense »). Les tables viennent des écrans ; un code
// inconnu (valeur ajoutée en base après coup) s'imprime tel quel plutôt que de disparaître.
const libelleDe = (table: Record<string, string>, code: unknown): string => { const c = texte(code); return table[c] ?? c; };
const libelleCategorie = (code: unknown): string => categorieIncident(texte(code))?.libelle ?? texte(code);
// Le sens d'une écriture : aucune table commune n'existait (le formulaire de comptabilité écrit « Recette » / « Dépense » dans ses options).
const SENS_ECRITURE: Record<string, string> = { recette: "Recette", depense: "Dépense" };
const avecSensLisible = (ecritures: Record<string, unknown>[]) => ecritures.map(e => ({ ...e, sens: libelleDe(SENS_ECRITURE, e.sens) }));

// Le récapitulatif du lot nu pour une année, lu comme l'écran « Préparer ma déclaration » : les montants de l'aide 2044 ne viennent que des
// captures d'encaissement, des qualifications justifiées et de l'exercice confirmé du lot. Partagé par le document et par la proposition
// du champ « intérêts d'emprunt » (D37), pour que les deux lisent le même livre.
//
// X21 (VER-TS-05) : les lectures sont bornées au lot et à l'année. Les écritures du lot de l'année, et celles sans lot (une
// qualification peut les attribuer au lot), se lisent d'abord ; qualifications et captures ne se lisent QUE pour ces pièces et pour
// les pièces d'origine de leurs contre-écritures. Une lecture qui atteint le plafond de lignes de l'API fait refuser le document
// (aucun montant sur une lecture peut-être coupée), avec un message qui le dit : voir `lectures-fiscales`.
export async function chargerRecapitulatifNu(db: SupabaseClient, orgId: string, lotId: string, annee: number): Promise<RecapitulatifFiscal> {
  const lire = (table:string) => db.from(table).select("*").eq("organization_id", orgId);
  const debutAnnee = `${annee}-01-01`, debutSuivante = `${annee+1}-01-01`;
  const lireBornee = async (requete: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await requete;
    if (r.error) throw new RefusDocument(MESSAGE_CHARGEMENT_IMPOSSIBLE);
    const lignes = (Array.isArray(r.data) ? r.data : []) as Record<string,unknown>[];
    return { lignes, tronquee: lectureTronquee(lignes) };
  };
  const ecrituresDeLAnnee = () => lire("ecritures").gte("date_piece",debutAnnee).lt("date_piece",debutSuivante).order("date_piece");
  const [duLot, sansLot, lectureExercices] = await Promise.all([
    lireBornee(ecrituresDeLAnnee().eq("lot_id",lotId)),
    lireBornee(ecrituresDeLAnnee().is("lot_id",null)),
    lireBornee(lire("fiscal_exercices_lots").eq("annee",annee).eq("lot_id",lotId).order("version",{ascending:false})),
  ]);
  const tronquees: string[] = [];
  if (duLot.tronquee || sansLot.tronquee) tronquees.push(`des écritures de ${annee}`);
  if (lectureExercices.tronquee) tronquees.push("des exercices confirmés");
  if (tronquees.length) throw new RefusDocument(messageDocumentLectureTronquee(annee, tronquees));
  // Les deux lectures sont disjointes (lot demandé / sans lot) ; une pièce n'est comptée qu'une fois quoi qu'il arrive.
  const dejaVues = new Set<string>();
  const anneeOrg = [...duLot.lignes, ...sansLot.lignes]
    .filter(e => { const id = texte(e.id); if (!id) return true; if (dejaVues.has(id)) return false; dejaVues.add(id); return true; })
    .sort((a, b) => texte(a.date_piece).localeCompare(texte(b.date_piece)));
  const identifiants = identifiantsDesEcritures(anneeOrg as { id?: string; contre_ecriture_de?: string | null }[]);
  const [lectureQualifications, lectureCaptures] = await Promise.all([
    lireParIdentifiants(identifiants, (paquet) => lire("fiscal_qualifications_ecritures").in("ecriture_id",paquet).order("version",{ascending:false})),
    lireParIdentifiants(identifiants, (paquet) => lire("fiscal_encaissements_composantes").in("ecriture_id",paquet)),
  ]);
  if (lectureQualifications.error || lectureCaptures.error) throw new RefusDocument(MESSAGE_CHARGEMENT_IMPOSSIBLE);
  if (lectureQualifications.tronquee) tronquees.push("des qualifications fiscales");
  if (lectureCaptures.tronquee) tronquees.push("des captures d’encaissement");
  if (tronquees.length) throw new RefusDocument(messageDocumentLectureTronquee(annee, tronquees));
  const qualifications = new Map<string,QualificationFiscale>();
  for (const q of (lectureQualifications.data ?? []) as unknown as QualificationFiscale[]) if (!qualifications.has(q.ecriture_id)) qualifications.set(q.ecriture_id,q);
  const composantes = new Map(((lectureCaptures.data ?? []) as unknown as ComposantesFiscales[]).map(c=>[c.ecriture_id,c]));
  const exercices = new Map<string,ExerciceFiscalLot>();
  for (const x of lectureExercices.lignes as unknown as ExerciceFiscalLot[]) if (x.lot_id === lotId && !exercices.has(x.lot_id)) exercices.set(x.lot_id,x);
  const ecritures = anneeOrg.filter(e => (texte(e.lot_id) || qualifications.get(texte(e.contre_ecriture_de) || texte(e.id))?.lot_id) === lotId);
  const organisations = await lireLignes(db.from("organizations").select("id,type").eq("id", orgId).limit(1));
  const typeEspace = organisations[0]?.type;
  if (typeEspace !== "agence" && typeEspace !== "proprietaire_direct") throw new RefusDocument(MESSAGE_CHARGEMENT_IMPOSSIBLE);
  // Ce nouveau profil est réservé à la gestion directe. Le parcours des agences conserve ses qualifications existantes.
  if (typeEspace === "proprietaire_direct") {
    const cadreFiscal = await lireCadreFiscal(db, orgId, annee, new Set([lotId]));
    if (cadreFiscal.blocage2044) throw new RefusDocument(cadreFiscal.blocage2044);
  }
  return recapitulatifFiscal(ecritures as unknown as EcritureFiscale[],annee,{qualifications,composantes,exercices,exigerPerimetre:true});
}

// La ligne 250 (intérêts d'emprunt) telle que le livre la porte : le montant des dépenses qualifiées en 250, ou `null` quand aucune ne l'est
// (la rubrique reste « à compléter »). D37 : c'est ce montant que le champ du document propose, et auquel la saisie est comparée.
export function interetsQualifies(fiscal: RecapitulatifFiscal): number | null {
  const ligne = fiscal.rubriques.find(r => r.code === "250");
  return !ligne || ligne.aCompleter ? null : ligne.montant;
}

// D37 (CHF-01, option B) : si le montant saisi diffère de celui que le livre porte en ligne 250, l'écart se lit SUR le PDF, sous le tableau.
// Le tableau reprend la valeur saisie (modifiable) ; l'écart n'est jamais silencieux. Comparaison au centime.
export function ecartInterets(saisi: number, qualifie: number | null): string {
  const livre = qualifie ?? 0, ecart = Math.abs(Math.round(saisi * 100) - Math.round(livre * 100)) / 100;
  if (ecart === 0) return "";
  const constat = qualifie === null ? "Le livre ne porte aucune dépense qualifiée en ligne 250" : `Le livre porte ${eur(qualifie)} qualifiés en ligne 250`;
  return `<div class="encadre"><p><strong>Écart sur la ligne 250 (intérêts d’emprunt).</strong> ${constat} ; le montant saisi à la génération du document est de ${eur(saisi)}, soit un écart de ${eur(ecart)}. Le tableau reprend le montant saisi : vérifiez-le avant de le recopier sur la déclaration.</p></div>`;
}

// Un montant remis dans un champ de saisie : virgule, deux décimales, sans séparateur de milliers (ce que `lireMontant` relit).
export function montantPourSaisie(montant: number): string {
  return (Math.round(montant * 100) / 100).toFixed(2).replace(".", ",");
}

export async function assemblerComplementGestion(code: typeof CODES_COMPLEMENTS_GESTION[number], db: SupabaseClient, orgId: string, cibleId: string, options: Record<string,string> = {}): Promise<Assemblage> {
  try {
    const lire = (table:string) => db.from(table).select("*").eq("organization_id", orgId);
    const unique = async (table:string,id:string) => {
      const lignes = await lireLignes(lire(table).eq("id",id).limit(1));
      if (!lignes.length) throw new RefusDocument("Le dossier demandé est introuvable ou inaccessible.");
      return lignes[0];
    };
    const orgs = await lireLignes(db.from("organizations").select("*").eq("id",orgId).limit(1));
    if (!orgs.length) throw new RefusDocument("Organisation inaccessible.");
    const org = orgs[0], f = new Fusion(), meta = CATALOGUE_DOCUMENTS.find(m=>m.id===code)!;
    // L'organisation telle que l'en-tête la lit (une valeur absente reste absente).
    const organisation = { name:texte(org.name), type:texte(org.type), address_line1:texte(org.address_line1)||null, postal_code:texte(org.postal_code)||null, city:texte(org.city)||null, telephone:texte(org.telephone)||null, email_contact:texte(org.email_contact)||null };
    // Phase 3 (C36, C76) : un document de bail est émis par les détenteurs du bail hors espace d'agence (expediteur, comme les
    // autres documents du bail), de même que l'ordre et le compte rendu d'une intervention (reprise du lot 37) ; les autres
    // documents de gestion (comparatif, récapitulatif d'incident, journal, récapitulatifs fiscaux), par l'organisation.
    // L'en-tête construit ici à partir du nom de l'espace faisait du nom technique du parc le bailleur et le signataire du
    // bordereau des clés et des courriers de charges.
    let exp = expediteur({ organisation });
    // Le jour à Paris, pas en UTC : entre 0 h et 2 h, toISOString donnait la veille.
    const aujourdhui = aujourdhuiParis();
    // La date du document (« Établi le » et « Fait à …, le ») : le jour de génération, sauf pour un acte daté de l'événement qu'il
    // constate (bordereau des clés : le jour de la remise).
    let dateDocument = aujourdhui;
    const champ = (cle:string,libelle:string) => f.champ(options[cle]?.trim()||null,libelle);
    const liens: LienDocument[] = [];
    let contenu = "", destinataire = "", logement = "", libelleLieu = "Logement", signatures = false;
    // Phase 3, lot 42 (C88) : le logement s'écrit comme dans les documents du bail (adresseLogement), étage et porte compris ;
    // l'ordre envoyé à l'artisan n'en donnait que le nom et l'adresse de l'immeuble.
    const lotConcerne = async (id:string) => {
      const lot = await unique("lots",id), bien = await unique("biens",texte(lot.bien_id));
      logement = adresseLogement({ nom: texte(lot.nom), etage: texte(lot.etage) || null }, { address_line1: texte(bien.address_line1) || null, postal_code: texte(bien.postal_code) || null, city: texte(bien.city) || null });
      liens.push({entite:"lot",entiteId:id});
      return lot;
    };
    // Phase 3 (C82) : un incident des parties communes n'a pas de lot ; il porte l'immeuble. Le document le dit, avec l'adresse
    // de l'immeuble ; il n'y a plus de lecture d'un lot à l'identifiant vide, qui finissait en « Réessayez » sans issue.
    const lieuIncident = async (incident:LigneDocument) => {
      if (texte(incident.lot_id)) { await lotConcerne(texte(incident.lot_id)); return; }
      if (!texte(incident.bien_id)) throw new RefusDocument("Ce signalement n’indique ni logement ni immeuble : précisez le lieu de l’incident avant de générer ce document.");
      const bien = await unique("biens",texte(incident.bien_id));
      libelleLieu = "Lieu";
      logement = [texte(bien.nom),"Parties communes",bien.address_line1,bien.postal_code,bien.city].filter(Boolean).join(" · ");
    };
    const bailConcerne = async (id:string) => {
      const ctx = await chargerContexteBail(db,orgId,id);
      if ("erreur" in ctx) throw new RefusDocument(ctx.erreur);
      destinataire = nomsLocataires(f,ctx.locataires); logement = adresseLogement(ctx.lot,ctx.bien); exp = expediteur(ctx);
      liens.push({entite:"bail",entiteId:id},{entite:"lot",entiteId:ctx.lot.id});
      return ctx;
    };
    if (["regularisation_charges","decompte_charges","consultation_charges"].includes(code)) {
      const r = await unique("regularisations_charges",cibleId);
      const ctx = await bailConcerne(texte(r.bail_id));
      if (ctx.bail.charges_mode === "forfait") throw new RefusDocument("Les charges forfaitaires ne font pas l’objet d’une régularisation annuelle.");
      contenu = `${section(`Charges de l’exercice ${texte(r.annee)}`)}${lignesTableau(f,[r],[["Provisions versées","provisions","montant"],["Charges réelles","charges_reelles","montant"],["Écart enregistré","ecart","montant"]])}
        <p>${libelleSoldeRegularisation(montant(r.ecart))}.</p>${
          // Audit gestion du 29/09 : quote-part d'un contrat individuel de
          // colocation, et régularisation tardive (art. 23 loi 89-462).
          r.quote_part_colocation != null
            ? `<p>Contrat individuel de colocation : charges du logement imputées à hauteur de ${nombreFr(Math.round(montant(r.quote_part_colocation) * 1000) / 10)}\u00a0% (surface de la chambre sur la surface cumulée des chambres), puis au prorata des jours d’occupation.</p>`
            : ""
        }${
          Array.isArray(r.etalement_12_mois) && r.etalement_12_mois.length
            ? `<p class="annonce">À la demande du locataire, le complément est réglé en douze mensualités (régularisation tardive, art. 23 de la loi du 6 juillet 1989) :</p>${lignesTableau(f, r.etalement_12_mois as Record<string, unknown>[], [["Mensualité","rang","texte"],["Échéance","echeance","date"],["Montant","montant","montant"]])}`
            : r.tardive && montant(r.ecart) < 0
              ? `<p>Régularisation effectuée après le terme de l’année civile suivant l’exercice : le locataire peut demander à régler ce complément par douzièmes (art. 23 de la loi du 6 juillet 1989).</p>`
              : ""
        }`;
      // D39 (CHF-03, option B) : le détail des dépenses se saisit au moment de générer le document, comme la consultation des justificatifs.
      // La régularisation émise ne se modifie pas (RM-3.9.7) : rien n'est écrit. Un détail déjà porté par la régularisation sert de repli.
      const detailSaisi = (options.detail_depenses ?? "").trim();
      if (detailSaisi.length > 6000) throw new RefusDocument("Le détail des dépenses est trop long : 6 000 caractères au plus.");
      // Phase 3, lot 42 (C97) : le justificatif du syndic est une pièce séparée, enregistrée dans le dossier ; il n'est pas dans ce
      // PDF. « Justificatif annexé : …, à joindre » disait les deux à la fois.
      if (code !== "consultation_charges") contenu += `${section("Décompte et répartition")}
        <p>${f.champ(detailSaisi||texte(r.note)||null,"détail des dépenses par nature et clé de répartition")}</p>
        <p>Justificatif : ${r.justificatif_document ? "pièce enregistrée dans le dossier, à joindre au courrier" : f.champ(null,"décompte justificatif à déposer et joindre")}.</p>`;
      contenu += `${section("Consultation des justificatifs")}<p>Modalités : ${champ("consultation","lieu ou accès, horaires et contact pour consulter les justificatifs")}${pointFinal(options.consultation)}</p>
        <p>${delaiDecompteRespecte(r.etalement_12_mois, dateDocument, r.date_emission) ?"Le décompte par nature de charges et le mode de répartition sont communiqués un mois avant la régularisation. " : ""}Les justificatifs restent à disposition pendant six mois à compter de l’envoi du décompte.</p>
        <p>Date du dossier : ${f.date(texte(r.date_emission))}. Ce PDF ne déclenche aucun prélèvement ni envoi.</p>`;
    } else if (code === "restitution_cles") {
      const edl = await unique("etats_des_lieux",cibleId);
      await bailConcerne(texte(edl.bail_id));
      const cles = await lireLignes(lire("edl_cles").eq("edl_id",cibleId).order("libelle"));
      if (!cles.length) throw new RefusDocument("Renseignez les clés dans l’état des lieux avant de préparer le bordereau.");
      // Phase 3 (C42) : le bordereau est daté de la remise des clés, c'est-à-dire de l'état des lieux, pas du jour de génération
      // (une remise du 01/09/2023 portait « Fait à Lyon, le 23/11/2026 », après le départ du locataire).
      dateDocument = texte(edl.date_edl) || aujourdhui;
      // Phase 3 (S20) : la référence d'une clé est facultative à la saisie, et l'état des lieux l'imprime « — » quand elle manque ;
      // le bordereau fait de même (elle ne peut plus être complétée une fois l'état des lieux signé).
      // Phase 3, lot 45 (T17, décision prudente) : le nombre de clés reste exigé tant que l'état des lieux n'est pas signé ; signé,
      // il est figé (rien ne se complète plus) : un nombre non saisi s'imprime « non compté », comme dans l'état des lieux.
      const lignesCles = edl.etat === "signe" ? cles.map(c => texte(c.nombre) === "" ? { ...c, nombre: "non compté" } : c) : cles;
      contenu = `${section(edl.type === "sortie" ? "Clés restituées au bailleur" : "Clés remises au locataire")}
        <p>Date du constat : ${f.date(texte(edl.date_edl))}. État des lieux ${edl.etat === "signe" ? "signé" : "en préparation : remise à confirmer contradictoirement"}.</p>
        ${lignesTableau(f,lignesCles,[["Clé / accès","libelle","texte"],["Nombre","nombre","texte"],["Référence","reference","facultatif"]])}`;
      signatures = true;
    } else if (["ordre_intervention","comparatif_devis","compte_rendu_intervention","recap_incident"].includes(code)) {
      const intervention = ["ordre_intervention","compte_rendu_intervention"].includes(code) ? await unique("incident_interventions",cibleId) : null;
      const incident = await unique("incidents",intervention ? texte(intervention.incident_id) : cibleId);
      await lieuIncident(incident);
      // Les comptes rendus sont rattachés au lot. Leur visibilité suit la GED du lot.
      // Phase 3, lot 42 (C89) : le récapitulatif dit quand l'incident a été signalé et son urgence (la date du constat, sinon celle
      // de l'enregistrement, comme l'historique des incidents du bien).
      const signaleLe = texte(incident.date_signalement) || texte(incident.created_at);
      // Reprise du lot 36 : l'état de l'incident et celui de la mission avec les libellés de DOCUMENT (sans la consigne de travail
      // de l'écran, « Terminé — à clôturer », « Confiée — l'artisan n'a pas encore répondu ») : l'ordre part à l'entreprise.
      contenu = `${section(`Incident ${texte(incident.numero)}`)}<p>Signalement : ${f.champ(texte(incident.description),"description du signalement")}${pointFinal(texte(incident.description))}</p>
        ${code === "recap_incident" ? `<p>Signalé le ${f.date(signaleLe || null,"date du signalement")} ; urgence : ${facultatif(libelleDe(URGENCES_INCIDENT,incident.urgence))}.</p>` : ""}
        <p>Pièce : ${facultatif(texte(incident.piece))} ; catégorie : ${facultatif(libelleCategorie(incident.categorie))} ; état : ${f.champ(libelleDe(ETATS_INCIDENT_DOCUMENT,incident.etat),"état du dossier")}.</p>`;
      if (intervention) {
        const artisans = await lireLignes(db.from("artisans").select("raison_sociale,siret,telephone,email").eq("id",intervention.artisan_id).limit(1));
        if (!artisans.length) throw new RefusDocument("Les coordonnées de l’artisan ne sont pas accessibles.");
        const a = artisans[0], entreprise = f.champ(texte(a.raison_sociale),"entreprise intervenante");
        // Reprise du lot 37 (C90, C36/C76 pour l'ordre) : les deux documents d'une mission sont ceux du DONNEUR D'ORDRE, l'agence
        // dans son espace, ailleurs les détenteurs du lot (C82 : pour les parties communes, ceux des logements de l'immeuble),
        // selon la règle d'expediteur. L'ordre partait au nom technique de l'espace et avec son téléphone, alors que le compte
        // rendu de la même mission désignait la bailleresse. Une lecture des détenteurs en échec refuse le document plutôt que de
        // redonner le nom de l'espace.
        if (organisation.type !== "agence") {
          const detenteurs = texte(incident.lot_id) ? await chargerDetenteursLot(db, texte(incident.lot_id)) : await chargerDetenteursBien(db, texte(incident.bien_id));
          if (!detenteurs) throw new RefusDocument(MESSAGE_CHARGEMENT_IMPOSSIBLE);
          exp = expediteur({ organisation, bailleurs: detenteurs });
        }
        // L'ordre est adressé à l'entreprise. Le compte rendu est la pièce du donneur d'ordre qui consigne ce que l'artisan a
        // déclaré : il n'a pas de case « Destinataire » (C83). Il désignait l'artisan lui-même (C90), puis le donneur d'ordre, qui
        // en était déjà l'émetteur (l'agence s'adressait le document à elle-même).
        destinataire = code === "ordre_intervention" ? entreprise : "";
        const nature = libelleDe(NATURES_TRAVAUX, intervention.nature_travaux);
        contenu += `${section("Mission enregistrée")}<p>${f.champ(nature,"nature des travaux")}${pointFinal(nature)}</p>
          <p>Artisan : ${entreprise} ; SIRET : ${facultatif(texte(a.siret))}. Contact : ${facultatif(texte(a.telephone))} · ${facultatif(texte(a.email))}.</p>
          <p>État de la mission : ${f.champ(libelleDe(STATUTS_INTERVENTION_DOCUMENT,intervention.statut),"statut de la mission")} ; confiée le ${f.date(texte(intervention.confiee_le))}.</p>`;
        if (code === "ordre_intervention") {
          if (["annulee","refusee"].includes(texte(intervention.statut))) throw new RefusDocument("Cette mission a été annulée ou refusée. Préparez une nouvelle mission pour émettre un ordre d’intervention.");
          // C79 : le créneau garde ses heures (heure de Paris). Début ou fin manquant : le document reste à compléter, comme avant.
          const debut = texte(intervention.debut_prevu), fin = texte(intervention.fin_prevue);
          // C80 : l'ordre dit quels travaux il commande, ceux du devis auquel la mission est rattachée (travaux en clair, montant
          // TTC). « Aucun travail supplémentaire » n'avait sinon aucun périmètre.
          // Reprise du lot 42 (C80) :
          //  - une mission sans devis ne donne plus d'ordre : il ne commandait rien (« Aucun devis n'est rattaché ») et interdisait
          //    pourtant tout « travail supplémentaire ». L'application rattache toujours la mission au devis retenu (retenir_devis
          //    est la seule à en créer) ; seules des données reprises en sont dépourvues. La liste du catalogue ne les propose plus ;
          //  - la référence « DEV-… » imprimée n'était pas celle du PDF du devis : le PDF validé par l'artisan porte la référence de
          //    sa préparation (artisan_devis_preparations.reference_id, que le donneur d'ordre ne peut pas lire), la mission
          //    l'identifiant du devis déposé, tiré à part. Le devis est désigné par ce que les deux documents partagent : son auteur,
          //    sa version, ses dates et son montant, puis ses travaux ;
          //  - la phrase qui borne les travaux ouvre la section, avant leur détail : elle partait seule en page 2, loin de la liste
          //    qu'elle encadre (la section la suit, coupée au besoin entre deux pages).
          const devisId = texte(intervention.devis_id);
          if (!devisId) throw new RefusDocument("Cette mission n’est rattachée à aucun devis : l’ordre d’intervention ne peut pas dire quels travaux sont commandés.");
          const devis = await unique("incident_devis", devisId);
          const auteurDevis = texte(devis.artisan_id) === texte(intervention.artisan_id)
            ? texte(a.raison_sociale)
            : texte((await lireLignes(db.from("artisans").select("raison_sociale").eq("id",devis.artisan_id).limit(1)))[0]?.raison_sociale);
          const version = Number(devis.version) > 1 ? ` (version ${Number(devis.version)})` : "";
          const travaux = `<p>${devis.statut === "retenu" ? "Devis retenu" : `Devis rattaché (${facultatif(libelleDe(STATUTS_DEVIS,devis.statut))})`} de ${facultatif(auteurDevis)}${version}, déposé le ${f.date(texte(devis.depose_le))}${devis.retenu_le ? ` et retenu le ${f.date(texte(devis.retenu_le))}` : ""} ; montant TTC : ${eur(montant(devis.montant_ttc_cents)/100)}.</p>
              <p>${f.champ(descriptionDevisLisible(texte(devis.description)).trim()||null,"travaux du devis retenu").replace(/\r?\n/g,"<br>")}</p>`;
          contenu += `<p>Créneau prévu : ${debut && fin ? creneauParis(debut, fin) : `${f.date(debut||null,"début prévu")} au ${f.date(fin||null,"fin prévue")}`}.</p>
            <p>Accès et personne à contacter : ${champ("acces","modalités d’accès et contact sur place")}${pointFinal(options.acces)}</p>
            ${section("Travaux commandés")}<p class="annonce">Seuls les travaux du devis ci-dessous sont commandés. Aucun travail supplémentaire n’est autorisé par ce document sans accord préalable du donneur d’ordre.</p>${travaux}`;
        } else {
          const crs = await lireLignes(lire("intervention_comptes_rendus").eq("intervention_id",cibleId).order("created_at",{ascending:false}));
          if (!crs.length) throw new RefusDocument("L’artisan doit déposer son compte rendu avant la génération du document.");
          for (const cr of crs) contenu += `${section("Compte rendu déclaré par l’artisan")}<p>Travaux réalisés : ${f.champ(texte(cr.travaux_realises),"travaux réalisés")}${pointFinal(texte(cr.travaux_realises))}</p>
            <p>Cause constatée : ${facultatif(texte(cr.cause_reelle))}${pointFinal(texte(cr.cause_reelle))}</p>
            <p>Montant final déclaré : ${cr.montant_final_cents == null ? f.champ(null,"montant final déclaré") : eur(montant(cr.montant_final_cents)/100)} ; nouvelle intervention nécessaire : ${cr.nouvelle_intervention_necessaire ? "oui" : "non"}.</p>
            <p>Compte rendu du ${f.date(texte(cr.created_at))}. Il ne remplace pas la facture de l’entreprise.</p>`;
        }
      } else if (code === "comparatif_devis") {
        const devis = await lireLignes(lire("incident_devis").eq("incident_id",cibleId).order("depose_le"));
        // Reprise du lot 38 : « encore » laissait attendre un devis sur un incident clos (transmis au syndic, par exemple) ; la liste
        // du catalogue ne propose plus que les incidents qui ont un devis (catalogue-cibles).
        if (!devis.length) throw new RefusDocument(texte(incident.etat) === "clos"
          ? "Aucun devis n’a été déposé pour cet incident, qui est clos : il n’y a pas de devis à comparer."
          : "Aucun devis n’a encore été déposé pour cet incident.");
        const artisans = await lireLignes(db.from("artisans").select("id,raison_sociale").in("id",[...new Set(devis.map(d=>texte(d.artisan_id)))]));
        const noms = new Map(artisans.map(a=>[a.id,a.raison_sociale]));
        // C78 : la description composée en SQL se lit en français (descriptionDevisLisible, comme l'écran), lignes conservées.
        contenu += lignesTableau(f,devis.map(d=>({...d,entreprise:noms.get(d.artisan_id),description:descriptionDevisLisible(texte(d.description)),montant:montant(d.montant_ttc_cents)/100,statut:libelleDe(STATUTS_DEVIS,d.statut)})),[["Entreprise","entreprise","texte"],["Prestation","description","lignes"],["TTC","montant","montant"],["Validité","valide_jusqu_au","date"],["Décision","statut","texte"]]);
        // C86 : la phrase suit l'état du dossier. Elle disait le choix « soumis à la validation » quand un devis était déjà retenu.
        // Reprise du lot 42 (C86) : « le choix reste à faire » n'est dit que s'il reste un devis reçu, sans décision, sur un dossier
        // ouvert. Un incident clos sans devis retenu (transmis au syndic, réparé autrement) ou dont tous les devis ont été écartés
        // (non retenus, refusés, expirés) le disait aussi.
        const retenu = devis.find(d=>d.statut==="retenu");
        const clos = texte(incident.etat) === "clos";
        contenu += `<p>Comparaison des offres déposées. ${retenu
          ? `Le devis de ${facultatif(texte(noms.get(retenu.artisan_id)))} (${eur(montant(retenu.montant_ttc_cents)/100)} TTC) a été retenu${retenu.retenu_le ? ` le ${f.date(texte(retenu.retenu_le))}` : ""}`
          : clos ? "Aucun devis n’a été retenu ; le dossier est clos"
          : devis.some(d=>d.statut==="depose") ? "Le choix reste à faire"
          : "Aucun devis n’est retenu"} ; ce document ne commande aucune prestation.</p>`;
      } else {
        // C89 : le récapitulatif dit aussi le suivi tel que le dossier l'enregistre : devis, missions (entreprise, dates, état) et
        // montant déclaré au compte rendu. Il n'en donnait que le signalement et la clôture.
        const [devis, missions] = await Promise.all([
          lireLignes(lire("incident_devis").eq("incident_id",cibleId).order("depose_le")),
          lireLignes(lire("incident_interventions").eq("incident_id",cibleId).order("confiee_le")),
        ]);
        const idsArtisans = [...new Set([...devis,...missions].map(l=>texte(l.artisan_id)).filter(Boolean))], idsMissions = missions.map(m=>texte(m.id));
        const [artisans, comptesRendus] = await Promise.all([
          idsArtisans.length ? lireLignes(db.from("artisans").select("id,raison_sociale").in("id",idsArtisans)) : Promise.resolve([] as LigneDocument[]),
          idsMissions.length ? lireLignes(lire("intervention_comptes_rendus").in("intervention_id",idsMissions)) : Promise.resolve([] as LigneDocument[]),
        ]);
        const nomArtisan = (id: unknown) => facultatif(texte(artisans.find(a=>texte(a.id)===texte(id))?.raison_sociale));
        const retenu = devis.find(d=>d.statut==="retenu");
        const phraseDevis = !devis.length ? "Aucun devis déposé." : `Devis déposés : ${devis.length} ; ${retenu
          ? `devis retenu : ${nomArtisan(retenu.artisan_id)}, ${eur(montant(retenu.montant_ttc_cents)/100)} TTC${retenu.retenu_le ? `, le ${f.date(texte(retenu.retenu_le))}` : ""}`
          : "aucun n’est retenu"}.`;
        // Reprise du lot 42 (C89) : « à fixer » et « pas encore déposé » annoncent un rendez-vous et un compte rendu à venir. Ils ne
        // s'impriment que pour une mission qui peut encore en avoir : rendez-vous à fixer tant que la mission n'est ni commencée
        // ni terminée, compte rendu attendu tant qu'elle n'est ni annulée ni refusée. Sinon « — ».
        // Phase 3, lot 43 (T02) : le compte rendu ne se dépose que sur une mission « en cours » (deposer_compte_rendu), qui passe
        // alors à « terminée » dans le même appel. « Pas encore déposé » ne vaut donc que pour une mission qui peut encore être
        // démarrée ou qui l'est (proposée, acceptée, planifiée, en cours). Une mission terminée sans compte rendu (donnée reprise)
        // ne l'aura jamais : « non déposé ». Annulée ou refusée : « — », comme avant (aucun compte rendu n'était attendu).
        const lignesMissions = missions.map(m => {
          const cr = comptesRendus.find(c=>texte(c.intervention_id)===texte(m.id));
          const statut = texte(m.statut), close = ["annulee","refusee"].includes(statut);
          const depotPossible = ["proposee","acceptee","planifiee","en_cours"].includes(statut);
          return [nomArtisan(m.artisan_id), f.date(texte(m.confiee_le),"date de la mission"),
            texte(m.debut_prevu) ? creneauParis(texte(m.debut_prevu), texte(m.fin_prevue)||null).replace(/^le /,"")
              : ["proposee","acceptee","planifiee"].includes(statut) ? "à fixer" : "—",
            texte(m.terminee_le) ? formaterDateFr(texte(m.terminee_le)) : "—",
            facultatif(libelleDe(STATUTS_INTERVENTION_DOCUMENT,m.statut)),
            cr ? (cr.montant_final_cents == null ? "non déclaré" : eur(montant(cr.montant_final_cents)/100)) : close ? "—" : depotPossible ? "pas encore déposé" : "non déposé"];
        });
        contenu += `${section("Suivi des travaux")}<p>${phraseDevis}</p>${lignesMissions.length
          ? tableau([{libelle:"Entreprise"},{libelle:"Confiée le"},{libelle:"Rendez-vous"},{libelle:"Terminée le"},{libelle:"État"},{libelle:"Compte rendu",droite:true}],lignesMissions)
          : "<p>Aucune mission confiée pour cet incident.</p>"}`;
        const imputation = incident.imputation ? libelleDe(IMPUTATIONS_INCIDENT, incident.imputation) : "";
        contenu += `${section("Décision et clôture")}<p>Imputation enregistrée : ${facultatif(imputation)}${pointFinal(imputation)}</p>
          <p>Justification : ${facultatif(texte(incident.imputation_justification))}${pointFinal(texte(incident.imputation_justification))}</p>
          <p>${incident.clos_le ? `Clôturé le ${f.date(texte(incident.clos_le))}. ${facultatif(texte(incident.cloture_commentaire))}` : "Le dossier est toujours ouvert."}</p>`;
      }
    } else if (["recap_fiscal_nu","recap_fiscal_meuble"].includes(code)) {
      const lot = await lotConcerne(cibleId);
      if ((code === "recap_fiscal_meuble") !== Boolean(lot.meuble)) throw new RefusDocument("Choisissez le récapitulatif correspondant au caractère nu ou meublé du lot.");
      const annee = anneeDocument(options);
      // D37 : le montant est lu sur le texte tel que tapé (« 2345,67 » vaut 2345,67), jamais par Number(). Vide : le montant qualifié du livre.
      const interetsLus = code === "recap_fiscal_nu" ? lireMontantFacultatif(options.interets_emprunt ?? "") : { montant: null };
      if ("erreur" in interetsLus) throw new RefusDocument(erreurDuChamp("Intérêts d’emprunt de l’année", interetsLus.erreur));
      const debutAnnee = `${annee}-01-01`, debutSuivante = `${annee+1}-01-01`;
      let fiscal: RecapitulatifFiscal, interetsEmprunt = 0, qualifie: number | null = null;
      if (code === "recap_fiscal_nu") {
        // Sans captures ni qualifications, le document imprimait 0,00 € partout (relevé du 13/10, FIN-01) : il refuse plutôt que de faire
        // recopier des zéros sur une déclaration.
        fiscal = await chargerRecapitulatifNu(db,orgId,cibleId,annee);
        if (fiscal.incomplet) throw new RefusDocument(`Le récapitulatif ${annee} de ce lot n’est pas complet : ${[...fiscal.alertes,phrasePiecesAQualifier(fiscal)].filter(Boolean).join(" ")} Complétez l’écran « Préparer ma déclaration » du lot, puis relancez la génération.`);
        qualifie = interetsQualifies(fiscal);
        if (interetsLus.montant !== null) interetsEmprunt = interetsLus.montant;
        else if (qualifie !== null) interetsEmprunt = qualifie;
        else throw new RefusDocument("Indiquez les intérêts d’emprunt de l’année, ou 0 si le logement n’a aucun emprunt.");
      } else {
        // C96 : le récapitulatif meublé ne ventile rien (un total des recettes, un total des dépenses) ; la lecture des baux qui
        // nourrissait une « ventilation » jamais calculée est retirée, et le texte ne l'annonce plus.
        const ecritures = await lireLignes(lire("ecritures").eq("lot_id",cibleId).gte("date_piece",debutAnnee).lt("date_piece",debutSuivante).order("date_piece"));
        fiscal = recapitulatifFiscal(ecritures as unknown as EcritureFiscale[],annee,{lotsMeubles:lot.meuble?new Set([cibleId]):new Set()});
      }
      contenu = `${section(`Exercice ${annee}`)}${mentionExerciceProvisoire(annee,aujourdhui)}<p>Récapitulatif du lot à 100 %, avant ventilation entre propriétaires. Les dépôts de garantie sont exclus et les contre-écritures déduites. ${phrasePerimetreFiscal(fiscal,{tableau:code==="recap_fiscal_nu"})}</p>`;
      if (lot.meuble) contenu += `<p>Recettes enregistrées : ${eur(fiscal.meuble.recettes)} ; dépenses enregistrées : ${eur(fiscal.meuble.depenses)}.</p><p>Les amortissements, emprunts et retraitements BIC sont à établir avec le comptable ; aucun résultat fiscal n’est certifié ici.</p>`;
      // C94 : une rubrique que le livre laisse « à compléter » (222 sans montant) s'imprime « à compléter », jamais 0,00 € : un zéro
      // se recopie tel quel. La ligne 250 porte toujours le montant retenu pour le document (saisi ou qualifié).
      else contenu += tableau([{libelle:"Rubrique"},{libelle:"Libellé"},{libelle:"Montant enregistré",droite:true}],fiscal.rubriques.map(r=>[f.champ(r.code,"rubrique"),f.champ(r.libelle,"libellé"),r.code==="250"?f.montant(interetsEmprunt,"Montant enregistré"):r.aCompleter?'<span class="fusion">à compléter</span>':f.montant(r.montant,"Montant enregistré")]))+ecartInterets(interetsEmprunt,qualifie)+`<p>Fonds de travaux ALUR suivis séparément : ${eur(fiscal.fondsTravauxAlur)}.</p><p>Hors déclaration : ${eur(fiscal.chargesRecuperees)} de ${LIBELLE_RECETTES_EXCLUES}${fiscal.teomExclue ? `, ${eur(fiscal.teomExclue)} de ${LIBELLE_DEPENSES_EXCLUES}` : ""} — ni revenus, ni charges déductibles.</p>`;
      contenu += `<p>Aide à la préparation de la déclaration. Vérifiez les pièces, la quote-part, les intérêts d’emprunt et les dépenses externes avant déclaration. ${code==="recap_fiscal_nu"?"Les loyers et provisions sont ventilés selon la capture faite à chaque encaissement ou la ventilation historique que vous avez justifiée.":"Les recettes sont reprises en total, sans ventilation entre loyer et charges."}</p>`;
    } else if (code === "ecriture_rectificative" || code === "cloture_mensuelle") {
      if (code === "ecriture_rectificative") {
        const e = await unique("ecritures",cibleId);
        if (!e.contre_ecriture_de) throw new RefusDocument("Ce justificatif concerne une contre-écriture enregistrée.");
        const origine = await unique("ecritures",texte(e.contre_ecriture_de));
        if (e.lot_id) await lotConcerne(texte(e.lot_id));
        // C93 : la contre-écriture reprend la date de la pièce d'origine ; sa date d'imputation (le jour de la correction) est
        // imprimée à côté. Le justificatif ne disait nulle part quand la rectification avait été passée.
        contenu = `${section("Pièce d’origine et rectification")}${lignesTableau(f,avecSensLisible([{...origine,role:"Origine"},{...e,role:"Rectification"}]),[["Pièce","role","texte"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"],["Date de la pièce","date_piece","date"],["Imputée le","date_imputation","date"]])}<p>Motif : ${f.champ(texte(e.motif)||null,"motif de la rectification")}${pointFinal(texte(e.motif))}</p>`;
      } else {
        if (cibleId !== orgId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.mois ?? "")) throw new RefusDocument("Choisissez le mois du journal à exporter.");
        const debut = `${options.mois}-01`, finDate = new Date(`${debut}T12:00:00Z`); finDate.setUTCMonth(finDate.getUTCMonth()+1);
        const ecritures = await lireLignes(lire("ecritures").gte("date_imputation",debut).lt("date_imputation",finDate.toISOString().slice(0,10)).order("date_imputation"));
        const clotures = await lireLignes(lire("clotures_comptables").eq("mois",debut).limit(1));
        // C91 : chaque écriture porte son logement et sa catégorie (le libellé des écrans du livre) : deux « Taxe foncière de
        // l'année » (taxe foncière et TEOM) ou deux « Encaissement de loyer » de deux baux ne se distinguaient pas.
        const idsLots = [...new Set(ecritures.map(e=>texte(e.lot_id)).filter(Boolean))];
        const lots = idsLots.length ? await lireLignes(lire("lots").in("id",idsLots)) : [];
        const lignes = avecSensLisible(ecritures.map(e=>({...e,logement:texte(lots.find(l=>texte(l.id)===texte(e.lot_id))?.nom),categorie:libelleCategorieEcriture(texte(e.categorie))})));
        contenu = `${section(`Journal — ${moisEnToutesLettres(options.mois)}`)}<p>${clotures.length ? `Mois clôturé le ${f.date(texte(clotures[0].cloture_at))}` : "Mois ouvert — document provisoire"}.</p>
          ${lignesTableau(f,lignes,[["Date","date_imputation","date"],["Logement","logement","facultatif"],["Catégorie","categorie","facultatif"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]])}
          <p>Total recettes : ${eur(ecritures.filter(e=>e.sens==="recette").reduce((s,e)=>s+montant(e.montant),0))} ; dépenses : ${eur(ecritures.filter(e=>e.sens==="depense").reduce((s,e)=>s+montant(e.montant),0))}.</p>`;
      }
    } else {
      if (org.type !== "agence") throw new RefusDocument("Les documents de mandat concernent les agences de gestion.");
      const rapport = ["rapport_gestion","bordereau_versement"].includes(code) ? await unique("rapports_gestion",cibleId) : null;
      const mandat = await unique("mandats",rapport ? texte(rapport.mandat_id) : cibleId);
      const mandant = await unique("persons",texte(mandat.person_id));
      destinataire = f.champ([mandant.nom,mandant.prenom].filter(Boolean).join(" "),"mandant");
      liens.push({entite:"mandat",entiteId:texte(mandat.id)},{entite:"personne",entiteId:texte(mandant.id)});
      const lignes = await lireLignes(lire("mandat_lignes").eq("mandat_id",mandat.id).order("date_debut"));
      const lots = lignes.length ? await lireLignes(lire("lots").in("id",[...new Set(lignes.map(l=>texte(l.lot_id)))])) : [];
      const noms = new Map(lots.map(l=>[l.id,l.nom]));
      // Phase 3, lot 43 (T03) : la fin d'une ligne de mandat et la date du versement s'imprimaient au format de la base
      // (« 2026-12-31 », « date : 2026-11-05 ») à côté d'un « Début » en date française. Elles s'impriment comme lui.
      contenu = `${section("Mandat et périmètre")}<p>Mandat ${referenceCourte("MANDAT",texte(mandat.id))} ; état : ${f.champ(libelleDe(ETATS_MANDAT,mandat.etat),"état du mandat")}.</p>
        ${lignesTableau(f,lignes.map(l=>({...l,lot:noms.get(l.lot_id),fin:texte(l.date_fin) ? formaterDateFr(texte(l.date_fin)) : "En cours"})),[["Lot","lot","texte"],["Début","date_debut","date"],["Fin","fin","texte"],["Honoraires (%)","taux_honoraires","texte"]])}`;
      if (rapport) {
        if (code === "bordereau_versement" && (rapport.versement_montant == null || !rapport.versement_date)) throw new RefusDocument("Enregistrez le versement du rapport avant d’émettre son bordereau.");
        contenu += `${section(code === "rapport_gestion" ? "Situation mensuelle" : "Versement enregistré")}
          <p>Mois : ${moisEnToutesLettres(texte(rapport.mois))} ; état du rapport : ${rapport.statut === "envoye" ? "Validé" : "À valider"} ; net enregistré : ${f.montant(rapport.net as number)}.</p>
          <p>Versement : ${rapport.versement_montant == null ? "non enregistré" : eur(montant(rapport.versement_montant))} ; date : ${facultatif(texte(rapport.versement_date) ? formaterDateFr(texte(rapport.versement_date)) : null)}.</p>
          <p>${facultatif(texte(rapport.commentaire))}</p>`;
        if (code === "rapport_gestion") {
          const finDate = new Date(`${texte(rapport.mois).slice(0,10)}T12:00:00Z`); finDate.setUTCMonth(finDate.getUTCMonth()+1);
          const debut = texte(rapport.mois).slice(0,10), fin = finDate.toISOString().slice(0,10);
          const ids = [...new Set(lignes.filter(l=>texte(l.date_debut)<fin && (!l.date_fin || texte(l.date_fin)>=debut)).map(l=>texte(l.lot_id)))];
          const mouvements = ids.length ? await lireLignes(lire("ecritures").in("lot_id",ids).gte("date_imputation",debut).lt("date_imputation",fin).order("date_imputation")) : [];
          const netActuel = mouvements.reduce((s,e)=>s+(e.sens==="recette"?1:-1)*Math.round(montant(e.montant)*100),0);
          if (Math.abs(netActuel-Math.round(montant(rapport.net)*100))>0) throw new RefusDocument("Le détail comptable ne correspond plus au net du rapport. Vérifiez le rapport avant de générer son PDF.");
          contenu += await detailRapportGestion(db, orgId, f, lots, lignes, mouvements, debut, fin);
          contenu += mouvements.length ? lignesTableau(f,avecSensLisible(mouvements),[["Date","date_imputation","date"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]]) : "<p>Aucune opération comptable enregistrée sur ce mois pour les lots du mandat.</p>";
        }
        contenu += "<p>Ce document restitue les opérations enregistrées. Il ne constitue pas un ordre de virement.</p>";
      } else if (code === "recap_fiscal_agence") {
        const annee = anneeDocument(options);
        const ids = [...new Set(lignes.map(l=>texte(l.lot_id)))];
        const brutes = ids.length ? await lireLignes(lire("ecritures").in("lot_id",ids).gte("date_piece",`${annee}-01-01`).lt("date_piece",`${annee+1}-01-01`).order("date_piece")) : [];
        const mouvements = brutes.filter(e=>lignes.some(l=>l.lot_id===e.lot_id && texte(l.date_debut)<=texte(e.date_piece) && (!l.date_fin||texte(l.date_fin)>=texte(e.date_piece))));
        // Phase 3, lot 42 (C95, C91) : même mention d'une année non terminée que les récapitulatifs du lot ; la nature d'une écriture
        // s'imprime avec le libellé du livre (« Dépôt de garantie »), plus le code de la base (« depot_garantie »).
        contenu += `${section(`Mouvements de gestion ${annee}`)}${mentionExerciceProvisoire(annee,aujourdhui)}${lignesTableau(f,avecSensLisible(mouvements.map(e=>({...e,categorie:libelleCategorieEcriture(texte(e.categorie))}))),[["Date","date_piece","date"],["Nature","categorie","texte"],["Libellé","libelle","texte"],["Sens","sens","texte"],["Montant","montant","montant"]])}
          <p>Relevé annuel du mandat, à rapprocher des pièces et à transmettre au comptable. Les transferts de fonds et dépôts ne constituent pas automatiquement des recettes fiscales. Ce relevé ne calcule pas un revenu imposable.</p>`;
      } else if (code === "resiliation_mandat") {
        contenu += `${section("Résiliation proposée")}<p>Date d’effet : ${f.date(options.date_effet||null,"date d’effet de la résiliation")} ; motif : ${champ("motif","motif et fondement de la résiliation")}${pointFinal(options.motif)}</p><p>Remise des fonds, pièces et dossiers : ${champ("remise","modalités de remise du dossier et du solde")}${pointFinal(options.remise)}</p>
          <p>Le préavis prévu au mandat est de ${f.champ(texte(mandat.preavis_mois),"durée du préavis")} mois. La génération ne résilie pas le mandat dans Gerimmo ; la date convenue doit être enregistrée après notification.</p>`; signatures = true;
      } else {
        contenu += `${section(code === "avenant_perimetre" ? "Périmètre convenu" : "Conditions convenues")}<p>Date d’effet : ${f.date(options.date_effet||null,"date d’effet de l’avenant")}.</p><p>${champ("modifications",code === "avenant_perimetre" ? "lots ajoutés ou retirés et conditions applicables" : "clauses modifiées et nouvelles conditions convenues")}${pointFinal(options.modifications)}</p><p>Les autres stipulations du mandat restent inchangées. Les modifications doivent être enregistrées dans le dossier après signature ; ce document ne les applique pas automatiquement.</p>`; signatures = true;
      }
    }
    const reference = referenceCourte(code.toUpperCase().replaceAll("_","-"),cibleId);
    // C83 : un document interne sans destinataire (comparatif, récapitulatif, journal, récapitulatif fiscal) n'imprime plus la case
    // « Destinataire » : le mot de repli « Organisation » ne désignait personne.
    const corps = `${enTete(f,exp,{libelle:"Dossier",reference,etabliLe:dateDocument})}${titre(meta.nom,"Document de gestion",[])}
      ${cartouches([["Dossier",reference],...(destinataire ? [["Destinataire",destinataire] as [string,string]] : []),...(logement ? [[libelleLieu,logement] as [string,string]] : [])])}${contenu}${faitA(f,exp.ville,dateDocument)}
      ${signatures?`<div class="signatures">${cadreSignature(code === "restitution_cles" ? libelleSignataireBailleur(organisation.type) : "Le mandataire",f.champ(exp.nom,"nom et prénom(s), ou dénomination"))}${cadreSignature("Partie concernée",destinataire)}</div>`:""}`;
    return {document:assemblerPage({f,titreDocument:meta.nom,nomPied:meta.nom,reference,corps:`<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`}),titreGed:meta.nom,nomFichier:`${code}-${cibleId.slice(0,8)}`,liens};
  } catch(e) { if(e instanceof RefusDocument) return {erreur:e.message}; throw e; }
}
