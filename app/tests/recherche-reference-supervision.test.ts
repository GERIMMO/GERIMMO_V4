/**
 * X18 (fiche SA-09), décision ratifiée du 14/10/2026 — la recherche de la console retrouve un bien, un lot ou un
 * incident PAR SA RÉFÉRENCE, côté base (`rechercher_reference_supervision`).
 *
 * Constat (audit du 13/10, S-RECHERCHE) : « INC-2026-0003 » et « Lot 1 » répondaient « Aucun client trouvé » ; la recherche
 * ne couvrait que les organisations, les artisans et les comptes.
 *
 * Ce que la base garantit ici :
 *  · seul le superviseur actif, en second facteur (`is_super_admin`), peut l'appeler : ni anon, ni un compte authentifié
 *    quelconque (même administrateur d'une agence), ni un superviseur sans second facteur ;
 *  · la référence est EXACTE (identifiant complet, numéro d'incident complet, nom ou référence interne complet) : une
 *    référence partielle, un motif `%` ou `_`, un début d'identifiant ne trouvent rien ; aucune organisation ne fuit ;
 *  · le résultat ne dit que le type d'objet trouvé et l'organisation (identifiant et nom) : ni adresse, ni nom de lot ou
 *    de bien, ni locataire ;
 *  · chaque recherche est tracée au journal de supervision (`audit_log`, action `recherche_reference`), sans recopier
 *    le texte saisi quand il est un nom (une adresse, souvent) ; la même recherche refaite dans la minute n'écrit pas
 *    une seconde ligne identique (comme les consultations, `log_sa_access`).
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

type Ligne = { type_objet: string; organisation_id: string; organisation_nom: string; nombre: number; groupes: number };

describe.skipIf(!DB_URL)("X18 — recherche d'un dossier par référence dans la console", () => {
  let db: Client;
  let sa: string;
  let simple: string;
  let adminA: string;
  let orgA: string;
  let orgB: string;
  let bienA: string;
  let bienB: string;
  let lotA: string;
  let lotB: string;
  let incidentA: string;
  let incidentB: string;

  async function compte(superAdmin: boolean) {
    const { rows: [u] } = await db.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'authenticated', 'authenticated', 'recherche-' || gen_random_uuid() || '@test.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`
    );
    if (superAdmin) await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')", [u.id]);
    return u.id as string;
  }
  async function agir(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text, true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  async function chercher(reference: string): Promise<Ligne[]> {
    const { rows } = await db.query("select * from public.rechercher_reference_supervision($1)", [reference]);
    return rows as Ligne[];
  }
  /** Une requête qui doit être refusée : l'erreur, son effet annulé. */
  async function refus(sql: string, params: unknown[] = []) {
    await db.query("savepoint refus");
    const erreur = await db.query(sql, params).then(() => null, (e) => e as Error & { code?: string });
    await db.query("rollback to savepoint refus");
    expect(erreur, "l'appel aurait dû être refusé").not.toBeNull();
    return erreur!;
  }
  async function traces(compteId: string) {
    await db.query("reset role");
    const { rows } = await db.query(
      "select organization_id, details from public.audit_log where account_id=$1 and action='recherche_reference' order by created_at, id", [compteId]
    );
    return rows as { organization_id: string | null; details: Record<string, unknown> }[];
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    sa = await compte(true);
    simple = await compte(false);
    adminA = await compte(false);
    ({ rows: [{ id: orgA }] } = await db.query("insert into public.organizations (name, status) values ('Agence Référence Alpha', 'active') returning id"));
    ({ rows: [{ id: orgB }] } = await db.query("insert into public.organizations (name, status) values ('Agence Référence Bêta', 'active') returning id"));
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')", [adminA, orgA]);
    ({ rows: [{ id: bienA }] } = await db.query(
      "insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'Résidence  des Tilleuls','appartement','12 rue Secrète','75011','Paris') returning id", [orgA]));
    ({ rows: [{ id: bienB }] } = await db.query(
      "insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'Résidence Bêta','appartement','8 avenue Privée','69003','Lyon') returning id", [orgB]));
    ({ rows: [{ id: lotA }] } = await db.query("insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot 1') returning id", [orgA, bienA]));
    ({ rows: [{ id: lotB }] } = await db.query("insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot 1') returning id", [orgB, bienB]));
    await db.query("insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot 12 bis') returning id", [orgB, bienB]);
    const { rows: [{ id: locataire }] } = await db.query("insert into public.persons (organization_id, nom, prenom) values ($1,'Dupont-Secret','Jeanne') returning id", [orgA]);
    ({ rows: [{ id: incidentA }] } = await db.query(
      "insert into public.incidents (organization_id, numero, lot_id, declarant_person_id, canal, categorie, description) values ($1,'INC-2026-0007',$2,$3,'espace_locataire','plomberie_joint','Fuite chez Mme Dupont-Secret') returning id", [orgA, lotA, locataire]));
    ({ rows: [{ id: incidentB }] } = await db.query(
      "insert into public.incidents (organization_id, numero, lot_id, canal, categorie, description) values ($1,'INC-2026-0071',$2,'agence','autre','Autre panne') returning id", [orgB, lotB]));
  });
  beforeEach(async () => { await db.query("reset role"); await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("réservée au superviseur actif, en second facteur", () => {
    it("anon n'a pas le droit d'exécuter la fonction", async () => {
      const { rows: [r] } = await db.query("select has_function_privilege('anon','public.rechercher_reference_supervision(text)','execute') as ok");
      expect(r.ok).toBe(false);
      await db.query("set local role anon");
      const erreur = await refus("select * from public.rechercher_reference_supervision('INC-2026-0007')");
      expect(erreur.code).toBe("42501");
    });

    it("un compte authentifié sans supervision est refusé, sans rien lire ni tracer", async () => {
      await agir(simple);
      const erreur = await refus("select * from public.rechercher_reference_supervision('INC-2026-0007')");
      expect(erreur.message).toMatch(/réservé à la supervision/);
      expect(await traces(simple)).toEqual([]);
    });

    it("l'administrateur d'une agence est refusé, même pour une référence de sa propre agence", async () => {
      await agir(adminA);
      expect((await refus("select * from public.rechercher_reference_supervision($1)", [bienA])).message).toMatch(/réservé à la supervision/);
      await agir(adminA);
      expect((await refus("select * from public.rechercher_reference_supervision('INC-2026-0071')")).message).toMatch(/réservé à la supervision/);
      expect(await traces(adminA)).toEqual([]);
    });

    it("un superviseur sans second facteur (aal1) est refusé", async () => {
      await agir(sa, "aal1");
      expect((await refus("select * from public.rechercher_reference_supervision('INC-2026-0007')")).message).toMatch(/réservé à la supervision/);
      expect(await traces(sa)).toEqual([]);
    });

    it("une adhésion de superviseur désactivée ne suffit pas", async () => {
      await db.query("update public.memberships set status='inactive' where account_id=$1", [sa]);
      await agir(sa);
      expect((await refus("select * from public.rechercher_reference_supervision('INC-2026-0007')")).message).toMatch(/réservé à la supervision/);
    });
  });

  describe("le superviseur retrouve l'organisation, et rien d'autre", () => {
    it("un incident par son numéro (casse indifférente) : le type et l'organisation, sans contenu", async () => {
      await agir(sa);
      const r = await chercher("  inc-2026-0007 ");
      expect(r).toEqual([{ type_objet: "incident", organisation_id: orgA, organisation_nom: "Agence Référence Alpha", nombre: 1, groupes: 1 }]);
      const texte = JSON.stringify(r);
      for (const contenu of ["Dupont", "Fuite", "rue", "Paris", "Lot 1", "Tilleuls", incidentA, lotA, bienA]) expect(texte).not.toContain(contenu);
    });

    it("un bien, un lot, un incident par leur identifiant", async () => {
      await agir(sa);
      expect(await chercher(bienB)).toEqual([{ type_objet: "bien", organisation_id: orgB, organisation_nom: "Agence Référence Bêta", nombre: 1, groupes: 1 }]);
      expect(await chercher(lotA.toUpperCase())).toEqual([{ type_objet: "lot", organisation_id: orgA, organisation_nom: "Agence Référence Alpha", nombre: 1, groupes: 1 }]);
      expect(await chercher(incidentB)).toEqual([{ type_objet: "incident", organisation_id: orgB, organisation_nom: "Agence Référence Bêta", nombre: 1, groupes: 1 }]);
    });

    it("un bien par sa référence interne exacte (casse et espaces indifférents)", async () => {
      await agir(sa);
      expect(await chercher("résidence des tilleuls")).toEqual([
        { type_objet: "bien", organisation_id: orgA, organisation_nom: "Agence Référence Alpha", nombre: 1, groupes: 1 },
      ]);
    });

    it("un nom de lot porté dans deux organisations : les deux organisations, une ligne chacune", async () => {
      await agir(sa);
      const r = await chercher("Lot 1");
      expect(r.map((l) => [l.type_objet, l.organisation_nom, l.nombre, l.groupes])).toEqual([
        ["lot", "Agence Référence Alpha", 1, 2],
        ["lot", "Agence Référence Bêta", 1, 2],
      ]);
    });

    it("le résultat n'a que cinq colonnes : type, organisation, nom de l'organisation, nombre, groupes", async () => {
      await agir(sa);
      const { fields } = await db.query("select * from public.rechercher_reference_supervision('INC-2026-0007')");
      expect(fields.map((f) => f.name)).toEqual(["type_objet", "organisation_id", "organisation_nom", "nombre", "groupes"]);
    });

    it("au plus huit organisations, et le nombre total pour le dire", async () => {
      await db.query("reset role");
      for (let i = 0; i < 9; i++) {
        const { rows: [{ id: org }] } = await db.query("insert into public.organizations (name) values ($1) returning id", [`Agence nombreuse ${i}`]);
        const { rows: [{ id: bien }] } = await db.query(
          "insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1,'Bien nombreux','appartement','1 rue X','75001','Paris') returning id", [org]);
        await db.query("insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot commun')", [org, bien]);
      }
      await agir(sa);
      const r = await chercher("Lot commun");
      expect(r).toHaveLength(8);
      expect(new Set(r.map((l) => l.groupes))).toEqual(new Set([9]));
    });
  });

  describe("« aucun résultat » et aucune fuite", () => {
    it("une référence inexistante ne répond rien", async () => {
      await agir(sa);
      expect(await chercher("INC-2026-9999")).toEqual([]);
      expect(await chercher("2b1e7d4e-8f3a-4c2d-9e1f-0a1b2c3d4e5f")).toEqual([]);
      expect(await chercher("Rien de tel")).toEqual([]);
    });

    it("une référence partielle ne trouve rien, dans aucune organisation", async () => {
      await agir(sa);
      for (const partielle of [
        "INC-2026-007", "INC-2026-00", "INC-2026", "NC-2026-0071", "INC-2026-0071 ", // la dernière est complète : contrôle ci-dessous
        bienB.slice(0, 8), bienB.slice(0, 35), lotA.slice(1),
        "Résidence", "Bêta", "Lot", "Lot 12", "ésidence Bêta",
        "%", "%%", "Lot%", "Lot _", "R_sidence B_ta", "%0071", "INC-2026-00__",
      ]) {
        const r = await chercher(partielle);
        if (partielle === "INC-2026-0071 ") { expect(r.map((l) => l.organisation_id)).toEqual([orgB]); continue; }
        expect(r, `« ${partielle} » ne doit rien trouver`).toEqual([]);
      }
    });

    it("un texte trop court ou trop long ne lit rien et n'écrit rien", async () => {
      await agir(sa);
      expect(await chercher("")).toEqual([]);
      expect(await chercher(" L ")).toEqual([]);
      expect(await chercher("x".repeat(121))).toEqual([]);
      expect(await traces(sa)).toEqual([]);
    });
  });

  describe("la recherche est tracée au journal de supervision, sans données personnelles", () => {
    it("une recherche par nom : une ligne, sans le texte saisi, avec les identifiants trouvés", async () => {
      await agir(sa);
      await chercher("Résidence des Tilleuls");
      const [ligne, ...autres] = await traces(sa);
      expect(autres).toEqual([]);
      expect(ligne.organization_id).toBe(orgA);
      expect(ligne.details).toEqual({ forme: "libelle", resultats: 1, organisations: [orgA], objets: [bienA] });
      expect(JSON.stringify(ligne.details)).not.toMatch(/Tilleuls|Résidence|rue|Paris/i);
    });

    it("une recherche par numéro d'incident garde la référence (ce n'est pas une donnée personnelle)", async () => {
      await agir(sa);
      await chercher("inc-2026-0007");
      expect(await traces(sa)).toEqual([
        { organization_id: orgA, details: { forme: "numero", reference: "INC-2026-0007", resultats: 1, organisations: [orgA], objets: [incidentA] } },
      ]);
    });

    it("une recherche sans résultat est tracée aussi, sans organisation", async () => {
      await agir(sa);
      await chercher("2b1e7d4e-8f3a-4c2d-9e1f-0a1b2c3d4e5f");
      await chercher("Rien de tel chez Mme Dupont");
      // Même transaction, même horodatage : l'ordre se fixe sur la forme.
      const lignes = (await traces(sa)).sort((a, b) => String(a.details.forme).localeCompare(String(b.details.forme)));
      expect(lignes).toEqual([
        { organization_id: null, details: { forme: "identifiant", reference: "2b1e7d4e-8f3a-4c2d-9e1f-0a1b2c3d4e5f", resultats: 0, organisations: [], objets: [] } },
        { organization_id: null, details: { forme: "libelle", resultats: 0, organisations: [], objets: [] } },
      ]);
      expect(JSON.stringify(lignes)).not.toContain("Dupont");
    });

    it("plusieurs organisations : la ligne n'est rattachée à aucune, les deux sont dans le détail", async () => {
      await agir(sa);
      await chercher("Lot 1");
      const [ligne] = await traces(sa);
      expect(ligne.organization_id).toBeNull();
      expect(new Set(ligne.details.organisations as string[])).toEqual(new Set([orgA, orgB]));
      expect(new Set(ligne.details.objets as string[])).toEqual(new Set([lotA, lotB]));
    });

    it("la même recherche refaite dans la minute n'écrit pas de seconde ligne ; une autre, si", async () => {
      await agir(sa);
      for (let i = 0; i < 5; i++) await chercher("INC-2026-0007");
      await chercher("Tout autre texte");
      await chercher("Encore un autre texte"); // même détail que la précédente (aucun résultat, par nom) : dédoublonnée
      expect(await traces(sa)).toHaveLength(2);
      await db.query("update public.audit_log set created_at = now() - interval '2 minutes' where account_id=$1", [sa]);
      await agir(sa);
      await chercher("INC-2026-0007");
      expect(await traces(sa)).toHaveLength(3);
    });

  });

  describe("la migration se rejoue sans effet et ne remplace jamais une fonction inconnue", () => {
    const MIGRATION = readFileSync("supabase/migrations/20261014720000_recherche_reference_supervision.sql", "utf8");
    const definition = async () =>
      (await db.query("select pg_get_functiondef('public.rechercher_reference_supervision(text)'::regprocedure) as d")).rows[0].d as string;

    it("rejouée, elle ne touche pas la définition en vigueur (même modifiée depuis, la marque y restant)", async () => {
      const avant = await definition();
      await db.query(MIGRATION);
      expect(await definition()).toBe(avant);
      // Une modification ultérieure (faite en relisant la définition) garde la marque : le rejeu ne l'écrase pas.
      await db.query("do $m$ begin execute replace(pg_get_functiondef('public.rechercher_reference_supervision(text)'::regprocedure), 'limit 8;', 'limit 7;'); end $m$");
      const modifiee = await definition();
      expect(modifiee).toContain("limit 7;");
      await db.query(MIGRATION);
      expect(await definition()).toBe(modifiee);
    });

    it("une fonction du même nom sans la marque de la décision : la migration s'arrête", async () => {
      await db.query("drop function public.rechercher_reference_supervision(text)");
      await db.query(`create function public.rechercher_reference_supervision(p_reference text)
        returns table (type_objet text, organisation_id uuid, organisation_nom text, nombre integer, groupes integer)
        language sql security definer set search_path = '' as $$ select null::text, null::uuid, null::text, 0, 0 where false $$`);
      await expect(db.query(MIGRATION)).rejects.toThrow(/existe déjà sans la marque/);
    });

    it("droits : authenticated peut l'appeler (la garde est dans la fonction), anon non ; security definer, search_path vide", async () => {
      const { rows: [r] } = await db.query(`select
        has_function_privilege('authenticated','public.rechercher_reference_supervision(text)','execute') as authentifie,
        has_function_privilege('anon','public.rechercher_reference_supervision(text)','execute') as anonyme,
        p.prosecdef as definer, p.proconfig as reglages
        from pg_proc p where p.oid = 'public.rechercher_reference_supervision(text)'::regprocedure`);
      expect(r).toEqual({ authentifie: true, anonyme: false, definer: true, reglages: ['search_path=""'] });
    });
  });
});
