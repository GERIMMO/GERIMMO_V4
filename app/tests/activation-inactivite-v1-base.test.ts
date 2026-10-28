/**
 * Intégration des textes de la V1 (24/10/2026) : migration 20261024150000_activation_inactivite_v1.sql et son retour.
 *
 * La V1 des conditions (article 9) et la page confidentialité annoncent la suppression d'un compte vingt-quatre mois après
 * la plus tardive de deux dates (dernière connexion d'un utilisateur du compte, fin du dernier abonnement payé), après
 * deux avertissements par courriel. La règle de catalogue `compte:inactif` passe à active, et les deux traitements de
 * l'inactivité la lisent ; l'application passe `VERSION_MIN_INACTIVITE` à la version de la V1.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, retour
 * nommé et atomique, manifeste, LISEZ-MOI, classement en série), et la constante de l'application.
 *
 * Sur une vraie base (SUPABASE_DB_URL : copie de la production d'avant le 24/10 plus les migrations du 24/10), dans une
 * transaction annulée à la fin :
 *  · aucun compte de la base qui n'a pas accepté la V1 n'est visé, même rendu inactif depuis trente mois ; un compte qui
 *    n'a accepté que la version du 30/09 non plus ;
 *  · rien n'est programmé avant vingt-quatre mois et deux avertissements : J-60 à une date annoncée d'au moins vingt-quatre
 *    mois après l'activité et soixante jours après l'avertissement ; ni J-60 seul, ni J-15 avant la date, ne programment ;
 *  · règle inactive : ni avertissement ni programmation, même date atteinte ;
 *  · retour : refus tant qu'une fermeture pour inactivité est programmée ; texte exact de 20261024130000 rendu, règle
 *    inactive, version retirée, rejeu sans effet, marche avant identique ; le retour de 20261024140000 refuse tant que
 *    celle-ci est inscrite.
 * Rejoue la migration et son retour (DDL) : classé en série.
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { verifierBaseDeTest } from "./garde-base";
import { VERSION_MIN_INACTIVITE } from "../src/lib/comptes-fermeture";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url) {
  const cible = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(cible.hostname) || !cible.pathname.startsWith("/gerimmo_ci_")) {
    throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
  }
}
const VERSION = "20261024150000";
const NOM = `${VERSION}_activation_inactivite_v1`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const FERMETURE = readFileSync("supabase/migrations/20261024130000_fermeture_comptes.sql", "utf8");
const RETOUR_CONSERVATION = readFileSync("supabase/retours-arriere/20261024140000_conservation_et_prospection.retour.sql", "utf8");

/** Le corps (entre `as $$` et `$$;`) d'une fonction de 20261024130000. */
function corps130000(nom: string): string {
  const debut = FERMETURE.indexOf(`create or replace function public.${nom}(`);
  const m = /as \$\$([\s\S]*?)\$\$;/.exec(FERMETURE.slice(debut));
  if (!m) throw new Error(`corps introuvable : ${nom}`);
  return m[1];
}

describe("activation de l'inactivité — fichiers (sans base)", () => {
  it("la V1 et la règle d'inactivité partent ensemble : VERSION_MIN_INACTIVITE est la version de la V1", () => {
    expect(VERSION_MIN_INACTIVITE).toBe(CONDITIONS_VERSION);
    expect(VERSION_MIN_INACTIVITE).toBe("2026-10-24");
  });

  it("la migration est rejouable sans transaction interne, sans jour de Paris nommé, et ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toContain("aujourdhui_paris");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path = ''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    expect(code).toContain("update public.retention_rules set actif = true where data_type = 'compte:inactif'");
    expect(MIGRATION).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("hors du bloc marqué, les deux fonctions gardent le texte de 20261024130000", () => {
    for (const nom of ["comptes_inactifs_a_prevenir", "fermetures_comptes_programmer_inactifs"]) {
      const debut = MIGRATION.indexOf(`create or replace function public.${nom}(`);
      const nouveau = /as \$\$([\s\S]*?)\$\$;/.exec(MIGRATION.slice(debut))![1];
      const sansBloc = nouveau
        .replace(/\n  -- ACTIVATION_INACTIVITE_20261024[^\n]*\n  if not exists \(select 1 from public\.retention_rules regle where regle\.data_type = 'compte:inactif' and regle\.actif\) then( return; end if;|\n    return jsonb_build_object\('programmees', 0, 'echecs', 0, 'regle_inactive', true\);\n  end if;)/, "");
      expect(sansBloc, nom).toBe(corps130000(nom));
      expect(nouveau, nom).toContain("ACTIVATION_INACTIVITE_20261024");
    }
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique et rend le texte de 130000", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toMatch(/^-- RETOUR ARRIÈRE de /m);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where left(version, 14) = '${VERSION}'`);
    expect(transactionsInterdites(RETOUR)).toEqual([]);
    expect(RETOUR).not.toContain("ACTIVATION_INACTIVITE_20261024 :");
    for (const nom of ["comptes_inactifs_a_prevenir", "fermetures_comptes_programmer_inactifs"]) {
      expect(RETOUR).toContain(`as $fonction$${corps130000(nom)}$fonction$;`);
    }
  });

  it("manifeste, procédure de retour, chaîne « Ordre complet » et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste).toContain(`${NOM}.sql`);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024140000_conservation_et_prospection.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi).toMatch(/Ordre complet si tout doit être défait :\s*(?:`20261028100200`[^`]*)?`20261027100000`[^`]*`20261026110449`[^`]*`20261026090335`[^`]*`20261025192344`[^`]*`20261024105901`[^`]*`20261024150000`[^`]*`20261024140000`/);
    expect(RETOUR_CONSERVATION).toContain("left(version, 14) > '20261024140000' and left(version, 14) <= '20261024150000'");
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/activation-inactivite-v1-base.test.ts"');
  });
});

