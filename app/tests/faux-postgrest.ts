/**
 * Un faux client Supabase qui HONORE ce qu'on lui demande, pour tester les écrans sans base.
 *
 * Pourquoi pas un client qui « rend les lignes du banc, quelle que soit la chaîne de filtres » : un écran dont on
 * retire un `.eq("organization_id", …)`, un `.in(…)` ou une colonne du `select` continuerait à passer ses tests, alors
 * que l'écran réel afficherait les données d'une autre agence, ou rien. Ici :
 *   · `select` ne rend QUE les colonnes demandées — une colonne oubliée arrive `undefined`, comme avec PostgREST ;
 *   · `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is` filtrent vraiment (dates ISO et horodatages se comparent
 *     comme du texte, ce que fait aussi Postgres pour ces formats) ;
 *   · `order`, `limit` et `count: "exact"` se comportent comme en base ;
 *   · une table inconnue, une colonne inconnue (lue ou filtrée) ou une méthode non prévue FONT ÉCHOUER la requête,
 *     comme PostgREST ; c'est ce qui fait tomber un test dont l'écran lit une colonne qui n'existe pas.
 *
 * Les colonnes déclarées par table sont recoupées avec la base réelle par `faux-postgrest-schema.test.ts`.
 */

export type Ligne = Record<string, unknown>;

export type TableFausse = {
  /** Les colonnes que la table possède vraiment. */
  colonnes: readonly string[];
  /** Les relations intégrées que les lignes portent sous cet alias (`lot:lots(nom)`). */
  integrees?: readonly string[];
  lignes: Ligne[];
  /** Si présent, toute lecture de la table échoue avec ce message. */
  erreur?: string;
};

export type BancFaux = Record<string, TableFausse>;
export type RetourFaux = { data: unknown; error: { message: string } | null; count: number | null };

type Condition = { colonne: string; texte: string; garde: (valeur: unknown) => boolean };

