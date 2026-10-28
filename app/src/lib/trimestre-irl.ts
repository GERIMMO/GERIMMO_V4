import { numeroTrimestreIrl } from "@/lib/baux";

/** Trimestre IRL de référence d'un bail, écrit « T3 2026 » en base (la forme que lit `trimestre_irl_numero` /
 * `trimestre_irl_annee` et qu'écrit déjà la révision annuelle). La référence d'un indice INSEE est un trimestre
 * D'UNE ANNÉE : « T3 » seul est une mention incomplète dans un acte (audit final, BAIL-02). */
export const FORMAT_TRIMESTRE_IRL = /^T[1-4] (19|20)\d{2}$/;

const ORDINAUX = ["", "1er", "2e", "3e", "4e"];

/** Numéro et année lus dans un libellé libre (« T3 2026 », « 2e trimestre 2025 »…) ; l'année manque pour « T3 ». */
export function lireTrimestreIrl(libelle: string | null | undefined): { numero: number; annee: number | null } | null {
  const numero = numeroTrimestreIrl(libelle);
  if (!numero) return null;
  const annee = /((?:19|20)\d{2})/.exec(libelle ?? "")?.[1];
  return { numero, annee: annee ? Number(annee) : null };
}

/** Valeur canonique « T3 2026 », ou le libellé tel quel s'il ne se lit pas, null si vide. */
export function trimestreIrlCanonique(libelle: string | null | undefined): string | null {
  const brut = (libelle ?? "").trim();
  if (!brut) return null;
  const lu = lireTrimestreIrl(brut);
  return lu?.annee ? `T${lu.numero} ${lu.annee}` : brut;
}

/** « 3e trimestre 2026 » : la mention imprimée au contrat et montrée au récapitulatif. null quand l'année manque
 * (« T3 ») ou que le libellé ne se lit pas. Les modèles de contrat impriment alors la valeur telle quelle : le contrat
 * d'un circuit de signature déjà parti doit se recalculer à l'identique pour être activé (empreinte). */
export function libelleTrimestreIrl(libelle: string | null | undefined): string | null {
  const lu = lireTrimestreIrl(libelle);
  if (!lu?.annee) return null;
  return `${ORDINAUX[lu.numero]} trimestre ${lu.annee}`;
}

/** Les trimestres proposés à la saisie, du plus récent au plus ancien : ceux déjà écoulés de l'année en cours et
 * les quatre de l'année précédente — l'indice de référence est le dernier publié à la signature. Une valeur déjà
 * enregistrée hors de cette liste (bail ancien, reprise « T2 » sans année) reste proposée pour ne pas disparaître. */
export function trimestresIrlProposes(aujourdhui: string, enregistre?: string | null): { valeur: string; libelle: string }[] {
  const annee = Number(aujourdhui.slice(0, 4)), mois = Number(aujourdhui.slice(5, 7));
  const trimestreCourant = Math.ceil(mois / 3);
  const options: { valeur: string; libelle: string }[] = [];
  for (let t = trimestreCourant - 1; t >= 1; t--) options.push({ valeur: `T${t} ${annee}`, libelle: `${ORDINAUX[t]} trimestre ${annee}` });
  for (let t = 4; t >= 1; t--) options.push({ valeur: `T${t} ${annee - 1}`, libelle: `${ORDINAUX[t]} trimestre ${annee - 1}` });
  const actuel = (enregistre ?? "").trim();
  if (actuel && !options.some(o => o.valeur === actuel)) {
    const lu = lireTrimestreIrl(actuel);
    options.push({ valeur: actuel, libelle: libelleTrimestreIrl(actuel) ?? (lu ? `${ORDINAUX[lu.numero]} trimestre — année à préciser` : actuel) });
  }
  return options;
}
