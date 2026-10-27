import type { ActionDuJour } from "@/lib/actions-du-jour";
import type { DiagnosticPilotage, LotPilotage } from "@/lib/pilotage-proprietaire";

export type TacheAccueil = {
  cle: string;
  /**
   * L'obligation, indépendante du lot : « dpe », « edl », « erp », « location »… C'est elle qui réunit
   * les tâches d'un grand parc en une ligne « N lots : <obligation> » (décision du 27/10, TRV-09).
   */
  type: string;
  titre: string;
  detail: string | null;
  contexte: string | null;
  /**
   * Ce que la tâche désigne et que nomme sa ligne dans le dépliage d'un groupe : le lot (avec sa chambre en colocation),
   * le bien, la pièce ; null quand la tâche n'en désigne aucun. Une alerte ne le tire de son titre que si celui-ci se
   * termine bien par le nom du lot : « Zone tendue non renseignée — préavis … » n'est pas découpé (relecture TRV-09).
   */
  lieu: string | null;
  echeance: string | null;
  href: string;
  geste: string;
  nature: "incident" | "document" | "location" | "demande";
};

type Options = {
  base: string;
  /** Les loyers déjà présentés dans la carte rouge sont dédoublonnés en amont. */
  actions: ActionDuJour[];
  lots: LotPilotage[];
  lotsSansBail: LotPilotage[];
  /** Lots dont un bail est en préparation, avec les identifiants de ces brouillons. */
  lotsEnPreparation?: (LotPilotage & { brouillons: string[] })[];
  preparation: { lot: LotPilotage; blocages: string[] | null }[];
  diagnostics: (DiagnosticPilotage & { lot: LotPilotage })[];
};

const incidentId = (action: ActionDuJour) => action.source === "alerte" && typeof action.alerte.details?.incident_id === "string"
  ? action.alerte.details.incident_id : null;