/** Découpe « a, b, lot:lots(nom, x), c » aux virgules de premier niveau. */
function decouper(colonnes: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const c of colonnes) {
    if (c === "(") profondeur++;
    if (c === ")") profondeur--;
    if (c === "," && profondeur === 0) {
      morceaux.push(courant.trim());
      courant = "";
    } else courant += c;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

const comparer = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

class RequeteFausse implements PromiseLike<RetourFaux> {
  private colonnesDemandees: string[] | null = null;
  private conditions: Condition[] = [];
  private tris: { colonne: string; croissant: boolean }[] = [];
  private plafond: number | null = null;
  private compter = false;
  private unique: "maybe" | "single" | null = null;

  constructor(private nom: string, private banc: BancFaux) {}

  select(colonnes = "*", options?: { count?: "exact" | "planned" | "estimated" }) {
    this.colonnesDemandees = decouper(colonnes);
    this.compter = Boolean(options?.count);
    return this;
  }
  private ajouter(colonne: string, texte: string, garde: (valeur: unknown) => boolean) {
    this.conditions.push({ colonne, texte, garde });
    return this;
  }
  eq(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} = ${String(valeur)}`, (v) => v === valeur);
  }
  neq(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} <> ${String(valeur)}`, (v) => v !== valeur);
  }
  gt(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} > ${String(valeur)}`, (v) => v != null && comparer(v, valeur) > 0);
  }
  gte(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} >= ${String(valeur)}`, (v) => v != null && comparer(v, valeur) >= 0);
  }
  lt(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} < ${String(valeur)}`, (v) => v != null && comparer(v, valeur) < 0);
  }
  lte(colonne: string, valeur: unknown) {
    return this.ajouter(colonne, `${colonne} <= ${String(valeur)}`, (v) => v != null && comparer(v, valeur) <= 0);
  }
  in(colonne: string, valeurs: readonly unknown[]) {
    return this.ajouter(colonne, `${colonne} in (${valeurs.join(",")})`, (v) => valeurs.includes(v));
  }
  is(colonne: string, valeur: null | boolean) {
    return this.ajouter(colonne, `${colonne} is ${String(valeur)}`, (v) => (valeur === null ? v == null : v === valeur));
  }
  order(colonne: string, options?: { ascending?: boolean }) {
    this.tris.push({ colonne, croissant: options?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.plafond = n;
    return this;
  }
  maybeSingle() {
    this.unique = "maybe";
    return this;
  }
  single() {
    this.unique = "single";
    return this;
  }

  private executer(): RetourFaux {
    const echec = (message: string): RetourFaux => ({ data: null, error: { message }, count: null });
    const table = this.banc[this.nom];
    if (!table) return echec(`relation « ${this.nom} » inconnue`);
    if (table.erreur) return echec(table.erreur);
    const connues = new Set(table.colonnes);
    const integrees = new Set(table.integrees ?? []);

    const colonnes = this.colonnesDemandees ?? ["*"];
    const projetees: string[] = [];
    for (const c of colonnes) {
      if (c === "*") {
        projetees.push(...table.colonnes);
        continue;
      }
      const integree = c.match(/^(\w+)(?::\w+)?(?:!\w+)?\(/);
      if (integree) {
        if (!integrees.has(integree[1])) return echec(`relation intégrée « ${integree[1]} » inconnue pour ${this.nom}`);
        projetees.push(integree[1]);
        continue;
      }
      if (!connues.has(c)) return echec(`colonne ${this.nom}.${c} inconnue`);
      projetees.push(c);
    }
    for (const { colonne } of this.conditions) {
      if (!connues.has(colonne)) return echec(`filtre sur ${this.nom}.${colonne} : colonne inconnue`);
    }
    for (const { colonne } of this.tris) {
      if (!connues.has(colonne)) return echec(`tri sur ${this.nom}.${colonne} : colonne inconnue`);
    }

    let lignes = table.lignes.filter((l) => this.conditions.every((c) => c.garde(l[c.colonne])));
    for (const { colonne, croissant } of [...this.tris].reverse()) {
      lignes = [...lignes].sort((a, b) => (croissant ? 1 : -1) * comparer(a[colonne], b[colonne]));
    }
    const total = lignes.length;
    if (this.plafond !== null) lignes = lignes.slice(0, this.plafond);
    const rendues = lignes.map((l) => Object.fromEntries(projetees.map((c) => [c, l[c]])));

    if (this.unique) {
      if (rendues.length > 1) return echec("plus d'une ligne rendue");
      if (rendues.length === 0 && this.unique === "single") return echec("aucune ligne rendue");
      return { data: rendues[0] ?? null, error: null, count: this.compter ? total : null };
    }
    return { data: rendues, error: null, count: this.compter ? total : null };
  }

  then<R1 = RetourFaux, R2 = never>(
    ok?: ((valeur: RetourFaux) => R1 | PromiseLike<R1>) | null,
    ko?: ((raison: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.executer()).then(ok, ko);
  }
}

export type RpcFaux = Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }>;

/** Le client : `from(table)` filtre vraiment ; `rpc(nom)` rend ce que le banc prévoit, et échoue pour le reste. */
export function fauxClient(banc: BancFaux, rpc: RpcFaux = {}) {
  return {
    from: (table: string) => new RequeteFausse(table, banc),
    rpc: (nom: string, args: Record<string, unknown> = {}) => {
      const reponse = rpc[nom];
      const r = reponse ? reponse(args) : { data: null, error: { message: `fonction « ${nom} » non prévue` } };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: null });
    },
  };
}

/**
 * Les colonnes que les écrans testés lisent ou filtrent, table par table. `faux-postgrest-schema.test.ts` vérifie
 * que chacune existe dans la base réelle : le faux client ne peut donc pas inventer une colonne qui n'y serait pas.
 * À compléter quand un nouvel écran est testé avec ce client.
 */
export const SCHEMA_CONNU = {
  incidents: {
    colonnes: [
      "id", "organization_id", "lot_id", "numero", "categorie", "urgence", "etat", "created_at", "responsable_account_id",
      "declarant_person_id", "canal", "piece", "description", "anciennete", "imputation", "imputation_justification",
      "imputation_contestation", "imputation_contestee_le", "cloture_motif", "cloture_commentaire", "clos_le",
    ],
    integrees: ["lot", "declarant"],
  },
  incident_evenements: {
    colonnes: ["id", "organization_id", "incident_id", "type", "acteur_account_id", "details", "created_at"],
    integrees: [],
  },
  document_liens: {
    colonnes: ["organization_id", "entite", "entite_id"],
    integrees: ["document"],
  },
  incident_devis: {
    colonnes: ["id", "organization_id", "incident_id", "statut", "valide_jusqu_au"],
    integrees: [],
  },
  incident_interventions: {
    colonnes: ["id", "organization_id", "incident_id", "debut_prevu", "terminee_le"],
    integrees: [],
  },
  intervention_factures: {
    colonnes: [
      "id", "organization_id", "intervention_id", "numero", "montant_ttc_cents", "montant_reference_cents",
      "ecart_justification", "document_id", "validee_le", "decision_motif", "imputation_validee", "reglee_le",
    ],
    integrees: [],
  },
  // D23 : les règlements déclarés d'une facture d'intervention, lus par l'écran de la facture.
  intervention_facture_reglements: {
    colonnes: [
      "id", "organization_id", "facture_id", "montant_cents", "date_reglement", "moyen", "reference", "created_at",
      "retire_le", "retrait_motif",
    ],
    integrees: [],
  },
} as const satisfies Record<string, { colonnes: readonly string[]; integrees: readonly string[] }>;

/** Une table du banc : ses colonnes viennent du catalogue, et une ligne qui en porte une autre est refusée. */
export function table(nom: keyof typeof SCHEMA_CONNU, lignes: Ligne[], erreur?: string): TableFausse {
  const { colonnes, integrees } = SCHEMA_CONNU[nom];
  const permises = new Set<string>([...colonnes, ...integrees]);
  for (const ligne of lignes) {
    for (const cle of Object.keys(ligne)) {
      if (!permises.has(cle)) throw new Error(`Banc de test : « ${cle} » n'est pas une colonne de ${nom}`);
    }
  }
  return { colonnes, integrees, lignes, erreur };
}
