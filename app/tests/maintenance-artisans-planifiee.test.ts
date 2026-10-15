/**
 * Audit du 13/10/2026 (AUT-01), décision D42, option B : la caducité des devis d'artisan est planifiée.
 *
 * Constat : `maintenance_artisans()` (caducité des devis, RM-9.2.3, et purge des motifs de liste noire) n'était
 * appelée par aucune tâche, et ne pouvait pas l'être : elle exige une identité de super-administrateur, qu'une
 * tâche pg_cron n'a pas. Les devis périmés restaient « déposés », leur sollicitation restait « vivante » et occupait
 * l'une des deux places de la mise en concurrence (RM-9.1.1).
 *
 * Correction : `maintenance_artisans_interne()` (sans garde d'identité, fermée à tous les rôles) ne fait QUE
 * l'expiration des devis ; la tâche `maintenance-artisans` l'appelle à 04 h 30 UTC ; `maintenance_artisans()` garde
 * sa garde et sa purge, pour l'usage manuel du super-administrateur. La purge des motifs de liste noire n'est PAS
 * planifiée (reportée avant septembre 2029, durées à faire valider).
 *
 * Nécessite SUPABASE_DB_URL. Chaque cas est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014210000_maintenance_artisans_expiration_cron.sql", "utf8");
const RETOUR = readFileSync("supabase/retours-arriere/20261014210000_maintenance_artisans_expiration_cron.retour.sql", "utf8");
const RELEVE = readFileSync("supabase/retours-arriere/releve-devis-perimes.sql", "utf8");
// La seconde migration (l'arrêt d'urgence, D06) et son retour sont lus à la demande : seuls les cas qui en dépendent échouent si l'un manque.
const lireMigrationArret = () => readFileSync("supabase/migrations/20261014211000_maintenance_artisans_arret_urgence.sql", "utf8");
const lireRetourArret = () => readFileSync("supabase/retours-arriere/20261014211000_maintenance_artisans_arret_urgence.retour.sql", "utf8");

let db: Client;

type Artisan = { id: string; compte: string };
type Dossier = { org: string; gerant: string; incident: string; consultation: string };
type Sollicite = Artisan & { sollicitation: string; devis?: string };

async function compte(prefixe: string): Promise<string> {
  const { rows: [{ id }] } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
       $1 || '-' || gen_random_uuid() || '@test.local','x', now(),
       '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
     returning id`,
    [prefixe]
  );
  return id;
}

/** Se place sous l'identité d'un compte (jeton de la requête), ou sans identité si `null` (pg_cron). */
async function agir(accountId: string | null, extra: Record<string, unknown> = {}) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", ...extra }) : "",
  ]);
  if (accountId) await db.query("set local role authenticated");
}

/** Tentative attendue en échec, jouée sous point de reprise : renvoie le message d'erreur (vide si elle a réussi). */
async function refusee(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql, params);
    await db.query("release savepoint e");
    return "";
  } catch (err) {
    await db.query("rollback to savepoint e");
    return (err as Error).message;
  }
}

/** Le jour de Paris, comme l'écran et la tâche le calculent. */
async function jourParis(decalage = 0): Promise<string> {
  await db.query("reset role");
  const { rows: [{ j }] } = await db.query<{ j: string }>(
    `select ((now() at time zone 'Europe/Paris')::date + $1::int)::text as j`,
    [decalage]
  );
  return j;
}

/** Une agence, un incident qualifié et une mise en concurrence ouverte (devis unique assumé : seule la chaîne compte). */
async function monterDossier(): Promise<Dossier> {
  await db.query("reset role");
  const { rows: [{ id: org }] } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status) values ('AUT-01','active') returning id`
  );
  const gerant = await compte("gerant");
  const locataire = await compte("loc");
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$3,'admin_agence'), ($2,$3,'locataire')`,
    [gerant, locataire, org]
  );
  const { rows: [{ id: bien }] } = await db.query<{ id: string }>(
    `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
     values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
    [org]
  );
  const { rows: [{ id: lot }] } = await db.query<{ id: string }>(
    `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','loue') returning id`,
    [bien, org]
  );
  const { rows: [{ id: personne }] } = await db.query<{ id: string }>(
    `insert into public.persons (organization_id, account_id, nom, prenom, telephone) values ($1,$2,'Martin','Léa','0600000000') returning id`,
    [org, locataire]
  );
  const { rows: [{ id: bail }] } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
     values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
    [org, lot, personne]
  );
  const { rows: [{ id: incident }] } = await db.query<{ id: string }>(
    `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie,
       description, etat, imputation, imputation_justification)
     values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
       'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps') returning id`,
    [org, lot, bail, personne]
  );
  // L'ouverture d'une mise en concurrence exige un artisan du carnet dans la zone (sinon : « adresse à compléter »).
  await creerArtisanDe(org, "Contact du carnet");
  await agir(gerant);
  const { rows: [{ ouvrir_consultation: consultation }] } = await db.query<{ ouvrir_consultation: string }>(
    `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant', true, 30)`,
    [org, incident]
  );
  return { org, gerant, incident, consultation };
}