describe.skipIf(!url)("activation de l'inactivité avec la V1 (avec base)", () => {
  let db: Client;
  /** Les comptes de la copie de production, avant tout ajout de ce fichier. */
  let comptesDeLaBase: string[] = [];

  async function proprietaire() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
  async function serviceRole() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)");
    await db.query("set local role service_role");
  }
  async function un<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    return (await db.query(sql, params)).rows[0] as T;
  }
  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return `${(e as { code?: string }).code} ${(e as Error).message}`;
    }
  }
  /** Un compte fictif dont la dernière connexion remonte à `ilYa`, qui a accepté `version` à l'inscription (ou rien). */
  async function compte(prefixe: string, version: string | null, ilYa: string): Promise<string> {
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb,
         case when $2::text is null then '{}'::jsonb else jsonb_build_object('cgu_version', $2::text) end,
         now() - $3::interval, now(), now() - $3::interval, '', '', '', '', '')
       returning id`,
      [prefixe, version, ilYa]
    );
    return id;
  }
  /** Un espace de propriétaire direct créé il y a `ilYa`, dont le compte est le titulaire. */
  async function espace(titulaire: string, ilYa: string): Promise<string> {
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      "insert into public.organizations (name, status, type, created_at) values ('Espace dormant fictif', 'active', 'proprietaire_direct', now() - $1::interval) returning id",
      [ilYa]);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [titulaire, id]);
    return id;
  }
  async function prevenir(version: string | null = CONDITIONS_VERSION): Promise<Record<string, any>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    await serviceRole();
    const { rows } = await db.query("select * from public.comptes_inactifs_a_prevenir($1, 1000)", [version]);
    await proprietaire();
    return rows;
  }
  async function programmerInactifs(): Promise<Record<string, unknown>> {
    await proprietaire();
    return (await un<{ r: Record<string, unknown> }>("select public.fermetures_comptes_programmer_inactifs() as r")).r;
  }
  async function fermeturesProgrammees(account: string): Promise<number> {
    await proprietaire();
    return Number((await un<{ n: string }>(
      "select count(*) n from public.fermetures_comptes where account_id = $1 and origine = 'inactivite' and statut = 'programmee'", [account])).n);
  }
  async function aujourdhui(): Promise<string> {
    return (await un<{ j: string }>("select ((now() at time zone 'Europe/Paris')::date)::text as j")).j;
  }
  async function consigner(account: string, etape: "j60" | "j15", activite: string, suppression: string) {
    await serviceRole();
    await db.query("select public.avertissement_inactivite_envoye($1, $2, $3, $4)", [account, etape, activite, suppression]);
    await proprietaire();
  }
  /** Le temps passe : avertissements envoyés plus tôt, date annoncée ramenée à `jours` d'aujourd'hui (jour de Paris). */
  async function reculer(account: string, envoyesIlYa: string, dans: number) {
    await proprietaire();
    await db.query(
      `update public.avertissements_inactivite set envoye_le = now() - $2::interval,
              suppression_prevue_le = (now() at time zone 'Europe/Paris')::date + $3::int where account_id = $1`,
      [account, envoyesIlYa, dans]);
  }
  async function etat() {
    return un<{ actif: boolean; prevenir: string; programmer: string }>(
      `select (select actif from public.retention_rules where data_type = 'compte:inactif') as actif,
              md5(pg_get_functiondef('public.comptes_inactifs_a_prevenir(text,integer)'::regprocedure)) as prevenir,
              md5(pg_get_functiondef('public.fermetures_comptes_programmer_inactifs()'::regprocedure)) as programmer`);
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    comptesDeLaBase = (await db.query<{ id: string }>("select id from public.accounts")).rows.map((r) => r.id);
    await db.query(MIGRATION);
    await db.query("update public.supervision_arrets set arrete = false where cle in ('global', 'purge')");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("reset role");
  });

  it("la règle compte:inactif est active, à vingt-quatre mois, et les deux traitements la lisent", async () => {
    const r = await un<{ actif: boolean; duree_mois: number; sort: string }>(
      "select actif, duree_mois, sort from public.retention_rules where data_type = 'compte:inactif'");
    expect(r).toEqual({ actif: true, duree_mois: 24, sort: "suppression" });
    for (const signature of ["comptes_inactifs_a_prevenir(text,integer)", "fermetures_comptes_programmer_inactifs()"]) {
      const def = (await un<{ d: string }>(`select pg_get_functiondef('public.${signature}'::regprocedure) as d`)).d;
      expect(def, signature).toContain("ACTIVATION_INACTIVITE_20261024");
    }
    // Droits inchangés : la clé de service lit les avertissements, personne de l'API ne programme.
    const droits = await un<{ p: string; f: string }>(
      `select array_to_string(proacl, ',') as p,
              (select array_to_string(proacl, ',') from pg_proc where oid = 'public.fermetures_comptes_programmer_inactifs()'::regprocedure) as f
         from pg_proc where oid = 'public.comptes_inactifs_a_prevenir(text,integer)'::regprocedure`);
    expect(droits.p).toContain("service_role=X");
    expect(droits.p).not.toMatch(/(^|,)(anon|authenticated)=/);
    expect(droits.f).not.toMatch(/(service_role|anon|authenticated)=/);
  });

  it("aucun compte de la base qui n'a pas accepté la V1 n'est visé, même inactif depuis trente mois", async () => {
    // La copie de la production d'avant le 24/10 : aucun de ses comptes n'a accepté la V1 (production : aucune acceptation).
    const acceptes = await un<{ n: string }>(
      "select count(*) n from public.acceptations_cgu where account_id = any($1) and version >= $2", [comptesDeLaBase, CONDITIONS_VERSION]);
    expect(Number(acceptes.n)).toBe(0);
    // Rendus inactifs depuis trente mois, espaces compris : toujours personne.
    await db.query("update auth.users set last_sign_in_at = now() - interval '30 months', created_at = now() - interval '30 months' where id = any($1)", [comptesDeLaBase]);
    await db.query(
      "update public.organizations set created_at = now() - interval '30 months' where id in (select organization_id from public.memberships where account_id = any($1))",
      [comptesDeLaBase]);
    const vises = (await prevenir()).filter((r) => comptesDeLaBase.includes(r.account_id));
    expect(vises).toEqual([]);
    // Un compte qui n'a accepté que la version du 30/09 : jamais visé non plus.
    const ancien = await compte("inact-ancien", "2026-09-30", "30 months");
    await espace(ancien, "30 months");
    expect((await prevenir()).filter((r) => r.account_id === ancien)).toEqual([]);
    // Un compte sans aucune acceptation : jamais visé.
    const sans = await compte("inact-sans", null, "30 months");
    expect((await prevenir()).filter((r) => r.account_id === sans)).toEqual([]);
    expect(await programmerInactifs()).toMatchObject({ programmees: 0, echecs: 0 });
  });

  it("rien n'est programmé avant vingt-quatre mois et deux avertissements", async () => {
    const dormeur = await compte("inact-v1", CONDITIONS_VERSION, "23 months");
    await espace(dormeur, "23 months");
    // À vingt-trois mois : l'avertissement J-60 est dû, à une date annoncée d'au moins vingt-quatre mois après l'activité
    // et soixante jours après aujourd'hui.
    const lus = (await prevenir()).filter((r) => r.account_id === dormeur);
    expect(lus).toHaveLength(1);
    const j60 = lus[0];
    expect(j60.etape).toBe("j60");
    const bornes = await un<{ activite24: string; plancher: string; annonce: string }>(
      `select ((($1::timestamptz) at time zone 'Europe/Paris')::date + interval '24 months')::date::text as activite24,
              ((now() at time zone 'Europe/Paris')::date + 60)::text as plancher, ($2::date)::text as annonce`,
      [j60.derniere_activite_le, j60.suppression_le]);
    expect(bornes.annonce >= bornes.activite24).toBe(true);
    expect(bornes.annonce >= bornes.plancher).toBe(true);
    // Sans avertissement consigné : rien n'est programmé.
    expect(await programmerInactifs()).toMatchObject({ programmees: 0 });
    // J-60 seul, même sa date atteinte : rien.
    await consigner(dormeur, "j60", j60.derniere_activite_le, j60.suppression_le);
    await reculer(dormeur, "61 days", 0);
    expect(await programmerInactifs()).toMatchObject({ programmees: 0 });
    expect(await fermeturesProgrammees(dormeur)).toBe(0);
    // J-60 et J-15 consignés, date annoncée pas encore atteinte : rien.
    await reculer(dormeur, "46 days", 14);
    const [j15] = (await prevenir()).filter((r) => r.account_id === dormeur);
    expect(j15.etape).toBe("j15");
    await consigner(dormeur, "j15", j15.derniere_activite_le, j15.suppression_le);
    expect(await programmerInactifs()).toMatchObject({ programmees: 0 });
    expect(await fermeturesProgrammees(dormeur)).toBe(0);
    // Les deux avertissements envoyés et la date annoncée atteinte : la fermeture est programmée, pour aujourd'hui.
    await reculer(dormeur, "61 days", 0);
    expect(await programmerInactifs()).toMatchObject({ programmees: 1, echecs: 0 });
    expect(await fermeturesProgrammees(dormeur)).toBe(1);
    const f = await un<{ effacement_prevu_le: string }>(
      "select effacement_prevu_le::text from public.fermetures_comptes where account_id = $1 and origine = 'inactivite'", [dormeur]);
    expect(f.effacement_prevu_le).toBe(await aujourdhui());
  });

  it("règle inactive : ni avertissement ni programmation, même avec la version de la V1 et la date atteinte", async () => {
    const dormeur = await compte("inact-regle", CONDITIONS_VERSION, "23 months");
    await espace(dormeur, "23 months");
    const [j60] = (await prevenir()).filter((r) => r.account_id === dormeur);
    await consigner(dormeur, "j60", j60.derniere_activite_le, j60.suppression_le);
    await consigner(dormeur, "j15", j60.derniere_activite_le, j60.suppression_le);
    await reculer(dormeur, "61 days", 0);
    await db.query("update public.retention_rules set actif = false where data_type = 'compte:inactif'");
    const autre = await compte("inact-regle-2", CONDITIONS_VERSION, "23 months");
    await espace(autre, "23 months");
    expect((await prevenir()).filter((r) => [dormeur, autre].includes(r.account_id))).toEqual([]);
    expect(await programmerInactifs()).toEqual({ programmees: 0, echecs: 0, regle_inactive: true });
    expect(await fermeturesProgrammees(dormeur)).toBe(0);
  });

  it("le retour de 20261024140000 refuse tant que celle-ci est inscrite", async () => {
    await proprietaire();
    await db.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, 'activation_inactivite_v1', array['essai']) on conflict do nothing", [VERSION]);
    expect(await echec(RETOUR_CONSERVATION)).toMatch(/^55000 Retour 20261024140000 refusé : migration\(s\) plus récente\(s\).*20261024150000/);
  });

  it("retour : refus avec une fermeture pour inactivité programmée ; texte de 130000 rendu ; rejeu sans effet ; marche avant identique", async () => {
    const apres = await etat();
    const dormeur = await compte("inact-retour", CONDITIONS_VERSION, "23 months");
    await espace(dormeur, "23 months");
    const [j60] = (await prevenir()).filter((r) => r.account_id === dormeur);
    await consigner(dormeur, "j60", j60.derniere_activite_le, j60.suppression_le);
    await consigner(dormeur, "j15", j60.derniere_activite_le, j60.suppression_le);
    await reculer(dormeur, "61 days", 0);
    expect(await programmerInactifs()).toMatchObject({ programmees: 1 });
    expect(await echec(RETOUR)).toMatch(/^55000 Retour 20261024150000 refusé : 1 fermeture\(s\) pour inactivité programmée\(s\)/);
    await db.query("update public.fermetures_comptes set statut = 'annulee', annulee_le = now(), annulation_motif = 'Essai du retour' where account_id = $1", [dormeur]);
    await db.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, 'activation_inactivite_v1', array['essai']) on conflict do nothing", [VERSION]);
    await db.query(RETOUR);
    const src = async (nom: string) => (await un<{ s: string }>("select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [nom])).s;
    expect(await src("comptes_inactifs_a_prevenir")).toBe(corps130000("comptes_inactifs_a_prevenir"));
    expect(await src("fermetures_comptes_programmer_inactifs")).toBe(corps130000("fermetures_comptes_programmer_inactifs"));
    const revenu = await etat();
    expect(revenu.actif).toBe(false);
    expect(Number((await un<{ n: string }>("select count(*) n from supabase_migrations.schema_migrations where left(version, 14) = $1", [VERSION])).n)).toBe(0);
    // Les avertissements déjà envoyés restent (preuve de ce qui est parti).
    expect(Number((await un<{ n: string }>("select count(*) n from public.avertissements_inactivite where account_id = $1", [dormeur])).n)).toBe(2);
    await db.query(RETOUR);
    expect(await etat()).toEqual(revenu);
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
  });
});
