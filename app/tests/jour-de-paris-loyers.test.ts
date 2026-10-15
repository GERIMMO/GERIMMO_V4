/**
 * Le jour de Paris décide des loyers : une seule date de référence, la même pour tous les objets de la base.
 *
 * LE DÉFAUT (15/10/2026). La base comparait des dates d'échéance de loyer à `current_date`, le jour du fuseau de la
 * SESSION (UTC chez Supabase), alors que toute l'application raisonne au jour de Paris. Entre 22 h et 24 h UTC (00 h à
 * 02 h à Paris), un loyer échu la veille à Paris s'affichait « attendu » au lieu d'« impayé », et les fonctions voisines
 * divergeaient (l'état disait « impayé » pendant que `suivre_impayes_bail` en comptait zéro).
 *
 * COMMENT ON LE TESTE SANS DÉPENDRE DE L'HEURE DE LA MACHINE. L'horloge ne se simule pas ; le fuseau de la SESSION, si.
 * Chaque test construit un monde complet (agence, deux logements, baux, échéances), puis interroge TOUS les objets de
 * l'inventaire pour le même loyer, sous cinq « temps » différents :
 *  - trois fuseaux de session, choisis à chaque exécution pour que `current_date` soit la veille du jour de Paris
 *    (comme à 23 h 30 UTC), le même jour (comme à 00 h 30 UTC), ou le lendemain. Le fuseau n'est pas fixe : « Etc/GMT+12 »
 *    n'est la veille de Paris que 14 h par jour. On cherche, parmi les décalages de -24 h à +24 h, celui qui convient ;
 *  - un jour de Paris FIGÉ (la fonction `aujourdhui_paris()` est remplacée, dans la transaction, par une date fixe) 40 jours
 *    après puis 40 jours avant l'horloge. Un seul reste de `current_date` dans un objet de l'inventaire suffit à le trahir.
 * Dans tous les cas, tous les objets doivent répondre pareil, et selon le jour de Paris.
 *
 * Nécessite SUPABASE_DB_URL (avec les migrations 20261014500000 à 20261014504000). Tout est joué dans une transaction
 * annulée à la fin. Aucun test ne lit l'heure réelle pour décider de son résultat.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

type Variante =
  | { nom: string; mode: "session"; ecart: -1 | 0 | 1 }
  | { nom: string; mode: "fige"; decalage: number };

const VARIANTES: Variante[] = [
  { nom: "session en retard d'un jour sur Paris (comme à 23 h 30 UTC)", mode: "session", ecart: -1 },
  { nom: "session au même jour que Paris (comme à 00 h 30 UTC)", mode: "session", ecart: 0 },
  { nom: "session en avance d'un jour sur Paris", mode: "session", ecart: 1 },
  { nom: "jour de Paris figé 40 jours après l'horloge", mode: "fige", decalage: 40 },
  { nom: "jour de Paris figé 40 jours avant l'horloge", mode: "fige", decalage: -40 },
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
      'test-fp-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

/** Agit sous un rôle, avec ou sans compte (service_role : la tâche planifiée). */
async function agir(compte: string | null, role: "authenticated" | "service_role" | "postgres" = "authenticated", aal = "aal2") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    compte || role !== "postgres" ? JSON.stringify({ sub: compte, role, aal }) : "",
  ]);
  if (role !== "postgres") await db.query(`set local role ${role}`);
}

/** Le jour de Paris tel que l'horloge le donne, calculé SANS la fonction qu'on teste. */
async function parisHorloge(): Promise<string> {
  const {
    rows: [{ p }],
  } = await db.query<{ p: string }>("select (now() at time zone 'Europe/Paris')::date::text as p");
  return p;
}

/** Le jour de référence de la variante, sans rien changer à la session. */
async function jourDeReference(v: Variante): Promise<string> {
  const paris = await parisHorloge();
  if (v.mode === "session") return paris;
  const {
    rows: [{ p }],
  } = await db.query<{ p: string }>("select ($1::date + $2::int)::text as p", [paris, v.decalage]);
  return p;
}

/** Fuseau POSIX de décalage `h` heures par rapport à UTC (positif à l'est). */
function fuseauPosix(h: number): string {
  if (h === 0) return "UTC";
  return h > 0 ? `<+${h}>-${h}` : `<-${-h}>${-h}`;
}

