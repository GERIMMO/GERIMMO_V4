/**
 * Un agent peut ajouter un bien — et ne voit toujours pas celui d'un autre.
 *
 * LE DÉFAUT (constaté par l'humain le 12/09) : « je me suis connecté en tant
 * qu'agent, je ne trouve pas où ajouter un lot ou un bien ». Il n'y avait
 * nulle part : le bouton était masqué, et la base aurait refusé.
 *
 * CE QUI SE PASSAIT. L'INSERT passait ; c'est la RELECTURE qui échouait.
 * `creer_bien_avec_lot` finit par `insert … returning id`, et le `returning`
 * déclenche la politique de LECTURE sur la ligne qu'on vient d'écrire. Un bien
 * tout neuf n'étant sous aucun mandat, il était hors du portefeuille de tout le
 * monde sauf de l'admin. L'agent créait dans le vide.
 *
 * LA RÈGLE CORRIGÉE, ÉTROITE : ce qu'un agent ENREGISTRE est à lui, tant que
 * l'agence ne l'a confié à personne. Son portefeuille = les lots de ses
 * mandats, plus ceux qu'il a saisis et qu'aucun mandat ne couvre.
 *
 * La règle LARGE — « ce que personne ne gère appartient à l'agence » — a été
 * essayée puis écartée : sur un parc pas encore sous mandat, elle rouvrait
 * l'agence entière à n'importe quel agent.
 *
 * CE QUE CES TESTS PROTÈGENT SURTOUT : la moitié qui ne doit PAS bouger. Le P0
 * du 09/09 — un agent ne voit rien du portefeuille d'un collègue — est éprouvé
 * ici sous sa forme la plus directe, parce que c'est lui que cette correction
 * pouvait casser.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Un agent enregistre un bien", () => {
  let db: Client;
  let org: string;
  let patron: string;
  let agentA: string;
  let agentB: string;
  let mandant: string;
  let lotDeA: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  async function creerCompte(prefixe: string): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         $1||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`,
      [prefixe]
    );
    return id;
  }

  async function devenir(compte: string) {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  }

  async function redevenirService() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, type)
       values ('Cabinet du portefeuille','active'::public.organization_status,'agence'::public.organization_type)
       returning id`
    );
    org = o.id;
    patron = await creerCompte("patron");
    agentA = await creerCompte("agentA");
    agentB = await creerCompte("agentB");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'), ($3,$2,'agent'), ($4,$2,'agent')`,
      [patron, org, agentA, agentB]
    );

    // Un lot confié à l'agent A : c'est lui que l'agent B ne doit jamais voir.
    const {
      rows: [m],
    } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id",
      [org]
    );
    mandant = m.id;
    const {
      rows: [bien],
    } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Immeuble de A','appartement'::public.bien_type,'1 rue A','75001','Paris')
       returning id`,
      [org]
    );
    const {
      rows: [l],
    } = await db.query<{ id: string }>(
      `insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot de A') returning id`,
      [org, bien.id]
    );
    lotDeA = l.id;
    await db.query(
      `insert into public.detentions (organization_id, lot_id, person_id, quote_part)
       values ($1,$2,$3,100)`,
      [org, lotDeA, mandant]
    );
    const {
      rows: [md],
    } = await db.query<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id)
       values ($1,$2,'brouillon'::public.mandat_etat, current_date - 30, $3) returning id`,
      [org, mandant, agentA]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
       values ($1,$2,$3,7,current_date - 30)`,
      [org, md.id, lotDeA]
    );
    await db.query("update public.mandats set etat='actif'::public.mandat_etat where id=$1", [
      md.id,
    ]);
  });

  describe("Ce qui ne doit PAS bouger — le P0 du 09/09", () => {
    it("l'agent B ne voit RIEN du lot confié à l'agent A", async () => {
      await devenir(agentB);
      const { rows } = await db.query("select * from public.lots where id = $1", [lotDeA]);
      expect(rows).toHaveLength(0);
    });

    it("il n'en voit pas non plus le bien, ni la fiche", async () => {
      await devenir(agentB);
      const { rows: biens } = await db.query(
        "select * from public.biens where nom = 'Immeuble de A'"
      );
      expect(biens).toHaveLength(0);
      const { rows: fiche } = await db.query("select * from public.fiche_lot($1)", [lotDeA]);
      expect(fiche).toHaveLength(0);
    });

    it("le titulaire, lui, le voit", async () => {
      await devenir(agentA);
      const { rows } = await db.query("select * from public.lots where id = $1", [lotDeA]);
      expect(rows).toHaveLength(1);
    });

    it("le lot d'un autre ne figure pas dans la liste de mon portefeuille", async () => {
      await devenir(agentB);
      const { rows } = await db.query<{ id: string }>(
        "select lots_de_mon_portefeuille as id from public.lots_de_mon_portefeuille($1)",
        [org]
      );
      expect(rows.map((r) => r.id)).not.toContain(lotDeA);
    });
  });

  describe("Ce qui est réparé", () => {
    it("l'agent crée un bien, et le relit aussitôt", async () => {
      await devenir(agentB);
      const { rows } = await db.query<{ bien: string }>(
        `select public.creer_bien_avec_lot($1,'Bien de B','appartement'::public.bien_type,
           '2 rue B', null, '75002','Paris', null, false, 30, 2) as bien`,
        [org]
      );
      expect(rows[0].bien).toBeTruthy();
      // La relecture est la moitié qui échouait : `returning id` déclenche la
      // politique de lecture sur la ligne qu'on vient d'écrire.
      const { rows: relu } = await db.query("select * from public.biens where id = $1", [
        rows[0].bien,
      ]);
      expect(relu).toHaveLength(1);
      const { rows: lot } = await db.query("select * from public.lots where bien_id = $1", [
        rows[0].bien,
      ]);
      expect(lot).toHaveLength(1);
    });

    it("le bien qu'il vient de créer est dans SON portefeuille", async () => {
      await devenir(agentB);
      const {
        rows: [{ bien }],
      } = await db.query<{ bien: string }>(
        `select public.creer_bien_avec_lot($1,'Bien de B','appartement'::public.bien_type,
           '2 rue B', null, '75002','Paris', null, false, 30, 2) as bien`,
        [org]
      );
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from public.lots
          where bien_id = $1 and id in (select public.lots_de_mon_portefeuille($2))`,
        [bien, org]
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    it("son collègue NE le voit PAS : ce qu'il saisit est à lui, pas à l'agence", async () => {
      // LA RÈGLE LARGE A ÉTÉ ÉCARTÉE ICI. On avait d'abord décrété que « ce que
      // personne ne gère appartient à l'agence » : c'était rouvrir tout le
      // stock non attribué à n'importe quel agent, soit l'agence entière sur un
      // parc pas encore sous mandat — le P0 du 09/09. Ce que l'agent enregistre
      // n'est visible que de lui, jusqu'à ce que l'administrateur le confie.
      await devenir(agentB);
      const {
        rows: [{ bien }],
      } = await db.query<{ bien: string }>(
        `select public.creer_bien_avec_lot($1,'Bien de B','appartement'::public.bien_type,
           '2 rue B', null, '75002','Paris', null, false, 30, 2) as bien`,
        [org]
      );
      await devenir(agentA);
      const { rows } = await db.query("select * from public.biens where id = $1", [bien]);
      expect(rows).toHaveLength(0);
    });

    it("un agent sans mandat qui n'a rien saisi voit toujours une liste VIDE", async () => {
      // Le P0 du 09/09, dit sous sa forme la plus nue : c'est lui que la
      // première version de ce correctif avait cassé.
      await devenir(agentB);
      const { rows } = await db.query("select * from public.lots_de_mon_portefeuille($1)", [org]);
      expect(rows).toHaveLength(0);
    });

    it("le lot saisi sort de sa vue le jour où l'administrateur le confie à un autre", async () => {
      await devenir(agentB);
      const {
        rows: [{ bien }],
      } = await db.query<{ bien: string }>(
        `select public.creer_bien_avec_lot($1,'Bien de B','appartement'::public.bien_type,
           '2 rue B', null, '75002','Paris', null, false, 30, 2) as bien`,
        [org]
      );
      const {
        rows: [{ id: lotDeB }],
      } = await db.query<{ id: string }>("select id from public.lots where bien_id = $1", [bien]);

      await redevenirService();
      await db.query(
        `insert into public.detentions (organization_id, lot_id, person_id, quote_part)
         values ($1,$2,$3,100)`,
        [org, lotDeB, mandant]
      );
      const {
        rows: [md],
      } = await db.query<{ id: string }>(
        `insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id)
         values ($1,$2,'brouillon'::public.mandat_etat, current_date, $3) returning id`,
        [org, mandant, agentA]
      );
      await db.query(
        `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
         values ($1,$2,$3,7,current_date)`,
        [org, md.id, lotDeB]
      );

      await devenir(agentB);
      const { rows } = await db.query("select * from public.lots where id = $1", [lotDeB]);
      expect(rows).toHaveLength(0);
      await devenir(agentA);
      const { rows: chezA } = await db.query("select * from public.lots where id = $1", [lotDeB]);
      expect(chezA).toHaveLength(1);
    });

    it("les mandats restent le geste de l'administrateur", async () => {
      await devenir(agentB);
      await expect(
        db.query(
          `insert into public.mandats (organization_id, person_id, etat, date_debut)
           values ($1,$2,'brouillon'::public.mandat_etat, current_date)`,
          [org, mandant]
        )
      ).rejects.toThrow(/administrateur/i);
    });
  });

  describe("Les prédicats restent fermés à anon", () => {
    it.each([
      "lots_de_mon_portefeuille(uuid)",
      "lot_hors_portefeuille(uuid, uuid)",
      "bien_hors_portefeuille(uuid, uuid)",
      "mandat_hors_portefeuille(uuid, uuid)",
    ])("%s", async (signature) => {
      await redevenirService();
      const { rows } = await db.query<{ anon: boolean; pub: boolean }>(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('public', $1, 'EXECUTE') as pub`,
        [`public.${signature}`]
      );
      expect(rows[0].anon).toBe(false);
      expect(rows[0].pub).toBe(false);
    });
  });
});