/** Une tâche se traite depuis sa cible ; les priorités restent dans leur carte dédiée. */
export function construireTachesAccueil({ base, actions, lots, lotsSansBail, lotsEnPreparation = [], preparation, diagnostics }: Options): TacheAccueil[] {
  const nomsLots = new Map(lots.map(lot => [lot.id, lot.nom]));
  const incidentsDejaAffiches = new Set(actions.filter(a => a.criticite === "critique").map(incidentId).filter(Boolean));
  const cles = new Set<string>();
  const taches: TacheAccueil[] = [];
  const ciblesExistantes = new Set(actions.flatMap(a => a.href ? [a.href] : []));

  for (const action of actions) {
    const incident = incidentId(action);
    if (action.criticite === "critique" || cles.has(action.cle) || (incident && incidentsDejaAffiches.has(incident))) continue;
    cles.add(action.cle);
    if (incident) incidentsDejaAffiches.add(incident);
    const href = action.href ?? `${base}/alertes?traiter=${action.alerte!.id}`;
    const lot = action.source === "alerte" && typeof action.alerte.details?.lot_id === "string"
      ? nomsLots.get(action.alerte.details.lot_id) ?? null : null;
    const nature = href.startsWith(`${base}/incidents`) ? "incident" : href.startsWith(`${base}/documents`) || href.endsWith("#diagnostics") ? "document" : "demande";
    const geste = nature === "incident" ? "Voir l’incident" : href.startsWith(`${base}/documents`) ? "Voir le document"
      : href.endsWith("#diagnostics") ? "Voir les diagnostics" : href.endsWith("#edl") ? "Voir l’état des lieux"
      : href.startsWith(`${base}/baux/`) ? "Ouvrir le bail" : "Traiter";
    // Une action calculée se nomme « <obligation>-<identifiant> » (lib/actions-attendues.ts) ; une alerte porte son type.
    const type = action.source === "alerte" ? action.type : action.source === "rapport" ? "rapport" : action.cle.replace(/-.*$/, "");
    // Une action calculée s'intitule « <obligation> — <lot[ · chambre] | bien | pièce> » ; le titre d'une alerte est libre :
    // son lieu est le lot qu'elle porte, repris du titre seulement quand celui-ci finit par ce lot (« Loyer impayé — Lot 3 : … »).
    const suffixe = action.titre.includes(" — ") ? action.titre.slice(action.titre.indexOf(" — ") + 3) : null;
    const lieu = action.source === "alerte" ? (lot && suffixe?.startsWith(lot) ? suffixe : lot) : action.source === "rapport" ? null : suffixe;
    taches.push({ cle: action.cle, type, titre: action.titre, detail: action.detail, echeance: action.echeance,
      contexte: lot && !action.titre.includes(lot) ? lot : null, lieu, href, geste, nature });
  }

  // Un diagnostic déjà demandé par une alerte conserve sa place et sa cible.
  for (const diagnostic of diagnostics) {
    const href = `${base}/parc/${diagnostic.lot.bien_id}/lots/${diagnostic.lot.id}#diagnostics`;
    if (ciblesExistantes.has(href)) continue;
    ciblesExistantes.add(href);
    taches.push({ cle: `surveillance-${diagnostic.id}`, type: "surveillance", titre: "Vérifier les conditions de location", contexte: diagnostic.lot.nom, lieu: diagnostic.lot.nom,
      detail: `DPE ${diagnostic.classe_dpe}`, echeance: null, href, geste: "Voir le DPE", nature: "document" });
  }

  // Un bail commencé se reprend avant d'en préparer un autre : un seul brouillon s'ouvre
  // directement, plusieurs renvoient à la fiche du lot qui les liste (audit #264, CB-03).
  for (const lot of lotsEnPreparation) {
    const href = lot.brouillons.length === 1 ? `${base}/baux/${lot.brouillons[0]}` : `${base}/parc/${lot.bien_id}/lots/${lot.id}#baux`;
    if (ciblesExistantes.has(href)) continue;
    ciblesExistantes.add(href);
    taches.push({ cle: `bail-preparation-${lot.id}`, type: "bail-preparation", titre: "Finaliser le bail", contexte: lot.nom, lieu: lot.nom,
      detail: lot.brouillons.length > 1 ? `${lot.brouillons.length} baux en préparation` : "Bail en préparation",
      echeance: null, href, geste: lot.brouillons.length > 1 ? "Voir les baux" : "Reprendre le bail", nature: "location" });
  }

  const preparations = new Map(preparation.map(p => [p.lot.id, p.blocages]));
  for (const lot of lotsSansBail) {
    const blocages = preparations.get(lot.id);
    const pret = blocages?.length === 0;
    taches.push({ cle: `location-${lot.id}`, type: pret ? "location-prete" : "location", titre: pret ? "Créer le bail" : "Préparer la location", contexte: lot.nom, lieu: lot.nom,
      detail: pret ? "Le logement est prêt pour son bail" : blocages === null ? "Préparation à vérifier" : null,
      echeance: null, href: `${base}/parc/${lot.bien_id}/lots/${lot.id}${pret ? "#baux" : ""}`,
      geste: pret ? "Créer le bail" : "Continuer", nature: "location" });
  }
  return taches;
}

/**
 * Au-delà de ce nombre de tâches, celles d'une même obligation se présentent en une ligne « N lots : <obligation> »
 * qui se déplie sur la liste des lots ; en dessous, une ligne par lot, comme toujours. Un parc de 300 lots donnait
 * 630 lignes et plus de 10 000 nœuds sur le tableau de bord (audit #264, TRV-09 ; décision du 27/10).
 */
export const SEUIL_REGROUPEMENT_TACHES = 24;