/** Un artisan validé, du bon métier et de la bonne zone, rattaché à l'agence. */
async function creerArtisanDe(org: string, nom: string): Promise<Artisan> {
  await db.query("reset role");
  const cpt = await compte("artisan");
  const { rows: [{ id }] } = await db.query<{ id: string }>(
    `insert into public.artisans (raison_sociale, siret, telephone, account_id, statut_plateforme, siret_etat)
     values ($1, lpad((floor(random()*89999999999999)+10000000000000)::bigint::text, 14, '0'), '0611111111', $2, 'valide','verifie')
     returning id`,
    [nom, cpt]
  );
  await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [id]);
  await db.query(`insert into public.artisan_zones values ($1,'75011')`, [id]);
  await db.query(`insert into public.artisan_agences (organization_id, artisan_id) values ($1,$2)`, [org, id]);
  return { id, compte: cpt };
}
const creerArtisan = (d: Dossier, nom: string) => creerArtisanDe(d.org, nom);

async function solliciter(d: Dossier, a: Artisan): Promise<Sollicite> {
  await agir(d.gerant);
  const { rows: [{ solliciter_artisan: sollicitation }] } = await db.query<{ solliciter_artisan: string }>(
    `select public.solliciter_artisan($1,$2,$3)`,
    [d.org, d.consultation, a.id]
  );
  return { ...a, sollicitation };
}

/** Le dépôt du devis par l'artisan, par la vraie RPC (validité future : la base refuse une date passée). */
async function deposerDevis(a: Sollicite): Promise<Sollicite> {
  await agir(a.compte);
  const { rows: [{ deposer_devis_structure: devis }] } = await db.query<{ deposer_devis_structure: string }>(
    `select public.deposer_devis_structure($1, jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',34000,'tva_bps',0)),
       'Diagnostic de test', 'Remplacement du flexible', 'Sous 7 jours', 'Une journée', null, null, current_date + 20)`,
    [a.sollicitation]
  );
  return { ...a, devis };
}

/** Un artisan sollicité qui a déposé son devis ; `jours` = validité restante (négatif : périmé), vue depuis le jour de Paris. */
async function sollicitéAvecDevis(d: Dossier, nom: string, jours: number): Promise<Sollicite> {
  const a = await deposerDevis(await solliciter(d, await creerArtisan(d, nom)));
  await db.query("reset role");
  await db.query(`update public.incident_devis set valide_jusqu_au = $2::date where id = $1`, [a.devis, await jourParis(jours)]);
  return a;
}

async function statuts(ids: { devis?: string[]; sollicitations?: string[] }) {
  await db.query("reset role");
  const devis = ids.devis?.length
    ? (await db.query<{ id: string; statut: string }>(`select id, statut::text from public.incident_devis where id = any($1)`, [ids.devis])).rows
    : [];
  const sollicitations = ids.sollicitations?.length
    ? (await db.query<{ id: string; statut: string }>(`select id, statut::text from public.incident_sollicitations where id = any($1)`, [ids.sollicitations])).rows
    : [];
  const parId = (rows: { id: string; statut: string }[]) => Object.fromEntries(rows.map((r) => [r.id, r.statut]));
  return { devis: parId(devis), sollicitations: parId(sollicitations) };
}

