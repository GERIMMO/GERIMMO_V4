/**
 * Aucune fonction du schéma `public` ne doit être appelable sans être connecté.
 *
 * POURQUOI CE TEST EXISTE. Refaire une fonction lui rend ses droits par défaut.
 * Changer le type de retour d'une fonction impose `DROP` puis `CREATE` —
 * PostgreSQL ne sait pas faire autrement — et le `CREATE` repart des droits que
 * Supabase accorde d'office à `anon` sur tout le schéma `public`. La fonction
 * renaît OUVERTE, silencieusement : la migration passe, l'écran fonctionne,
 * personne ne voit rien. C'est arrivé deux fois (`comparatif_edl` le 01/08,
 * `mon_agenda_artisan` le 11/09), et ça se reproduira à la prochaine colonne
 * ajoutée à un retour.
 *
 * La fonction `fermer_fonctions_a_anon()` répare ; ce test est ce qui oblige à
 * l'appeler. Quand il échoue, la réparation est d'une ligne : ajouter
 * `select public.fermer_fonctions_a_anon();` à la fin de la migration fautive.
 *
 * SI UNE FONCTION DOIT VRAIMENT ÊTRE PUBLIQUE un jour (un webhook signé, par
 * exemple), elle s'inscrit dans `v_publiques` DANS la fonction de fermeture,
 * avec sa raison — pas ici. Le test lit le catalogue, pas une liste à lui.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Surface publique des fonctions", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  it("aucune fonction de `public` n'est exécutable par anon", async () => {
    const { rows } = await db.query<{ signature: string; definer: boolean }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
              p.prosecdef as definer
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prokind = 'f'
          and has_function_privilege('anon', p.oid, 'EXECUTE')
        order by p.prosecdef desc, p.proname`
    );
    // Le message porte la réparation : celui qui casse ce test vient d'écrire
    // une migration, il doit savoir quoi y ajouter sans aller lire ailleurs.
    const ouvertes = rows
      .map((r) => `  · ${r.signature}${r.definer ? "  [SECURITY DEFINER]" : ""}`)
      .join("\n");
    expect(
      rows,
      rows.length === 0
        ? ""
        : `Ces fonctions sont appelables SANS être connecté, par /rest/v1/rpc/… :\n${ouvertes}\n\n` +
            "Un DROP/CREATE leur a rendu les droits par défaut. Ajoutez\n" +
            "`select public.fermer_fonctions_a_anon();` à la fin de la migration qui les refait."
    ).toHaveLength(0);
  });

  it("les rôles connectés gardent leurs droits après la fermeture", async () => {
    // La fermeture retire le droit de PUBLIC — qui couvre aussi `authenticated`
    // et `service_role`. Si elle ne leur rendait pas nommément, la moitié du
    // produit tomberait sans que le premier test s'en aperçoive.
    const { rows } = await db.query<{ signature: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('mon_agenda_artisan','comparatif_edl','dossier_personne')
          and not has_function_privilege('authenticated', p.oid, 'EXECUTE')`
    );
    expect(
      rows.map((r) => r.signature),
      "Ces fonctions sont appelées par des écrans de l'application connectée : sans droit pour `authenticated`, les pages rendent une erreur."
    ).toEqual([]);
  });

  it("la fermeture est rejouable et ne casse rien quand tout est déjà fermé", async () => {
    await db.query("begin");
    try {
      const {
        rows: [{ fermer_fonctions_a_anon: n }],
      } = await db.query<{ fermer_fonctions_a_anon: number }>(
        "select public.fermer_fonctions_a_anon()"
      );
      // Zéro : il n'y avait rien à fermer. C'est le résultat attendu d'un
      // second passage, et c'est ce qui rend l'appel sûr en fin de migration.
      expect(n).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });

  it("la fonction de fermeture n'est pas exposée aux rôles de l'application", async () => {
    // Elle modifie des droits : l'exposer donnerait à un client le moyen de
    // retirer `anon` de fonctions… ou de tourner en boucle sur le catalogue.
    const { rows } = await db.query<{ anon: boolean; authentifie: boolean }>(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authentifie
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'fermer_fonctions_a_anon'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].anon).toBe(false);
    expect(rows[0].authentifie).toBe(false);
  });
});
