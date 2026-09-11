/**
 * Tests d'intégration — le cycle mensuel tourne sans personne (11/09).
 *
 * Jusqu'à cette date, les appels de loyer d'un mois n'existaient que si un
 * gérant ouvrait le bail et cliquait « Générer l'échéancier ». Le wiki décrit
 * pourtant l'inverse depuis le 24/07 (« appel de loyer émis par tâche
 * planifiée », processus « Quittancement des loyers »). Un client qui oublie de
 * cliquer n'a pas d'appel, donc pas de quittance, donc aucun impayé détectable.
 *
 * Ces tests gardent les trois propriétés qui font tenir l'automatisation :
 *  — le cron aboutit là où un humain serait refusé (et l'inverse) ;
 *  — un bail en défaut n'emporte pas le mois de tous les autres ;
 *  — une organisation suspendue n'est pas servie.
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

let db: Client;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-cm-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

/** Se faire passer pour un compte (ou pour le cron : accountId null). */
async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

/** Un bail actif, son lot et son locataire, dans une organisation donnée. */
async function bailActif(org: string, gerant: string, moisEnArriere: number): Promise<string> {
  await simuler(gerant);
  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    `select public.creer_bien_avec_lot($1,'1 rue CM','appartement'::public.bien_type,'1 rue CM',null,'75001','Paris',1990,false,45,2) as id`,
    [org]
  );
  const {
    rows: [{ id: lot }],
  } = await db.query<{ id: string }>(`select id from public.lots where bien_id=$1`, [bien]);
  await db.query("reset role");
  const {
    rows: [{ id: loc }],
  } = await db.query<{ id: string }>(
    `insert into public.persons (organization_id, nom) values ($1,'Locataire') returning id`,
    [org]
  );
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges,
                              etat, date_debut, jour_echeance)
     values ($1,$2,$3,700,50,'actif',
             (date_trunc('month', current_date) - make_interval(months => $4::int))::date, 1)
     returning id`,
    [org, lot, loc, moisEnArriere]
  );
  return id;
}

async function appels(bail: string): Promise<{ total: number; echus: number }> {
  const {
    rows: [r],
  } = await db.query<{ total: string; echus: string }>(
    `select count(*)::text as total,
            count(*) filter (where date_echeance < current_date)::text as echus
     from public.appels_loyer where bail_id=$1`,
    [bail]
  );
  return { total: Number(r.total), echus: Number(r.echus) };
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

/**
 * Suspendre une organisation passe par un super admin : `organizations` porte
 * son propre verrou (seul lui touche au statut, au type et à l'essai).
 */
async function suspendre(org: string) {
  await db.query("reset role");
  const sa = await creerUtilisateur();
  // Un super admin n'appartient à aucune organisation (contrainte
  // memberships_super_admin_sans_org) : c'est ce qui en fait un rôle de
  // plateforme et non d'agence.
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
    [sa]
  );
  await simuler(sa);
  await db.query(
    `update public.organizations set status='suspendue'::public.organization_status where id=$1`,
    [org]
  );
  await db.query("reset role");
}

describe.skipIf(!DB_URL)("le cycle mensuel", () => {
  async function organisation(statut = "active"): Promise<[string, string]> {
    await db.query("reset role");
    const {
      rows: [{ id: org }],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status) values ('Cycle', $1::public.organization_status) returning id`,
      [statut]
    );
    const gerant = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    return [org, gerant];
  }

  it("génère les appels du mois sans qu'un gérant ait cliqué", async () => {
    const [org, gerant] = await organisation();
    const bail = await bailActif(org, gerant, 3);

    await simuler(null, "postgres");
    const {
      rows: [{ cycle_mensuel_interne: bilan }],
    } = await db.query<{ cycle_mensuel_interne: { baux: number; appels_crees: number } }>(
      `select public.cycle_mensuel_interne()`
    );
    expect(bilan.baux).toBe(1);
    // Le mois de début, les mois intermédiaires, et le mois courant.
    expect(bilan.appels_crees).toBe(4);
    expect((await appels(bail)).total).toBe(4);

    // Idempotence : le cron peut repasser, il ne double rien.
    const {
      rows: [{ cycle_mensuel_interne: second }],
    } = await db.query<{ cycle_mensuel_interne: { appels_crees: number } }>(
      `select public.cycle_mensuel_interne()`
    );
    expect(second.appels_crees).toBe(0);
    expect((await appels(bail)).total).toBe(4);
  });

  it("laisse la trace de son passage, même quand il n'a rien à faire", async () => {
    // Sans journal, « le cycle n'a pas tourné » et « le cycle n'avait rien à
    // faire » se ressemblent — et on ne sait pas lequel des deux on regarde.
    await simuler(null, "postgres");
    await db.query(`select public.cycle_mensuel_interne()`);
    const {
      rows: [t],
    } = await db.query<{ details: { baux: number; echecs: number } }>(
      `select details from public.tech_log where evenement='cycle_mensuel' order by created_at desc limit 1`
    );
    expect(t.details).toHaveProperty("baux");
    expect(t.details.echecs).toBe(0);
  });

  it("ne sert pas une organisation suspendue", async () => {
    // Générer le mois de gestion d'un client qui ne paie plus reviendrait à le
    // lui offrir. Ses données restent lisibles ; elles ne s'enrichissent plus.
    const [orgA, gerantA] = await organisation("active");
    const bailA = await bailActif(orgA, gerantA, 1);
    const [orgB, gerantB] = await organisation("active");
    const bailB = await bailActif(orgB, gerantB, 1);
    await suspendre(orgB);

    await simuler(null, "postgres");
    await db.query(`select public.cycle_mensuel_interne()`);
    expect((await appels(bailA)).total).toBe(2);
    expect((await appels(bailB)).total).toBe(0);
  });

  it("un bail en défaut n'emporte pas le mois des autres", async () => {
    const [org, gerant] = await organisation();
    const bon = await bailActif(org, gerant, 1);
    const casse = await bailActif(org, gerant, 1);

    // On simule une défaillance imprévue sur UN bail — la sorte d'incident que
    // le filtre de la boucle ne peut pas anticiper. Sans le rattrapage
    // d'erreur, elle emporterait la transaction, donc le mois de TOUS les
    // clients : un seul dossier bancal et personne n'est quittancé.
    await db.query("reset role");
    await db.query(`
      create or replace function pg_temp.casser() returns trigger language plpgsql as $$
      begin
        if new.bail_id = current_setting('gerimmo.test_casse')::uuid then
          raise exception 'défaillance simulée';
        end if;
        return new;
      end $$`);
    await db.query(`select set_config('gerimmo.test_casse', $1, true)`, [casse]);
    await db.query(`create trigger zzz_casse before insert on public.appels_loyer
                    for each row execute function pg_temp.casser()`);

    await simuler(null, "postgres");
    const {
      rows: [{ cycle_mensuel_interne: bilan }],
    } = await db.query<{
      cycle_mensuel_interne: { baux: number; echecs: { bail_id: string; erreur: string }[] };
    }>(`select public.cycle_mensuel_interne()`);

    expect(bilan.baux).toBe(2);
    expect(bilan.echecs.length).toBe(1);
    expect(bilan.echecs[0].bail_id).toBe(casse);
    expect(bilan.echecs[0].erreur).toMatch(/défaillance simulée/);
    // L'autre bail a bien reçu son mois.
    expect((await appels(bon)).total).toBe(2);
    expect((await appels(casse)).total).toBe(0);

    // Et l'échec est au journal technique, pas seulement dans la valeur de
    // retour que personne ne lit quand c'est le cron qui appelle.
    await db.query("reset role");
    const {
      rows: [t],
    } = await db.query<{ details: { echecs: number } }>(
      `select details from public.tech_log where evenement='cycle_mensuel' order by created_at desc limit 1`
    );
    expect(t.details.echecs).toBe(1);
  });
});