/** Met la session dans le « temps » de la variante. Sans effet sur l'horloge réelle. */
async function activerVariante(v: Variante, jourDeParis: string): Promise<void> {
  if (v.mode === "fige") {
    await db.query("reset role");
    await db.query(
      `create or replace function public.aujourdhui_paris() returns date
       language sql stable set search_path to '' as $f$ select date '${jourDeParis}' $f$`
    );
    return;
  }
  const {
    rows: [{ h }],
  } = await db.query<{ h: number }>(
    `select h from generate_series(-24, 24) h
      where ((now() at time zone 'UTC') + h * interval '1 hour')::date = ($1::date + $2::int)
      order by abs(h), h limit 1`,
    [jourDeParis, v.ecart]
  );
  await db.query("reset role");
  await db.query("select set_config('TimeZone', $1, true)", [fuseauPosix(h)]);
  // Garde-fou du test lui-même : la session voit bien le jour voulu (et pas celui de Paris, sauf écart nul).
  const {
    rows: [{ j }],
  } = await db.query<{ j: string }>("select current_date::text as j");
  const {
    rows: [{ attendu }],
  } = await db.query<{ attendu: string }>("select ($1::date + $2::int)::text as attendu", [jourDeParis, v.ecart]);
  expect(j, "le fuseau de session simulé ne donne pas le jour voulu").toBe(attendu);
}

type Monde = {
  jour: string;
  org: string;
  gerant: string;
  superAdmin: string;
  lotIndividuel: string;
  bailIndividuel: string;
  lotCollectif: string;
  bailCollectif: string;
  locataire: string;
};

/** Mandat actif depuis longtemps sur le lot : une agence n'encaisse pas sans mandat (déclencheurs suspendus le temps d'écrire). */
async function couvrir(lot: string): Promise<void> {
  await db.query("reset role");
  await db.query("set session_replication_role = replica");
  await db.query(
    `with l as (select id, organization_id from public.lots where id = $1),
          p as (insert into public.persons (organization_id, nom, prenom) select organization_id, 'Mandant', 'Banc' from l returning id, organization_id),
          m as (insert into public.mandats (organization_id, person_id, etat, date_debut) select organization_id, id, 'actif', date '2000-01-01' from p returning id, organization_id)
     insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut) select m.organization_id, m.id, l.id, date '2000-01-01' from m cross join l`,
    [lot]
  );
  await db.query("set session_replication_role = origin");
}

async function monter(jour: string): Promise<Monde> {
  await agir(null, "postgres");
  const {
    rows: [{ id: org }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, relances_envoi_auto, appels_envoi_auto, quittances_envoi_auto,
                                       relance_1_jours, relance_seuil_montant)
     values ('Fuseau de Paris', 'active', true, true, true, 1, 0) returning id`
  );
  const gerant = await creerUtilisateur();
  const superAdmin = await creerUtilisateur();
  await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')", [gerant, org]);
  await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')", [superAdmin]);

  const lots: string[] = [];
  for (const rue of ["1 rue du Fuseau", "2 rue du Fuseau"]) {
    await agir(gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query<{ id: string }>(
      `select public.creer_bien_avec_lot($1,$2,'appartement'::public.bien_type,$2,null,'75003','Paris',1990,false,40,2) as id`,
      [org, rue]
    );
    await agir(null, "postgres");
    const {
      rows: [{ id: lot }],
    } = await db.query<{ id: string }>("select id from public.lots where bien_id = $1", [bien]);
    lots.push(lot);
  }
  const [lotIndividuel, lotCollectif] = lots;

  const personne = async (nom: string, email: string | null) =>
    (
      await db.query<{ id: string }>(
        "insert into public.persons (organization_id, nom, prenom, email) values ($1,$2,'Claire',$3) returning id",
        [org, nom, email]
      )
    ).rows[0].id;
  const locataire = await personne("Martin", "claire.martin@exemple.fr");

  // Début de bail : le premier jour du mois de Paris trois mois avant le jour de référence ($4 : le jour de référence).
  const {
    rows: [{ id: chambre }],
  } = await db.query<{ id: string }>(
    `insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
     values ($1,$2,'Jardin',12,30,'Chambre au calme','Cuisine et séjour') returning id`,
    [org, lotIndividuel]
  );
  await db.query("update public.lots set colocation_loyer_reference = 1000 where id = $1", [lotIndividuel]);
  const bailIndividuel = (
    await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, etat, date_debut, jour_echeance, type, chambre_id)
       values ($1,$2,$3,700,50,'actif', (date_trunc('month', $4::date) - interval '3 months')::date, 1, 'colocation', $5) returning id`,
      [org, lotIndividuel, locataire, jour, chambre]
    )
  ).rows[0].id;
  const bailCollectif = (
    await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, etat, date_debut, jour_echeance)
       values ($1,$2,$3,700,50,'actif', (date_trunc('month', $4::date) - interval '3 months')::date, 1) returning id`,
      [org, lotCollectif, locataire, jour]
    )
  ).rows[0].id;
  await couvrir(lotIndividuel);
  await couvrir(lotCollectif);
  return { jour, org, gerant, superAdmin, lotIndividuel, bailIndividuel, lotCollectif, bailCollectif, locataire };
}

/** Pose un appel de loyer dont l'échéance est `jour + decalage` ; la période est le Nème mois avant le jour de référence. */
async function poserAppel(m: Monde, bail: string, moisAvant: number, decalage: number, montant = 750): Promise<string> {
  await agir(null, "postgres");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
     values ($1,$2,(date_trunc('month', $3::date) - make_interval(months => $4))::date, $5 - 50, 50, $5, $3::date + $6::int)
     returning id`,
    [m.org, bail, m.jour, moisAvant, montant, decalage]
  );
  return id;
}

