/**
 * UN ANCIEN DPE CLASSÉ G NE BLOQUE PLUS UNE FOIS REMPLACÉ — audit palier 1 du 22/11/2026, P1-11 (relevé 14 a).
 *
 * L'audit, sur lecture du code, craignait qu'un ancien DPE classé G bloque la mise en location même après un nouveau
 * diagnostic mieux classé : `lot_blocages_location` regarde tout DPE non archivé. EXÉCUTÉ ICI, LE DÉFAUT N'EXISTE PAS :
 * l'enregistrement d'un nouveau diagnostic archive le précédent du même logement (déclencheur
 * `diagnostics_remplacement`). Il n'y a donc jamais qu'un DPE non archivé par logement, et c'est le dernier enregistré.
 * Aucune correction n'a été faite ; ces tests tiennent le comportement pour que le point reste clos.
 *
 * CE QUE CES TESTS MONTRENT AUSSI, sans rien y changer : c'est le dernier diagnostic ENREGISTRÉ qui fait foi, pas le
 * plus récent par sa date de réalisation (consigné dans JOURNAL.md, lot 21).
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Aucun DDL.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const DPE_G = "DPE classe G : logement interdit à la location (loi Climat)";
const DPE_ABSENT = "DPE absent ou expiré (obligatoire en habitation)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("blocage « DPE classe G » : le diagnostic remplacé ne compte plus (avec base)", () => {
  let db: Client;
  let org = "", lot = "", autreLot = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  /** Enregistre un DPE réalisé il y a `age` jours, valable encore longtemps. */
  const dpe = (classe: string | null, age: number, logement = lot) => id(
    `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,classe_dpe)
     values($1,$2,'dpe',current_date - $3::int,current_date + 3000,$4) returning id`, [org, logement, age, classe]);
  const blocages = async (logement = lot) => (await db.query("select public.lot_blocages_location($1) b", [logement])).rows[0].b as string[];
  const enVigueur = async (logement = lot) => (await db.query(
    "select id, classe_dpe from public.diagnostics where lot_id=$1 and type='dpe' and archived_at is null", [logement])).rows;

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai DPE fictif','proprietaire_direct','active') returning id");
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','immeuble','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2) values($1,$2,'Lot fictif','brouillon',40) returning id", [org, bien]);
    autreLot = await id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2) values($1,$2,'Autre lot fictif','brouillon',40) returning id", [org, bien]);
  });

  it("un DPE classé G bloque ; un nouveau DPE mieux classé l'archive et lève le blocage", async () => {
    const ancien = await dpe("G", 900);
    expect(await blocages()).toContain(DPE_G);
    const nouveau = await dpe("D", 30);
    expect(await enVigueur()).toEqual([{ id: nouveau, classe_dpe: "D" }]);
    expect((await db.query("select archived_at is not null archive from public.diagnostics where id=$1", [ancien])).rows[0].archive).toBe(true);
    const b = await blocages();
    expect(b).not.toContain(DPE_G);
    expect(b).not.toContain(DPE_ABSENT);
  });

  it("un nouveau DPE classé G, lui, bloque, même si le précédent ne l'était pas", async () => {
    await dpe("D", 900);
    expect(await blocages()).not.toContain(DPE_G);
    const nouveau = await dpe("G", 30);
    expect(await enVigueur()).toEqual([{ id: nouveau, classe_dpe: "G" }]);
    expect(await blocages()).toContain(DPE_G);
  });

  it("le remplacement ne touche que le même logement", async () => {
    const voisin = await dpe("G", 100, autreLot);
    await dpe("C", 30);
    expect(await enVigueur(autreLot)).toEqual([{ id: voisin, classe_dpe: "G" }]);
    expect(await blocages(autreLot)).toContain(DPE_G);
    expect(await blocages()).not.toContain(DPE_G);
  });

  it("constat, non modifié : c'est le dernier diagnostic ENREGISTRÉ qui fait foi, pas le plus récent par sa date", async () => {
    await dpe("D", 30);
    // Un diagnostic plus ancien, enregistré après coup, devient celui qui fait foi.
    const ancienEnregistreApres = await dpe("G", 900);
    expect(await enVigueur()).toEqual([{ id: ancienEnregistreApres, classe_dpe: "G" }]);
    expect(await blocages()).toContain(DPE_G);
  });
});