/** Joue la commande EXACTE de la tâche planifiée, comme pg_cron : rôle de la base, sans jeton de connexion. */
async function jouerLaTache() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '', true)`);
  const { rows } = await db.query<{ command: string }>(`select command from cron.job where jobname = 'maintenance-artisans'`);
  expect(rows).toHaveLength(1);
  await db.query(rows[0].command);
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

describe.skipIf(!DB_URL)("AUT-01 — la tâche planifiée", () => {
  it("existe, passe à 04 h 30 UTC chaque jour et n'appelle QUE la version interne", async () => {
    const { rows } = await db.query<{ schedule: string; command: string }>(
      `select schedule, command from cron.job where jobname = 'maintenance-artisans'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe("30 4 * * *");
    expect(rows[0].command.trim().replace(/;$/, "")).toBe("select public.maintenance_artisans_interne()");
    // Aucune tâche n'appelle la version publique (garde d'identité, purge comprise).
    const { rows: [{ n }] } = await db.query<{ n: number }>(
      `select count(*)::int as n from cron.job where command ~ 'maintenance_artisans\\s*\\('`
    );
    expect(n).toBe(0);
  });

  it("expire les devis périmés et la sollicitation qui les porte, sans toucher à ceux qui valent encore", async () => {
    const d = await monterDossier();
    const perime = await sollicitéAvecDevis(d, "Périmé", -2);
    const veille = await sollicitéAvecDevis(d, "Hier", -1);
    // Un devis valable jusqu'à aujourd'hui l'est encore toute la journée (comme l'écran : « avant aujourd'hui »).
    // Le plafond de deux sollicitations en parallèle se libère avant, par l'expiration des deux premiers.
    await jouerLaTache();
    const aujourdhui = await sollicitéAvecDevis(d, "Aujourd'hui", 0);
    const futur = await sollicitéAvecDevis(d, "Futur", 15);

    await jouerLaTache();
    const etat = await statuts({
      devis: [perime.devis!, veille.devis!, aujourdhui.devis!, futur.devis!],
      sollicitations: [perime.sollicitation, veille.sollicitation, aujourdhui.sollicitation, futur.sollicitation],
    });
    expect(etat.devis).toEqual({
      [perime.devis!]: "expire",
      [veille.devis!]: "expire",
      [aujourdhui.devis!]: "depose",
      [futur.devis!]: "depose",
    });
    expect(etat.sollicitations).toEqual({
      [perime.sollicitation]: "expiree",
      [veille.sollicitation]: "expiree",
      [aujourdhui.sollicitation]: "devis_depose",
      [futur.sollicitation]: "devis_depose",
    });
  });

  it("renvoie le nombre de devis expirés, et un second passage ne change plus rien", async () => {
    const d = await monterDossier();
    const a = await sollicitéAvecDevis(d, "Un", -3);
    const b = await sollicitéAvecDevis(d, "Deux", -1);
    await db.query("reset role");
    expect((await db.query(`select public.maintenance_artisans_interne() as n`)).rows[0].n).toBe(2);
    const apres = await statuts({ devis: [a.devis!, b.devis!], sollicitations: [a.sollicitation, b.sollicitation] });
    expect((await db.query(`select public.maintenance_artisans_interne() as n`)).rows[0].n).toBe(0);
    expect(await statuts({ devis: [a.devis!, b.devis!], sollicitations: [a.sollicitation, b.sollicitation] })).toEqual(apres);
  });

  it("ne touche ni le devis retenu (même périmé depuis), ni les devis non retenus", async () => {
    const d = await monterDossier();
    const retenu = await sollicitéAvecDevis(d, "Retenu", 10);
    const ecarte = await sollicitéAvecDevis(d, "Écarté", 10);
    await agir(d.gerant);
    await db.query(`select public.retenir_devis($1,$2)`, [d.org, retenu.devis]);
    // La mission a été confiée ; la date de validité du devis passe ensuite : le devis reste « retenu ».
    await db.query("reset role");
    await db.query(`update public.incident_devis set valide_jusqu_au = $2::date where id = any($1)`, [[retenu.devis, ecarte.devis], await jourParis(-5)]);
    await jouerLaTache();
    const etat = await statuts({ devis: [retenu.devis!, ecarte.devis!], sollicitations: [retenu.sollicitation, ecarte.sollicitation] });
    expect(etat.devis).toEqual({ [retenu.devis!]: "retenu", [ecarte.devis!]: "non_retenu" });
    expect(etat.sollicitations).toEqual({ [retenu.sollicitation]: "retenue", [ecarte.sollicitation]: "non_retenue" });
  });

  it("une agence dont l'abonnement est suspendu ne bloque pas le passage des autres", async () => {
    const suspendue = await monterDossier();
    const a = await sollicitéAvecDevis(suspendue, "Agence suspendue", -4);
    const ouverte = await monterDossier();
    const b = await sollicitéAvecDevis(ouverte, "Agence ouverte", -4);
    await db.query("reset role");
    // Comme les autres tests de suspension : le statut d'une agence ne se change que par le super-administrateur ou la tâche système.
    await db.query(`select public.tache_systeme()`);
    await db.query(`update public.organizations set status = 'suspendue' where id = $1`, [suspendue.org]);
    await db.query(`select set_config('gerimmo.systeme', '', true)`);
    // Sans identité (pg_cron), la garde d'abonnement refuserait l'écriture sur l'agence suspendue et ferait échouer
    // TOUTE la tâche : la caducité d'un devis ne dépend pas de la situation commerciale de l'agence.
    await jouerLaTache();
    const etat = await statuts({ devis: [a.devis!, b.devis!], sollicitations: [a.sollicitation, b.sollicitation] });
    expect(etat.devis).toEqual({ [a.devis!]: "expire", [b.devis!]: "expire" });
    expect(etat.sollicitations).toEqual({ [a.sollicitation]: "expiree", [b.sollicitation]: "expiree" });
    // Le passage n'a pas laissé la garde désarmée pour la suite de la session.
    await db.query("reset role");
    expect((await db.query(`select coalesce(current_setting('gerimmo.systeme', true), '') as v`)).rows[0].v).not.toBe("on");
  });
});

