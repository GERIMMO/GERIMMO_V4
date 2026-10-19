/**
 * Identité de l'éditeur, clés des prestataires (19/10) — migration 20261019123000, retour arrière et rejeu, sur la base
 * de test.
 *
 * La contrainte `identite_champs_connus` de `supervision_identite` est une liste FERMÉE de clés JSON. Le formulaire de
 * /admin/parametres écrit désormais toutes les clés de CHAMPS_EDITEUR (nulles si vides), localisation de la Base Adresse
 * Nationale et coordonnées des prestataires comprises : tant que la migration n'a pas ouvert la liste, la base refuse
 * le premier enregistrement (check_violation, 23514). Ce fichier vérifie que la migration admet exactement les clés du
 * formulaire et refuse toute autre, porte la borne de taille à 40 000 octets, se rejoue sans effet ; que le retour refuse
 * de retirer une valeur saisie, retire les clés vides, repose les deux contraintes d'origine et retire sa version ; et
 * que la migration se réapplique ensuite.
 *
 * Tout se joue dans une transaction annulée, sur une base jetable, avec des valeurs fictives. Le fichier est en série
 * (vitest.config.ts) : `alter table` sur supervision_identite et suspension de son déclencheur le temps du retour.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { CHAMPS_EDITEUR } from "@/lib/identite-editeur";
import { CHAMPS_PRESTATAIRES } from "@/lib/editeur";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const VERSION = "20261019123000";
const NOM = `${VERSION}_identite_editeur_prestataires`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const REJOUABLE = MIGRATION.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");

const CLES = Object.keys(CHAMPS_EDITEUR);
const NOUVELLES = Object.keys(CHAMPS_PRESTATAIRES);
const ANCIENNES = CLES.filter((k) => !NOUVELLES.includes(k));
/** Les deux contraintes telles que la migration 20261018061548 les a posées (relevé de production du 19/10, identique). */
const CONTRAINTES_D_ORIGINE = {
  identite_champs_connus: `CHECK (((valeurs - ARRAY[${ANCIENNES.map((k) => `'${k}'::text`).join(", ")}]) = '{}'::jsonb))`,
  supervision_identite_valeurs_check: "CHECK (((jsonb_typeof(valeurs) = 'object'::text) AND (octet_length((valeurs)::text) < 20000)))",
};

/** Ce que le formulaire écrit : toutes ses clés, `null` quand le champ est vide. */
const formulaire = (valeurs: Record<string, string> = {}): Record<string, string | null> =>
  Object.fromEntries(CLES.map((k) => [k, valeurs[k] ?? null]));

