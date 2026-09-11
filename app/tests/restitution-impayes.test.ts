/**
 * Tests d'intégration — Restitution : les impayés sont un INSTANTANÉ daté.
 *
 * Le décompte fige le dépôt encaissé et les impayés au démarrage, puis
 * `finaliser_decompte` calcule le solde sur cet instantané. Entre les deux, le
 * locataire règle souvent son arriéré — précisément parce qu'on le lui réclame
 * pour qu'il récupère son dépôt. À quelle DATE les impayés doivent être arrêtés
 * n'est tranché par aucune règle du wiki (point à trancher, humain) : on ne le
 * décide donc pas ici. Ce qui est vérifié, c'est ce qui est indiscutable —
 * l'instantané est daté, et le gérant peut le réarrêter tant que le décompte
 * n'est pas figé (RM-2.7.3).
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-ri-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
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

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Restitution — instantané des impayés, daté et réarrêtable", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
  let proprietaire: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('CC Restit impayés','active') returning id`
    );
    orgA = org;
    gerant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Prop")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Un bail nu à 900 € HC : le dépôt d'un mois y tient (plafond RM-2.1.1).
  async function bailPret(): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue des Impayés','appartement'::public.bien_type,
        '12 rue des Impayés',null,'75011','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc)
       values ($1,$2,$3,900,900) returning id`,
      [orgA, lot, locataire]
    );
    await db.query(`select public.encaisser_depot($1,900,current_date,'virement',null,null)`, [bail]);
    // EDL d'entrée signé, sinon les retenues sont bloquées (RM-2.4.3)
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    return bail;
  }

  // 800 € appelés (les appels naissent hors RLS, comme le cron), 500 € encaissés
  async function arriereDe300(bail: string): Promise<void> {
    await db.query("reset role");
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, montant_du, date_echeance)
       values ($1,$2,current_date,800,current_date)`,
      [orgA, bail]
    );
    await simuler(db, gerant);
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,500,current_date)`,
      [orgA, bail]
    );
  }

  async function reglerLeSolde(bail: string, montant: number): Promise<void> {
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,$3,current_date)`,
      [orgA, bail, montant]
    );
  }

  it("le démarrage date son instantané, et la lecture à jour dit la réalité du moment", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);

    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    const {
      rows: [avant],
    } = await db.query(
      `select depot, impayes, montants_arretes_le from public.restitutions where id=$1`,
      [rst]
    );
    expect(Number(avant.impayes)).toBe(300);
    // La date d'arrêté est renseignée : l'écran ne peut plus afficher un
    // chiffre figé sans dire depuis quand il l'est.
    expect(avant.montants_arretes_le).not.toBeNull();

    // Le locataire règle son arriéré pour récupérer son dépôt
    await reglerLeSolde(bail, 300);

    // L'instantané ne bouge pas tout seul (aucune règle ne dit qu'il le doit)…
    const {
      rows: [apres],
    } = await db.query(`select impayes, montants_arretes_le from public.restitutions where id=$1`, [rst]);
    expect(Number(apres.impayes)).toBe(300);
    expect(apres.montants_arretes_le).toEqual(avant.montants_arretes_le);

    // …mais la réalité du moment est lisible, pour que l'écran signale l'écart
    const {
      rows: [reel],
    } = await db.query(`select depot, impayes from public.montants_restitution_a_jour($1)`, [bail]);
    expect(Number(reel.impayes)).toBe(0);
    expect(Number(reel.depot)).toBe(900);
  });

  it("réarrêter les montants rend le dépôt entier au locataire qui a soldé sa dette", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);

    // Le défaut : sans réarrêté, le décompte impute une dette déjà soldée et
    // ne rend que 600 € sur 900 €.
    await reglerLeSolde(bail, 300);
    const {
      rows: [{ impayes }],
    } = await db.query(`select public.rafraichir_montants_restitution($1) as impayes`, [rst]);
    expect(Number(impayes)).toBe(0);

    const {
      rows: [r],
    } = await db.query(
      `select depot, impayes, montants_arretes_le from public.restitutions where id=$1`,
      [rst]
    );
    expect(Number(r.impayes)).toBe(0);
    expect(Number(r.depot)).toBe(900);

    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBe(900);
  });

  it("le réarrêté suit la réalité dans les deux sens : un impayé né après le démarrage s'impute", async () => {
    const bail = await bailPret();
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    const {
      rows: [depart],
    } = await db.query(`select impayes from public.restitutions where id=$1`, [rst]);
    expect(Number(depart.impayes)).toBe(0);

    // Dernier mois appelé après coup, jamais réglé
    await arriereDe300(bail);
    const {
      rows: [{ impayes }],
    } = await db.query(`select public.rafraichir_montants_restitution($1) as impayes`, [rst]);
    expect(Number(impayes)).toBe(300);

    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBe(600);
  });

  it("le réarrêté redate l'instantané : la date dite à l'écran suit les montants", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);

    // `now()` vaut l'heure d'OUVERTURE de la transaction : deux appels dans le
    // même test rendent la même valeur. Sans reculer la date à la main, aucun
    // test en transaction ne peut voir qu'un réarrêté l'avance — et la ligne
    // `montants_arretes_le = now()` pourrait disparaître sans que rien ne
    // tombe. On la recule donc, puis on regarde si le réarrêté la ramène.
    await db.query("reset role");
    await db.query(
      `update public.restitutions set montants_arretes_le = now() - interval '3 days' where id=$1`,
      [rst]
    );
    const {
      rows: [{ montants_arretes_le: recule }],
    } = await db.query(`select montants_arretes_le from public.restitutions where id=$1`, [rst]);
    await simuler(db, gerant);

    await reglerLeSolde(bail, 300);
    await db.query(`select public.rafraichir_montants_restitution($1)`, [rst]);

    const {
      rows: [apres],
    } = await db.query(`select impayes, montants_arretes_le from public.restitutions where id=$1`, [
      rst,
    ]);
    expect(Number(apres.impayes)).toBe(0);
    // Des montants neufs sous une vieille date, c'est le piège de ce lot à
    // l'envers : l'agent croirait le chiffre périmé alors qu'il vient d'être
    // arrêté, et le réarrêterait en boucle sans jamais faire taire le bandeau.
    expect(new Date(apres.montants_arretes_le).getTime()).toBeGreaterThan(
      new Date(recule).getTime()
    );
  });

  it("décompte figé : le réarrêté est refusé (RM-2.7.3, la correction est un rectificatif)", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    await db.query(`select public.finaliser_decompte($1)`, [rst]);

    await reglerLeSolde(bail, 300);
    await attendreEchec(db, /rectificatif/, `select public.rafraichir_montants_restitution($1)`, [rst]);
    const {
      rows: [fige],
    } = await db.query(`select impayes, solde from public.restitutions where id=$1`, [rst]);
    expect(Number(fige.impayes)).toBe(300);
    expect(Number(fige.solde)).toBe(600);
  });

  it("le geste légitime passe toujours : retenue décotée puis finalisation sur l'instantané du démarrage", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);

    // Peinture : 900 € neuf, durée 7 ans, âge 3 → 900 × 4/7 = 514,29 (RM-2.4.4)
    const {
      rows: [{ montant }],
    } = await db.query(`select public.ajouter_retenue($1,'Peinture séjour',900,7,3,null) as montant`, [rst]);
    expect(Number(montant)).toBeCloseTo(514.29, 2);

    // Impayés imputés AVANT les dégradations (RM-2.4.7) : 900 − 300 − 514,29
    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBeCloseTo(85.71, 2);
    const {
      rows: [st],
    } = await db.query(`select statut from public.restitutions where id=$1`, [rst]);
    expect(st.statut).toBe("finalise");
  });

  it("une agence ne lit ni ne réarrête les montants d'un bail qui n'est pas le sien", async () => {
    const bail = await bailPret();
    await arriereDe300(bail);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);

    await db.query("reset role");
    const intrus = await creerUtilisateur(db);
    const {
      rows: [{ id: orgB }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('CC Autre agence','active') returning id`
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [intrus, orgB]
    );
    await simuler(db, intrus);

    const vide = await db.query(`select * from public.montants_restitution_a_jour($1)`, [bail]);
    expect(vide.rows).toHaveLength(0);
    await attendreEchec(db, /Accès refusé/, `select public.rafraichir_montants_restitution($1)`, [rst]);
  });
});

/**
 * Le réarrêté et la finalisation ne peuvent plus se croiser.
 *
 * Les deux gestes se touchent à l'écran : le bandeau d'écart porte
 * « Réarrêter les montants à aujourd'hui », « Finaliser le décompte » est juste
 * en dessous, et ce sont deux formulaires distincts — donc deux requêtes, donc
 * deux transactions. Tant que le réarrêté lisait `statut` sans verrou, la
 * finalisation pouvait passer entre sa lecture et son écriture : l'UPDATE
 * bloqué reprenait la version fraîche de la ligne et s'appliquait quand même,
 * sur un décompte figé. La ligne ne s'additionnait plus (900 − 0 ≠ 600) et le
 * PDF comme l'espace locataire faisaient disparaître 300 € sans imputation.
 *
 * Une course a besoin de DEUX sessions, donc de données VALIDÉES : ce bloc ne
 * peut pas vivre dans la transaction annulée des autres. Il reprend ses lignes
 * une à une à la fin.
 */