async function statuts(bail: string, via: "brut" | "gerant", m?: Monde): Promise<string[]> {
  if (via === "gerant") await agir(m!.gerant);
  else await agir(null, "postgres");
  const fonction = via === "brut" ? "etat_loyers_bail_brut" : "etat_loyers_bail";
  const { rows } = await db.query<{ statut: string }>(`select statut from public.${fonction}($1) order by periode`, [bail]);
  await agir(null, "postgres");
  return rows.map((r) => r.statut);
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

describe.skipIf(!DB_URL).each(VARIANTES)("jour de Paris — $nom", (variante) => {
  /** Monte le monde puis met la session dans le « temps » de la variante. */
  async function preparer(): Promise<Monde> {
    const jour = await jourDeReference(variante);
    const m = await monter(jour);
    await activerVariante(variante, jour);
    return m;
  }

  it("l'état d'un loyer : échu la veille = impayé ; le jour même = attendu (en direct et par le gérant)", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailIndividuel, 2, -1);
    await poserAppel(m, m.bailIndividuel, 1, 0);
    await poserAppel(m, m.bailIndividuel, 0, 1);
    expect(await statuts(m.bailIndividuel, "brut")).toEqual(["impaye", "attendu", "attendu"]);
    expect(await statuts(m.bailIndividuel, "gerant", m)).toEqual(["impaye", "attendu", "attendu"]);
  });

  it("suivre_impayes_bail : une alerte pour l'échu de la veille, aucune pour l'échéance du jour", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 0, 0);
    await agir(null, "postgres");
    const jourSeul = await db.query("select public.suivre_impayes_bail($1) as n", [m.bailCollectif]);
    expect(jourSeul.rows[0].n, "l'échéance du jour n'est pas un impayé").toBe(0);
    await poserAppel(m, m.bailCollectif, 1, -1);
    const echu = await db.query("select public.suivre_impayes_bail($1) as n", [m.bailCollectif]);
    expect(echu.rows[0].n, "un loyer échu la veille doit poser l'alerte d'impayé").toBe(1);
    const { rows } = await db.query(
      "select details->>'termes' as termes, echeance::text as echeance from public.alerts where type = 'loyer_impaye' and details->>'bail_id' = $1",
      [m.bailCollectif]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].termes).toBe("1");
    const { rows: [{ attendu }] } = await db.query("select ($1::date - 1)::text as attendu", [m.jour]);
    expect(rows[0].echeance).toBe(attendu);
  });

  it("relances_loyer_dues : le retard se compte en jours de Paris, la veille compte un jour, le jour même aucun", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 0, 0);
    await agir(null, "service_role");
    const jourSeul = await db.query("select bail_id from public.relances_loyer_dues(200) where bail_id = $1", [m.bailCollectif]);
    expect(jourSeul.rows, "l'échéance du jour n'est pas encore en retard").toHaveLength(0);
    await poserAppel(m, m.bailCollectif, 1, -1);
    await agir(null, "service_role");
    const { rows } = await db.query<{ jours_retard: number; niveau: string; total_du: string }>(
      "select jours_retard, niveau, total_du from public.relances_loyer_dues(200) where bail_id = $1",
      [m.bailCollectif]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].jours_retard).toBe(1);
    expect(rows[0].niveau).toBe("relance_1");
    expect(Number(rows[0].total_du)).toBe(750);
  });

  it("relance_loyer_consigner : la relance est datée du jour de Paris, et un seul courrier par jour de Paris", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 1, -1);
    await agir(null, "service_role");
    const premiere = await db.query("select public.relance_loyer_consigner($1, 'relance_1', 'essai') as id", [m.bailCollectif]);
    expect(premiere.rows[0].id).not.toBeNull();
    const seconde = await db.query("select public.relance_loyer_consigner($1, 'relance_1', 'essai') as id", [m.bailCollectif]);
    expect(seconde.rows[0].id, "pas deux courriers le même jour").toBeNull();
    await agir(null, "postgres");
    const { rows } = await db.query("select date_envoi::text as jour from public.relances where bail_id = $1", [m.bailCollectif]);
    expect(rows.map((r) => r.jour)).toEqual([m.jour]);
  });

  it("colocation : la solidarité qui s'arrête aujourd'hui court encore aujourd'hui, celle d'hier est finie", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 1, -1);
    await agir(null, "postgres");
    const insere = async (nom: string, email: string, finDecalage: number) => {
      const {
        rows: [{ id }],
      } = await db.query<{ id: string }>(
        "insert into public.persons (organization_id, nom, prenom, email) values ($1,$2,'Colo',$3) returning id",
        [m.org, nom, email]
      );
      await db.query(
        `insert into public.bail_personnes (organization_id, bail_id, person_id, role, date_solidarite_fin)
         values ($1,$2,$3,'colocataire', $4::date + $5::int)`,
        [m.org, m.bailCollectif, id, m.jour, finDecalage]
      );
    };
    await insere("Aujourdhui", "fin-aujourdhui@exemple.fr", 0);
    await insere("Hier", "fin-hier@exemple.fr", -1);
    await insere("Demain", "fin-demain@exemple.fr", 1);
    await agir(null, "service_role");
    const relance = await db.query<{ autres: string[] }>(
      "select autres_destinataires as autres from public.relances_loyer_dues(200) where bail_id = $1",
      [m.bailCollectif]
    );
    expect(relance.rows).toHaveLength(1);
    expect([...relance.rows[0].autres].sort()).toEqual(["fin-aujourdhui@exemple.fr", "fin-demain@exemple.fr"]);
    const appel = await db.query<{ autres: string[] }>(
      "select autres_destinataires as autres from public.appels_a_envoyer(200) where bail_id = $1",
      [m.bailCollectif]
    );
    expect(appel.rows).toHaveLength(1);
    expect([...appel.rows[0].autres].sort()).toEqual(["fin-aujourdhui@exemple.fr", "fin-demain@exemple.fr"]);
  });

  it("fiche du lot et contrats du lot : l'impayé échu compte l'échu de la veille, pas l'échéance du jour", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailIndividuel, 2, -1, 800);
    await poserAppel(m, m.bailIndividuel, 1, 0, 750);
    await poserAppel(m, m.bailIndividuel, 0, 1, 700);
    await agir(m.gerant);
    const fiche = await db.query<{ termes_impayes: number; impaye_echu: string }>(
      "select termes_impayes, impaye_echu from public.fiche_lot($1)",
      [m.lotIndividuel]
    );
    expect(fiche.rows).toHaveLength(1);
    expect(fiche.rows[0].termes_impayes).toBe(1);
    expect(Number(fiche.rows[0].impaye_echu)).toBe(800);
    const contrats = await db.query<{ termes_impayes: number; impaye_echu: string }>(
      "select termes_impayes, impaye_echu from public.contrats_du_lot($1)",
      [m.lotIndividuel]
    );
    expect(contrats.rows).toHaveLength(1);
    expect(contrats.rows[0].termes_impayes).toBe(1);
    expect(Number(contrats.rows[0].impaye_echu)).toBe(800);
  });

  it("historique du lot : ce qui est arrivé aujourd'hui (Paris) y figure, ce qui arrive demain non", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailIndividuel, 2, -1);
    await poserAppel(m, m.bailIndividuel, 1, 0);
    await poserAppel(m, m.bailIndividuel, 0, 1);
    await agir(m.gerant);
    const { rows } = await db.query<{ jour: string }>(
      "select survenu_le::text as jour from public.historique_du_lot($1, 100) where nature = 'appel' order by survenu_le",
      [m.lotIndividuel]
    );
    const {
      rows: [{ veille, aujourdhui }],
    } = await db.query<{ veille: string; aujourdhui: string }>("select ($1::date - 1)::text as veille, $1::text as aujourdhui", [m.jour]);
    expect(rows.map((r) => r.jour)).toEqual([veille, aujourdhui]);
  });

  it("fin de bail dans l'historique : un bail qui finit aujourd'hui (Paris) y fige, pas celui qui finit demain", async () => {
    const m = await preparer();
    await agir(null, "postgres");
    await db.query("update public.baux set date_fin = $2::date where id = $1", [m.bailCollectif, m.jour]);
    await db.query("update public.baux set date_fin = $2::date + 1 where id = $1", [m.bailIndividuel, m.jour]);
    await agir(m.gerant);
    const fins = async (lot: string) =>
      (
        await db.query<{ jour: string }>(
          "select survenu_le::text as jour from public.historique_du_lot($1, 100) where titre = 'Fin de bail'",
          [lot]
        )
      ).rows.map((r) => r.jour);
    expect(await fins(m.lotCollectif)).toEqual([m.jour]);
    expect(await fins(m.lotIndividuel)).toEqual([]);
  });

  it("orchestration : la priorité « haute » commence à 31 jours de retard à Paris, pas 30", async () => {
    const m = await preparer();
    const {
      rows: [{ trente, trente_et_un }],
    } = await db.query<{ trente: number; trente_et_un: number }>("select -30 as trente, -31 as trente_et_un");
    const appel = await poserAppel(m, m.bailCollectif, 1, trente);
    const priorite = async () => {
      await agir(null, "service_role", "aal1");
      await db.query("select public.actualiser_orchestration()");
      await agir(null, "postgres");
      return (
        await db.query("select priorite from public.orchestration_cases where dossier_type = 'loyer' and dossier_id = $1", [m.bailCollectif])
      ).rows[0]?.priorite;
    };
    expect(await priorite(), "30 jours de retard : pas encore « haute »").toBe("normale");
    await db.query("update public.appels_loyer set date_echeance = $2::date + $3::int where id = $1", [appel, m.jour, trente_et_un]);
    expect(await priorite(), "31 jours de retard : « haute »").toBe("haute");
  });

  it("brief de la direction (source loyers) : en retard = échu avant le jour de Paris, prochains 7 jours = du jour de Paris à +7", async () => {
    const m = await preparer();
    const lire = async () => {
      await agir(m.superAdmin);
      const { rows } = await db.query("select public.collecter_source_direction('loyers') as r");
      await agir(null, "postgres");
      return rows[0].r.mesures as { echeances_en_retard: number; echeances_prochains_7_jours: number };
    };
    const avant = await lire();
    await poserAppel(m, m.bailCollectif, 3, -1);
    await poserAppel(m, m.bailCollectif, 2, 0);
    await poserAppel(m, m.bailCollectif, 1, 7);
    await poserAppel(m, m.bailCollectif, 0, 8);
    const apres = await lire();
    expect(apres.echeances_en_retard - avant.echeances_en_retard).toBe(1);
    expect(apres.echeances_prochains_7_jours - avant.echeances_prochains_7_jours).toBe(2);
  });

  it("brief de la direction (source échéances) : l'alerte d'impayé d'un loyer échu la veille est « en retard », pas « à venir »", async () => {
    const m = await preparer();
    const lire = async () => {
      await agir(m.superAdmin);
      const { rows } = await db.query("select public.collecter_source_direction('echeances') as r");
      await agir(null, "postgres");
      return rows[0].r.mesures as { alertes_en_retard: number; alertes_prochains_7_jours: number };
    };
    const avant = await lire();
    await poserAppel(m, m.bailCollectif, 0, -1);
    await agir(null, "postgres");
    expect((await db.query("select public.suivre_impayes_bail($1) as n", [m.bailCollectif])).rows[0].n).toBe(1);
    const apres = await lire();
    expect(apres.alertes_en_retard - avant.alertes_en_retard).toBe(1);
    expect(apres.alertes_prochains_7_jours - avant.alertes_prochains_7_jours).toBe(0);
  });

  it("encaissement sans date : daté du jour de Paris, comme l'écriture comptable qui le suit", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 0, -1, 750);
    await agir(m.gerant);
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      "insert into public.encaissements (organization_id, bail_id, montant) values ($1,$2,100) returning id",
      [m.org, m.bailCollectif]
    );
    await agir(null, "postgres");
    const enc = await db.query("select date_paiement::text as jour from public.encaissements where id = $1", [id]);
    expect(enc.rows[0].jour).toBe(m.jour);
    const ecr = await db.query(
      "select date_piece::text as piece, date_imputation::text as imputation from public.ecritures where encaissement_id = $1",
      [id]
    );
    expect(ecr.rows.length).toBeGreaterThan(0);
    for (const r of ecr.rows) expect([r.piece, r.imputation]).toEqual([m.jour, m.jour]);
  });

  it("quittance : émise et réémise au jour de Paris", async () => {
    const m = await preparer();
    const appel = await poserAppel(m, m.bailCollectif, 0, -1, 750);
    await agir(m.gerant);
    // Règlement partiel : un reçu (insertion), puis complet : la quittance (mise à jour). Le déclencheur
    // d'encaissement appelle resynchroniser_quittances dans les deux cas.
    const {
      rows: [{ id: partiel }],
    } = await db.query<{ id: string }>(
      "insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,300, $3::date - 1) returning id",
      [m.org, m.bailCollectif, m.jour]
    );
    const date = async () =>
      (await db.query("select date_emission::text as jour, est_quittance from public.quittances where appel_id = $1", [appel])).rows[0];
    await agir(null, "postgres");
    const recu = await date();
    expect(recu.est_quittance).toBe(false);
    expect(recu.jour).toBe(m.jour);
    await db.query("update public.quittances set date_emission = $2::date - 5 where appel_id = $1", [appel, m.jour]);
    await agir(m.gerant);
    await db.query("insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,450, $3::date)", [
      m.org,
      m.bailCollectif,
      m.jour,
    ]);
    await agir(null, "postgres");
    const quittance = await date();
    expect(quittance.est_quittance).toBe(true);
    expect(quittance.jour, "la quittance réémise porte le jour de Paris").toBe(m.jour);
    expect(partiel).toBeTruthy();
  });

  it("encaissement supprimé : la contre-écriture est datée du jour de Paris", async () => {
    const m = await preparer();
    await poserAppel(m, m.bailCollectif, 0, -1, 750);
    await agir(m.gerant);
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      "insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,100, $3::date - 3) returning id",
      [m.org, m.bailCollectif, m.jour]
    );
    await db.query("select public.supprimer_encaissement($1, 'Saisi par erreur')", [id]);
    await agir(null, "postgres");
    const { rows } = await db.query(
      "select date_piece::text as piece, date_imputation::text as imputation from public.ecritures where contre_ecriture_de is not null and bail_id = $1",
      [m.bailCollectif]
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect([r.piece, r.imputation]).toEqual([m.jour, m.jour]);
  });

  it("relance saisie sans date : datée du jour de Paris", async () => {
    const m = await preparer();
    await agir(m.gerant);
    const {
      rows: [{ jour }],
    } = await db.query<{ jour: string }>(
      "insert into public.relances (organization_id, bail_id, niveau) values ($1,$2,'relance_1') returning date_envoi::text as jour",
      [m.org, m.bailCollectif]
    );
    expect(jour).toBe(m.jour);
  });

  it("quittances à envoyer : l'émission d'il y a 45 jours de Paris est encore envoyée, celle de 46 jours non", async () => {
    const m = await preparer();
    const appels = [await poserAppel(m, m.bailCollectif, 2, -45), await poserAppel(m, m.bailCollectif, 1, -46)];
    await agir(null, "postgres");
    await db.query("set session_replication_role = replica");
    const periodes = [45, 46];
    for (const [i, appel] of appels.entries()) {
      await db.query(
        "insert into public.quittances (organization_id, bail_id, appel_id, montant, date_emission) values ($1,$2,$3,750, $4::date - $5::int)",
        [m.org, m.bailCollectif, appel, m.jour, periodes[i]]
      );
    }
    await db.query("set session_replication_role = origin");
    await agir(null, "service_role");
    const { rows } = await db.query("select quittance_id from public.quittances_a_envoyer(200) where bail_id = $1", [m.bailCollectif]);
    expect(rows).toHaveLength(1);
  });

  it("génération des appels : on génère jusqu'au mois du jour de Paris", async () => {
    const m = await preparer();
    await agir(m.gerant);
    const { rows: [{ n }] } = await db.query<{ n: number }>("select public.generer_appels_loyer($1) as n", [m.bailCollectif]);
    await agir(null, "postgres");
    const { rows } = await db.query<{ dernier: string; premier: string }>(
      "select max(periode)::text as dernier, min(periode)::text as premier from public.appels_loyer where bail_id = $1",
      [m.bailCollectif]
    );
    const {
      rows: [{ debut, mois }],
    } = await db.query<{ debut: string; mois: string }>(
      "select (date_trunc('month', $1::date) - interval '3 months')::date::text as debut, date_trunc('month', $1::date)::date::text as mois",
      [m.jour]
    );
    expect(rows[0].premier).toBe(debut);
    expect(rows[0].dernier).toBe(mois);
    expect(n).toBe(4);
  });

  it("cycle mensuel : un bail terminé le mois précédent (Paris) est servi, celui d'avant non", async () => {
    const m = await preparer();
    await agir(null, "postgres");
    // Deux baux terminés, sans appels : le cycle ne génère que pour celui qu'il sélectionne. Mise à jour en
    // administration (déclencheurs suspendus) : la clôture d'un bail a ses propres tests.
    await db.query("set session_replication_role = replica");
    // Fin il y a deux mois : hors du cycle (qui ne sert que le mois précédent et le mois courant).
    await db.query("update public.baux set etat = 'termine', date_fin = (date_trunc('month', $2::date) - interval '2 months')::date where id = $1", [
      m.bailIndividuel,
      m.jour,
    ]);
    // Fin le 1er du mois précédent : dans le cycle.
    await db.query("update public.baux set etat = 'termine', date_fin = (date_trunc('month', $2::date) - interval '1 month')::date where id = $1", [
      m.bailCollectif,
      m.jour,
    ]);
    await db.query("set session_replication_role = origin");
    await agir(null, "service_role", "aal1");
    await db.query("select public.cycle_mensuel_interne()");
    await agir(null, "postgres");
    const compte = async (bail: string) => Number((await db.query("select count(*) n from public.appels_loyer where bail_id = $1", [bail])).rows[0].n);
    expect(await compte(m.bailCollectif), "fin le 1er du mois précédent : servi").toBeGreaterThan(0);
    expect(await compte(m.bailIndividuel), "fin il y a deux mois : hors du cycle").toBe(0);
  });
});

