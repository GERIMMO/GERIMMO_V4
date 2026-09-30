// OUTIL GRATUIT — LA SÉRIE OFFICIELLE DE L'IRL, LUE CHEZ L'INSEE (30/09).
//
// Le bailleur n'a plus à relever les indices : la page (composant serveur)
// interroge la Banque de données macroéconomiques de l'Insee, série
// 001515333 (IRL, base 100 au 4e trimestre 1998), au format SDMX-ML.
//
// AUCUNE VALEUR D'INDICE DANS LE CODE. Les valeurs viennent de la réponse de
// l'Insee, et d'elle seule. Si l'Insee ne répond pas (réseau, délai, format
// inattendu), `chargerSerieIrl` renvoie `null` : la page retombe sur la saisie
// manuelle. Jamais d'exception, jamais de valeur supposée.
//
// Le fetch est serveur uniquement (la CSP du navigateur n'a pas à connaître
// insee.fr) et mis en cache une journée.

/** L'adresse SDMX de la série de l'IRL (Banque de données macroéconomiques). */
export const URL_SDMX_SERIE_IRL = "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/001515333";

export type CodeTrimestre = "T1" | "T2" | "T3" | "T4";

export type ObservationIrl = {
  trimestre: CodeTrimestre;
  annee: number;
  valeur: number;
};

const DELAI_MS = 5000;
const UNE_JOURNEE = 86400;

/** Le numéro (1 à 4) d'un code « T2 ». */
export function numeroTrimestre(code: CodeTrimestre): 1 | 2 | 3 | 4 {
  return Number(code.slice(1)) as 1 | 2 | 3 | 4;
}

/** Les attributs d'une balise XML, dans n'importe quel ordre : { NOM: "valeur" }. */
function attributs(balise: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of balise.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const nom = m[1].includes(":") ? m[1].split(":").pop()! : m[1];
    r[nom] = m[3] ?? m[4] ?? "";
  }
  return r;
}

/** « 2025-Q2 » → { annee: 2025, trimestre: "T2" } ; null si illisible. */
function lirePeriode(p: string | undefined): { annee: number; trimestre: CodeTrimestre } | null {
  const m = /^\s*(\d{4})-Q([1-4])\s*$/.exec(p ?? "");
  return m ? { annee: Number(m[1]), trimestre: `T${m[2]}` as CodeTrimestre } : null;
}

function lireValeur(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrait toutes les observations d'une réponse SDMX-ML de l'Insee :
 * - format StructureSpecific : `<Obs TIME_PERIOD="2025-Q2" OBS_VALUE="…" />` ;
 * - format Generic : `<generic:Obs><generic:ObsDimension value="2025-Q2"/>
 *   <generic:ObsValue value="…"/></generic:Obs>`.
 * Liste triée du plus ancien au plus récent, un trimestre au plus une fois.
 */
export function lireSerieSdmx(xml: string): ObservationIrl[] {
  if (typeof xml !== "string" || !xml) return [];
  const parPeriode = new Map<string, ObservationIrl>();
  // `<Obs` ou `<prefixe:Obs` suivi d'un blanc, de `/` ou de `>` : exclut
  // ObsDimension, ObsValue, ObsKey.
  const motif = /<(?:[\w.-]+:)?Obs(?=[\s/>])([^>]*?)(\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?Obs\s*>)/g;
  for (const m of xml.matchAll(motif)) {
    const propres = attributs(m[1]);
    let periode = propres.TIME_PERIOD;
    let valeur = propres.OBS_VALUE;
    const interieur = m[3];
    if (interieur) {
      const dim = /<(?:[\w.-]+:)?ObsDimension\b([^>]*)\/?>/.exec(interieur);
      const val = /<(?:[\w.-]+:)?ObsValue\b([^>]*)\/?>/.exec(interieur);
      if (periode == null && dim) periode = attributs(dim[1]).value;
      if (valeur == null && val) valeur = attributs(val[1]).value;
    }
    const p = lirePeriode(periode);
    const v = lireValeur(valeur);
    if (!p || v == null) continue;
    parPeriode.set(`${p.annee}-${p.trimestre}`, { ...p, valeur: v });
  }
  return [...parPeriode.values()].sort(
    (a, b) => a.annee - b.annee || numeroTrimestre(a.trimestre) - numeroTrimestre(b.trimestre)
  );
}

/**
 * Charge la série officielle (serveur uniquement, cache d'une journée).
 * `null` si l'Insee ne répond pas, répond en erreur ou sans observation.
 */
export async function chargerSerieIrl(): Promise<ObservationIrl[] | null> {
  try {
    const r = await fetch(URL_SDMX_SERIE_IRL, {
      headers: { Accept: "application/xml" },
      signal: AbortSignal.timeout(DELAI_MS),
      next: { revalidate: UNE_JOURNEE },
    });
    if (!r.ok) return null;
    const serie = lireSerieSdmx(await r.text());
    return serie.length > 0 ? serie : null;
  } catch {
    return null;
  }
}

/** Le trimestre civil d'une date ISO (« 2025-05-14 » → T2 2025) ; null si illisible. */
export function trimestreDeDate(iso: string): { trimestre: CodeTrimestre; annee: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso ?? "");
  if (!m) return null;
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) return null;
  return { annee: Number(m[1]), trimestre: `T${Math.ceil(mois / 3)}` as CodeTrimestre };
}