describe.skipIf(!DB_URL)("Restitution — réarrêté et finalisation ne se croisent plus", () => {
  let semeur: Client;
  let sessionA: Client;
  let sessionB: Client;
  let org: string | null = null;
  let compte: string | null = null;
  let restitution: string;

  const nomOrg = `Course restitution ${crypto.randomUUID()}`;

  async function porterLesClaims(c: Client, u: string) {
    await c.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, false)`,
      [u]
    );
  }

  beforeAll(async () => {
    semeur = new Client({ connectionString: DB_URL });
    sessionA = new Client({ connectionString: DB_URL });
    sessionB = new Client({ connectionString: DB_URL });
    await semeur.connect();
    await sessionA.connect();
    await sessionB.connect();

    const {
      rows: [o],
    } = await semeur.query(
      `insert into public.organizations (name, status) values ($1,'active') returning id`,
      [nomOrg]
    );
    org = o.id;
    compte = await creerUtilisateur(semeur);
    await semeur.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [compte, org]
    );
    await porterLesClaims(semeur, compte!);
    const {
      rows: [p],
    } = await semeur.query(
      `insert into public.persons (organization_id, nom) values ($1,'Loc course') returning id`,
      [org]
    );
    const {
      rows: [{ id: bien }],
    } = await semeur.query(
      `select public.creer_bien_avec_lot($1,'3 rue de la Course','appartement'::public.bien_type,
        '3 rue de la Course',null,'75011','Paris',1990,false,45,2) as id`,
      [org]
    );
    const {
      rows: [{ id: lot }],
    } = await semeur.query(`select id from public.lots where bien_id=$1`, [bien]);
    const {
      rows: [{ id: bail }],
    } = await semeur.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc)
       values ($1,$2,$3,900,900) returning id`,
      [org, lot, p.id]
    );
    await semeur.query(`select public.encaisser_depot($1,900,current_date,'virement',null,null)`, [bail]);
    await semeur.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, montant_du, date_echeance)
       values ($1,$2,current_date,800,current_date)`,
      [org, bail]
    );
    await semeur.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,500,current_date)`,
      [org, bail]
    );
    const {
      rows: [r],
    } = await semeur.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    restitution = r.id;
    // Le locataire solde ses 300 € : la réalité dit désormais 0 € d'impayés
    await semeur.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,300,current_date)`,
      [org, bail]
    );
    await porterLesClaims(sessionA, compte!);
    await porterLesClaims(sessionB, compte!);
  });

  afterAll(async () => {
    for (const c of [sessionA, sessionB]) {
      try {
        await c?.query("rollback");
      } catch {
        /* la session n'était pas en transaction */
      }
    }
    if (semeur && org) {
      // Les clés étrangères sont neutralisées le temps du ménage : sinon il
      // faudrait deviner l'ordre exact des tables, qui changera au prochain
      // sprint. Tout ce que ce bloc a écrit porte l'organisation.
      await semeur.query("set session_replication_role = replica");
      const { rows: tables } = await semeur.query(`
        select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
        where n.nspname = 'public' and c.relkind = 'r'`);
      for (const t of tables) {
        await semeur.query(`delete from public."${t.relname}" where organization_id = $1`, [org]);
      }
      await semeur.query("set session_replication_role = origin");
      await semeur.query(`delete from public.organizations where id = $1`, [org]);
      if (compte) await semeur.query(`delete from auth.users where id = $1`, [compte]);
    }
    await semeur?.end();
    await sessionA?.end();
    await sessionB?.end();
  });

  it("une finalisation qui passe pendant un réarrêté laisse le décompte figé intact (RM-2.7.3)", async () => {
    const {
      rows: [{ pg_backend_pid: pidA }],
    } = await sessionA.query(`select pg_backend_pid()`);

    // B tient la ligne sans rien décider encore : c'est le créneau pendant
    // lequel A lisait « en_cours » puis écrivait quand même.
    await sessionB.query("begin");
    await sessionB.query(`select * from public.restitutions where id=$1 for update`, [restitution]);

    await sessionA.query("begin");
    const reponseA = sessionA
      .query(`select public.rafraichir_montants_restitution($1) as impayes`, [restitution])
      .then(
        (r) => ({ impayes: Number(r.rows[0].impayes) }),
        (e: Error) => ({ erreur: e.message })
      );

    // On attend que A soit RÉELLEMENT en attente du verrou, plutôt que de
    // dormir au hasard : un test de course qui se joue sur une temporisation
    // devient rouge le jour où la machine est chargée.
    const bloque = await (async () => {
      for (let i = 0; i < 100; i++) {
        const { rows } = await semeur.query(
          `select count(*)::int as n from pg_stat_activity
            where pid = $1 and wait_event_type = 'Lock'`,
          [pidA]
        );
        if (rows[0].n === 1) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    })();
    expect(bloque, "le réarrêté aurait dû attendre le verrou de la ligne").toBe(true);

    const {
      rows: [{ solde }],
    } = await sessionB.query(`select public.finaliser_decompte($1) as solde`, [restitution]);
    expect(Number(solde)).toBe(600);
    await sessionB.query("commit");

    const a = await reponseA;
    await sessionA.query("rollback");
    // Le décompte est figé : le réarrêté qui attendait doit le VOIR et refuser.
    expect("erreur" in a ? a.erreur : `réarrêté accepté (${JSON.stringify(a)})`).toMatch(
      /rectificatif/
    );

    const {
      rows: [fin],
    } = await semeur.query(
      `select statut, depot, impayes, solde from public.restitutions where id=$1`,
      [restitution]
    );
    expect(fin.statut).toBe("finalise");
    expect(Number(fin.impayes)).toBe(300);
    // Un décompte figé s'additionne : dépôt − impayés − retenues = solde.
    expect(Number(fin.depot) - Number(fin.impayes)).toBe(Number(fin.solde));
  }, 20000);
});

// La base peut bien dater son instantané : si l'écran ne le dit pas, l'agent
// finalise toujours sur un chiffre dont il ignore l'âge. Et « Finaliser » FIGE
// le décompte (RM-2.7.3) — un geste irréversible se confirme, comme la
// signature d'un EDL de sortie ou la suppression d'une détention. Ces deux
// garde-fous vivent dans le JSX : on lit la source pour que le retour en
// arrière se voie.
describe("Écran de restitution — le figé se dit, l'irréversible se confirme", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx"),
    "utf8"
  );

  it("affiche la date d'arrêté des montants et propose de les réarrêter", () => {
    expect(source).toContain("montants_arretes_le");
    expect(source).toContain("arrêtés le");
    expect(source).toContain("rafraichirMontantsRestitution");
  });

  it("ne finalise plus sur un simple clic : la confirmation passe par la modale", () => {
    const debut = source.indexOf("function BoutonFinaliser");
    expect(debut).toBeGreaterThan(-1);
    const bouton = source.slice(debut);
    expect(bouton).toContain("<Modale");
    // BoutonEnvoi soumet le formulaire au premier clic — c'était le défaut.
    expect(bouton).not.toContain("BoutonEnvoi");
    // La modale annonce ce qui est figé, sinon confirmer ne veut rien dire.
    expect(bouton).toContain("rectificatif");
  });
});
