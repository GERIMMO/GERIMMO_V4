import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { indicesDuCode } from "./indices-jointure";

/**
 * G-02 (recette du 11/11/2026) : l'étape « Documents » de tout bail échouait en production (PGRST200)
 * alors que toute la CI était verte. Le vrai PostgREST (14.5 en production) refuse un indice par NOM
 * de contrainte sur une auto-relation (documents → documents) et tout nom de contrainte inexistant ;
 * l'émulateur des tests les acceptait. Ce test confronte chaque indice du code au catalogue réel de la
 * base migrée : il aurait signalé les deux défauts sans avoir besoin du binaire PostgREST.
 */
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

type Fk = { nom: string; source: string; cible: string; colonnes: string[] };

describe.skipIf(!url)("indices de jointure du code — catalogue de la base migrée", () => {
  it("chaque indice désigne une contrainte entre les deux tables, ou la colonne d'une telle contrainte ; jamais un nom de contrainte sur une auto-relation", async () => {
    const db = new Client({ connectionString: url });
    await db.connect();
    let fks: Fk[];
    try {
      fks = (await db.query<Fk>(`select c.conname as nom, s.relname as source, t.relname as cible,
          (select array_agg(a.attname::text order by k.o) from unnest(c.conkey) with ordinality k(n, o)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as colonnes
        from pg_constraint c join pg_class s on s.oid = c.conrelid join pg_class t on t.oid = c.confrelid
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)).rows;
    } finally { await db.end(); }
    const indices = indicesDuCode();
    expect(indices.length).toBeGreaterThan(10);
    const ecarts: string[] = [];
    for (const { cible, indice, fichiers } of indices) {
      const parNom = fks.find(f => f.nom === indice);
      if (parNom) {
        if (parNom.source !== cible && parNom.cible !== cible) ecarts.push(`${cible}!${indice} : la contrainte ne touche pas « ${cible} » (${fichiers.join(", ")})`);
        else if (parNom.source === parNom.cible) ecarts.push(`${cible}!${indice} : auto-relation désignée par son nom, refusée par PostgREST — utiliser l'indice par colonne « ${cible}!${parNom.colonnes.join(",")} » (${fichiers.join(", ")})`);
        continue;
      }
      const parColonne = fks.filter(f => (f.source === cible || f.cible === cible) && f.colonnes.length === 1 && f.colonnes[0] === indice);
      if (!parColonne.length) ecarts.push(`${cible}!${indice} : ni contrainte ni colonne de clé étrangère de ce nom (${fichiers.join(", ")})`);
    }
    expect(ecarts).toEqual([]);
  });
});