describe.skipIf(!DB_URL)("qui a le droit de déclencher", () => {
  it("la porte publique garde son contrôle de rôle après la refonte", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: org }],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status) values ('Porte','active') returning id`
    );
    const gerant = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const bail = await bailActif(org, gerant, 1);
    const etranger = await creerUtilisateur();

    await simuler(etranger);
    await db.query("savepoint e");
    await expect(db.query(`select public.generer_appels_loyer($1)`, [bail])).rejects.toThrow(
      /Accès refusé/
    );
    await db.query("rollback to savepoint e");

    // Le gérant, lui, passe toujours.
    await simuler(gerant);
    const {
      rows: [{ generer_appels_loyer: n }],
    } = await db.query<{ generer_appels_loyer: number }>(
      `select public.generer_appels_loyer($1)`,
      [bail]
    );
    expect(Number(n)).toBe(2);
  });

  it("les fonctions internes ne sont pas exécutables par un compte", async () => {
    // Elles ne vérifient RIEN : exposées, elles laisseraient créer des appels
    // ou lire l'état d'impayé de n'importe quel bail à partir de son seul
    // identifiant (invariant posé par l'audit du 10/09).
    const {
      rows: [r],
    } = await db.query<Record<string, boolean>>(`
      select has_function_privilege('authenticated', 'public.generer_appels_loyer_interne(uuid)', 'execute') as interne,
             has_function_privilege('authenticated', 'public.suivre_impayes_bail(uuid)', 'execute') as suivi,
             has_function_privilege('authenticated', 'public.cycle_mensuel_interne()', 'execute') as cycle,
             has_function_privilege('authenticated', 'public.generer_alertes_impayes()', 'execute') as impayes,
             has_function_privilege('anon', 'public.cycle_mensuel_interne()', 'execute') as anon_cycle`);
    expect(r).toEqual({ interne: false, suivi: false, cycle: false, impayes: false, anon_cycle: false });
  });

  it("un compte connecté ne déclenche pas le cycle, même s'il a le droit d'appeler", async () => {
    // Ceinture et bretelles. La révocation ci-dessus arrête déjà tout compte
    // applicatif ; elle peut être défaite par un GRANT malheureux. Le contrôle
    // DANS LE CORPS, lui, tient quel que soit le droit d'appel — on le vérifie
    // donc depuis un rôle qui a ce droit, avec une identité posée.
    const gerant = await creerUtilisateur();
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [gerant]
    );
    await db.query("savepoint e");
    await expect(db.query(`select public.cycle_mensuel_interne()`)).rejects.toThrow(
      /reserve au cron/
    );
    await db.query("rollback to savepoint e");
    await db.query("savepoint e2");
    await expect(db.query(`select public.generer_alertes_impayes()`)).rejects.toThrow(
      /reserve au cron/
    );
    await db.query("rollback to savepoint e2");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  });
});

describe.skipIf(!DB_URL)("l'impayé se constate tout seul", () => {
  let org: string;
  let gerant: string;

  beforeEach(async () => {
    await db.query("reset role");
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status) values ('Impayés','active') returning id`
    );
    org = id;
    gerant = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
  });

  async function alerteImpayee(bail: string) {
    await db.query("reset role");
    const {
      rows: [a],
    } = await db.query<{
      statut: string;
      criticite: string;
      titre: string;
      seuil: string;
      origine_type: string | null;
      origine_id: string | null;
      closed_action: string | null;
    }>(
      `select statut, criticite::text, titre, details->>'seuil' as seuil,
              origine_type, origine_id, closed_action
       from public.alerts where type='loyer_impaye' and details->>'bail_id'=$1
       order by created_at desc limit 1`,
      [bail]
    );
    return a;
  }

  it("pose UNE alerte par bail, rattachée au bail, et la ferme quand c'est soldé", async () => {
    const bail = await bailActif(org, gerant, 2);
    await simuler(null, "postgres");
    await db.query(`select public.cycle_mensuel_interne()`);
    const { echus } = await appels(bail);
    expect(echus).toBeGreaterThan(0);

    const {
      rows: [{ generer_alertes_impayes: posees }],
    } = await db.query<{ generer_alertes_impayes: number }>(
      `select public.generer_alertes_impayes()`
    );
    expect(Number(posees)).toBe(1);

    const a = await alerteImpayee(bail);
    expect(a.statut).toBe("ouverte");
    expect(a.seuil).toBe(String(echus));
    // Rattachée à son bail : c'est ce qui lui permet de se fermer toute seule.
    expect(a.origine_type).toBe("bail");
    expect(a.origine_id).toBe(bail);
    // Le titre dit le montant et depuis quand, en clair.
    expect(a.titre).toMatch(/Loyer impayé — Locataire/);
    expect(a.titre).toMatch(/€ dus depuis le \d{2}\/\d{2}\/\d{4}/);

    // Deuxième passage : rien de neuf, l'alerte ne se duplique pas.
    await simuler(null, "postgres");
    const {
      rows: [{ generer_alertes_impayes: seconde }],
    } = await db.query<{ generer_alertes_impayes: number }>(
      `select public.generer_alertes_impayes()`
    );
    expect(Number(seconde)).toBe(0);

    // Le locataire paie tout : l'alerte se ferme, avec son motif, et reste
    // à l'historique.
    await simuler(gerant);
    const {
      rows: [{ du }],
    } = await db.query<{ du: string }>(
      `select sum(montant_du)::text as du from public.appels_loyer where bail_id=$1`,
      [bail]
    );
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,$3::numeric, current_date)`,
      [org, bail, du]
    );
    await simuler(null, "postgres");
    await db.query(`select public.generer_alertes_impayes()`);
    const fermee = await alerteImpayee(bail);
    expect(fermee.statut).toBe("fermee");
    expect(fermee.closed_action).toBe("Impayé soldé");
  });

  it("deux termes dus passent la criticité à critique, et le seuil suit la dette", async () => {
    const bail = await bailActif(org, gerant, 2);
    await simuler(null, "postgres");
    await db.query(`select public.cycle_mensuel_interne()`);
    await db.query(`select public.generer_alertes_impayes()`);
    const a = await alerteImpayee(bail);
    expect(Number(a.seuil)).toBeGreaterThanOrEqual(2);
    expect(a.criticite).toBe("critique");

    // Le locataire règle tout sauf un terme : la dette baisse, l'alerte le dit
    // sans se rouvrir ailleurs.
    await simuler(gerant);
    const {
      rows: [{ du }],
    } = await db.query<{ du: string }>(
      `select (sum(montant_du) - 750)::text as du from public.appels_loyer where bail_id=$1`,
      [bail]
    );
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,$3::numeric, current_date)`,
      [org, bail, du]
    );
    await simuler(null, "postgres");
    await db.query(`select public.generer_alertes_impayes()`);
    const apres = await alerteImpayee(bail);
    expect(apres.statut).toBe("ouverte");
    expect(Number(apres.seuil)).toBe(1);
    expect(apres.criticite).toBe("normale");
  });

  it("ne relance pas : il n'invente aucun délai que l'agence n'a pas fixé", async () => {
    // Le wiki (« Relances et mise en demeure », cible V3) veut un montant
    // plancher et trois délais PARAMÉTRÉS PAR AGENCE. Tant que ce paramétrage
    // n'existe pas, la tâche constate et s'arrête là : écrire une relance,
    // c'est poser un acte qui fonde ensuite un recours.
    const bail = await bailActif(org, gerant, 2);
    await simuler(null, "postgres");
    await db.query(`select public.cycle_mensuel_interne()`);
    await db.query(`select public.generer_alertes_impayes()`);
    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.relances where bail_id=$1`,
      [bail]
    );
    expect(n).toBe("0");
  });
});
