/**
 * LE LOCATAIRE LIT L'ÉTAT DES SIGNATURES ÉLECTRONIQUES OÙ IL EST SIGNATAIRE — audit palier 1 du 22/11/2026, P1-06.
 *
 * Le défaut : rien, dans l'espace du locataire, ne disait qu'une signature électronique était en cours, qu'il avait
 * signé, ou que toutes les signatures étaient réunies. Les circuits ne sont lisibles que par le gestionnaire.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. le locataire lit SES circuits : nature, état, dates, son propre état, décompte des signatures — et rien des
 *     autres signataires (la fonction ne rend aucune colonne qui les porte) ;
 *  2. seuls comptent les circuits partis chez le prestataire, et ceux achevés depuis moins de trente jours ; ni
 *     préparation, ni envoi à vérifier, ni circuit annulé, ni essai, ni acceptation de devis ;
 *  3. un autre locataire, un locataire dont l'accès est fermé, le gestionnaire, un autre espace, un visiteur : rien ;
 *  4. la migration se rejoue ; son retour supprime la fonction, sans toucher aux circuits.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122160000_signatures_electroniques_locataire";
const FONCTION = "public.mes_signatures_electroniques(uuid)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("signatures électroniques du locataire — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé ; elle ne fait que lire", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/signatures-electroniques-locataire-base.test.ts"');
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(insert|update|delete|alter table|create policy|drop)\b/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("language sql stable security definer");
  });
});

describe.skipIf(!url)("signatures électroniques du locataire (avec base)", () => {
  let db: Client;
  let org = "", autreOrg = "", proprietaire = "", compteA = "", compteB = "";
  let personneA = "", personneB = "", personneProprietaire = "", bail = "", document = "", lot = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const lire = async (compteId: string, espace = org) => {
    await agir(compteId);
    return (await db.query("select * from public.mes_signatures_electroniques($1)", [espace])).rows;
  };
  const signataire = (personId: string, statut: string, qualite = "Locataire") =>
    ({ personId, qualite, prenom: "Prénom", nom: "NOM-SECRET", email: "secret@test.local", telephone: "+33600000000", statut });
  /** Un circuit d'avenant, écrit en tant que base (les circuits naissent côté serveur). */
  async function circuit(etat: string, signataires: unknown[], options: { essai?: boolean; ilYa?: string; espace?: string; doc?: string; contrat?: string } = {}) {
    await base();
    return id(`insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,
        signataires,etat,modele,cible_id,expire_le,envoye_le,essai,updated_at)
      values($1,$2,$3,$4,'zoho','sandbox',repeat('b',64),repeat('c',64),$5,$6,'avenant',$2,now()+interval '10 days',now()-interval '1 day',$7,now()-$8::interval) returning id`,
      [options.espace ?? org, options.contrat ?? bail, options.doc ?? document, proprietaire, JSON.stringify(signataires), etat, options.essai ?? false, options.ilYa ?? "0 days"]);
  }

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Espace fictif des signatures','active','proprietaire_direct') returning id");
    autreOrg = await id("insert into public.organizations(name,status,type) values('Autre espace fictif','active','proprietaire_direct') returning id");
    proprietaire = await compte("proprietaire"); compteA = await compte("locataire-a"); compteB = await compte("locataire-b");
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'proprietaire_direct'),($3,$2,'locataire'),($4,$2,'locataire')`, [proprietaire, org, compteA, compteB]);
    personneProprietaire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Bailleur fictif','Paul') returning id", [org]);
    personneA = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Locataire A fictif','Alice',$2) returning id", [org, compteA]);
    personneB = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Locataire B fictif','Bruno',$2) returning id", [org, compteB]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon') returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    bail = await id(`insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges)
      values($1,$2,$3,'brouillon',current_date-30,700,50) returning id`, [org, lot, personneA]);
    document = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'autre','TEST avenant fictif',$1::text||'/test/avenant.pdf','application/pdf',10,'test-avenant') returning id`, [org]);
  });

  it("le locataire lit son circuit en cours : nature, état, dates, SON état, décompte — rien des autres signataires", async () => {
    const c = await circuit("en_cours", [signataire(personneA, "notified"), signataire(personneB, "signed", "Colocataire"), signataire(personneProprietaire, "initiated", "Propriétaire")]);
    const lignes = await lire(compteA);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ circuit_id: c, modele: "avenant", etat: "en_cours", acheve_le: null, mon_statut: "notified", signatures_recues: 1, signatures_attendues: 3 });
    expect(lignes[0].envoye_le).toBeInstanceOf(Date);
    expect(lignes[0].expire_le).toBeInstanceOf(Date);
    // Aucune colonne ne porte un nom, une adresse ou un téléphone.
    expect(Object.keys(lignes[0]).sort()).toEqual(["acheve_le", "circuit_id", "envoye_le", "etat", "expire_le", "modele", "mon_statut", "signatures_attendues", "signatures_recues"]);
    expect(JSON.stringify(lignes)).not.toMatch(/NOM-SECRET|secret@test\.local|\+336/);
    // Le colocataire lit le même circuit, avec SON état.
    expect((await lire(compteB))[0]).toMatchObject({ circuit_id: c, mon_statut: "signed", signatures_recues: 1 });
  });

  it("ne rend que les circuits où il est signataire", async () => {
    await circuit("en_cours", [signataire(personneB, "notified"), signataire(personneProprietaire, "initiated", "Propriétaire")]);
    expect(await lire(compteA)).toEqual([]);
    expect(await lire(compteB)).toHaveLength(1);
  });

  it("ni préparation, ni envoi à vérifier, ni circuit annulé, ni essai", async () => {
    const parties = [signataire(personneA, "initiated"), signataire(personneProprietaire, "initiated", "Propriétaire")];
    // Un seul circuit actif par document (règle de la base) : chaque cas se joue seul, puis s'annule.
    const seul = async (etat: string, essai = false) => {
      await base();
      await db.query("savepoint cas");
      await circuit(etat, parties, { essai });
      const lignes = await lire(compteA);
      await base();
      await db.query("rollback to savepoint cas");
      return lignes;
    };
    for (const etat of ["pret", "preparation", "a_verifier", "annule"]) expect(await seul(etat), etat).toEqual([]);
    expect(await seul("en_cours", true), "essai").toEqual([]);
    // Témoin : le même circuit, parti et hors essai, est bien rendu.
    expect(await seul("en_cours")).toHaveLength(1);
  });

  it("achevé depuis moins de trente jours : rendu avec sa date de fin ; plus ancien : non", async () => {
    const parties = [signataire(personneA, "signed"), signataire(personneProprietaire, "signed", "Propriétaire")];
    const recents = [await circuit("termine", parties, { ilYa: "5 days" }), await circuit("refuse", parties, { ilYa: "29 days" }), await circuit("expire", parties, { ilYa: "1 day" })];
    await circuit("termine", parties, { ilYa: "31 days" });
    await circuit("expire", parties, { ilYa: "90 days" });
    const lignes = await lire(compteA);
    expect(lignes.map((l) => l.circuit_id).sort()).toEqual([...recents].sort());
    for (const l of lignes) expect(l.acheve_le).toBeInstanceOf(Date);
    expect(lignes.find((l) => l.etat === "termine")).toMatchObject({ mon_statut: "signed", signatures_recues: 2, signatures_attendues: 2 });
  });

  it("accès fermé, gestionnaire, autre espace, visiteur : rien", async () => {
    await circuit("en_cours", [signataire(personneA, "notified"), signataire(personneProprietaire, "initiated", "Propriétaire")]);
    expect(await lire(compteA)).toHaveLength(1);
    // Le gestionnaire a son propre écran : cette fonction ne lui rend rien, même s'il figure parmi les signataires.
    expect(await lire(proprietaire)).toEqual([]);
    // L'identifiant d'un autre espace ne donne rien.
    expect(await lire(compteA, autreOrg)).toEqual([]);
    // Accès du locataire fermé : plus rien.
    await base();
    await db.query("update public.memberships set status='inactive' where account_id=$1 and organization_id=$2", [compteA, org]);
    expect(await lire(compteA)).toEqual([]);
    await agir(null, "anon");
    expect(await refus("select * from public.mes_signatures_electroniques($1)", [org])).toMatch(/permission denied/);
  });

  it("la migration se rejoue ; son retour supprime la fonction sans toucher aux circuits", async () => {
    const droit = async (role: string) =>
      (await db.query("select to_regprocedure($1) is not null and has_function_privilege($2,$1,'execute') ok", [FONCTION, role])).rows[0].ok as boolean;
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const c = await circuit("en_cours", [signataire(personneA, "notified"), signataire(personneProprietaire, "initiated", "Propriétaire")]);

    await base();
    expect([await droit("authenticated"), await droit("anon")]).toEqual([true, false]);
    await db.query(migration);
    expect([await droit("authenticated"), await droit("anon")]).toEqual([true, false]);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122160000','signatures_electroniques_locataire') on conflict do nothing");
    await db.query(retour);
    expect((await db.query("select to_regprocedure($1) is not null ok", [FONCTION])).rows[0].ok).toBe(false);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122160000'")).rows[0].n).toBe(0);
    expect((await db.query("select etat from public.bail_signature_circuits where id=$1", [c])).rows[0].etat).toBe("en_cours");
    await db.query(retour);

    await db.query(migration);
    expect([await droit("authenticated"), await droit("anon")]).toEqual([true, false]);
    expect(await lire(compteA)).toHaveLength(1);
  });
});