describe.skipIf(!DB_URL)("AUT-01 — la place de la mise en concurrence", () => {
  it("l'expiration libère le plafond de deux sollicitations en parallèle (RM-9.1.1)", async () => {
    const d = await monterDossier();
    await sollicitéAvecDevis(d, "Un", -2);
    await sollicitéAvecDevis(d, "Deux", -1);
    const troisieme = await creerArtisan(d, "Trois");

    // Avant : les deux sollicitations sont « vivantes » alors que leurs devis sont périmés — l'impasse constatée.
    await agir(d.gerant);
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, troisieme.id])).toMatch(/Deux artisans au maximum/);

    await jouerLaTache();

    // Après : les deux places sont libres, un autre artisan peut être sollicité.
    await agir(d.gerant);
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, troisieme.id])).toBe("");
  });

  it("n'en libère qu'une quand un seul devis est périmé", async () => {
    const d = await monterDossier();
    await sollicitéAvecDevis(d, "Périmé", -1);
    await sollicitéAvecDevis(d, "Valable", 10);
    const [c, e] = [await creerArtisan(d, "Trois"), await creerArtisan(d, "Quatre")];
    await jouerLaTache();
    await agir(d.gerant);
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, c.id])).toBe("");
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, e.id])).toMatch(/Deux artisans au maximum/);
  });

  it("ne traite PAS une sollicitation restée sans réponse : elle garde sa place", async () => {
    const d = await monterDossier();
    const sansReponse = await solliciter(d, await creerArtisan(d, "Silencieux"));
    const perime = await sollicitéAvecDevis(d, "Périmé", -1);
    const [c, e] = [await creerArtisan(d, "Trois"), await creerArtisan(d, "Quatre")];
    await jouerLaTache();
    const etat = await statuts({ sollicitations: [sansReponse.sollicitation, perime.sollicitation] });
    expect(etat.sollicitations).toEqual({ [sansReponse.sollicitation]: "envoyee", [perime.sollicitation]: "expiree" });
    // La place du périmé est libre, celle du silencieux reste prise : un seul nouvel artisan, pas deux.
    await agir(d.gerant);
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, c.id])).toBe("");
    expect(await refusee(`select public.solliciter_artisan($1,$2,$3)`, [d.org, d.consultation, e.id])).toMatch(/Deux artisans au maximum/);
    // Et l'artisan silencieux peut toujours répondre.
    await agir(sansReponse.compte);
    expect(await refusee(`select public.decliner_sollicitation($1, 'Pas disponible')`, [sansReponse.sollicitation])).toBe("");
  });

  it("l'artisan dont le devis a expiré ne peut ni décliner ni redéposer (la sollicitation est « expirée »)", async () => {
    const d = await monterDossier();
    const a = await sollicitéAvecDevis(d, "Périmé", -1);
    await jouerLaTache();
    await agir(a.compte);
    expect(await refusee(`select public.decliner_sollicitation($1, 'x')`, [a.sollicitation])).toMatch(/n'est plus en attente \(état : expiree\)/);
    expect(await refusee(
      `select public.deposer_devis_structure($1, jsonb_build_array(jsonb_build_object('libelle','T','quantite',1,'prix_unitaire_ht_cents',1000,'tva_bps',0)),
         'D', 'P', 'Sous 7 jours', 'Une journée', null, null, current_date + 20)`,
      [a.sollicitation]
    )).toMatch(/n'attend plus de devis \(état : expiree\)/);
    // Il la voit dans sa boîte de réception, avec le statut « expirée » et la date de validité du devis.
    const { rows } = await db.query(`select statut::text, valide_jusqu_au::text from public.mes_sollicitations()`);
    expect(rows).toEqual([{ statut: "expiree", valide_jusqu_au: await jourParis(-1) }]);
  });
});

describe.skipIf(!DB_URL)("AUT-01 — les droits", () => {
  it.each(["anon", "authenticated", "service_role"])("la version interne n'est exécutable ni par %s ni par PUBLIC", async (role) => {
    await db.query("reset role");
    const { rows: [privileges] } = await db.query(
      `select has_function_privilege($1, 'public.maintenance_artisans_interne()', 'EXECUTE') as role,
              exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where p.oid = 'public.maintenance_artisans_interne()'::regprocedure and a.grantee = 0) as public`,
      [role]
    );
    expect(privileges).toEqual({ role: false, public: false });
    await db.query(`select set_config('request.jwt.claims', json_build_object('role', $1::text)::text, true)`, [role]);
    await db.query(`set local role ${role}`);
    expect(await refusee(`select public.maintenance_artisans_interne()`)).toMatch(/permission denied/);
  });

  it("la version publique garde sa garde : refusée à un gérant, à un connecté sans second facteur et à anon", async () => {
    const d = await monterDossier();
    await agir(d.gerant, { aal: "aal2" });
    expect(await refusee(`select * from public.maintenance_artisans()`)).toMatch(/Accès refusé/);
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await db.query("set local role anon");
    expect(await refusee(`select * from public.maintenance_artisans()`)).toMatch(/permission denied/);
    // Un super-administrateur sans second facteur (aal1) est refusé aussi.
    await db.query("reset role");
    const sa = await compte("sa");
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`, [sa]);
    await agir(sa, { aal: "aal1" });
    expect(await refusee(`select * from public.maintenance_artisans()`)).toMatch(/Accès refusé/);
  });
});

describe.skipIf(!DB_URL)("AUT-01 — la purge des motifs de liste noire n'est pas planifiée", () => {
  /** Une relation d'agence et une inscription globale en liste noire dont l'échéance de purge est passée. */
  async function listesNoiresEchues() {
    const d = await monterDossier();
    const locale = await creerArtisan(d, "Liste noire locale");
    const globale = await creerArtisan(d, "Liste noire globale");
    await db.query("reset role");
    await db.query(
      `update public.artisan_agences set statut = 'desactive', blacklist_le = now(), blacklist_motif = 'Motif local', purge_motif_le = current_date - 1
        where organization_id = $1 and artisan_id = $2`,
      [d.org, locale.id]
    );
    await db.query(
      `update public.artisans set blacklist_globale_le = now(), blacklist_globale_motif = 'Motif global', purge_motif_le = current_date - 1 where id = $1`,
      [globale.id]
    );
    return { d, locale, globale };
  }
  const lire = async (d: Dossier, locale: Artisan, globale: Artisan) => {
    await db.query("reset role");
    const { rows: [l] } = await db.query(
      `select blacklist_motif, purge_motif_le is not null as purge from public.artisan_agences where organization_id = $1 and artisan_id = $2`,
      [d.org, locale.id]
    );
    const { rows: [g] } = await db.query(
      `select blacklist_globale_motif as blacklist_motif, purge_motif_le is not null as purge from public.artisans where id = $1`,
      [globale.id]
    );
    return { locale: l, globale: g };
  };

  it("la tâche planifiée laisse les motifs en place, même échus", async () => {
    const { d, locale, globale } = await listesNoiresEchues();
    await jouerLaTache();
    expect(await lire(d, locale, globale)).toEqual({
      locale: { blacklist_motif: "Motif local", purge: true },
      globale: { blacklist_motif: "Motif global", purge: true },
    });
  });

  it("la version interne ne contient aucune trace de la purge ni des listes noires", async () => {
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure) as def`);
    expect(def).not.toMatch(/blacklist|purge_motif_le|artisan_agences|public\.artisans\b/);
    expect(def).not.toMatch(/is_super_admin/);
  });

  it("la version publique garde la purge pour le super-administrateur (usage manuel), avec le même décompte des devis", async () => {
    const { d, locale, globale } = await listesNoiresEchues();
    const perime = await sollicitéAvecDevis(d, "Périmé", -1);
    await db.query("reset role");
    const sa = await compte("sa");
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`, [sa]);
    await agir(sa, { aal: "aal2" });
    const { rows } = await db.query(`select devis_expires, motifs_purges from public.maintenance_artisans()`);
    expect(rows).toEqual([{ devis_expires: 1, motifs_purges: 2 }]);
    expect(await lire(d, locale, globale)).toEqual({
      locale: { blacklist_motif: null, purge: false },
      globale: { blacklist_motif: null, purge: false },
    });
    expect((await statuts({ devis: [perime.devis!] })).devis).toEqual({ [perime.devis!]: "expire" });
  });

  it("la version publique appelle la version interne (une seule définition de la caducité)", async () => {
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.maintenance_artisans()'::regprocedure) as def`);
    expect(def).toContain("public.maintenance_artisans_interne()");
    expect(def).toContain("is_super_admin()");
    expect(def).not.toMatch(/set statut = 'expire'/);
  });
});

