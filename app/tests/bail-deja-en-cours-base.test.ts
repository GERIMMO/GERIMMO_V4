/**
 * UN BAIL DÉJÀ EN COURS S'ACTIVE PAR SON CONTRAT SIGNÉ — décision B du dirigeant, 20/11/2026
 * (migration 20261120190000_bail_deja_en_cours.sql).
 *
 * Le frein constaté : un propriétaire qui arrive avec un locataire déjà en place ne pouvait pas activer son bail sans
 * « mettre en location » le logement, donc sans DPE ni état des risques de moins de six mois. En production, les 11 baux
 * saisis par des propriétaires étaient restés en brouillon.
 *
 * Ce que ces tests tiennent, en base :
 *  1. la définition (« date d'entrée strictement passée », jour de Paris), identique à l'écran (lib/baux.ts) ;
 *  2. un bail déjà en cours s'active depuis un logement jamais mis en location, sans DPE ni état des risques ;
 *  3. tout le reste bloque encore : entrée aujourd'hui ou future, mentions, contrat signé, détention, DPE classé G,
 *     bail déjà en cours sur le lot, mandat d'une agence ;
 *  4. le logement ne devient « loué » que par un bail actif, et « brouillon → disponible » garde son contrôle complet ;
 *  5. les libellés que le filtre retire sont bien ceux de `lot_blocages_location` (sinon le blocage reviendrait) ;
 *  6. le guide de démarrage ne réclame plus la préparation d'un logement déjà loué ;
 *  7. droits : rien pour un visiteur, rien sur le bail d'un autre espace ;
 *  8. rejeu de la migration et retour arrière exact.
 *
 * Nécessite SUPABASE_DB_URL (base de test locale). Transaction annulée après chaque test.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { bailDejaEnCours } from "../src/lib/baux";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const NOM = "20261120190000_bail_deja_en_cours";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const LISEZ_MOI = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");

const DPE_MANQUANT = "DPE absent ou expiré (obligatoire en habitation)";
const ERP_MANQUANT = "ERP absent ou expiré (état des risques, validité 6 mois)";
const DIAGNOSTIC_EXPIRE = "Un diagnostic déposé est expiré";

describe("la migration et son retour, à la lecture", () => {
  it("la migration nomme son retour, et le LISEZ-MOI des retours le recense", () => {
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    expect(LISEZ_MOI).toContain(`${NOM}.retour.sql`);
  });

  it("ni l'une ni l'autre ne touche une donnée ni les fonctions inchangées", () => {
    for (const sql of [MIGRATION, RETOUR]) {
      expect(sql).not.toMatch(/\b(?:update|insert\s+into|truncate|alter\s+table|drop\s+table)\b/i);
      expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.(?:lot_blocages_location|activer_bail)\b/i);
    }
    // Le seul effacement du retour : sa propre ligne dans l'historique des migrations.
    expect(RETOUR.match(/\bdelete\s+from\b/gi)).toHaveLength(1);
    expect(RETOUR).toContain("delete from supabase_migrations.schema_migrations where version = '20261120190000'");
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe.skipIf(!DB_URL)("Bail déjà en cours : activation par le contrat signé", () => {
  let db: Client;
  let org: string;
  let compte: string;
  let bailleur: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function creerUtilisateur(): Promise<string> {
    const { rows: [{ id }] } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-bail-en-cours-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    return id;
  }
  async function enTantQuePostgres() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  async function simuler(uid: string | null, role = "authenticated") {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""],
    );
    await db.query(`set local role ${role}`);
  }
  async function refus(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return (e as Error).message;
    }
  }

  /** Un espace (propriétaire direct par défaut), son responsable, un bailleur et un locataire. */
  async function espace(type: "proprietaire_direct" | "agence" = "proprietaire_direct") {
    await enTantQuePostgres();
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status, type) values ('Bail en cours', 'active', $1::public.organization_type) returning id`,
      [type],
    );
    const uid = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1, $2, $3::public.membership_role)`,
      [uid, o.id, type === "agence" ? "admin_agence" : "proprietaire_direct"],
    );
    const { rows } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur'),($1,'Locataire') returning id, nom`,
      [o.id],
    );
    return { org: o.id as string, compte: uid, bailleur: rows.find((p) => p.nom === "Bailleur")!.id as string, locataire: rows.find((p) => p.nom === "Locataire")!.id as string };
  }

  beforeEach(async () => {
    await db.query("begin");
    ({ org, compte, bailleur, locataire } = await espace());
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  /** Un logement tel qu'il sort de sa création : « brouillon », jamais mis en location, sans aucun diagnostic. */
  async function logement(options: { detention?: boolean; organisation?: string; responsable?: string; proprietaire?: string } = {}) {
    const o = options.organisation ?? org;
    await simuler(options.responsable ?? compte);
    const { rows: [{ id: bien }] } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue des Lilas','appartement'::public.bien_type,
         '12 rue des Lilas', null, '33000','Bordeaux',1998,false,45,2) as id`,
      [o],
    );
    await enTantQuePostgres();
    const { rows: [{ id: lot }] } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(`delete from public.detentions where lot_id = $1`, [lot]);
    if (options.detention !== false) {
      await db.query(
        `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
        [lot, o, options.proprietaire ?? bailleur],
      );
    }
    return { bien: bien as string, lot: lot as string };
  }
  async function contratSigne(o = org, responsable = compte): Promise<string> {
    await enTantQuePostgres();
    const { rows: [{ id }] } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid(),$2)
       returning id`,
      [o, responsable],
    );
    return id;
  }
  /** Un brouillon, comme le pose le formulaire. `jours` : décalage de la date d'entrée par rapport au jour de Paris. */
  async function brouillon(lot: string, jours: number | null, champs: { loyer?: number | null; o?: string; qui?: string | null } = {}) {
    await enTantQuePostgres();
    const { rows: [{ id }] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, jour_echeance, date_debut)
       values ($1,$2,$3,$4,50,5, case when $5::int is null then null else public.aujourdhui_paris() + $5::int end) returning id`,
      [champs.o ?? org, lot, champs.qui === undefined ? locataire : champs.qui, champs.loyer === undefined ? 700 : champs.loyer, jours],
    );
    return id as string;
  }
  const deposer = (bail: string, document: string, o = org) => `select public.activer_bail_papier('${o}','${bail}','${document}')`;
  /** Le geste du propriétaire : le contrat signé est rangé, PUIS déposé sous son identité. Rend le refus, ou « » si accepté. */
  async function depot(bail: string, o = org, qui = compte): Promise<string> {
    const document = await contratSigne(o, qui);
    await simuler(qui);
    return refus(deposer(bail, document, o));
  }
  const etats = async (bail: string, lot: string) => ({
    bail: (await db.query(`select etat::text from public.baux where id=$1`, [bail])).rows[0].etat as string,
    lot: (await db.query(`select etat::text from public.lots where id=$1`, [lot])).rows[0].etat as string,
  });

  // ── 1. La définition ────────────────────────────────────────────────────────────────────────────────
  it("« déjà en cours » : entrée strictement passée, au jour de Paris ; l'écran dit la même chose que la base", async () => {
    const { rows: [jour] } = await db.query(`select to_char(public.aujourdhui_paris(),'YYYY-MM-DD') as aujourdhui`);
    for (const decalage of [-730, -1, 0, 1, 30]) {
      const { rows: [r] } = await db.query(
        `select public.bail_deja_en_cours(public.aujourdhui_paris() + $1::int) as base, to_char(public.aujourdhui_paris() + $1::int,'YYYY-MM-DD') as date`,
        [decalage],
      );
      expect(r.base, `décalage ${decalage}`).toBe(decalage < 0);
      expect(bailDejaEnCours(r.date, jour.aujourdhui), `écran, décalage ${decalage}`).toBe(r.base);
    }
    expect((await db.query(`select public.bail_deja_en_cours(null) as base`)).rows[0].base).toBe(false);
    expect(bailDejaEnCours(null, jour.aujourdhui)).toBe(false);
    expect(bailDejaEnCours("pas une date", jour.aujourdhui)).toBe(false);
  });

  // ── 2. Le cas de la décision ────────────────────────────────────────────────────────────────────────
  it("un bail entré il y a deux ans s'active par son contrat signé : logement jamais mis en location, ni DPE ni état des risques", async () => {
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    const document = await contratSigne();

    // Le lot, lui, n'est toujours pas « louable » : la règle de mise en location est intacte.
    const { rows: [b] } = await db.query(
      `select public.lot_blocages_location($1) as du_lot, public.bail_blocages_mise_en_location($2) as du_bail`, [lot, bail]);
    expect(b.du_lot).toEqual([DPE_MANQUANT, ERP_MANQUANT]);
    expect(b.du_bail).toEqual([]);

    await simuler(compte);
    expect(await refus(deposer(bail, document))).toBe("");
    expect(await etats(bail, lot)).toEqual({ bail: "actif", lot: "loue" });
    await enTantQuePostgres();
    const { rows: [signe] } = await db.query(`select document_signe from public.baux where id=$1`, [bail]);
    expect(signe.document_signe).toBe(document);
  });

  it("la veille suffit ; un diagnostic déposé puis expiré ne bloque pas non plus", async () => {
    const { lot, bien } = await logement();
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'electricite', current_date - 3000, current_date - 10)`, [org, lot]);
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1,$2,'erp', current_date - 400, current_date - 200)`, [org, bien]);
    const bail = await brouillon(lot, -1);
    const { rows: [b] } = await db.query(
      `select public.lot_blocages_location($1) as du_lot, public.bail_blocages_mise_en_location($2) as du_bail`, [lot, bail]);
    expect(b.du_lot).toEqual([DPE_MANQUANT, ERP_MANQUANT, DIAGNOSTIC_EXPIRE]);
    expect(b.du_bail).toEqual([]);
    expect(await depot(bail)).toBe("");
    expect(await etats(bail, lot)).toEqual({ bail: "actif", lot: "loue" });
  });

  // ── 3. Ce qui bloque encore ─────────────────────────────────────────────────────────────────────────
  it.each([[0, "aujourd'hui"], [1, "demain"], [30, "dans un mois"]])(
    "un bail qui entre %s jour(s) plus tard (%s) exige toujours la mise en location et les diagnostics",
    async (jours) => {
      const { lot } = await logement();
      const bail = await brouillon(lot, jours);
      expect((await db.query(`select public.bail_blocages_mise_en_location($1) as b`, [bail])).rows[0].b).toEqual([DPE_MANQUANT, ERP_MANQUANT]);
      expect(await depot(bail)).toMatch(/Le lot doit être « disponible » pour être loué \(actuel : brouillon\)/);
      expect(await etats(bail, lot)).toEqual({ bail: "brouillon", lot: "brouillon" });
    },
  );

  it("sans date d'entrée ou sans loyer, les mentions obligatoires bloquent comme avant", async () => {
    const { lot } = await logement();
    const sansDate = await brouillon(lot, null);
    expect(await depot(sansDate)).toMatch(/Mentions obligatoires du bail manquantes/);
    const sansLoyer = await brouillon(lot, -400, { loyer: null });
    expect(await depot(sansLoyer)).toMatch(/Mentions obligatoires du bail manquantes : Loyer hors charges non fixé/);
    const sansLocataire = await brouillon(lot, -400, { qui: null });
    expect(await depot(sansLocataire)).toMatch(/Locataire principal non désigné/);
  });

  it("sans contrat signé, rien ne s'active : c'est lui qui active le bail", async () => {
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    await simuler(compte);
    expect(await refus(`select public.activer_bail($1)`, [bail])).toMatch(/Déposez le bail signé \(PDF\)/);
    expect(await etats(bail, lot)).toEqual({ bail: "brouillon", lot: "brouillon" });
  });

  it("les autres blocages du logement restent : une détention incomplète bloque un bail déjà en cours", async () => {
    const { lot } = await logement({ detention: false });
    const bail = await brouillon(lot, -730);
    const { rows: [b] } = await db.query(`select public.bail_blocages_mise_en_location($1) as b`, [bail]);
    expect(b.b).toHaveLength(1);
    expect(b.b[0]).toMatch(/^Détention incomplète/);
    expect(await depot(bail)).toMatch(/Mise en location bloquée : Détention incomplète/);
    expect(await etats(bail, lot)).toEqual({ bail: "brouillon", lot: "brouillon" });
  });

  it("un DPE classé G bloque toujours : la décision ne porte que sur les diagnostics manquants", async () => {
    const { lot } = await logement();
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration, classe_dpe)
       values ($1,$2,'dpe', current_date - 30, current_date + 3000, 'G')`, [org, lot]);
    const bail = await brouillon(lot, -730);
    expect(await depot(bail)).toMatch(/Mise en location bloquée : DPE classe G/);
    expect(await etats(bail, lot)).toEqual({ bail: "brouillon", lot: "brouillon" });
  });

  it("un seul bail en cours par logement, y compris pour deux baux déjà commencés", async () => {
    const { lot } = await logement();
    const premier = await brouillon(lot, -730);
    expect(await depot(premier)).toBe("");
    const second = await brouillon(lot, -100);
    expect(await depot(second)).toMatch(/Un bail est déjà en cours sur ce lot/);
  });

  it("une agence reste tenue par son mandat : sans mandat, refus ; avec, le bail déjà en cours s'active", async () => {
    const agence = await espace("agence");
    const { lot } = await logement({ organisation: agence.org, responsable: agence.compte, proprietaire: agence.bailleur });
    const bail = await brouillon(lot, -730, { o: agence.org, qui: agence.locataire });
    const document = await contratSigne(agence.org, agence.compte);
    await simuler(agence.compte);
    expect(await refus(deposer(bail, document, agence.org))).toMatch(/aucun mandat de gestion en cours ne couvre ce lot/);
    await couvrirParMandat(db, lot);
    await simuler(agence.compte);
    expect(await refus(deposer(bail, document, agence.org))).toBe("");
    expect(await etats(bail, lot)).toEqual({ bail: "actif", lot: "loue" });
  });

  // ── 4. L'état du logement ───────────────────────────────────────────────────────────────────────────
  it("un logement ne devient « loué » que par un bail actif, et « brouillon → disponible » garde son contrôle", async () => {
    const { lot } = await logement();
    await brouillon(lot, -730);
    await simuler(compte);
    expect(await refus(`update public.lots set etat='loue' where id=$1`, [lot])).toMatch(/Ce lot n'a pas de bail/);
    expect(await refus(`update public.lots set etat='disponible' where id=$1`, [lot])).toMatch(/Passage en disponible impossible : .*DPE absent ou expiré.*ERP absent ou expiré/);
    expect(await refus(`update public.lots set etat='preavis' where id=$1`, [lot])).toMatch(/Transition interdite : brouillon → preavis/);
  });

  it("une fois loué par un bail déjà en cours, le logement suit le bail comme tout autre", async () => {
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    expect(await depot(bail)).toBe("");
    expect(await refus(`update public.lots set etat='disponible' where id=$1`, [lot])).toMatch(/Ce lot porte un bail en cours : il reste loué/);
    expect(await refus(`update public.lots set etat='brouillon' where id=$1`, [lot])).toMatch(/Transition interdite : loue → brouillon/);
  });

  it("mauvais PDF déposé : « Corriger » remet le bail en brouillon, et le bon contrat le réactive", async () => {
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    expect(await depot(bail)).toBe("");
    // Rien n'a encore vécu (ni loyer appelé, ni encaissement) : le retour en brouillon est permis.
    expect(await refus(`select public.devalider_bail($1)`, [bail])).toBe("");
    const apres = await etats(bail, lot);
    expect(apres.bail).toBe("brouillon");
    expect(apres.lot).not.toBe("loue");
    await enTantQuePostgres();
    expect((await db.query(`select document_signe from public.baux where id=$1`, [bail])).rows[0].document_signe).toBeNull();
    expect(await depot(bail)).toBe("");
    expect(await etats(bail, lot)).toEqual({ bail: "actif", lot: "loue" });
  });

  // ── 5. Le filtre et ses libellés ────────────────────────────────────────────────────────────────────
  it("les trois libellés retirés sont ceux de lot_blocages_location, mot pour mot (sinon le blocage reviendrait)", async () => {
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.lot_blocages_location(uuid)'::regprocedure) as def`);
    for (const libelle of [DPE_MANQUANT, ERP_MANQUANT, DIAGNOSTIC_EXPIRE]) expect(def, libelle).toContain(`'${libelle}'`);
    const { rows: [{ filtre }] } = await db.query(`select pg_get_functiondef('public.bail_blocages_mise_en_location(uuid)'::regprocedure) as filtre`);
    expect(filtre).toContain(`not like 'DPE absent ou expiré%'`);
    expect(filtre).toContain(`not like 'ERP absent ou expiré%'`);
    expect(filtre).toContain(`<> '${DIAGNOSTIC_EXPIRE}'`);
  });

  // ── 6. Le guide de démarrage ────────────────────────────────────────────────────────────────────────
  it("le guide réclame la préparation du logement avant le bail, plus après : un logement loué n'est pas « à faire »", async () => {
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    const etape = async () => {
      await simuler(compte);
      const { rows } = await db.query(`select etape, faite, detail from public.parcours_demarrage($1)`, [org]);
      return rows.find((r) => r.etape === "lot_pret")!;
    };
    const avant = await etape();
    expect(avant.faite).toBe(false);
    expect(avant.detail).toContain("DPE absent ou expiré");
    expect(await depot(bail)).toBe("");
    const apres = await etape();
    expect(apres).toMatchObject({ faite: true, detail: "Votre logement est loué. Les diagnostics qui manquent restent signalés dans vos actions à mener." });
  });

  // ── 7. Droits ───────────────────────────────────────────────────────────────────────────────────────
  it("un visiteur n'exécute aucune des deux fonctions ; un autre espace ne lit rien du bail", async () => {
    const { lot } = await logement({ detention: false });
    const bail = await brouillon(lot, -730);
    await simuler(null, "anon");
    expect(await refus(`select public.bail_blocages_mise_en_location($1)`, [bail])).toMatch(/permission denied/);
    expect(await refus(`select public.bail_deja_en_cours(current_date)`)).toMatch(/permission denied/);

    const autre = await espace();
    await simuler(autre.compte);
    // Sous les droits de l'appelant : le bail d'un autre espace est invisible, ses blocages aussi.
    expect((await db.query(`select public.bail_blocages_mise_en_location($1) as b`, [bail])).rows[0].b).toEqual(["Bail introuvable"]);
    expect(await depot(bail)).not.toBe("");
    expect(await etats(bail, lot)).toEqual({ bail: "brouillon", lot: "brouillon" });
  });

  it("les droits des fonctions corrigées sont ceux d'avant", async () => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authentifie, p.prosecdef as definisseur
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('controler_mise_en_location','parcours_demarrage','bail_blocages_mise_en_location','bail_deja_en_cours')
        order by 1`);
    expect(rows).toEqual([
      { proname: "bail_blocages_mise_en_location", anon: false, authentifie: true, definisseur: false },
      { proname: "bail_deja_en_cours", anon: false, authentifie: true, definisseur: false },
      { proname: "controler_mise_en_location", anon: false, authentifie: true, definisseur: true },
      { proname: "parcours_demarrage", anon: false, authentifie: true, definisseur: true },
    ]);
  });

  // ── 8. Rejeu et retour ──────────────────────────────────────────────────────────────────────────────
  const empreintes = async () => (await db.query(
    `select p.proname, md5(pg_get_functiondef(p.oid)) as empreinte, p.proacl::text as droits
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('controler_mise_en_location','verifier_transition_lot','parcours_demarrage','bail_blocages_mise_en_location','bail_deja_en_cours','lot_blocages_location','activer_bail')
      order by 1`)).rows;

  it("la migration se rejoue sans effet", async () => {
    await enTantQuePostgres();
    const avant = await empreintes();
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(avant);
  });

  it("le retour rend les trois fonctions à leur forme d'avant, retire les deux nouvelles, se rejoue ; puis la migration revient au même état", async () => {
    await enTantQuePostgres();
    const migre = await empreintes();
    await db.query(RETOUR);
    const revenu = await empreintes();
    expect(revenu.map((f) => f.proname)).toEqual(["activer_bail", "controler_mise_en_location", "lot_blocages_location", "parcours_demarrage", "verifier_transition_lot"]);
    for (const nom of ["controler_mise_en_location", "verifier_transition_lot", "parcours_demarrage"]) {
      const { rows: [{ def }] } = await db.query(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [nom]);
      expect(def, nom).not.toContain("Décision B du 20/11/2026");
      expect(def, nom).not.toContain("bail_deja_en_cours");
      expect(def, nom).not.toContain("Votre logement est loué.");
    }
    // Fonctions inchangées par l'aller comme par le retour.
    for (const nom of ["activer_bail", "lot_blocages_location"]) {
      expect(revenu.find((f) => f.proname === nom), nom).toEqual(migre.find((f) => f.proname === nom));
    }
    await db.query(RETOUR);
    expect(await empreintes()).toEqual(revenu);

    // Après le retour, le bail déjà en cours est de nouveau refusé depuis un logement en préparation.
    const { lot } = await logement();
    const bail = await brouillon(lot, -730);
    expect(await depot(bail)).toMatch(/Le lot doit être « disponible »/);

    await enTantQuePostgres();
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(migre);
  });

  it("une définition inattendue arrête la migration avec un message qui dit où, sans rien changer", async () => {
    await enTantQuePostgres();
    await db.query(RETOUR);
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.verifier_transition_lot()'::regprocedure) as def`);
    await db.query(def.replace("new.etat in ('disponible', 'archive')", "new.etat in ('disponible','archive')"));
    const avant = await empreintes();
    expect(await refus(MIGRATION)).toMatch(/définition inattendue de verifier_transition_lot/);
    expect(await empreintes()).toEqual(avant);
  });
});
