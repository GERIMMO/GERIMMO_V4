/**
 * Lot « fuseau-suite » (décisions du dirigeant du 15/10/2026, points 1 et 2) : le dépôt de garantie, le journal comptable,
 * la révision IRL, le terme du bail, la régularisation des charges et le rapport de gestion datent « aujourd'hui » du jour
 * de Paris, comme les loyers depuis le lot « fuseau-paris ».
 *
 * LE DÉFAUT. Ces objets lisaient `current_date` (ou `now()` pour le mois du rapport automatique), le jour du fuseau de la
 * SESSION (UTC chez Supabase). Entre minuit et 1 h (hiver) ou 2 h (été) à Paris, la base était encore la veille : une révision
 * IRL datée d'aujourd'hui était refusée comme « datée de demain », un dépôt encaissé sans date et sa pièce comptable étaient
 * datés de la veille, le 1er janvier une régularisation n'était pas encore « tardive », etc.
 *
 * COMMENT ON LE TESTE SANS DÉPENDRE DE L'HEURE DE LA MACHINE (même méthode que tests/jour-de-paris-loyers.test.ts).
 *  - INSTANTS FIXES : `aujourdhui_paris()` reçoit, le temps de la transaction, son propre corps où l'horloge `now()` est remplacée
 *    par un instant donné. La conversion à Paris est donc celle de la base ; on vérifie la bascule de minuit en heure d'été
 *    (22 h 30 UTC = 00 h 30 à Paris, le lendemain) et en heure d'hiver (23 h 30 UTC = 00 h 30 à Paris, le lendemain), et la veille
 *    (une heure plus tôt : encore le même jour à Paris). La session est en UTC, comme chez Supabase. Un objet qui lirait encore
 *    `current_date` donnerait le jour réel de la machine, jamais ces dates-là.
 *  - FUSEAU DE SESSION : l'horloge réelle, avec un fuseau de session choisi pour que `current_date` soit la veille du jour de Paris
 *    (comme à 23 h 30 UTC), le même jour, ou le lendemain.
 * Dans tous les cas, chaque objet doit donner le jour de Paris.
 *
 * Nécessite SUPABASE_DB_URL. Tout est joué dans une transaction annulée à la fin de chaque essai.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

type Temps =
  | { nom: string; mode: "instant"; instant: string; jour: string }
  | { nom: string; mode: "session"; ecart: -1 | 0 | 1 };

const TEMPS: Temps[] = [
  { nom: "heure d'été, 22 h 30 UTC le 31 juillet = 00 h 30 à Paris le 1er août", mode: "instant", instant: "2026-07-31 22:30:00+00", jour: "2026-08-01" },
  { nom: "heure d'été, 21 h 30 UTC le 31 juillet = 23 h 30 à Paris, encore le 31", mode: "instant", instant: "2026-07-31 21:30:00+00", jour: "2026-07-31" },
  { nom: "heure d'hiver, 23 h 30 UTC le 31 décembre = 00 h 30 à Paris le 1er janvier", mode: "instant", instant: "2026-12-31 23:30:00+00", jour: "2027-01-01" },
  { nom: "heure d'hiver, 22 h 30 UTC le 31 décembre = 23 h 30 à Paris, encore le 31", mode: "instant", instant: "2026-12-31 22:30:00+00", jour: "2026-12-31" },
  { nom: "horloge réelle, session en retard d'un jour sur Paris (comme à 23 h 30 UTC)", mode: "session", ecart: -1 },
  { nom: "horloge réelle, session au même jour que Paris", mode: "session", ecart: 0 },
  { nom: "horloge réelle, session en avance d'un jour sur Paris", mode: "session", ecart: 1 },
];

let db: Client;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-fs-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

/** Agit sous un rôle, avec ou sans compte (service_role : le traitement automatique). */
async function agir(compte: string | null, role: "authenticated" | "service_role" | "postgres" = "authenticated") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    compte || role !== "postgres" ? JSON.stringify({ sub: compte, role, aal: "aal2" }) : "",
  ]);
  if (role !== "postgres") await db.query(`set local role ${role}`);
}

/** Le jour de Paris de l'horloge réelle, calculé SANS la fonction de la base. */
async function parisHorloge(): Promise<string> {
  const {
    rows: [{ p }],
  } = await db.query<{ p: string }>("select (now() at time zone 'Europe/Paris')::date::text as p");
  return p;
}