describe.skipIf(!DB_URL)("AUT-01 — le relevé de production à faire avant la première exécution", () => {
  it("est en lecture seule et compte exactement ce que la première exécution va changer", async () => {
    const d = await monterDossier();
    const a = await sollicitéAvecDevis(d, "Périmé 1", -9);
    const b = await sollicitéAvecDevis(d, "Périmé 2", -1);
    const autre = await monterDossier();
    await sollicitéAvecDevis(autre, "Valable", 5);
    await solliciter(autre, await creerArtisan(autre, "Sans réponse"));
    await db.query("reset role");
    // Le fichier ne doit rien écrire : hors commentaires, il n'a que des « select » (PostgreSQL n'accepte pas de passer
    // une transaction déjà commencée en lecture seule, on lit donc le texte).
    const instructions = RELEVE.replace(/--[^\n]*/g, "").split(";").map((i) => i.trim()).filter(Boolean);
    expect(instructions).toHaveLength(5);
    for (const i of instructions) {
      expect(i).toMatch(/^select\b/i);
      expect(i).not.toMatch(/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|set_config|nextval)\b/i);
    }
    const resultats = (await db.query(RELEVE)) as unknown as { rows: Record<string, unknown>[] }[];
    expect(resultats).toHaveLength(5);
    expect(resultats[0].rows[0]).toMatchObject({ devis_deposes_perimes: "2", incidents_concernes: "1", agences_concernees: "1" });
    expect(resultats[1].rows.map((r) => r.devis_id).sort()).toEqual([a.devis, b.devis].sort());
    expect(resultats[1].rows.every((r) => r.devis_statut_avant === "depose" && r.sollicitation_statut_avant === "devis_depose")).toBe(true);
    // L'incident dont les deux places sont tenues par des devis périmés est signalé ; l'autre (devis valables) ne l'est pas.
    expect(resultats[2].rows.map((r) => r.incident_id)).toEqual([d.incident]);
    expect(resultats[2].rows[0]).toMatchObject({ sollicitations_vivantes: "2", dont_devis_perimes: "2" });
    // Ces mêmes devis sont ceux que la tâche passe ensuite à « expiré » : le relevé dit vrai.
    await jouerLaTache();
    expect((await statuts({ devis: [a.devis!, b.devis!] })).devis).toEqual({ [a.devis!]: "expire", [b.devis!]: "expire" });
  });
});

/**
 * Le lot « arrêt d'urgence » (D06, migration 20261014200000 : table `supervision_taches_arret` et prédicat
 * `tache_planifiee_autorisee`) n'est pas dans cette branche. Quand il y est (après intégration), ses objets RÉELS sont
 * utilisés ; sinon une doublure du même contrat est posée le temps du test (transaction annulée). Dans les deux cas la
 * migration de l'arrêt est rejouée par-dessus, comme sur une base où le lot de l'arrêt d'urgence est passé en premier.
 */
async function integrerLeLotArret(): Promise<"reel" | "doublure"> {
  await db.query("reset role");
  const { rows: [{ present }] } = await db.query<{ present: boolean }>(
    `select to_regprocedure('public.tache_planifiee_autorisee(text)') is not null as present`
  );
  if (!present) {
    await db.query(`create table public.supervision_taches_arret (tache text not null, cle text not null, primary key (tache, cle))`);
    await db.query(`insert into public.supervision_taches_arret values ('retention-quotidienne', 'purge'), ('cycle-mensuel', 'appels'), ('cycle-mensuel', 'quittances')`);
    await db.query(
      `create function public.tache_planifiee_autorisee(p_tache text) returns boolean language plpgsql stable security definer set search_path = '' as $f$
       begin
         if p_tache is null or not exists (select 1 from public.supervision_taches_arret where tache = p_tache) then
           raise exception 'Tâche planifiée inconnue de la table d''arrêt : %', coalesce(p_tache, '(vide)');
         end if;
         return not exists (select 1 from public.supervision_arrets a where a.arrete
           and (a.cle = 'global' or a.cle in (select t.cle from public.supervision_taches_arret t where t.tache = p_tache)));
       end $f$`
    );
    await db.query(`revoke all on function public.tache_planifiee_autorisee(text) from public, anon, authenticated, service_role`);
  }
  await db.query(lireMigrationArret());
  return present ? "reel" : "doublure";
}