export type GroupeTaches = {
  cle: string;
  /** « 300 lots : DPE absent ou expiré », « 30 baux : État des lieux d'entrée à signer ». */
  titre: string;
  /** Ce qui se compte : « lots », « baux », « biens », « documents », « demandes »… */
  unite: string;
  /** Le détail quand toutes les tâches du groupe disent le même, sinon null : il se lit alors lot par lot. */
  detail: string | null;
  /** L'échéance la plus proche parmi les tâches datées du groupe, sinon null. */
  echeance: string | null;
  nature: TacheAccueil["nature"];
  /** Les tâches du groupe, dans l'ordre naturel de leur lieu (Lot 2 avant Lot 10). */
  taches: TacheAccueil[];
};

/** L'obligation sans le lieu : « DPE absent ou expiré — Lot 3 » → « DPE absent ou expiré » ; un titre sans lieu reste entier. */
const obligation = (tache: TacheAccueil) => tache.lieu && tache.titre.endsWith(` — ${tache.lieu}`)
  ? tache.titre.slice(0, -tache.lieu.length - 3) : tache.titre;

/** Ce qu'une ligne du dépliage nomme : le lot (avec sa chambre), le bien, la pièce, sinon le titre entier. */
export const lieuTache = (tache: TacheAccueil) => tache.lieu ?? tache.titre;

// Le nombre du titre compte ce que l'unité nomme (relecture TRV-09 : « 30 lots » pour 30 baux de 10 colocations) :
// l'état des lieux et l'impayé se posent par bail (plusieurs par lot en colocation), l'ERP par bien, la pièce de la GED
// par document, le rapport par rapport ; le DPE, la surveillance et la location se posent une fois par lot. Une alerte
// vaut une demande (ou un incident, dédoublonné plus haut), jamais un lot : deux alertes peuvent viser le même lot.
const UNITES: Record<string, string> = { edl: "baux", impaye: "baux", erp: "biens", piece: "documents", rapport: "rapports",
  dpe: "lots", surveillance: "lots", "bail-preparation": "lots", location: "lots", "location-prete": "lots" };
const unite = (tache: TacheAccueil) => UNITES[tache.type] ?? (tache.nature === "incident" ? "incidents" : "demandes");

const parLieu = (a: TacheAccueil, b: TacheAccueil) => lieuTache(a).localeCompare(lieuTache(b), "fr", { numeric: true });
const plusProche = (a: string | null, b: string | null) => a === null ? b : b === null ? a : a < b ? a : b;

/**
 * Les lignes de la carte : les tâches elles-mêmes jusqu'au seuil, puis une ligne par obligation partagée par au moins
 * deux tâches (ordre de première apparition conservé) ; une obligation isolée garde sa ligne.
 */
export function regrouperTachesAccueil(taches: TacheAccueil[]): (TacheAccueil | GroupeTaches)[] {
  if (taches.length <= SEUIL_REGROUPEMENT_TACHES) return taches;
  const cleGroupe = (tache: TacheAccueil) => `${tache.type}|${obligation(tache)}`;
  const membres = new Map<string, TacheAccueil[]>();
  for (const tache of taches) {
    const cle = cleGroupe(tache);
    if (!membres.has(cle)) membres.set(cle, []);
    membres.get(cle)!.push(tache);
  }
  const entrees: (TacheAccueil | GroupeTaches)[] = [];
  const vues = new Set<string>();
  for (const tache of taches) {
    const cle = cleGroupe(tache);
    if (vues.has(cle)) continue;
    vues.add(cle);
    const groupe = membres.get(cle)!;
    if (groupe.length < 2) { entrees.push(tache); continue; }
    entrees.push({ cle: `groupe-${cle}`, titre: `${groupe.length} ${unite(tache)} : ${obligation(tache)}`, unite: unite(tache),
      detail: groupe.every(t => t.detail === groupe[0].detail) ? groupe[0].detail : null,
      echeance: groupe.reduce<string | null>((e, t) => plusProche(e, t.echeance), null), nature: tache.nature, taches: [...groupe].sort(parLieu) });
  }
  return entrees;
}
