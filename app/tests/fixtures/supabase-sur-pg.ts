/**
 * Un faux client Supabase qui parle à la vraie base locale : les mêmes appels que ceux des actions
 * (`from().select().eq().maybeSingle()`, `from().insert()`, `rpc()`), exécutés sur une connexion `pg` déjà placée sous
 * le rôle `authenticated` avec le jeton du gérant (donc sous les politiques RLS, les droits de colonne et les
 * déclencheurs de la production).
 *
 * Fidélité à PostgREST, là où elle compte pour ces tests :
 *  - une erreur de la base n'est PAS levée : elle est rendue dans `{ error: { code, message, details } }` ;
 *  - chaque appel est une transaction à part : dans un test qui tient tout dans une transaction annulée, chaque appel
 *    est enveloppé dans un point de sauvegarde (une violation d'unicité n'abandonne pas le reste du test) ;
 *  - un `numeric` est rendu en nombre et une `date` en texte (le pilote `pg` rendrait une chaîne et un objet Date).
 */
import { types as typesPg, type Client, type ClientConfig } from "pg";

export const typesCommePostgrest: NonNullable<ClientConfig["types"]> = {
  getTypeParser: ((oid: number, format?: string) => {
    if (oid === 1700) return (v: string) => parseFloat(v);
    if (oid === 1082) return (v: string) => v;
    return typesPg.getTypeParser(oid, (format ?? "text") as "text");
  }) as NonNullable<ClientConfig["types"]>["getTypeParser"],
};

export type ErreurPostgrest = { code: string; message: string; details: string | null; hint: string | null };
type Retour = { data: unknown; error: ErreurPostgrest | null };

function erreurDe(e: unknown): ErreurPostgrest {
  const x = e as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: x.code ?? "", message: x.message ?? "", details: x.detail ?? null, hint: x.hint ?? null };
}

export function clientSurPg(db: Client, options: { transactionnel: boolean }) {
  let compteur = 0;
  async function jouer<T>(travail: () => Promise<T>): Promise<{ ok: T } | { erreur: ErreurPostgrest }> {
    const point = `postgrest_${++compteur}`;
    if (options.transactionnel) await db.query(`savepoint ${point}`);
    try {
      const ok = await travail();
      if (options.transactionnel) await db.query(`release savepoint ${point}`);
      return { ok };
    } catch (e) {
      if (options.transactionnel) await db.query(`rollback to savepoint ${point}`);
      return { erreur: erreurDe(e) };
    }
  }

  const ensemblistes = new Map<string, boolean>();
  async function estEnsembliste(nom: string): Promise<boolean> {
    if (!ensemblistes.has(nom)) {
      const { rows } = await db.query("select bool_or(proretset) as r from pg_proc where proname=$1 and pronamespace='public'::regnamespace", [nom]);
      ensemblistes.set(nom, Boolean(rows[0]?.r));
    }
    return ensemblistes.get(nom)!;
  }

  return {
    async rpc(nom: string, args: Record<string, unknown> = {}): Promise<Retour> {
      const cles = Object.keys(args);
      const appel = `public.${nom}(${cles.map((c, i) => `${c} => $${i + 1}`).join(", ")})`;
      const valeurs = cles.map((c) => args[c]);
      const ens = await estEnsembliste(nom);
      const r = await jouer(() => db.query(ens ? `select * from ${appel}` : `select ${appel} as resultat`, valeurs));
      if ("erreur" in r) return { data: null, error: r.erreur };
      return { data: ens ? r.ok.rows : r.ok.rows[0]?.resultat ?? null, error: null };
    },

    from(table: string) {
      const filtres: [string, unknown][] = [];
      let colonnes = "*";
      const requete = {
        select(cols = "*") {
          colonnes = cols;
          return requete;
        },
        eq(colonne: string, valeur: unknown) {
          filtres.push([colonne, valeur]);
          return requete;
        },
        async maybeSingle(): Promise<Retour> {
          const where = filtres.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
          const r = await jouer(() => db.query(`select ${colonnes} from public.${table}${where ? ` where ${where}` : ""} limit 2`, filtres.map(([, v]) => v)));
          if ("erreur" in r) return { data: null, error: r.erreur };
          if (r.ok.rows.length > 1) return { data: null, error: { code: "PGRST116", message: "plusieurs lignes", details: null, hint: null } };
          return { data: r.ok.rows[0] ?? null, error: null };
        },
        async insert(valeur: Record<string, unknown> | Record<string, unknown>[]): Promise<Retour> {
          const lignes = (Array.isArray(valeur) ? valeur : [valeur]).map((l) => JSON.parse(JSON.stringify(l)) as Record<string, unknown>);
          // PostgREST envoie l'ensemble des clés de toutes les lignes : une clé absente d'une ligne vaut NULL.
          const noms = [...new Set(lignes.flatMap((l) => Object.keys(l)))];
          const params: unknown[] = [];
          const groupes = lignes.map((l) => `(${noms.map((n) => { params.push(l[n] ?? null); return `$${params.length}`; }).join(", ")})`);
          const r = await jouer(() => db.query(`insert into public.${table} (${noms.join(", ")}) values ${groupes.join(", ")}`, params));
          return "erreur" in r ? { data: null, error: r.erreur } : { data: null, error: null };
        },
      };
      return requete;
    },
  };
}
