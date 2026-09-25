// Ce qui attend une décision du superviseur — UN calcul, lu par la barre haute,
// le menu, l'accueil et le point du matin (audit 25/09, C6 : quatre compteurs,
// trois valeurs).
//
// Le chiffre additionne :
// - les décisions « en attente » du point du matin d'aujourd'hui (elles portent
//   déjà les artisans, publications, retours, veille et évolutions) ;
// - à défaut de point préparé, les inscriptions d'artisans à valider — la seule
//   file décidable en un clic sans le point ;
// - UNE ligne pour la santé du service quand des points bloquent : c'est une
//   décision (« rétablir »), pas vingt-et-une.
import { chargerSante, type ClientQuiLitLeJournal } from "./sante-service";
import { jourDuPoint } from "./point-du-matin";

export type DecisionsAttendues = {
  jour: string;
  /** Le point d'aujourd'hui est préparé (au moins une équipe). */
  pointPrepare: boolean;
  /** Décisions en attente dans le point d'aujourd'hui ; null si la lecture a échoué. */
  pointDuMatin: number | null;
  /** Inscriptions d'artisans à valider ; null si la lecture a échoué. */
  artisans: number | null;
  santeBloquants: number;
  tachesIllisibles: boolean;
  /** Le chiffre unique. */
  total: number;
  /** Les lectures en échec, en français, pour le dire plutôt qu'afficher zéro. */
  indisponibles: string[];
};

export function totalDecisions(d: Pick<DecisionsAttendues, "pointPrepare" | "pointDuMatin" | "artisans" | "santeBloquants">): number {
  const files = d.pointPrepare ? d.pointDuMatin ?? 0 : d.artisans ?? 0;
  return files + (d.santeBloquants > 0 ? 1 : 0);
}

type Lecteur = ClientQuiLitLeJournal & {
  from: (table: string) => unknown;
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
};
type Chaine = {
  select: (c: string, o?: { count: "exact"; head: boolean }) => Chaine;
  eq: (c: string, v: string) => Chaine;
  in: (c: string, v: string[]) => Chaine;
  then: PromiseLike<{ data: unknown; error: unknown; count: number | null }>["then"];
};

export async function chargerDecisionsAttendues(
  db: Lecteur,
  env: Record<string, string | undefined>,
  faitsEditeurManquants: number,
  maintenant: Date = new Date()
): Promise<DecisionsAttendues> {
  const jour = jourDuPoint(maintenant);
  const [sante, points, artisans] = await Promise.all([
    chargerSante(db, env, faitsEditeurManquants, maintenant),
    (db.from("points_du_matin") as Chaine).select("id").eq("jour", jour),
    db.rpc("artisans_a_valider"),
  ]);
  const indisponibles: string[] = [];
  const ids = points.error ? [] : ((points.data as { id: string }[] | null) ?? []).map((p) => p.id);
  if (points.error) indisponibles.push("le point du matin");
  let pointDuMatin: number | null = null;
  if (!points.error) {
    if (ids.length === 0) pointDuMatin = 0;
    else {
      const d = await (db.from("decisions_du_matin") as Chaine).select("id", { count: "exact", head: true }).eq("statut", "en_attente").in("point_id", ids);
      if (d.error) indisponibles.push("les décisions du point");
      else pointDuMatin = d.count ?? 0;
    }
  }
  const nbArtisans = artisans.error || !Array.isArray(artisans.data) ? null : artisans.data.length;
  if (nbArtisans === null) indisponibles.push("les inscriptions d’artisans");
  if (sante.tachesIllisibles) indisponibles.push("l’historique des tâches");
  const d = { jour, pointPrepare: ids.length > 0, pointDuMatin, artisans: nbArtisans, santeBloquants: sante.bloquants, tachesIllisibles: sante.tachesIllisibles };
  return { ...d, total: totalDecisions(d), indisponibles };
}