/**
 * L'indice de référence d'un bail (art. 17-1 de la loi du 6 juillet 1989) :
 * à défaut de clause, c'est le DERNIER indice publié à la date de signature —
 * souvent le trimestre précédent, pas celui de la date. L'Insee publie l'IRL
 * d'un trimestre vers le 15 du mois qui suit sa fin (T1 mi-avril, T2
 * mi-juillet, T3 mi-octobre, T4 mi-janvier de l'année suivante) ; on retient
 * cette date théorique. Avec `trimestre` imposé (clause du bail), rend la
 * dernière occurrence de ce trimestre déjà publiée à la date.
 */
export function referencePublieeA(
  iso: string,
  trimestre?: CodeTrimestre,
): { trimestre: CodeTrimestre; annee: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  if (mois < 1 || mois > 12) return null;
  const publication = (q: number, a: number) => {
    const moisPub = q * 3 + 1; // 4, 7, 10, 13
    return moisPub === 13 ? { a: a + 1, m: 1 } : { a, m: moisPub };
  };
  const publie = (q: number, a: number) => {
    const p = publication(q, a);
    return p.a < annee || (p.a === annee && (p.m < mois || (p.m === mois && jour >= 15)));
  };
  for (let a = annee; a >= annee - 2; a--) {
    for (let q = 4; q >= 1; q--) {
      if (trimestre && `T${q}` !== trimestre) continue;
      if (publie(q, a)) return { trimestre: `T${q}` as CodeTrimestre, annee: a };
    }
  }
  return null;
}

export type SelectionIndices = {
  /** Même trimestre, année de la signature ou de la dernière révision. */
  reference: ObservationIrl | null;
  /** Même trimestre, dernière année publiée (postérieure à la référence). */
  nouveau: ObservationIrl | null;
  /** Le dernier indice publié, tous trimestres confondus. */
  dernier: ObservationIrl | null;
};

/**
 * Choisit les deux indices de la révision dans la série : l'indice de
 * référence (trimestre du bail, année de la signature ou de la dernière
 * révision) et le nouvel indice (même trimestre, dernière année publiée).
 */
export function choisirIndices(
  serie: ObservationIrl[],
  choix: { trimestre: CodeTrimestre; annee: number }
): SelectionIndices {
  const dernier = serie.length > 0 ? serie[serie.length - 1] : null;
  const reference = serie.find((o) => o.trimestre === choix.trimestre && o.annee === choix.annee) ?? null;
  const memeTrimestre = serie.filter((o) => o.trimestre === choix.trimestre && o.annee > choix.annee);
  const nouveau = memeTrimestre.length > 0 ? memeTrimestre[memeTrimestre.length - 1] : null;
  return { reference, nouveau, dernier };
}
