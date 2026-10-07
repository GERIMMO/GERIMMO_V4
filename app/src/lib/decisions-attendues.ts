// Ce qui attend une décision du superviseur — UN calcul, lu par la barre haute,
// le menu, l'accueil et le point du matin (audit 25/09, C6 : quatre compteurs,
// trois valeurs).
//
// Audit console du 27/09 (majeur 2) : le chiffre ne disait pas tout. Sans point
// préparé, il ignorait veille, articles, évolutions et idées ; il ne comptait
// jamais les rangs « hors équipes » (demandes commerciales, contestations, bugs
// bloquants, alertes critiques), si bien que la puce « 1 décision attendue »
// côtoyait cinq rangs. Désormais :
// - les décisions viennent des FILES D'ORIGINE (les mêmes lectures que le point
//   du matin, `lireAttentes`), point préparé ou non — le point ne sert qu'à
//   l'affichage (gestes en un clic, recommandation) ;
// - chaque rang « hors équipes » listé sous « À décider » compte pour un ;
// - la santé du service compte pour UN rang quand des points bloquent : c'est
//   une décision (« rétablir »), pas vingt-et-une.
// Le total est exactement le nombre de rangs listés sous « À décider ».
import { chargerSante, type ClientQuiLitLeJournal } from "./sante-service";
import { assemblerPoints, jourDuPoint, lireAttentes, type DecisionAssemblee, type SourceDecision } from "./point-du-matin";

export type DecisionDeFile = Pick<DecisionAssemblee, "cle" | "titre" | "pourquoi" | "lien" | "source" | "source_id"> & { equipe: string };

export type Signal = { cle: string; titre: string; detail: string; href?: string; action: string };

export type DecisionsAttendues = {
  jour: string;
  /** Le point d'aujourd'hui est préparé (au moins une équipe). */
  pointPrepare: boolean;
  /** Ce que les files d'origine attendent, une ligne par décision. */
  decisions: DecisionDeFile[];
  /** Les rangs « hors équipes », chacun avec sa commande. */
  signaux: Signal[];
  /** Inscriptions d'artisans à valider ; null si la lecture a échoué. */
  artisans: number | null;
  santeBloquants: number;
  tachesIllisibles: boolean;
  /** Le chiffre unique : décisions + rangs hors équipes. */
  total: number;
  /** Les lectures en échec, en français, pour le dire plutôt qu'afficher zéro. */
  indisponibles: string[];
};

