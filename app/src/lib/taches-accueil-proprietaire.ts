import type { ActionDuJour } from "@/lib/actions-du-jour";
import type { DiagnosticPilotage, LotPilotage } from "@/lib/pilotage-proprietaire";

export type TacheAccueil = {
  cle: string;
  titre: string;
  detail: string | null;
  contexte: string | null;
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
    taches.push({ cle: action.cle, titre: action.titre, detail: action.detail, echeance: action.echeance,
      contexte: lot && !action.titre.includes(lot) ? lot : null, href, geste, nature });
  }

  // Un diagnostic déjà demandé par une alerte conserve sa place et sa cible.
  for (const diagnostic of diagnostics) {
    const href = `${base}/parc/${diagnostic.lot.bien_id}/lots/${diagnostic.lot.id}#diagnostics`;
    if (ciblesExistantes.has(href)) continue;
    ciblesExistantes.add(href);
    taches.push({ cle: `surveillance-${diagnostic.id}`, titre: "Vérifier les conditions de location", contexte: diagnostic.lot.nom,
      detail: `DPE ${diagnostic.classe_dpe}`, echeance: null, href, geste: "Voir le DPE", nature: "document" });
  }

  // Un bail commencé se reprend avant d'en préparer un autre : un seul brouillon s'ouvre
  // directement, plusieurs renvoient à la fiche du lot qui les liste (audit #264, CB-03).
  for (const lot of lotsEnPreparation) {
    const href = lot.brouillons.length === 1 ? `${base}/baux/${lot.brouillons[0]}` : `${base}/parc/${lot.bien_id}/lots/${lot.id}#baux`;
    if (ciblesExistantes.has(href)) continue;
    ciblesExistantes.add(href);
    taches.push({ cle: `bail-preparation-${lot.id}`, titre: "Finaliser le bail", contexte: lot.nom,
      detail: lot.brouillons.length > 1 ? `${lot.brouillons.length} baux en préparation` : "Bail en préparation",
      echeance: null, href, geste: lot.brouillons.length > 1 ? "Voir les baux" : "Reprendre le bail", nature: "location" });
  }

  const preparations = new Map(preparation.map(p => [p.lot.id, p.blocages]));
  for (const lot of lotsSansBail) {
    const blocages = preparations.get(lot.id);
    const pret = blocages?.length === 0;
    taches.push({ cle: `location-${lot.id}`, titre: pret ? "Créer le bail" : "Préparer la location", contexte: lot.nom,
      detail: pret ? "Le logement est prêt pour son bail" : blocages === null ? "Préparation à vérifier" : null,
      echeance: null, href: `${base}/parc/${lot.bien_id}/lots/${lot.id}${pret ? "#baux" : ""}`,
      geste: pret ? "Créer le bail" : "Continuer", nature: "location" });
  }
  return taches;
}