/** Fuseau POSIX de décalage `h` heures par rapport à UTC (positif à l'est). */
function fuseauPosix(h: number): string {
  if (h === 0) return "UTC";
  return h > 0 ? `<+${h}>-${h}` : `<-${-h}>${-h}`;
}

/** Le jour de Paris attendu dans ce « temps ». */
async function jourDuTemps(t: Temps): Promise<string> {
  return t.mode === "instant" ? t.jour : parisHorloge();
}

/** Met la session dans le « temps » voulu. Sans effet sur l'horloge réelle. */
async function activerTemps(t: Temps, jour: string): Promise<void> {
  await db.query("reset role");
  if (t.mode === "instant") {
    // Le corps de la base, l'horloge remplacée par l'instant : la conversion (heure d'été, heure d'hiver) est celle de la base.
    const {
      rows: [{ corps }],
    } = await db.query<{ corps: string }>("select prosrc as corps from pg_proc where oid = 'public.aujourdhui_paris()'::regprocedure");
    expect(corps, "aujourdhui_paris() doit lire l'horloge par now()").toMatch(/\bnow\(\)/i);
    const fige = corps.replace(/\bnow\(\)/gi, `timestamptz '${t.instant}'`);
    await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path to '' as $f$ ${fige} $f$`);
    await db.query("select set_config('TimeZone', 'UTC', true)");
    const {
      rows: [{ j }],
    } = await db.query<{ j: string }>("select public.aujourdhui_paris()::text as j");
    expect(j, `à ${t.instant}, Paris doit être le ${t.jour}`).toBe(t.jour);
    return;
  }
  const {
    rows: [{ h }],
  } = await db.query<{ h: number }>(
    // Jusqu'à ±48 h : entre minuit et 2 h à Paris, une session « en avance d'un jour sur Paris » demande plus de 24 h
    // d'avance sur UTC (fuseau fictif que PostgreSQL accepte, `<+26>-26` par exemple) ; ±24 h échouait à ces heures-là.
    `select h from generate_series(-48, 48) h
      where ((now() at time zone 'UTC') + h * interval '1 hour')::date = ($1::date + $2::int)
      order by abs(h), h limit 1`,
    [jour, t.ecart]
  );
  await db.query("select set_config('TimeZone', $1, true)", [fuseauPosix(h)]);
  const {
    rows: [{ j, attendu }],
  } = await db.query<{ j: string; attendu: string }>("select current_date::text as j, ($1::date + $2::int)::text as attendu", [jour, t.ecart]);
  expect(j, "le fuseau de session simulé ne donne pas le jour voulu").toBe(attendu);
}

type Monde = {
  jour: string;
  org: string;
  gerant: string;
  lotA: string;
  bailA: string;
  bailB: string;
  bailC: string;
  mandatA: string;
};

/** Un mandat actif depuis longtemps sur le lot (déclencheurs suspendus le temps d'écrire). Rend son identifiant. */
async function couvrir(lot: string): Promise<string> {
  await db.query("reset role");
  await db.query("set session_replication_role = replica");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `with l as (select id, organization_id from public.lots where id = $1),
          p as (insert into public.persons (organization_id, nom, prenom, email) select organization_id, 'Mandant', 'Banc', 'mandant-' || gen_random_uuid() || '@exemple.fr' from l returning id, organization_id),
          m as (insert into public.mandats (organization_id, person_id, etat, date_debut) select organization_id, id, 'actif', date '2000-01-01' from p returning id, organization_id),
          ml as (insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut) select m.organization_id, m.id, l.id, date '2000-01-01' from m cross join l)
     select id from m`,
    [lot]
  );
  await db.query("set session_replication_role = origin");
  return id;
}

/**
 * Trois logements, chacun sous mandat, et trois baux meublés :
 *  - A : débuté un an jour pour jour avant le jour de Paris (date anniversaire de révision le jour même ; premier terme la veille),
 *        dépôt de garantie de 700 €, indice de référence T2 2025 ;
 *  - B : débuté un an moins un jour avant (premier terme le jour même) ;
 *  - C : débuté trois ans avant, charges en provision (régularisation).
 */
async function monter(jour: string): Promise<Monde> {
  await agir(null, "postgres");
  const {
    rows: [{ id: org }],
  } = await db.query<{ id: string }>("insert into public.organizations (name, status) values ('Fuseau, la suite', 'active') returning id");
  const gerant = await creerUtilisateur();
  await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')", [gerant, org]);
  const lots: string[] = [];
  for (const rue of ["1 rue de la Suite", "2 rue de la Suite", "3 rue de la Suite"]) {
    await agir(gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query<{ id: string }>(
      `select public.creer_bien_avec_lot($1,$2,'appartement'::public.bien_type,$2,null,'75003','Paris',1990,false,40,2) as id`,
      [org, rue]
    );
    await agir(null, "postgres");
    lots.push((await db.query<{ id: string }>("select id from public.lots where bien_id = $1", [bien])).rows[0].id);
  }
  const [lotA, lotB, lotC] = lots;
  await db.query("update public.lots set meuble = true where id = any($1::uuid[])", [lots]);
  const {
    rows: [{ id: locataire }],
  } = await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom, email) values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id", [org]);
  const bail = async (lot: string, debut: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, depot_garantie, etat, date_debut, jour_echeance,
                                  type, revision_irl, irl_valeur, irl_trimestre, charges_mode)
         values ($1,$2,$3,700,50,700,'actif', ${debut}, 1, 'meuble', true, 140, 'T2 2025', 'provision') returning id`,
        [org, lot, locataire, jour]
      )
    ).rows[0].id;
  const bailA = await bail(lotA, "($4::date - interval '1 year')::date");
  const bailB = await bail(lotB, "($4::date + 1 - interval '1 year')::date");
  const bailC = await bail(lotC, "($4::date - interval '3 years')::date");
  const mandatA = await couvrir(lotA);
  await couvrir(lotB);
  await couvrir(lotC);
  return { jour, org, gerant, lotA, bailA, bailB, bailC, mandatA };
}