describe.skipIf(!DB_URL)("identité de l'éditeur : clés des prestataires — migration, retour et rejeu", () => {
  let db: Client;
  let superviseur: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    // Un superviseur permanent fictif : l'écran écrit sous son identité (politique identite_admin, déclencheur de traçage).
    const { rows: [u] } = await db.query(
      `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values(gen_random_uuid(),'authenticated','authenticated','identite-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
    );
    superviseur = u.id as string;
    await db.query("insert into public.accounts(id,email) select id,email from auth.users where id=$1 on conflict (id) do nothing", [superviseur]);
    await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')", [superviseur]);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("reset role");
  });

  const contraintes = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (
        await db.query(
          `select conname, pg_get_constraintdef(oid) as def from pg_constraint
           where conrelid='public.supervision_identite'::regclass and conname in ('identite_champs_connus','supervision_identite_valeurs_check')`
        )
      ).rows.map((r) => [r.conname, r.def])
    );
  const clesAdmises = (def: string) => [...def.matchAll(/'([A-Za-z]+)'::text/g)].map((m) => m[1]);
  const ligne = async () => (await db.query("select revision, valeurs, modifie_par from public.supervision_identite where singleton")).rows[0];
  const traces = async () => Number((await db.query("select count(*) from public.supervision_registre where objet='supervision_identite'")).rows[0].count);

  /** Un essai qui peut échouer : son échec ne condamne pas la transaction du test. */
  async function essai<T>(action: () => Promise<T>): Promise<T> {
    await db.query("savepoint essai");
    try {
      const r = await action();
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  }

  /**
   * Écrit comme l'écran : superviseur permanent (aal2), rôle `authenticated`, révision attendue puis incrémentée. Le rôle
   * est rendu après le point de sauvegarde (jamais dans une transaction avortée : le code d'erreur d'origine serait perdu).
   */
  async function enregistrer(valeurs: Record<string, string | null>): Promise<number> {
    try {
      return await essai(async () => {
        await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)", [superviseur]);
        await db.query("set local role authenticated");
        const { rows: [{ revision }] } = await db.query("select revision from public.supervision_identite where singleton");
        const { rows } = await db.query(
          "update public.supervision_identite set valeurs=$1::jsonb, revision=$2 where singleton and revision=$3 returning revision",
          [JSON.stringify(valeurs), revision + 1, revision]
        );
        return rows[0].revision as number;
      });
    } finally {
      await db.query("reset role");
    }
  }
  const code = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? null);

  it("la base n'admet que les clés du formulaire, dans son ordre, et borne les valeurs à 40 000 octets", async () => {
    const c = await contraintes();
    expect(clesAdmises(c.identite_champs_connus)).toEqual(CLES);
    expect(c.supervision_identite_valeurs_check).toContain("< 40000");
  });

  it("l'écran enregistre ses clés, vides puis fictives, sous l'identité du superviseur, et chaque écriture est tracée", async () => {
    const avant = await traces();
    expect(await enregistrer(formulaire())).toBe(1);
    expect(await enregistrer(formulaire({ denomination: "Identité QA fictive", localisationBan: "Localisation QA fictive", coordonneesSupabase: "Coordonnées QA fictives\nligne 2" }))).toBe(2);
    const l = await ligne();
    expect(Object.keys(l.valeurs).sort()).toEqual([...CLES].sort());
    expect(l.valeurs.coordonneesSupabase).toBe("Coordonnées QA fictives\nligne 2");
    expect(l.modifie_par).toBe(superviseur);
    expect(await traces()).toBe(avant + 2);
  });

  it("une clé inconnue est refusée par la base (check_violation)", async () => {
    expect(await code(enregistrer({ ...formulaire(), cleInconnue: "x" }))).toBe("23514");
    expect(await code(enregistrer({ ...formulaire(), localisationSupabase: "ailleurs" }))).toBe("23514");
    expect((await ligne()).revision).toBe(0);
  });

  it("vingt-cinq champs de 1 000 caractères passent ; les mêmes en caractères sur deux octets dépassent la borne", async () => {
    expect(await enregistrer(formulaire(Object.fromEntries(CLES.map((k) => [k, "a".repeat(1000)]))))).toBe(1);
    expect(await code(enregistrer(formulaire(Object.fromEntries(CLES.map((k) => [k, "é".repeat(1000)])))))).toBe("23514");
  });

  it("la migration se rejoue sans effet, avec ou sans la fermeture des fonctions à anon", async () => {
    const avant = await contraintes();
    await db.query(REJOUABLE);
    expect(await contraintes()).toEqual(avant);
    await db.query(MIGRATION);
    expect(await contraintes()).toEqual(avant);
  });

  it("le retour refuse de retirer une coordonnée saisie et ne modifie rien", async () => {
    await enregistrer(formulaire({ coordonneesVercel: "Coordonnées QA fictives" }));
    const [avantContraintes, avantLigne] = [await contraintes(), await ligne()];
    await expect(essai(() => db.query(RETOUR))).rejects.toThrow(/Retour refusé/);
    expect(await contraintes()).toEqual(avantContraintes);
    expect(await ligne()).toEqual(avantLigne);
  });

  it("sur la ligne vide de la production, le retour repose les contraintes d'origine sans toucher la ligne", async () => {
    expect((await ligne()).valeurs).toEqual({});
    await db.query(RETOUR);
    expect(await contraintes()).toEqual(CONTRAINTES_D_ORIGINE);
    expect(await ligne()).toMatchObject({ revision: 0, valeurs: {} });
  });

  it("après un enregistrement, le retour retire les clés vides, repose les contraintes d'origine et sa version ; la migration se réapplique", async () => {
    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations(version text primary key, name text, statements text[])");
    await db.query("insert into supabase_migrations.schema_migrations(version) values ($1), ('test_identite_voisine') on conflict do nothing", [VERSION]);
    const migree = await contraintes();
    await enregistrer(formulaire({ denomination: "Identité QA fictive" }));
    const avantTraces = await traces();

    await db.query(RETOUR);
    expect(await contraintes()).toEqual(CONTRAINTES_D_ORIGINE);
    const l = await ligne();
    expect(Object.keys(l.valeurs).sort()).toEqual([...ANCIENNES].sort());
    expect(l.valeurs.denomination).toBe("Identité QA fictive");
    // La révision avance (l'écran recharge) ; le retrait n'est pas tracé : une session de maintenance n'a pas d'auteur.
    expect(l.revision).toBe(2);
    expect(await traces()).toBe(avantTraces);
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ($1,'test_identite_voisine') order by 1", [VERSION])).rows).toEqual([
      { version: "test_identite_voisine" },
    ]);
    // L'ancien formulaire (treize clés) écrit de nouveau ; le nouveau est refusé tant que la migration n'est pas réappliquée.
    expect(await enregistrer(Object.fromEntries(ANCIENNES.map((k) => [k, null])))).toBe(3);
    expect(await code(enregistrer(formulaire()))).toBe("23514");

    await db.query(RETOUR); // rien à faire : les clés nouvelles sont déjà absentes
    expect(await contraintes()).toEqual(CONTRAINTES_D_ORIGINE);
    await db.query(REJOUABLE);
    expect(await contraintes()).toEqual(migree);
    expect(await enregistrer(formulaire())).toBe(4);
  });
});