describe.skipIf(!DB_URL)("cohérence : tous les objets d'inventaire s'accordent sur un même loyer", () => {
  /**
   * Pour UN appel de loyer d'échéance `decalage` jours autour du jour de Paris, chaque objet de l'inventaire dit s'il le
   * tient pour échu. Ils doivent tous répondre pareil (échu seulement si l'échéance est avant le jour de Paris), quel que
   * soit le temps de la session — dans les deux sens de décalage.
   */
  type Verdicts = Record<string, boolean>;
  async function interroger(variante: Variante, decalage: number): Promise<Verdicts> {
    const jour = await jourDeReference(variante);
    const m = await monter(jour);
    await poserAppel(m, m.bailIndividuel, 0, decalage, 800);
    await activerVariante(variante, jour);
    const v: Verdicts = {};

    await agir(null, "postgres");
    v["état (brut)"] = (await db.query("select statut from public.etat_loyers_bail_brut($1)", [m.bailIndividuel])).rows[0].statut === "impaye";
    await agir(m.gerant);
    v["état (gérant)"] = (await db.query("select statut from public.etat_loyers_bail($1)", [m.bailIndividuel])).rows[0].statut === "impaye";
    v["fiche du lot"] = (await db.query("select termes_impayes from public.fiche_lot($1)", [m.lotIndividuel])).rows[0].termes_impayes === 1;
    v["contrats du lot"] = (await db.query("select termes_impayes from public.contrats_du_lot($1)", [m.lotIndividuel])).rows[0].termes_impayes === 1;
    // L'historique ne montre que ce qui est déjà arrivé : le terme y figure s'il est échu ou échoit aujourd'hui.
    v["historique du lot (terme déjà arrivé)"] =
      (await db.query("select 1 from public.historique_du_lot($1, 50) where nature = 'appel'", [m.lotIndividuel])).rows.length === 1;
    await agir(null, "postgres");
    v["alerte d'impayé"] = (await db.query("select public.suivre_impayes_bail($1) as n", [m.bailIndividuel])).rows[0].n === 1;
    // Un bail en colocation individuelle est relancé comme un autre : le locataire principal a un e-mail.
    await agir(null, "service_role");
    v["relance"] = (await db.query("select 1 from public.relances_loyer_dues(200) where bail_id = $1", [m.bailIndividuel])).rows.length === 1;
    await agir(null, "service_role", "aal1");
    await db.query("select public.actualiser_orchestration()");
    await agir(null, "postgres");
    v["dossier d'orchestration"] =
      (await db.query("select 1 from public.orchestration_cases where dossier_type = 'loyer' and dossier_id = $1 and etat <> 'termine'", [m.bailIndividuel])).rows.length === 1;
    await agir(m.superAdmin);
    const faits = (await db.query("select public.collecter_source_direction('loyers') as r")).rows[0].r.faits as { href: string }[];
    v["brief de la direction"] = faits.some((f) => f.href.endsWith(`/baux/${m.bailIndividuel}`));
    await agir(null, "postgres");
    return v;
  }

  describe.each([
    ["l'échéance est avant le jour de Paris (hier)", -1, true],
    ["l'échéance est le jour de Paris", 0, false],
    ["l'échéance est après le jour de Paris (demain)", 1, false],
  ] as const)("%s", (_nom, decalage, echu) => {
    it.each(VARIANTES)("$nom : tous les objets répondent « échu = " + "oui/non » pareil", async (variante) => {
      const verdicts = await interroger(variante, decalage);
      const attendu = Object.fromEntries(Object.keys(verdicts).map((k) => [k, k.startsWith("historique") ? decalage <= 0 : echu]));
      expect(verdicts).toEqual(attendu);
    });
  });
});