/** Une date calculée par la base (évite tout calcul de date côté JavaScript). */
async function date(expression: string, params: unknown[] = []): Promise<string> {
  const {
    rows: [{ d }],
  } = await db.query<{ d: string }>(`select (${expression})::date::text as d`, params);
  return d;
}

async function echoue(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint essai");
  try {
    await db.query(sql, params);
    return "";
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.query("rollback to savepoint essai");
    await db.query("release savepoint essai");
  }
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

describe.skipIf(!DB_URL).each(TEMPS)("jour de Paris, la suite — $nom", (temps) => {
  async function preparer(): Promise<Monde> {
    const jour = await jourDuTemps(temps);
    const m = await monter(jour);
    await activerTemps(temps, jour);
    return m;
  }

  it("dépôt de garantie encaissé sans date : le dépôt, sa pièce comptable et, s'il est retiré, sa contre-écriture portent le jour de Paris", async () => {
    const m = await preparer();
    await agir(m.gerant);
    await db.query("select public.encaisser_depot($1, 300, null, 'virement')", [m.bailA]);
    await agir(null, "postgres");
    const {
      rows: [depot],
    } = await db.query<{ id: string; jour: string }>(
      "select id, date_encaissement::text as jour from public.depot_encaissements where bail_id = $1",
      [m.bailA]
    );
    expect(depot.jour, "date du dépôt").toBe(m.jour);
    const { rows: pieces } = await db.query<{ piece: string; imputation: string }>(
      "select date_piece::text as piece, date_imputation::text as imputation from public.ecritures where depot_encaissement_id = $1",
      [depot.id]
    );
    expect(pieces).toEqual([{ piece: m.jour, imputation: m.jour }]);
    const {
      rows: [{ id: ecritureDuDepot }],
    } = await db.query<{ id: string }>("select id from public.ecritures where depot_encaissement_id = $1", [depot.id]);

    // Retrait du dépôt (motif donné) : la contre-écriture est datée du jour de Paris.
    await db.query("select set_config('gerimmo.motif_contre_ecriture', 'Erreur de saisie', true)");
    await db.query("delete from public.depot_encaissements where id = $1", [depot.id]);
    const { rows: contre } = await db.query<{ piece: string; imputation: string }>(
      "select date_piece::text as piece, date_imputation::text as imputation from public.ecritures where contre_ecriture_de = $1",
      [ecritureDuDepot]
    );
    expect(contre).toEqual([{ piece: m.jour, imputation: m.jour }]);
  });

  it("journal comptable : une contre-écriture est imputée au jour de Paris ; une écriture ou un dépôt saisis sans date prennent le jour de Paris", async () => {
    const m = await preparer();
    await agir(null, "postgres");
    const piece = await date("$1::date - 10", [m.jour]);
    const {
      rows: [{ id: ecriture }],
    } = await db.query<{ id: string }>(
      `insert into public.ecritures (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
       values ($1,$2,'travaux','depense',120,$3,$3,'Robinetterie',false) returning id`,
      [m.org, m.lotA, piece]
    );
    await agir(m.gerant);
    await db.query("select public.contre_ecriture($1, 'Facture saisie deux fois')", [ecriture]);
    await agir(null, "postgres");
    const { rows: contre } = await db.query<{ piece: string; imputation: string }>(
      "select date_piece::text as piece, date_imputation::text as imputation from public.ecritures where contre_ecriture_de = $1",
      [ecriture]
    );
    // La pièce reste celle de l'écriture annulée ; l'imputation est le jour de l'annulation, à Paris.
    expect(contre).toEqual([{ piece, imputation: m.jour }]);

    const {
      rows: [sansDate],
    } = await db.query<{ piece: string; imputation: string }>(
      `insert into public.ecritures (organization_id, lot_id, categorie, sens, montant, libelle, systeme)
       values ($1,$2,'travaux','depense',80,'Serrure',false) returning date_piece::text as piece, date_imputation::text as imputation`,
      [m.org, m.lotA]
    );
    expect(sansDate).toEqual({ piece: m.jour, imputation: m.jour });
    const {
      rows: [{ jour: depotSansDate }],
    } = await db.query<{ jour: string }>(
      "insert into public.depot_encaissements (organization_id, bail_id, montant, moyen) values ($1,$2,100,'virement') returning date_encaissement::text as jour",
      [m.org, m.bailA]
    );
    expect(depotSansDate, "date d'un dépôt saisi sans date").toBe(m.jour);
  });

  it("révision IRL : demandée le jour même à Paris, elle est acceptée ; sans date, elle est datée du jour de Paris ; le lendemain est refusé", async () => {
    const m = await preparer();
    await agir(m.gerant);
    // Sans date : la demande est datée du jour de Paris (essai annulé ensuite : une seule révision par année de bail).
    await db.query("savepoint sans_date");
    await db.query("select public.reviser_loyer($1, 145, 'T2 2026')", [m.bailA]);
    await agir(null, "postgres");
    const {
      rows: [parDefaut],
    } = await db.query<{ demande: string; effet: string }>(
      "select date_demande::text as demande, date_effet::text as effet from public.revisions_loyer where bail_id = $1",
      [m.bailA]
    );
    expect(parDefaut).toEqual({ demande: m.jour, effet: m.jour });
    await db.query("rollback to savepoint sans_date");

    await agir(m.gerant);
    const lendemain = await date("$1::date + 1", [m.jour]);
    expect(await echoue("select public.reviser_loyer($1, 145, 'T2 2026', $2::date)", [m.bailA, lendemain])).toMatch(/Révision anticipée/);
    // Le défaut décrit par le dirigeant : la demande datée d'aujourd'hui (à Paris) était refusée comme « datée de demain ».
    await db.query("select public.reviser_loyer($1, 145, 'T2 2026', $2::date)", [m.bailA, m.jour]);
    await agir(null, "postgres");
    const {
      rows: [revision],
    } = await db.query<{ demande: string; effet: string; loyer: string }>(
      "select r.date_demande::text as demande, r.date_effet::text as effet, b.loyer_hc::text as loyer from public.revisions_loyer r join public.baux b on b.id = r.bail_id where r.bail_id = $1",
      [m.bailA]
    );
    expect(revision).toEqual({ demande: m.jour, effet: m.jour, loyer: "725.00" });
  });

  it("terme du bail : calculé à la date du jour de Paris (le terme d'hier est passé, celui d'aujourd'hui est en cours)", async () => {
    const m = await preparer();
    await agir(null, "postgres");
    const {
      rows: [{ debut_a: debutA }],
    } = await db.query<{ debut_a: string }>("select date_debut::text as debut_a from public.baux where id = $1", [m.bailA]);
    await agir(m.gerant);
    const {
      rows: [{ a, b }],
    } = await db.query<{ a: string; b: string }>("select public.terme_bail($1)::text as a, public.terme_bail($2)::text as b", [m.bailA, m.bailB]);
    // A : premier terme la veille (passé) → le terme suivant, un an plus tard. B : premier terme le jour même → ce jour.
    expect(a, "bail A").toBe(await date("($1::date + interval '2 years')::date - 1", [debutA]));
    expect(b, "bail B").toBe(m.jour);
  });

  it("régularisation des charges : émise le jour de Paris, tardive selon le jour de Paris, étalée à partir du mois qui suit le jour de Paris", async () => {
    const m = await preparer();
    await agir(null, "postgres");
    const insererJustificatif = async () =>
      (
        await db.query<{ id: string }>(
          `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
           values ($1::uuid,'justificatif','Décompte',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) returning id`,
          [m.org]
        )
      ).rows[0].id;
    const justificatif = await insererJustificatif();
    const autreJustificatif = await insererJustificatif();
    const annee = Number(m.jour.slice(0, 4));
    // Un exercice de l'année de Paris est commencé : il n'est pas refusé comme « exercice invalide » (essai annulé ensuite).
    await agir(m.gerant);
    expect(await echoue("select public.regulariser_charges($1, $2, 100, $3)", [m.bailC, annee, autreJustificatif])).not.toMatch(/Exercice invalide/);
    // Exercice de l'avant-dernière année : la régularisation est tardive (faite après le 31 décembre de l'année suivante), donc étalable.
    await db.query("select public.regulariser_charges($1, $2, 1200, $3, null, true)", [m.bailC, annee - 2, justificatif]);
    await agir(null, "postgres");
    const {
      rows: [reg],
    } = await db.query<{ emission: string; tardive: boolean; premiere: string }>(
      `select date_emission::text as emission, tardive, etalement_12_mois->0->>'echeance' as premiere
         from public.regularisations_charges where bail_id = $1 and annee = $2`,
      [m.bailC, annee - 2]
    );
    expect(reg).toEqual({
      emission: m.jour,
      tardive: true,
      premiere: await date("date_trunc('month', $1::date) + interval '1 month'", [m.jour]),
    });
  });

  it("rapport de gestion : le mois couvert par défaut est celui qui précède le mois de Paris ; le versement au propriétaire est dû 15 jours après le jour de Paris", async () => {
    const m = await preparer();
    const moisPrecedent = await date("date_trunc('month', $1::date) - interval '1 month'", [m.jour]);
    await agir(m.gerant);
    const {
      rows: [rapport],
    } = await db.query<{ mois: string }>("select mois::text as mois from public.rapport_du_lot($1, null)", [m.lotA]);
    expect(rapport.mois).toBe(moisPrecedent);

    await agir(null, "postgres");
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      "insert into public.rapports_gestion (organization_id, mandat_id, mois, statut, net) values ($1,$2,$3,'a_valider',100) returning id",
      [m.org, m.mandatA, moisPrecedent]
    );
    await agir(m.gerant);
    await db.query("select public.envoyer_rapport($1)", [id]);
    await agir(null, "postgres");
    const { rows: alertes } = await db.query<{ echeance: string }>(
      "select echeance::text as echeance from public.alerts where type = 'versement_proprietaire' and details->>'rapport_id' = $1",
      [id]
    );
    expect(alertes).toEqual([{ echeance: await date("$1::date + 15", [m.jour]) }]);
  });

  it("rapport de gestion automatique : préparé pour le mois clôturé qui précède le mois de Paris", async () => {
    const m = await preparer();
    const moisPrecedent = await date("date_trunc('month', $1::date) - interval '1 month'", [m.jour]);
    await agir(null, "postgres");
    await db.query("insert into public.clotures_comptables (organization_id, mois) values ($1,$2)", [m.org, moisPrecedent]);
    await agir(null, "service_role");
    const {
      rows: [{ n }],
    } = await db.query<{ n: number }>("select public.preparer_rapports_automatiques() as n");
    await agir(null, "postgres");
    const { rows } = await db.query<{ mois: string }>(
      "select distinct mois::text as mois from public.rapports_gestion where organization_id = $1",
      [m.org]
    );
    expect(rows, `rapports préparés : ${n}`).toEqual([{ mois: moisPrecedent }]);
  });
});
