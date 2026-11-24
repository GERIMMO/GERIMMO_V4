/**
 * Décision du dirigeant du 24/11/2026 (Q28) : « le diagnostic à la date d'établissement la plus récente doit décider.
 * Corrige après lecture du texte ; d'ici là, un avertissement. »
 *
 * CE MODULE NE CHANGE PAS LA RÈGLE. Aujourd'hui, Gerimmo retient le diagnostic de performance énergétique (DPE) qui
 * n'est pas archivé ; enregistrer un nouveau DPE archive le précédent du même logement (déclencheur
 * `diagnostics_remplacement`). C'est donc le DERNIER ENREGISTRÉ qui décide, même si un autre, remplacé depuis, porte une
 * date d'établissement plus récente (un diagnostic ancien saisi après coup). Aucune page officielle lue le 24/11 ne dit
 * lequel doit décider (TEXTES-OFFICIELS-LUS, partie 2 ; JURISTE, partie 6, point 15).
 *
 * Ce module repère seulement les logements où la question se pose, pour que l'écran l'affiche là où Gerimmo s'appuie
 * sur la classe : préparation du bail, révision du loyer, fiche du logement (blocage et alerte « DPE F ou G »).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DpeEnregistre = {
  id: string;
  classe_dpe: string | null;
  /** Date d'établissement du diagnostic (AAAA-MM-JJ), recopiée du rapport. */
  date_realisation: string;
  /** Renseignée quand un DPE enregistré ensuite l'a remplacé. */
  archived_at: string | null;
  created_at: string;
};

export type EcartDpe = {
  /** Celui que Gerimmo retient aujourd'hui. */
  retenu: DpeEnregistre;
  /** Le plus récent par date d'établissement, archivé ou non (peut être le même que `retenu`). */
  plusRecent: DpeEnregistre;
  /** Nombre de DPE non archivés du logement (un seul, sauf données anciennes). */
  enVigueur: number;
  /**
   * Reprise du lot D3 (M5) : les DPE en vigueur qui portent la même date d'établissement que `retenu` (lui compris).
   * Deux ou plus : la base ne les départage pas (le contrat et la révision lisent « le premier par date
   * d'établissement », sans autre critère) ; l'écran ne dit alors pas lequel est retenu.
   */
  aLaMemeDate: DpeEnregistre[];
};

const parDateEtablissement = (a: DpeEnregistre, b: DpeEnregistre) =>
  b.date_realisation.localeCompare(a.date_realisation) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

/**
 * `null` : rien à signaler (aucun DPE, ou le DPE retenu est aussi le plus récent et il est le seul en vigueur).
 * Le DPE retenu est lu comme le font le bail et les rappels : parmi les non archivés, le premier par date
 * d'établissement.
 */
export function ecartDpe(dpe: DpeEnregistre[]): EcartDpe | null {
  const enVigueur = dpe.filter((d) => !d.archived_at).sort(parDateEtablissement);
  const retenu = enVigueur[0];
  if (!retenu) return null;
  const plusRecent = [...dpe].sort(parDateEtablissement)[0];
  if (enVigueur.length < 2 && plusRecent.date_realisation <= retenu.date_realisation) return null;
  return {
    retenu, plusRecent: plusRecent.date_realisation > retenu.date_realisation ? plusRecent : retenu, enVigueur: enVigueur.length,
    aLaMemeDate: enVigueur.filter((d) => d.date_realisation === retenu.date_realisation),
  };
}

/** Lecture sous les droits de la session. Une lecture en échec ne signale rien : l'avertissement n'invente pas un écart. */
export async function lireEcartDpe(db: SupabaseClient, orgId: string, lotId: string): Promise<EcartDpe | null> {
  const { data, error } = await db.from("diagnostics").select("id,classe_dpe,date_realisation,archived_at,created_at")
    .eq("organization_id", orgId).eq("lot_id", lotId).eq("type", "dpe").limit(200);
  return error || !data ? null : ecartDpe(data as DpeEnregistre[]);
}

const jourFr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const classe = (d: DpeEnregistre) => (d.classe_dpe ? `classe ${d.classe_dpe}` : "classe non renseignée");
const designation = (d: DpeEnregistre) => `le diagnostic établi le ${jourFr(d.date_realisation)} (${classe(d)})`;

/** Les trois phrases de l'avertissement, neutres : ce que Gerimmo retient, lequel est le plus récent, et la suite. */
export function phrasesEcartDpe(e: EcartDpe): { retenu: string; plusRecent: string; suite: string } {
  // Reprise du lot D3 (M5) : à dates égales, on ne dit pas lequel est retenu (la base ne les départage pas).
  const egalite = e.aLaMemeDate.length > 1;
  return {
    retenu: egalite
      ? `${e.aLaMemeDate.length} diagnostics en vigueur pour ce logement portent la même date d’établissement, le ${jourFr(e.retenu.date_realisation)} (${e.aLaMemeDate.map(classe).join(", ")}) : Gerimmo ne peut pas dire lequel est retenu, l’un ou l’autre peut être lu.`
      : `Gerimmo retient aujourd’hui ${designation(e.retenu)} : c’est ${e.enVigueur > 1 ? "le plus récent des diagnostics en vigueur" : "le dernier enregistré"} pour ce logement.`,
    plusRecent: e.plusRecent.id !== e.retenu.id
      ? `Le plus récent par sa date d’établissement est ${designation(e.plusRecent)}${e.plusRecent.archived_at ? ", remplacé depuis dans Gerimmo" : ""}.`
      : egalite ? "Aucun diagnostic enregistré ne porte une date d’établissement plus récente."
      : `C’est aussi le plus récent par sa date d’établissement, mais ${e.enVigueur} diagnostics sont en vigueur pour ce logement.`,
    suite: "La règle qui dit lequel décide sera fixée après lecture du texte officiel. D’ici là, vérifiez que la classe retenue est la bonne.",
  };
}

/**
 * Reprise du lot D3 (M5) : ce que la fiche du logement dit de l'usage de la classe. Avec UN diagnostic en vigueur, sa
 * classe sert au contrôle de la mise en location et à l'alerte (classe G seulement : aucune alerte ne porte sur la
 * classe F sur cette fiche, l'ancienne phrase le laissait croire). Avec PLUSIEURS, ce n'est pas « la classe retenue » qui
 * sert : le contrôle de la mise en location (`lot_blocages_location`) et l'alerte « DPE classé G » regardent tous les
 * diagnostics en vigueur, et un seul en classe G suffit.
 */
export function usageDpeFicheLogement(e: EcartDpe | null): string {
  return e && e.enVigueur > 1
    ? "Le contrôle de la mise en location et l’alerte « DPE classé G » ne lisent pas un seul diagnostic : ils regardent tous les diagnostics en vigueur, et il suffit que l’un d’eux soit en classe G."
    : "Sa classe sert au contrôle de la mise en location : en classe G, la mise en location est bloquée et l’alerte « DPE classé G » s’affiche.";
}