describe.skipIf(!DB_URL)("inventaire : plus aucun jour de session dans les objets qui décident d'un loyer", () => {
  const FONCTIONS_DU_LOT = [
    "public.etat_loyers_bail_brut(uuid)",
    "public.suivre_impayes_bail(uuid)",
    "public.relances_loyer_dues(integer)",
    "public.relance_loyer_consigner(uuid,text,text)",
    "public.actualiser_orchestration()",
    "public.collecter_source_direction(text)",
    "public.contrats_du_lot(uuid)",
    "public.fiche_lot(uuid)",
    "public.historique_du_lot(uuid,integer)",
    "public.generer_appels_loyer_interne(uuid)",
    "public.cycle_mensuel_interne()",
    "public.resynchroniser_quittances(uuid)",
    "public.quittances_a_envoyer(integer)",
    "public.appels_a_envoyer(integer)",
    "public.contre_passer_encaissement()",
  ];
  const DEFAUTS_DU_LOT: [string, string][] = [
    ["encaissements", "date_paiement"],
    ["quittances", "date_emission"],
    ["relances", "date_envoi"],
  ];

  it.each(FONCTIONS_DU_LOT)("%s ne lit plus current_date et lit le jour de Paris", async (signature) => {
    const { rows } = await db.query<{ def: string }>("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
    expect(rows[0].def).not.toMatch(/\bcurrent_date\b/i);
    expect(rows[0].def).toContain("public.aujourdhui_paris()");
  });

  it.each(DEFAUTS_DU_LOT)("%s.%s prend le jour de Paris par défaut", async (table, colonne) => {
    const { rows } = await db.query<{ defaut: string }>(
      `select pg_get_expr(d.adbin, d.adrelid) as defaut
         from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
        where d.adrelid = $1::regclass and a.attname = $2`,
      [`public.${table}`, colonne]
    );
    expect(rows[0].defaut).toMatch(/^(public\.)?aujourdhui_paris\(\)$/);
  });

  it("aujourdhui_paris() est le jour de Paris, quel que soit le fuseau de la session", async () => {
    const paris = await parisHorloge();
    for (const fuseau of ["UTC", "Etc/GMT+12", "Etc/GMT-14", "America/Los_Angeles", "Pacific/Kiritimati", "<-24>24", "<+24>-24"]) {
      await db.query("savepoint fuseau");
      await db.query("select set_config('TimeZone', $1, true)", [fuseau]);
      const { rows } = await db.query<{ j: string; defini: string }>(
        "select public.aujourdhui_paris()::text as j, pg_get_functiondef('public.aujourdhui_paris()'::regprocedure) as defini"
      );
      await db.query("rollback to savepoint fuseau");
      expect(rows[0].j, fuseau).toBe(paris);
      expect(rows[0].defini).toMatch(/Europe\/Paris/);
    }
  });

  it("aujourdhui_paris() : droits — jamais anon, ouverte aux comptes connectés et à la tâche planifiée", async () => {
    const { rows } = await db.query<{ anon: boolean; connecte: boolean; service: boolean }>(
      `select has_function_privilege('anon', 'public.aujourdhui_paris()', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'public.aujourdhui_paris()', 'EXECUTE') as connecte,
              has_function_privilege('service_role', 'public.aujourdhui_paris()', 'EXECUTE') as service`
    );
    expect(rows[0]).toEqual({ anon: false, connecte: true, service: true });
  });

  it("garde de l'inventaire : aucun nouvel objet de loyer ne compare à current_date sans être classé « hors périmètre »", async () => {
    // Les fonctions qui touchent un loyer (appel, état d'un loyer, encaissement, quittance, relance) ET lisent le jour de la
    // SESSION (current_date, localtimestamp, now()::date…). Aucune ne doit rester. Les domaines voisins qui gardent le jour de
    // session à dessein (révision IRL, charges, dépôt de garantie, restitution, mandats, abonnement, artisans, diagnostics,
    // assurances…) ne touchent aucune de ces tables ni l'état des loyers : ils n'entrent pas ici. Si une fonction légitime
    // apparaît un jour, la classer ICI avec sa raison, jamais en assouplissant le motif.
    const HORS_PERIMETRE = new Set<string>();
    const { rows } = await db.query<{ nom: string }>(
      `select distinct p.proname as nom
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
          and pg_get_functiondef(p.oid) ~* '(\\m(current_date|localtimestamp|localtime)\\M|now\\(\\)\\s*::\\s*date|\\(\\s*now\\(\\)\\s*\\)\\s*::\\s*date|current_timestamp\\s*::\\s*date)'
          and pg_get_functiondef(p.oid) ~* '(\\mappels_loyer\\M|\\metat_loyers_bail_brut\\M|public\\.(encaissements|quittances|relances)\\M)'
        order by 1`
    );
    const inconnus = rows.map((r) => r.nom).filter((nom) => !HORS_PERIMETRE.has(nom));
    expect(
      inconnus,
      "Ces fonctions touchent un loyer et lisent le jour de la session : passez-les au jour de Paris (public.aujourdhui_paris()) ou classez-les dans HORS_PERIMETRE avec leur raison."
    ).toEqual([]);
  });
});