export function totalDecisions(d: { decisions: unknown[]; signaux: unknown[] }): number {
  return d.decisions.length + d.signaux.length;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export type Compteurs = { bugsN1: number | null; devis: number | null; contestations: number | null; alertesCritiques: number | null };

/**
 * Les rangs « hors équipes » : ceux que la page liste sous « À décider ». Une
 * lecture en échec produit un rang qui le dit (« indisponible »), jamais un zéro.
 */
export function signauxHorsEquipes(c: Compteurs, sante: { bloquants: number; tachesIllisibles: boolean }): Signal[] {
  const s: Signal[] = [];
  if (sante.bloquants > 0 || sante.tachesIllisibles) s.push({ cle: "sante", titre: "Rétablir la santé du service", detail: sante.tachesIllisibles ? "L’historique des tâches est indisponible : l’état du travail automatique est inconnu." : `${pluriel(sante.bloquants, "point")} bloque${sante.bloquants > 1 ? "nt" : ""} : chaque ligne porte la commande qui le règle.`, href: "/admin/sante", action: "Ouvrir la santé" });
  if (c.alertesCritiques === null || c.alertesCritiques > 0) s.push({ cle: "alertes", titre: "Examiner les alertes critiques", detail: c.alertesCritiques === null ? "Le nombre d’alertes critiques est indisponible." : `${pluriel(c.alertesCritiques, "alerte")} critique${c.alertesCritiques > 1 ? "s" : ""} ouverte${c.alertesCritiques > 1 ? "s" : ""}, toutes organisations confondues.`, action: "Ouvrir les alertes" });
  if (c.bugsN1 === null || c.bugsN1 > 0) s.push({ cle: "bugs", titre: "Suivre les problèmes bloquants", detail: c.bugsN1 === null ? "Le nombre de problèmes bloquants est indisponible." : `${pluriel(c.bugsN1, "problème")} bloquant${c.bugsN1 > 1 ? "s" : ""} pris en charge, pas encore résolu${c.bugsN1 > 1 ? "s" : ""}.`, href: "/admin/retours?nature=bug", action: "Examiner" });
  if (c.contestations === null || c.contestations > 0) s.push({ cle: "contestations", titre: "Répondre aux contestations d’artisans", detail: c.contestations === null ? "Le nombre de contestations est indisponible." : `${pluriel(c.contestations, "contestation")} de note en cours.`, href: "/admin/retours?nature=contestation", action: "Examiner" });
  if (c.devis === null || c.devis > 0) s.push({ cle: "devis", titre: "Répondre aux demandes commerciales", detail: c.devis === null ? "La file des demandes est indisponible." : `${pluriel(c.devis, "demande")} d’agence en attente d’une réponse.`, href: "/admin/devis", action: "Répondre" });
  return s;
}

type Resultat = { data: unknown; error: unknown; count?: number | null };
type Chaine = PromiseLike<Resultat> & {
  select: (c: string, o?: { count: "exact"; head: boolean }) => Chaine;
  eq: (c: string, v: string) => Chaine;
  neq: (c: string, v: string) => Chaine;
  in: (c: string, v: string[]) => Chaine;
  is: (c: string, v: null) => Chaine;
  or: (f: string) => Chaine;
  not: (c: string, o: string, v: null) => Chaine;
  order: (c: string, o: { ascending: boolean }) => Chaine;
  limit: (n: number) => Chaine;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
};
type Lecteur = ClientQuiLitLeJournal & {
  from: (table: string) => unknown;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

const nombre = (r: Resultat) => (r.error ? null : r.count ?? 0);

export async function chargerDecisionsAttendues(
  db: Lecteur,
  env: Record<string, string | undefined>,
  faitsEditeurManquants: number,
  maintenant: Date = new Date()
): Promise<DecisionsAttendues> {
  const jour = jourDuPoint(maintenant);
  const de = (t: string) => db.from(t) as Chaine;
  const [sante, points, files, bugsN1, devis, contestations, alertesCritiques] = await Promise.all([
    chargerSante(db, env, faitsEditeurManquants, maintenant),
    de("points_du_matin").select("id").eq("jour", jour),
    lireAttentes(db as never),
    // Les bugs bloquants nouveaux ou en examen sont déjà des décisions de l'équipe
    // qualité (« Prendre en charge ») : le rang ne compte que ceux en cours.
    de("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").eq("etat", "en_cours"),
    de("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    de("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "contestation").neq("etat", "resolu"),
    de("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte").eq("criticite", "critique"),
  ]);
  const indisponibles: string[] = [];
  if (points.error) indisponibles.push("le point du matin");
  for (const n of files.indisponibles) indisponibles.push(`la file « ${n} »`);
  const pointPrepare = !points.error && Array.isArray(points.data) && points.data.length > 0;
  // Les décisions, point préparé ou non : l'assemblage pur du point du matin,
  // sur les files d'origine lues à l'instant.
  const decisions: DecisionDeFile[] = assemblerPoints({ passages: [], journaux: [], attentes: files.attentes, maintenant })
    .flatMap((p) => p.decisions.map((d) => ({ cle: d.cle, titre: d.titre, pourquoi: d.pourquoi, lien: d.lien, source: d.source as SourceDecision, source_id: d.source_id, equipe: p.equipe })));
  const nbArtisans = files.indisponibles.includes("artisans") ? null : files.attentes.artisans.length;
  if (sante.tachesIllisibles) indisponibles.push("l’historique des tâches");
  const signaux = signauxHorsEquipes(
    { bugsN1: nombre(bugsN1), devis: nombre(devis), contestations: nombre(contestations), alertesCritiques: nombre(alertesCritiques) },
    sante
  );
  return {
    jour, pointPrepare, decisions, signaux, artisans: nbArtisans,
    santeBloquants: sante.bloquants, tachesIllisibles: sante.tachesIllisibles,
    total: totalDecisions({ decisions, signaux }), indisponibles,
  };
}

// ── L'état courant d'une décision du point ─────────────────────────────────
// Ce que chaque file d'origine doit encore attendre pour que la décision du
// point ait un objet (audit console 27/09, majeur 1) : la décision relit l'état
// COURANT avant d'agir, et ne diffuse jamais une information écartée entre-temps.
const ETAT_ATTENDU: Record<SourceDecision, { table: string; colonne: string; valeurs: string[] }> = {
  developpement: { table: "development_proposals", colonne: "statut", valeurs: ["autorisation"] },
  publication: { table: "publications", colonne: "statut", valeurs: ["proposition", "brouillon", "programmee"] },
  artisan: { table: "artisans", colonne: "statut_plateforme", valeurs: ["en_attente"] },
  retour: { table: "retours_utilisateurs", colonne: "etat", valeurs: ["nouveau", "en_examen"] },
  veille: { table: "regulatory_watch", colonne: "statut", valeurs: ["a_examiner"] },
};

/** La source attend-elle encore une décision ? `null` si elle n'a pas pu être relue. */
export async function sourceAttendEncore(db: { from: (t: string) => unknown }, source: string, sourceId: string): Promise<boolean | null> {
  if (!Object.hasOwn(ETAT_ATTENDU, source)) return null;
  const attendu = ETAT_ATTENDU[source as SourceDecision];
  const { data, error } = await (db.from(attendu.table) as Chaine).select(attendu.colonne).eq("id", sourceId).maybeSingle();
  if (error) return null;
  return Boolean(data) && attendu.valeurs.includes(String(data?.[attendu.colonne]));
}
