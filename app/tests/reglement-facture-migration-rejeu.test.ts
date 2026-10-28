/**
 * Migration 20261014610000 (règlement déclaratif de la facture d'intervention, D23-A) : elle se rejoue sans effet,
 * s'arrête sur une définition inattendue, et son retour arrière retire exactement ce qu'elle ajoute aux deux fonctions
 * existantes (marques cohérentes), refuse de se jouer dans un lot et retire sa version.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin. Le rejeu écarte la fermeture à anon
 * (elle réécrit les droits de TOUTES les fonctions de `public` et ferait attendre les autres fichiers de test) ; sa
 * présence en fin de migration est vérifiée sur le texte. Les DDL de la migration ne se rejouent que si l'objet est absent
 * (aucun verrou de table au rejeu : vérifié ci-dessous).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014610000_reglement_facture_intervention.sql", "utf8");
const RETOUR = readFileSync("supabase/retours-arriere/20261014610000_reglement_facture_intervention.retour.sql", "utf8");
const rejouable = (sql: string) => sql.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");

const VALIDER = "public.valider_facture_artisan(uuid,uuid,text)";
const ANNULABLE = "public.ecriture_annulable_depuis_le_journal(uuid)";
const NOUVELLES = [
  "public.enregistrer_reglement_facture(uuid,uuid,bigint,date,text,text,uuid)",
  "public.retirer_reglement_facture(uuid,uuid,text)",
  "public.mes_reglements_factures_artisan()",
  "public.etat_facture_intervention(uuid)",
];

describe("Lot reglement-facture — fichiers de migration et de retour arrière (sans base)", () => {
  it("la migration est la dernière du manifeste, dans sa plage (20261014610000 à 20261014619999)", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const i = manifeste.indexOf("20261014610000_reglement_facture_intervention.sql");
    expect(i).toBeGreaterThan(0);
    expect(manifeste.indexOf("20261014504000_jour_de_paris_encaissements.sql")).toBeLessThan(i);
    for (const suivante of manifeste.slice(i + 1)) expect(suivante > "20261014610000").toBe(true);
  });

  it("la migration ferme les fonctions à anon, nomme son retour, exige le jour de Paris et n'écrit jamais current_date", () => {
    expect(MIGRATION).toContain("select public.fermer_fonctions_a_anon();");
    expect(MIGRATION).toContain("supabase/retours-arriere/20261014610000_reglement_facture_intervention.retour.sql");
    expect(MIGRATION).toContain("to_regprocedure('public.aujourdhui_paris()') is null");
    expect(MIGRATION).not.toMatch(/\bcurrent_date\b/i);
  });

  it("les ancres sont d'une seule ligne, exigées exactement une fois", () => {
    expect(MIGRATION).toContain("v_ancre constant text := 'closed_action=''Facture contrôlée et validée''';");
    expect(MIGRATION).toContain("v_ancre constant text := 'when e.encaissement_id is not null then';");
    expect(MIGRATION).toMatch(/\(length\(v_def\) - length\(replace\(v_def, v_ancre, ''\)\)\) <> length\(v_ancre\)/);
    // Aucune ancre à plusieurs lignes : les littéraux `$ancre$` de 20261013120000 n'ont pas cours ici.
    expect(MIGRATION).not.toContain("$ancre$");
  });

  it("les marques du retour arrière sont celles que la migration pose (et celles-là seulement)", () => {
    expect(MIGRATION).toContain("E'  -- >> D23 (X06, CHN-02)");
    expect(MIGRATION).toContain("E'  -- << D23 (X06, CHN-02)\\n'");
    expect(MIGRATION).toContain("E'    -- >> D23 (PRO2-21)");
    expect(MIGRATION).toContain("E'    -- << D23 (PRO2-21)\\n'");
    expect(RETOUR).toContain("'  -- >> D23 (X06, CHN-02)', E'-- << D23 (X06, CHN-02)\\n'");
    expect(RETOUR).toContain("'    -- >> D23 (PRO2-21)', E'-- << D23 (PRO2-21)\\n'");
    for (const signature of NOUVELLES) expect(RETOUR).toContain(`drop function if exists ${signature.replace(/,/g, ", ")}`);
  });

  it("le retour est atomique sans valider la transaction appelante, retire sa version et conserve la table (B.11)", () => {
    expect(RETOUR).not.toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
    expect(RETOUR).toMatch(/do \$retour_atomique\$/);
    expect(RETOUR).toMatch(/end \$retour_atomique\$;/);
    expect(RETOUR).toContain("where version = '20261014610000'");
    expect(RETOUR).toContain("select public.fermer_fonctions_a_anon();");
    expect(RETOUR).not.toMatch(/drop table/i);
    expect(RETOUR).not.toMatch(/drop column/i);
    expect(RETOUR).toMatch(/RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : une fonction du lot D23 est appelée par/);
  });
});

describe.skipIf(!DB_URL)("Migration 20261014610000 — rejeu sur la base", () => {
  let db: Client;

  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const signature of [VALIDER, ANNULABLE, ...NOUVELLES]) {
      const { rows } = await db.query(
        `select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure`,
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    const contrainte = await db.query("select pg_get_constraintdef(oid) as v from pg_constraint where conname = 'incident_evenements_type_check'");
    etat["contrainte"] = contrainte.rows.map((r) => r.v).join("|");
    const table = await db.query(
      `select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) as v
         from information_schema.columns where table_schema = 'public' and table_name = 'intervention_facture_reglements'`
    );
    etat["table"] = table.rows[0].v;
    const index = await db.query("select string_agg(indexdef, '|' order by indexdef) as v from pg_indexes where tablename = 'intervention_facture_reglements'");
    etat["index"] = index.rows[0].v;
    // Audit final du 27/10 (PUB-01) : la politique restrictive transverse « second_facteur » est posée par poser_gardes_second_facteur(), pas par ce lot.
    const politiques = await db.query("select string_agg(polname, ',' order by polname) as v from pg_policy where polrelid = 'public.intervention_facture_reglements'::regclass and polname <> 'second_facteur'");
    etat["politiques"] = politiques.rows[0].v;
    const declencheurs = await db.query("select string_agg(tgname, ',' order by tgname) as v from pg_trigger where tgrelid = 'public.intervention_facture_reglements'::regclass and not tgisinternal");
    etat["declencheurs"] = declencheurs.rows[0].v;
    return etat;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it("les deux fonctions existantes portent leur marque ; les quatre nouvelles existent ; la table a ses gardes", async () => {
    expect((await db.query("select pg_get_functiondef($1::text::regprocedure) d", [VALIDER])).rows[0].d).toContain("-- >> D23 (X06, CHN-02)");
    expect((await db.query("select pg_get_functiondef($1::text::regprocedure) d", [ANNULABLE])).rows[0].d).toContain("-- >> D23 (PRO2-21)");
    for (const signature of NOUVELLES) expect((await db.query("select to_regprocedure($1) p", [signature])).rows[0].p, signature).not.toBeNull();
    const e = await empreinte();
    expect(e["declencheurs"]).toBe("abonnement_intervention_facture_reglements,diagnostic_artisan_lecture,traversee_lecture_seule");
    expect(e["politiques"]).toBe("intervention_facture_reglements_lecture");
    expect(e["contrainte"]).toContain("'facture_reglee'::text, 'reglement_retire'::text");
  });

  it("rejouée sur une base déjà migrée, elle ne change rien (deux fois de suite) et ne pose aucun verrou de table", async () => {
    const avant = await empreinte();
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    // Aucun verrou exclusif tenu sur les tables touchées par les DDL conditionnels (elles existaient déjà).
    const { rows } = await db.query(
      `select c.relname from pg_locks l join pg_class c on c.oid = l.relation
        where l.pid = pg_backend_pid() and l.mode = 'AccessExclusiveLock' and c.relname in ('intervention_factures', 'incident_evenements', 'intervention_facture_reglements')`
    );
    expect(rows).toEqual([]);
  });

  it("une définition inattendue l'arrête : l'ancre absente de valider_facture_artisan (marque retirée)", async () => {
    const def: string = (await db.query("select pg_get_functiondef($1::text::regprocedure) d", [VALIDER])).rows[0].d;
    const sansBloc = def.replace(/  -- >> D23 \(X06, CHN-02\)[\s\S]*?-- << D23 \(X06, CHN-02\)\n/, "").replace("closed_action='Facture contrôlée et validée'", "closed_action='Facture validée'");
    expect(sansBloc).not.toContain("D23 (X06");
    await db.query(sansBloc);
    await expect(db.query(rejouable(MIGRATION))).rejects.toThrow(/Correctif X06 \(valider_facture_artisan\) : définition inattendue/);
  });

  it("une ancre répétée dans ecriture_annulable_depuis_le_journal l'arrête aussi", async () => {
    const def: string = (await db.query("select pg_get_functiondef($1::text::regprocedure) d", [ANNULABLE])).rows[0].d;
    const sansBloc = def.replace(/    -- >> D23 \(PRO2-21\)[\s\S]*?-- << D23 \(PRO2-21\)\n/, "");
    expect(sansBloc).not.toContain("D23 (PRO2-21)");
    // L'ancre deux fois : un commentaire qui la répète suffit à la rendre ambiguë.
    const doublee = sansBloc.replace("  -- NULL = annulable", "  -- when e.encaissement_id is not null then (commentaire)\n  -- NULL = annulable");
    await db.query(doublee);
    await expect(db.query(rejouable(MIGRATION))).rejects.toThrow(/Correctif PRO2-21 \(ecriture_annulable_depuis_le_journal\) : définition inattendue/);
  });

  it("la contrainte des événements se complète à partir de la liste en vigueur, quelle qu'elle soit", async () => {
    // Un autre lot a ajouté une valeur et retiré les deux nôtres : la migration les remet sans perdre la sienne.
    await db.query("alter table public.incident_evenements drop constraint incident_evenements_type_check");
    await db.query("alter table public.incident_evenements add constraint incident_evenements_type_check check (type = any (array['declaration', 'autre_lot']::text[]))");
    await db.query(rejouable(MIGRATION));
    const { rows } = await db.query("select pg_get_constraintdef(oid) v from pg_constraint where conname = 'incident_evenements_type_check'");
    expect(rows[0].v).toContain("'autre_lot'::text");
    expect(rows[0].v).toContain("'facture_reglee'::text, 'reglement_retire'::text");
  });

  it("le retour arrière, joué ici sans sa transaction, retire les blocs et les fonctions, garde la table, puis la migration les remet", async () => {
    const avant = await empreinte();
    // Le corps du script, sans la garde de transaction ni begin/commit (nous sommes déjà dans la transaction du test).
    const corps = RETOUR
      .replace(/do \$retour_arriere\$\nbegin\n  if statement_timestamp\(\)[\s\S]*?end \$retour_arriere\$;\n/, "")
      .replace(/^begin;$/m, "")
      .replace(/^commit;$/m, "")
      .replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
    await db.query(corps);
    expect((await db.query("select pg_get_functiondef($1::text::regprocedure) d", [VALIDER])).rows[0].d).not.toContain("D23 (X06");
    expect((await db.query("select pg_get_functiondef($1::text::regprocedure) d", [ANNULABLE])).rows[0].d).not.toContain("D23 (PRO2-21)");
    for (const signature of NOUVELLES) expect((await db.query("select to_regprocedure($1) p", [signature])).rows[0].p, signature).toBeNull();
    expect((await db.query("select to_regclass('public.intervention_facture_reglements') t")).rows[0].t).not.toBeNull();
    // Rejeu du retour : « rien à faire ».
    const { rows: notices } = await db.query("select pg_temp.retirer_bloc($1, '  -- >> D23 (X06, CHN-02)', E'-- << D23 (X06, CHN-02)\\n') r", [VALIDER]);
    expect(notices[0].r).toContain("rien à faire");
    // Marche avant : la migration redonne exactement l'état migré.
    await db.query(rejouable(MIGRATION));
    expect(await empreinte()).toEqual(avant);
  });
});
