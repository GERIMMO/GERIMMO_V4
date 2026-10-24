/**
 * Plan de conformité du 23/10/2026 (lot 1A ; R10, R19, R60) : migration
 * 20261024100000_acceptation_conditions_et_classement_artisans.sql et son retour arrière.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, retour
 * nommé et atomique, manifeste, LISEZ-MOI, classement en série).
 *
 * Sur une vraie base (SUPABASE_DB_URL), dans une transaction annulée à la fin :
 *  · classement des artisans : une note sur deux évaluations passe APRÈS une note sur trois ; sans note, l'ordre
 *    alphabétique ; `publiable` vaut toujours « trois évaluations au moins » ;
 *  · `abonnements_sans_accord_conditions` : seuls les abonnements vivants, non programmés pour finir, dont aucun
 *    responsable n'a accepté la version demandée alors qu'un responsable en avait accepté une autre ; clé de service
 *    seulement ;
 *  · `abonnement_non_reconduction_conditions` : miroir, échéance à préparer, journal d'audit ; clé de service seulement ;
 *  · aujourd'hui (version 2026-09-30) : un compte qui l'a acceptée ne voit pas l'écran, et aucun abonnement n'est listé ;
 *  · rejeu sans effet ; définition inattendue refusée en nommant la fonction ; retour (tri de 20261023180000 rendu au
 *    caractère près, fonctions retirées, version supprimée), rejoué sans effet, puis marche avant.
 * La note des artisans est fixée par une `artisan_note` d'essai (réécrite dans la transaction) ; avec la migration et
 * son retour (DDL), le fichier est classé en série (vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { CONDITIONS_VERSION } from "../src/lib/editeur";
import { nouvelleVersionAAccepter } from "../src/lib/nouvelle-version-conditions";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const VERSION = "20261024100000";
const NOM = `${VERSION}_acceptation_conditions_et_classement_artisans`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const RESEAU = readFileSync("supabase/migrations/20261023180000_reseau_zone_choisie_par_artisan.sql", "utf8");
const SOCLE_ARTISANS = readFileSync("supabase/migrations/20260911180000_module8_artisans_socle.sql", "utf8");
const ARTISANS = "artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux)";
const AFFECTABLES = "artisans_affectables_interne(uuid,public.artisan_metier,public.nature_travaux,text)";
const FONCTIONS = [
  ARTISANS,
  AFFECTABLES,
  "abonnements_sans_accord_conditions(text)",
  "abonnement_non_reconduction_conditions(uuid,text,text,boolean,boolean)",
];

describe("acceptation des conditions et classement des artisans — fichiers (sans base)", () => {
  it("la migration est rejouable sans transaction interne, sans jour de Paris nommé, et ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toContain("aujourdhui_paris");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path = ''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Aucune table nouvelle ; les deux fonctions de la non-reconduction sont réservées à la clé de service.
    expect(code).not.toMatch(/create table/i);
    expect(code).toContain("revoke all on function public.abonnements_sans_accord_conditions(text) from public, anon, authenticated;");
    expect(code).toContain("revoke all on function public.abonnement_non_reconduction_conditions(uuid, text, text, boolean, boolean) from public, anon, authenticated;");
  });

  it("les ancres du tri sont celles de 20261023180000 et de 20260911180000, présentes une fois", () => {
    expect(RESEAU.split("order by n.note_publiee desc nulls last,a.raison_sociale,a.id;")).toHaveLength(2);
    // `artisans_affectables` de 20260911180000, renommée `artisans_affectables_interne` par 20260928081000.
    expect(SOCLE_ARTISANS.split("order by n.note_publiee desc nulls last, a.raison_sociale;")).toHaveLength(2);
    expect(MIGRATION).toContain(`'a.raison_sociale collate "fr-x-icu"'`);
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where left(version, 14) = '${VERSION}'`);
  });

  it("manifeste, procédure de retour et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024090000_versions_conditions_et_archives_comptes.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/acceptation-conditions-base.test.ts"');
    // Le rejeu de 20261023180000 rejoue aussi cette migration, qui réécrit une de ses fonctions.
    expect(readFileSync("tests/reseau-zone-artisan-rejeu.test.ts", "utf8")).toContain(`supabase/migrations/${NOM}.sql`);
  });
});

describe.skipIf(!url)("acceptation des conditions et classement des artisans (avec base)", () => {
  let db: Client;
  let org = "";
  let bien = "";
  let proprietaireBien = "";
  const artisans: Record<string, string> = {};

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  async function compte(prefixe: string): Promise<string> {
    const { rows: [{ id: compteId, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', '', '')
       returning id, email`,
      [prefixe]
    );
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [compteId, email]);
    return compteId;
  }
  async function session(qui: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', 'aal2')::text, true)", [qui]);
    await db.query("set local role authenticated");
  }
  async function serviceRole() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)");
    await db.query("set local role service_role");
  }
  async function proprietaire() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
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
  const empreinte = async () =>
    (await db.query(
      `select jsonb_object_agg(s, jsonb_build_array(
         (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid = to_regprocedure('public.' || s)),
         (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.' || s)),
         obj_description(to_regprocedure('public.' || s), 'pg_proc'))) e
       from unnest($1::text[]) s`,
      [FONCTIONS]
    )).rows[0].e as Record<string, unknown>;
  const corps = async (signature: string) =>
    (await db.query("select prosrc from pg_proc where oid = to_regprocedure($1)", [`public.${signature}`])).rows[0]?.prosrc as string | undefined;

  /** Un espace propriétaire, son responsable et son abonnement ; l'acceptation des conditions clients si demandée. */
  async function espace(options: { accepte?: string[]; statut?: string; annulation?: boolean; agentAccepte?: string } = {}) {
    const responsable = await compte("acc-resp");
    const o = await id("insert into public.organizations(name,type,status) values('Espace essai','proprietaire_direct','active') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [responsable, o]);
    for (const version of options.accepte ?? []) {
      await db.query("insert into public.acceptations_cgu(account_id,version,source,document) values($1,$2,'compte','conditions_clients')", [responsable, version]);
    }
    if (options.agentAccepte) {
      const agent = await compte("acc-agent");
      await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent')", [agent, o]);
      await db.query("insert into public.acceptations_cgu(account_id,version,source,document) values($1,$2,'compte','conditions_clients')", [agent, options.agentAccepte]);
    }
    const sub = `sub_essai_${o.slice(0, 8)}`;
    await db.query(
      "insert into public.abonnements(organization_id,stripe_subscription_id,stripe_statut,periode_fin,annulation_demandee,changement_applique_pour) values($1,$2,$3,'2027-03-01T00:00:00Z',$4,'2027-03-01T00:00:00Z')",
      [o, sub, options.statut ?? "active", options.annulation ?? false]
    );
    return { org: o, sub, responsable };
  }
  const listes = async (version: string) => {
    await serviceRole();
    const { rows } = await db.query<{ organization_id: string }>("select organization_id from public.abonnements_sans_accord_conditions($1)", [version]);
    await proprietaire();
    return rows.map((r) => r.organization_id);
  };

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION);
    // Finitions du 24/10 (relecture transverse 2, point 4) : le retour refuse tant qu'une migration plus récente du plan
    // de conformité est inscrite (la base de la CI les inscrit toutes). Retirées de l'historique, dans la transaction
    // du fichier, annulée à la fin.
    await db.query("delete from supabase_migrations.schema_migrations where left(version, 14) > $1 and left(version, 14) <= '20261024140000'", [VERSION]);
    // Un bailleur et son bien confirmé à Paris 11e ; trois artisans validés, publics, plombiers sur 75011.
    proprietaireBien = await compte("acc-bailleur");
    org = await id("insert into public.organizations(name,type,status) values('Classement réseau','proprietaire_direct','active') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaireBien, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien classement','appartement','1 rue du Test','75011','Paris','75056') returning id", [org]);
    const sirets: Record<string, string> = { Alpha: "13456789012345", Bravo: "23456789012345", Charlie: "33456789012345" };
    for (const nom of ["Alpha", "Bravo", "Charlie"]) {
      artisans[nom] = await id(
        "insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values($1,$2,'0600000000',$3,'publique','valide','verifie') returning id",
        [`${nom} plomberie`, sirets[nom], await compte(`acc-artisan-${nom}`)]
      );
      await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [artisans[nom]]);
      await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [artisans[nom]]);
    }
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("reset role");
    await db.query("rollback to savepoint cas");
  });

  /** Fixe la note des artisans (note, nombre d'évaluations) : `artisan_note` d'essai, avec le seuil réel de trois. */
  async function notes(valeurs: Record<string, [number, number]>) {
    await proprietaire();
    await db.query("create table public.zz_notes_essai(artisan_id uuid primary key, note numeric, nb integer)");
    for (const [nom, [note, nb]] of Object.entries(valeurs)) {
      await db.query("insert into public.zz_notes_essai values($1,$2,$3)", [artisans[nom], note, nb]);
    }
    await db.query(`create or replace function public.artisan_note(p_artisan uuid)
      returns table(note_gerant numeric, note_locataire numeric, note_publiee numeric, nb_evaluations integer, publiable boolean, fiabilite_disponible boolean)
      language sql stable security definer set search_path = '' as $$
        select n.note, null::numeric, n.note, coalesce(n.nb, 0), coalesce(n.nb, 0) >= 3, false
          from (select 1) x left join public.zz_notes_essai n on n.artisan_id = p_artisan
      $$`);
  }
  const proposes = async () => {
    await session(proprietaireBien);
    const { rows } = await db.query<{ raison_sociale: string; publiable: boolean }>(
      "select raison_sociale, publiable from public.artisans_disponibles_bien($1,$2,'plomberie','entretien_courant')",
      [org, bien]
    );
    await proprietaire();
    return rows.map((r) => r.raison_sociale);
  };

  it("`publiable` vaut déjà « trois évaluations au moins » dans artisan_note : seul le tri change", async () => {
    const { rows: [{ d }] } = await db.query("select pg_get_functiondef('public.artisan_note(uuid)'::regprocedure) d");
    expect(d).toContain("(select count(*) from e) >= 3");
  });

  it("une note sur deux évaluations passe après une note sur trois ; sans note, l'ordre alphabétique", async () => {
    // Alpha : 5/5 sur deux avis ; Bravo : 4/5 sur trois avis ; Charlie : aucun avis.
    await notes({ Alpha: [5, 2], Bravo: [4, 3] });
    expect(await proposes()).toEqual(["Bravo plomberie", "Alpha plomberie", "Charlie plomberie"]);
    // Avec le tri de 20261023180000 (avant la migration), la note sur deux avis passait devant.
    await db.query(RETOUR);
    expect(await proposes()).toEqual(["Alpha plomberie", "Bravo plomberie", "Charlie plomberie"]);
  });

  it("deux notes publiables se classent par note décroissante, puis par raison sociale", async () => {
    await notes({ Alpha: [4, 5], Bravo: [4.5, 3], Charlie: [4, 9] });
    expect(await proposes()).toEqual(["Bravo plomberie", "Alpha plomberie", "Charlie plomberie"]);
  });

  // Relecture adverse du 24/10 (défaut 4) : sans note, « l'ordre alphabétique de la raison sociale » (article 8.8, A5).
  // La collation par défaut de la base (C.UTF-8 en CI) rangeait les capitales avant les minuscules et les lettres
  // accentuées après « Z » : `Batiplus < Bâti Plus < Zinc SARL < abri jardin < Électricité Martin`.
  it("sans note : l'ordre alphabétique français (casse et accents), quelle que soit la collation de la base", async () => {
    const ajoutes: Record<string, string> = { "Zinc SARL": "43456789012345", "abri jardin": "53456789012345", "Électricité Martin": "63456789012345", "Batiplus": "73456789012345", "Bâti Plus": "83456789012345" };
    for (const [nom, siret] of Object.entries(ajoutes)) {
      const a = await id(
        "insert into public.artisans(raison_sociale,siret,telephone,account_id,visibilite,statut_plateforme,siret_etat) values($1,$2,'0600000000',$3,'publique','valide','verifie') returning id",
        [nom, siret, await compte("acc-artisan-alpha")]
      );
      await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [a]);
      await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [a]);
    }
    await notes({});
    expect(await proposes()).toEqual([
      "abri jardin", "Alpha plomberie", "Bâti Plus", "Batiplus", "Bravo plomberie", "Charlie plomberie", "Électricité Martin", "Zinc SARL",
    ]);
  });

  // Relecture adverse du 24/10 (défaut 5) : `artisans_affectables` (contacts personnels de l'espace, exécutable par un
  // compte connecté) gardait l'ancien tri, la note dès la première évaluation.
  it("artisans_affectables suit le même classement : la note à partir de trois évaluations, puis l'ordre alphabétique", async () => {
    for (const nom of ["Alpha", "Bravo", "Charlie"]) {
      await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisans[nom]]);
    }
    await notes({ Alpha: [5, 2], Bravo: [4, 3] });
    await session(proprietaireBien);
    const { rows } = await db.query<{ raison_sociale: string }>(
      "select raison_sociale from public.artisans_affectables($1,'plomberie','entretien_courant','75011')",
      [org]
    );
    await proprietaire();
    expect(rows.map((r) => r.raison_sociale)).toEqual(["Bravo plomberie", "Alpha plomberie", "Charlie plomberie"]);
  });

  it("sans accord : seuls les abonnements vivants dont aucun responsable n'a accepté la version, après en avoir accepté une autre", async () => {
    const ancien = await espace({ accepte: ["2026-09-30"] });
    const accepte = await espace({ accepte: ["2026-09-30", "v-nouvelle"] });
    const jamais = await espace();
    const programme = await espace({ accepte: ["2026-09-30"], annulation: true });
    const annule = await espace({ accepte: ["2026-09-30"], statut: "canceled" });
    const agentSeul = await espace({ accepte: ["2026-09-30"], agentAccepte: "v-nouvelle" });
    const liste = await listes("v-nouvelle");
    expect(liste).toContain(ancien.org);
    // L'acceptation d'un agent ne vaut pas celle du Client.
    expect(liste).toContain(agentSeul.org);
    for (const e of [accepte, jamais, programme, annule]) expect(liste).not.toContain(e.org);
  });

  it("aujourd'hui : un responsable qui a accepté la version en vigueur ne voit pas l'écran, et rien n'est listé pour elle", async () => {
    const e = await espace({ accepte: [CONDITIONS_VERSION] });
    await session(e.responsable);
    const { rows } = await db.query<{ version: string }>(
      "select version from public.acceptations_cgu where account_id = $1 and document = 'conditions_clients' order by acceptee_le desc limit 1",
      [e.responsable]
    );
    await proprietaire();
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: rows[0]?.version ?? null })).toBeNull();
    expect(await listes(CONDITIONS_VERSION)).not.toContain(e.org);
  });

  it("consignation : miroir posé, échéance remise à préparer si un échéancier a été libéré, journal d'audit", async () => {
    const e = await espace({ accepte: ["2026-09-30"] });
    await serviceRole();
    await db.query("select public.abonnement_non_reconduction_conditions($1,$2,'v-nouvelle',true,true)", [e.org, e.sub]);
    await proprietaire();
    const { rows: [a] } = await db.query("select annulation_demandee, changement_applique_pour from public.abonnements where organization_id = $1", [e.org]);
    expect(a).toEqual({ annulation_demandee: true, changement_applique_pour: null });
    const { rows: journal } = await db.query("select action, details from public.audit_log where organization_id = $1 and action like 'abonnement%'", [e.org]);
    expect(journal).toEqual([{ action: "abonnement_non_reconduit_conditions", details: { version: "v-nouvelle", periode_fin: "2027-03-01T00:00:00+00:00", echeancier_libere: true } }]);
    // Programmé pour finir : il n'est plus listé.
    expect(await listes("v-nouvelle")).not.toContain(e.org);
  });

  it("consignation d'un échec après libération de l'échéancier : échéance à préparer, rien de posé, aucun journal", async () => {
    const e = await espace({ accepte: ["2026-09-30"] });
    await serviceRole();
    await db.query("select public.abonnement_non_reconduction_conditions($1,$2,'v-nouvelle',true,false)", [e.org, e.sub]);
    await proprietaire();
    const { rows: [a] } = await db.query("select annulation_demandee, changement_applique_pour from public.abonnements where organization_id = $1", [e.org]);
    expect(a).toEqual({ annulation_demandee: false, changement_applique_pour: null });
    expect((await db.query("select 1 from public.audit_log where organization_id = $1 and action like 'abonnement%'", [e.org])).rows).toHaveLength(0);
  });

  it("consignation : abonnement d'une autre organisation refusé ; paramètres vides refusés", async () => {
    const e = await espace({ accepte: ["2026-09-30"] });
    const autre = await espace({ accepte: ["2026-09-30"] });
    await serviceRole();
    expect(await echec("select public.abonnement_non_reconduction_conditions($1,$2,'v-nouvelle')", [e.org, autre.sub])).toMatch(/^22023 Abonnement introuvable/);
    expect(await echec("select public.abonnement_non_reconduction_conditions($1,$2,'  ')", [e.org, e.sub])).toMatch(/^22023/);
    expect(await echec("select * from public.abonnements_sans_accord_conditions('')")).toMatch(/^22023/);
  });

  it("droits : ni anon, ni un compte connecté, ni un super-administrateur n'appellent les deux fonctions", async () => {
    const e = await espace({ accepte: ["2026-09-30"] });
    for (const role of ["anon", "authenticated"]) {
      const { rows: [{ lire, poser }] } = await db.query(
        "select has_function_privilege($1, 'public.abonnements_sans_accord_conditions(text)', 'execute') lire, has_function_privilege($1, 'public.abonnement_non_reconduction_conditions(uuid,text,text,boolean,boolean)', 'execute') poser",
        [role]
      );
      expect({ role, lire, poser }).toEqual({ role, lire: false, poser: false });
    }
    await session(e.responsable);
    expect(await echec("select * from public.abonnements_sans_accord_conditions('v-nouvelle')")).toMatch(/^42501/);
    expect(await echec("select public.abonnement_non_reconduction_conditions($1,$2,'v-nouvelle')", [e.org, e.sub])).toMatch(/^42501/);
    // Même appelée par le propriétaire des fonctions sans jeton de service, la garde interne refuse.
    await proprietaire();
    expect(await echec("select * from public.abonnements_sans_accord_conditions('v-nouvelle')")).toMatch(/^42501 Accès réservé au traitement/);
  });

  // Relecture adverse du 24/10 (défaut 2) : la garde de l'espace artisan (conditionsArtisansAAccepter) se tait quand
  // `artisan_supervise()` désigne un artisan, c'est-à-dire pendant un diagnostic du super-administrateur. Ce contrat-là :
  // l'artisan supervisé pour le super-administrateur en diagnostic, rien pour l'artisan lui-même ni une fois la session
  // fermée ; et en diagnostic, l'acceptation lue pour le compte connecté est bien absente, le clic refusé.
  it("diagnostic : artisan_supervise() désigne l'artisan au seul super-administrateur en session ouverte", async () => {
    const superAdmin = await compte("acc-super-admin");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin')", [superAdmin]);
    const { rows: [{ account_id: compteArtisan }] } = await db.query("select account_id from public.artisans where id = $1", [artisans.Alpha]);
    await db.query("insert into public.acceptations_cgu(account_id,version,source,document) values($1,'2026-11-15','compte','conditions_artisans')", [compteArtisan]);
    const s = await id("insert into public.supervision_sessions_artisan(account_id,artisan_id,expire_le,motif) values($1,$2,now() + interval '1 hour','diagnostic essai') returning id", [superAdmin, artisans.Alpha]);

    await session(superAdmin);
    expect((await db.query("select public.artisan_supervise() a")).rows[0].a).toBe(artisans.Alpha);
    expect((await db.query("select public.mon_artisan_id() a")).rows[0].a).toBe(artisans.Alpha);
    // Ce que l'ancienne garde lisait : l'acceptation du super-administrateur, absente ; et son clic est refusé.
    expect((await db.query("select count(*)::int n from public.acceptations_cgu where account_id = auth.uid() and document = 'conditions_artisans'")).rows[0].n).toBe(0);
    expect(await echec("select public.accepter_cgu('2026-11-15','compte','conditions_artisans')")).toMatch(/lecture seule/);

    await session(compteArtisan);
    expect((await db.query("select public.artisan_supervise() a")).rows[0].a).toBeNull();

    await proprietaire();
    await db.query("update public.supervision_sessions_artisan set fermee_le = now() where id = $1", [s]);
    await session(superAdmin);
    expect((await db.query("select public.artisan_supervise() a")).rows[0].a).toBeNull();
  });

  it("rejouée, la migration ne change ni définitions, ni droits, ni commentaires", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(avant);
  });

  it("une définition inattendue de artisans_disponibles_bien arrête la migration et le retour, en nommant la fonction", async () => {
    const { rows: [{ d }] } = await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [`public.${ARTISANS}`]);
    const converti = 'order by case when n.publiable then n.note_publiee end desc nulls last,a.raison_sociale collate "fr-x-icu",a.id;';
    expect(d).toContain(converti);
    await db.query((d as string).replace(converti, "order by a.raison_sociale,a.id;"));
    expect(await echec(MIGRATION)).toMatch(/définition inattendue de artisans_disponibles_bien/);
    expect(await echec(RETOUR)).toMatch(/définition inattendue de artisans_disponibles_bien/);
  });

  it("retour : tri de 20261023180000 au caractère près, fonctions retirées, version supprimée ; rejoué sans effet ; puis marche avant", async () => {
    const migre = await empreinte();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'acceptation_conditions_et_classement_artisans') on conflict do nothing", [VERSION]);
    await db.query(RETOUR);
    const origine = /create or replace function public\.artisans_disponibles_bien\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(RESEAU)?.[1];
    expect(origine).toBeTruthy();
    expect(await corps(ARTISANS)).toBe(origine);
    const origineAffectables = /create function public\.artisans_affectables\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(SOCLE_ARTISANS)?.[1];
    expect(origineAffectables).toBeTruthy();
    expect(await corps(AFFECTABLES)).toBe(origineAffectables);
    expect(await corps("abonnements_sans_accord_conditions(text)")).toBeUndefined();
    expect(await corps("abonnement_non_reconduction_conditions(uuid,text,text,boolean,boolean)")).toBeUndefined();
    expect((await db.query("select 1 from supabase_migrations.schema_migrations where version = $1", [VERSION])).rows).toHaveLength(0);
    const apres = await empreinte();
    await db.query(RETOUR);
    expect(await empreinte()).toEqual(apres);
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(migre);
  });

  it("la forme convertie sans collation (premier état de cette migration) est complétée ; le retour l'accepte aussi", async () => {
    const migre = await empreinte();
    const converti = (await corps(ARTISANS))!;
    const { rows: [{ d }] } = await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [`public.${ARTISANS}`]);
    await db.query((d as string).replace(' collate "fr-x-icu",a.id;', ",a.id;"));
    expect(await corps(ARTISANS)).not.toBe(converti);
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(migre);
    await db.query((d as string).replace(' collate "fr-x-icu",a.id;', ",a.id;"));
    await db.query(RETOUR);
    const origine = /create or replace function public\.artisans_disponibles_bien\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(RESEAU)?.[1];
    expect(await corps(ARTISANS)).toBe(origine);
  });

  it("le retour est atomique : une erreur après lui, dans la même transaction, annule tout", async () => {
    const migre = await empreinte();
    await db.query("savepoint atomique");
    await expect(db.query(`${RETOUR}; select 1/0;`)).rejects.toMatchObject({ code: "22012" });
    await db.query("rollback to savepoint atomique");
    expect(await empreinte()).toEqual(migre);
  });
});
