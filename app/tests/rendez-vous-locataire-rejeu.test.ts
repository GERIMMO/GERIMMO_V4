/**
 * Décision D22 (migration 20261014620000) : la migration se rejoue sans effet, et elle refuse une définition inattendue.
 *
 *  - REJEU. Jouée une seconde fois sur une base déjà migrée, elle laisse à l'identique (empreinte md5) les définitions et
 *    droits des fonctions qu'elle touche, la liste fermée des types d'événement et la clé des rappels. Constat du 15/10 :
 *    une première version marquait `choisir_creneau` d'une marque différente de celle qu'elle cherchait, et chaque rejeu
 *    y recopiait une ligne de plus.
 *  - LISTE FERMÉE COMPLÉTÉE. Un type d'événement ajouté par une autre migration (ici simulé) reste admis : la migration
 *    relit la contrainte en base au lieu de la réécrire de mémoire.
 *  - ANCRE ABSENTE. Une fonction dont la définition ne contient plus l'ancre attendue arrête la migration avec un message
 *    qui dit laquelle.
 * La base visée est déjà migrée ; tout est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = readFileSync(
  new URL("../supabase/migrations/20261014620000_rendez_vous_locataire_report_annulation.sql", import.meta.url),
  "utf8"
);
const FONCTIONS = [
  "public.accepter_creneau_locataire(uuid)",
  "public.choisir_creneau(uuid,uuid)",
  "public.refuser_creneaux_locataire(uuid,text)",
  "public.fixer_creneau_arbitrage(uuid,uuid,timestamptz,timestamptz,text)",
  "public.fixer_creneau_arbitrage_motive(uuid,uuid,timestamptz,timestamptz,text,text)",
  "public.rendez_vous_a_rappeler(integer)",
  "public.marquer_rappel_envoye(uuid,text,text,text)",
  "public.demander_report_rdv(uuid,uuid,text,text,jsonb,uuid)",
  "public.annuler_rdv_locataire(uuid,uuid,text,text,uuid)",
  "public.mes_rendez_vous_locataire(uuid)",
];

describe.skipIf(!url)("D22 — rejeu de la migration du report et de l'annulation par le locataire", () => {
  let db: Client;
  const empreinte = async () =>
    (await db.query(
      `select md5(string_agg(s || pg_get_functiondef(s::regprocedure) || coalesce((select proacl::text from pg_proc where oid = s::regprocedure), ''), '|' order by s))
              || md5((select string_agg(conname || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint
                      where conrelid in ('public.incident_evenements'::regclass, 'public.intervention_rappels'::regclass, 'public.intervention_demandes_rdv'::regclass))) as e
       from unnest($1::text[]) s`,
      [FONCTIONS]
    )).rows[0].e as string;
  const marques = async (sig: string) =>
    (await db.query("select (length(d) - length(replace(d, 'Décision D22', ''))) / length('Décision D22') as n from pg_get_functiondef($1::regprocedure) d", [sig])).rows[0].n as number;

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query("begin"); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("deux rejeus de suite laissent les fonctions, leurs droits et les contraintes à l'identique", async () => {
    const avant = await empreinte();
    const marquesAvant = await Promise.all(FONCTIONS.slice(0, 7).map(marques));
    expect(marquesAvant.every((n) => n >= 1)).toBe(true);
    await db.query(migration);
    await db.query(migration);
    expect(await empreinte()).toBe(avant);
    expect(await Promise.all(FONCTIONS.slice(0, 7).map(marques))).toEqual(marquesAvant);
    // choisir_creneau porte UNE marque (le rejeu ne recopie plus sa ligne).
    expect(await marques("public.choisir_creneau(uuid,uuid)")).toBe(1);
  });

  it("un type d'événement ajouté par une autre migration reste admis après le passage de celle-ci", async () => {
    const { rows: [{ d }] } = await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conname='incident_evenements_type_check'");
    const autre = (d as string).replace(/\]\)\)\)$/, ", 'type_d_une_autre_migration'::text])))").replace(/'rdv_[a-z_]+'::text, /g, "");
    expect(autre).toContain("type_d_une_autre_migration");
    await db.query("alter table public.incident_evenements drop constraint incident_evenements_type_check");
    await db.query(`alter table public.incident_evenements add constraint incident_evenements_type_check ${autre}`);
    await db.query(migration);
    const { rows: [{ d: apres }] } = await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conname='incident_evenements_type_check'");
    expect(apres).toContain("'type_d_une_autre_migration'");
    for (const t of ["rdv_report_demande", "rdv_report_accepte", "rdv_report_refuse", "rdv_report_retire", "rdv_report_expire", "rdv_annule_par_locataire"]) {
      expect(apres).toContain(`'${t}'`);
    }
  });

  it("une définition sans l'ancre attendue arrête la migration et dit laquelle", async () => {
    // On retire la marque ET l'ancre de choisir_creneau : la migration doit refuser au lieu d'écrire à l'aveugle.
    const { rows: [{ d }] } = await db.query("select pg_get_functiondef('public.choisir_creneau(uuid,uuid)'::regprocedure) as d");
    const sansAncre = (d as string)
      .replace(/.*Décision D22.*\n/, "")
      .replace("raise exception 'Ce créneau n''est plus proposé';", "raise exception 'Ce créneau n''est plus disponible';");
    await db.query(sansAncre);
    await expect(db.query(migration)).rejects.toThrow(/Correctif D22 \(choisir_creneau\) : définition inattendue/);
  });
});