/** Pose (ou lève) un arrêt d'urgence, comme le ferait commander_arret_supervision. */
async function arreter(cle: string, arrete = true) {
  await db.query("reset role");
  const auteur = await compte("arret");
  await db.query(
    `insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, $2, 'Essai de contrôle', $3)
     on conflict (cle) do update set arrete = excluded.arrete`,
    [cle, arrete, auteur]
  );
}

const drapeauSysteme = async () => {
  await db.query("reset role");
  return (await db.query<{ v: string }>(`select coalesce(current_setting('gerimmo.systeme', true), '') as v`)).rows[0].v;
};

describe.skipIf(!DB_URL)("AUT-01 — l'arrêt d'urgence (D06) arrête aussi la caducité des devis", () => {
  it.each(["global", "rappels"])("arrêt « %s » : la tâche n'expire rien et ne pose pas le drapeau système ; levé, le même passage expire", async (cle) => {
    await integrerLeLotArret();
    const d = await monterDossier();
    const p = await sollicitéAvecDevis(d, "Périmé", -2);
    await arreter(cle);
    const drapeau = await drapeauSysteme();

    await jouerLaTache();
    expect(await statuts({ devis: [p.devis!], sollicitations: [p.sollicitation] })).toEqual({
      devis: { [p.devis!]: "depose" },
      sollicitations: { [p.sollicitation]: "devis_depose" },
    });
    expect(await drapeauSysteme()).toBe(drapeau);
    expect((await db.query(`select public.maintenance_artisans_interne() as n`)).rows[0].n).toBe(0);

    // La même base, la même donnée, la même tâche : l'arrêt levé, elle fait son travail (le test n'est pas vide).
    await arreter(cle, false);
    expect((await db.query(`select public.maintenance_artisans_interne() as n`)).rows[0].n).toBe(1);
    expect(await statuts({ devis: [p.devis!], sollicitations: [p.sollicitation] })).toEqual({
      devis: { [p.devis!]: "expire" },
      sollicitations: { [p.sollicitation]: "expiree" },
    });
  });

  it.each(["marketing", "purge", "relances", "territoire"])("l'arrêt « %s » n'est pas le sien : la tâche passe", async (cle) => {
    await integrerLeLotArret();
    const d = await monterDossier();
    const p = await sollicitéAvecDevis(d, "Périmé", -2);
    await arreter(cle);
    await jouerLaTache();
    expect((await statuts({ devis: [p.devis!] })).devis).toEqual({ [p.devis!]: "expire" });
  });

  it("la version publique du super-administrateur obéit au même arrêt pour la caducité (elle passe par la version interne)", async () => {
    await integrerLeLotArret();
    const d = await monterDossier();
    const p = await sollicitéAvecDevis(d, "Périmé", -2);
    await db.query("reset role");
    const sa = await compte("sa");
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`, [sa]);
    await arreter("global");
    await agir(sa, { aal: "aal2" });
    expect((await db.query(`select devis_expires from public.maintenance_artisans()`)).rows).toEqual([{ devis_expires: 0 }]);
    expect((await statuts({ devis: [p.devis!] })).devis).toEqual({ [p.devis!]: "depose" });
    await arreter("global", false);
    await agir(sa, { aal: "aal2" });
    expect((await db.query(`select devis_expires from public.maintenance_artisans()`)).rows).toEqual([{ devis_expires: 1 }]);
  });

  it("la version interne lit l'arrêt AVANT d'écrire quoi que ce soit (ni drapeau système, ni mise à jour)", async () => {
    const { rows: [{ def }] } = await db.query<{ def: string }>(`select pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure) as def`);
    const lecture = def.indexOf("tache_planifiee_autorisee");
    expect(lecture).toBeGreaterThan(0);
    expect(lecture).toBeLessThan(def.indexOf("tache_systeme()"));
    expect(lecture).toBeLessThan(def.indexOf("update public.incident_devis"));
    expect(def).toContain("'maintenance-artisans'");
  });

  it("la migration inscrit la tâche dans la table de correspondance de l'arrêt, avec la clé « rappels », une seule fois", async () => {
    await integrerLeLotArret();
    const lire = async () => (await db.query(`select tache, cle from public.supervision_taches_arret where tache = 'maintenance-artisans'`)).rows;
    expect(await lire()).toEqual([{ tache: "maintenance-artisans", cle: "rappels" }]);
    const avant = (await db.query(`select count(*)::int as n from public.supervision_taches_arret`)).rows[0].n;
    await db.query(lireMigrationArret());
    expect(await lire()).toEqual([{ tache: "maintenance-artisans", cle: "rappels" }]);
    expect((await db.query(`select count(*)::int as n from public.supervision_taches_arret`)).rows[0].n).toBe(avant);
    // Les lignes des autres tâches ne sont pas touchées.
    expect((await db.query(`select count(*)::int as n from public.supervision_taches_arret where tache <> 'maintenance-artisans'`)).rows[0].n).toBeGreaterThan(0);
  });

  it("tant que le lot de l'arrêt d'urgence n'est pas là, la migration se joue sans erreur, ne crée rien et la tâche passe", async ({ skip }) => {
    const { rows: [{ present }] } = await db.query<{ present: boolean }>(`select to_regprocedure('public.tache_planifiee_autorisee(text)') is not null as present`);
    if (present) skip(); // lot intégré : ce cas n'existe plus, les cas ci-dessus jouent sur les objets réels
    await db.query(lireMigrationArret());
    const { rows: [{ table, fonction }] } = await db.query(
      `select to_regclass('public.supervision_taches_arret') as table, to_regprocedure('public.tache_planifiee_autorisee(text)') as fonction`
    );
    expect({ table, fonction }).toEqual({ table: null, fonction: null });
    const d = await monterDossier();
    const p = await sollicitéAvecDevis(d, "Périmé", -2);
    await arreter("global"); // sans le lot de l'arrêt d'urgence, aucune tâche pg_cron n'est arrêtée (état du reste des tâches aujourd'hui)
    await jouerLaTache();
    expect((await statuts({ devis: [p.devis!] })).devis).toEqual({ [p.devis!]: "expire" });
  });
});

describe.skipIf(!DB_URL)("AUT-01 — rejeu et retour arrière", () => {
  async function empreinte() {
    await db.query("reset role");
    const { rows } = await db.query(
      `select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as def, coalesce(p.proacl::text, '') as acl
         from pg_proc p where p.oid in ('public.maintenance_artisans()'::regprocedure, 'public.maintenance_artisans_interne()'::regprocedure)
        order by 1`
    );
    const { rows: taches } = await db.query(`select jobid, jobname, schedule, command from cron.job order by jobname`);
    return { rows, taches };
  }

  it("rejouées (deux fois, dans l'ordre), les migrations ne changent rien : mêmes définitions, mêmes droits, même tâche", async () => {
    const avant = await empreinte();
    expect(avant.taches.filter((t) => t.jobname === "maintenance-artisans")).toHaveLength(1);
    for (let i = 0; i < 2; i++) {
      await db.query(MIGRATION);
      await db.query(lireMigrationArret());
      expect(await empreinte()).toEqual(avant);
    }
  });

  it("rejouées, elles ne touchent à aucune donnée : devis et sollicitations gardent leur état", async () => {
    const d = await monterDossier();
    const a = await sollicitéAvecDevis(d, "Périmé", -2);
    await db.query("reset role");
    await db.query(MIGRATION);
    await db.query(lireMigrationArret());
    expect(await statuts({ devis: [a.devis!], sollicitations: [a.sollicitation] })).toEqual({
      devis: { [a.devis!]: "depose" },
      sollicitations: { [a.sollicitation]: "devis_depose" },
    });
  });

  it("aucune fonction du schéma public n'est restée ouverte à anon", async () => {
    await db.query("reset role");
    const { rows } = await db.query(
      `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')`
    );
    expect(rows).toEqual([]);
  });

  /**
   * Le script de retour gère sa propre transaction et REFUSE de se jouer dans un lot : on lui retire ici cette seule
   * enveloppe (garde, begin, commit) pour le rejouer dans la transaction du test, annulée à la fin. Tout le reste est
   * le texte du script. Le test lui donne aussi la fonction `cron.unschedule` que l'outil de test local ne fournit pas.
   */
  async function jouerLeRetour(script: string = RETOUR) {
    await db.query("reset role");
    await db.query(
      `create or replace function cron.unschedule(p_nom text) returns boolean language sql as $$
         with s as (delete from cron.job where jobname = p_nom returning 1) select exists (select from s) $$`
    );
    const corps = script
      .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
      .replace(/^begin;$/m, "")
      .replace(/^commit;$/m, "");
    expect(corps).not.toMatch(/statement_timestamp/);
    // L'outil du script vit dans pg_temp, le temps d'une connexion : un second passage dans la même session le retire d'abord.
    await db.query(`drop function if exists pg_temp.restaurer_fonction(text, text, text)`);
    await db.query(corps);
  }

  it("le retour arrière retire la tâche et la version interne, et rétablit la fonction d'origine", async () => {
    await jouerLeRetour();
    await db.query("reset role");
    expect((await db.query(`select count(*)::int as n from cron.job where jobname = 'maintenance-artisans'`)).rows[0].n).toBe(0);
    expect((await db.query(`select to_regprocedure('public.maintenance_artisans_interne()') as f`)).rows[0].f).toBeNull();
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.maintenance_artisans()'::regprocedure) as def`);
    expect(def).not.toContain("maintenance_artisans_interne");
    expect(def).toContain("set statut = 'expire'");
    expect(def).toContain("valide_jusqu_au < current_date");
    // Les droits d'origine sont conservés : ni PUBLIC ni anon.
    const { rows: [{ anon }] } = await db.query(`select has_function_privilege('anon', 'public.maintenance_artisans()', 'EXECUTE') as anon`);
    expect(anon).toBe(false);
  });

  it("le retour arrière est rejouable sans effet, et la migration se rejoue ensuite (marche avant)", async () => {
    await jouerLeRetour();
    const apresUnRetour = await db.query(`select md5(pg_get_functiondef('public.maintenance_artisans()'::regprocedure)) as m`);
    await jouerLeRetour();
    expect((await db.query(`select md5(pg_get_functiondef('public.maintenance_artisans()'::regprocedure)) as m`)).rows).toEqual(apresUnRetour.rows);
    await db.query(MIGRATION);
    expect((await db.query(`select count(*)::int as n from cron.job where jobname = 'maintenance-artisans'`)).rows[0].n).toBe(1);
    expect((await db.query(`select to_regprocedure('public.maintenance_artisans_interne()') is not null as ok`)).rows[0].ok).toBe(true);
  });

  it("le retour arrière n'écrase pas une fonction réécrite depuis (la marque du correctif est absente)", async () => {
    await db.query(
      `create or replace function public.maintenance_artisans() returns table (devis_expires integer, motifs_purges integer)
       language plpgsql security definer set search_path to '' as $f$ begin return query select 0, 0; end $f$`
    );
    await jouerLeRetour();
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.maintenance_artisans()'::regprocedure) as def`);
    expect(def).toContain("select 0, 0");
  });

  describe("le retour de la lecture de l'arrêt d'urgence (20261014211000)", () => {
    const interne = async () =>
      (await db.query<{ def: string }>(`select pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure) as def`)).rows[0].def;

    it("rétablit la caducité sans lecture de l'arrêt, garde la tâche et retire la ligne de correspondance", async () => {
      await integrerLeLotArret();
      await jouerLeRetour(lireRetourArret());
      await db.query("reset role");
      const def = await interne();
      expect(def).not.toContain("tache_planifiee_autorisee");
      expect(def).toContain("set statut = 'expire'");
      expect((await db.query(`select count(*)::int as n from cron.job where jobname = 'maintenance-artisans'`)).rows[0].n).toBe(1);
      expect((await db.query(`select count(*)::int as n from public.supervision_taches_arret where tache = 'maintenance-artisans'`)).rows[0].n).toBe(0);
      // Les lignes des autres tâches restent.
      expect((await db.query(`select count(*)::int as n from public.supervision_taches_arret`)).rows[0].n).toBeGreaterThan(0);
      // Effet : l'arrêt global n'arrête plus la caducité (le défaut revient, comme le script le dit), le travail se fait.
      const d = await monterDossier();
      const p = await sollicitéAvecDevis(d, "Périmé", -2);
      await arreter("global");
      await jouerLaTache();
      expect((await statuts({ devis: [p.devis!] })).devis).toEqual({ [p.devis!]: "expire" });
      // Droits d'origine : la version interne reste fermée.
      const { rows: [{ anon, service }] } = await db.query(
        `select has_function_privilege('anon', 'public.maintenance_artisans_interne()', 'EXECUTE') as anon,
                has_function_privilege('service_role', 'public.maintenance_artisans_interne()', 'EXECUTE') as service`
      );
      expect({ anon, service }).toEqual({ anon: false, service: false });
    });

    it("est rejouable sans effet, et la migration se rejoue ensuite (marche avant)", async () => {
      await integrerLeLotArret();
      await jouerLeRetour(lireRetourArret());
      const apresUn = (await db.query(`select md5(pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure)) as m`)).rows;
      await jouerLeRetour(lireRetourArret());
      expect((await db.query(`select md5(pg_get_functiondef('public.maintenance_artisans_interne()'::regprocedure)) as m`)).rows).toEqual(apresUn);
      await db.query(lireMigrationArret());
      expect(await interne()).toContain("tache_planifiee_autorisee");
      expect((await db.query(`select cle from public.supervision_taches_arret where tache = 'maintenance-artisans'`)).rows).toEqual([{ cle: "rappels" }]);
    });

    it("n'écrase pas une fonction réécrite depuis (la marque du correctif est absente)", async () => {
      await db.query(
        `create or replace function public.maintenance_artisans_interne() returns integer
         language plpgsql security definer set search_path to '' as $f$ begin return 42; end $f$`
      );
      await jouerLeRetour(lireRetourArret());
      expect(await interne()).toContain("return 42");
    });

    it("ne casse pas quand le retour de 20261014210000 a déjà supprimé la fonction", async () => {
      await integrerLeLotArret();
      await db.query(`drop function public.maintenance_artisans_interne()`);
      await jouerLeRetour(lireRetourArret());
      expect((await db.query(`select to_regprocedure('public.maintenance_artisans_interne()') as f`)).rows[0].f).toBeNull();
      expect((await db.query(`select count(*)::int as n from public.supervision_taches_arret where tache = 'maintenance-artisans'`)).rows[0].n).toBe(0);
    });

    it("ne casse pas quand le lot de l'arrêt d'urgence n'est pas là (pas de table de correspondance)", async ({ skip }) => {
      const { rows: [{ present }] } = await db.query<{ present: boolean }>(`select to_regprocedure('public.tache_planifiee_autorisee(text)') is not null as present`);
      if (present) skip(); // lot intégré : la table existe, les cas ci-dessus jouent sur les objets réels
      await jouerLeRetour(lireRetourArret());
      expect((await db.query(`select to_regclass('public.supervision_taches_arret') as t`)).rows[0].t).toBeNull();
      expect((await interne())).not.toContain("tache_planifiee_autorisee");
    });
  });
});
