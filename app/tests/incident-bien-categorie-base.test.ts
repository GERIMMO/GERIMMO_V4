/**
 * LA DÉCLARATION D'INCIDENT DEPUIS LA FICHE DU BIEN DEMANDE LA CATÉGORIE ET L'URGENCE — audit palier 1 du 22/11/2026,
 * P1-19 (« une seule déclaration d'incident côté gestionnaire »).
 *
 * Le défaut : cette porte écrivait toujours la catégorie « autre » et l'urgence « normale ».
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. sur un logement, la catégorie et l'urgence choisies sont au dossier ; une urgence pose l'alerte « critique » ;
 *     le titre, la date et la commande restent ce qu'ils étaient ;
 *  2. le « doublon possible » compare désormais de vraies catégories, sur le logement comme sur les parties communes ;
 *  3. sur les parties communes, l'urgence est écrite au dossier, à l'alerte et au fil ;
 *  4. l'appel à sept arguments de la version précédente de l'application aboutit et écrit ce qu'il écrivait ;
 *  5. catégorie vide ou inconnue : refus, rien n'est créé ; la commande rejouée ne crée rien de plus ;
 *  6. ni le locataire, ni un compte étranger à l'espace, ni un visiteur ne peuvent déclarer ;
 *  7. une seule fonction de ce nom ; la migration se rejoue sans effet ; son retour rend la signature à sept arguments
 *     et le corps exact de la migration du 1er novembre, sans toucher aux incidents déclarés.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { CATEGORIES_INCIDENT } from "../src/lib/incidents";

const NOM = "20261122220000_incident_bien_categorie_urgence";
const NEUF = "public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid,text,public.incident_urgence)";
const SEPT = "public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("incident déclaré depuis la fiche du bien — manifeste, retour et écran (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé et sa place en tête de la chaîne du jour de Paris", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // La fonction cite le jour de Paris : son retour précède tous les autres dans l'ordre complet.
    expect(lisezMoi).toMatch(/Ordre complet si tout doit être défait :\n`20261122220000` \(/);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/incident-bien-categorie-base.test.ts"');
  });

  it("la migration retire l'ancienne signature, n'ouvre rien aux visiteurs, et garde les valeurs d'avant par défaut", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("drop function if exists public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid);");
    expect(sql).toContain("p_categorie text default 'autre'");
    expect(sql).toContain("p_urgence public.incident_urgence default 'normale'");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toContain("poser_gardes_abonnement");
  });

  it("les deux portes du gestionnaire posent les mêmes questions : mêmes catégories, mêmes libellés d'urgence", () => {
    const fiche = readFileSync("src/components/declaration-incident-bien.tsx", "utf8");
    const ecran = readFileSync("src/app/agence/[orgId]/incidents/nouveau/formulaire-incident.tsx", "utf8");
    const options = (source: string, debut: RegExp) => {
      const select = debut.exec(source)?.[0] ?? "";
      return [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
    };
    const urgencesEcran = options(ecran, /<select\s+id="urgence"[\s\S]*?<\/select>/);
    expect(urgencesEcran).toEqual([["normale", "Normal — sous quelques jours"], ["urgente", "Urgent — dégât en cours"]]);
    expect(options(fiche, /<select name="urgence"[\s\S]*?<\/select>/)).toEqual(urgencesEcran);
    // Les catégories viennent de la même liste, dans les deux écrans : aucune liste recopiée.
    for (const source of [fiche, ecran]) expect(source).toMatch(/CATEGORIES_INCIDENT\.map\(\(?c\)?\s*=>/);
    expect(fiche).toMatch(/<select name="categorie" required defaultValue=""/);
    expect(fiche).toContain("Urgent : un dégât est en cours ou le logement est inutilisable.");
    const action = readFileSync("src/app/actions/incident-bien-simple.ts", "utf8");
    expect(action).toContain("p_categorie:categorie,p_urgence:urgence");
  });
});

describe.skipIf(!url)("incident déclaré depuis la fiche du bien, catégorie et urgence (avec base)", () => {
  let db: Client;
  let org = "", bien = "", lot = "", proprietaire = "", locataire = "", etranger = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  type Saisie = { lot?: string | null; titre?: string; note?: string | null; categorie?: string | null; urgence?: string | null; commande?: string; espace?: string };
  const APPEL = `select public.declarer_incident_bien_simple(p_org => $1, p_bien => $2, p_lot => $3, p_titre => $4,
    p_date => public.aujourdhui_paris(), p_note => $5, p_commande => $6, p_categorie => $7, p_urgence => $8::public.incident_urgence) id`;
  const parametres = (s: Saisie) => [s.espace ?? org, bien, s.lot === undefined ? lot : s.lot, s.titre ?? "Fuite sous l’évier", s.note ?? null,
    s.commande ?? randomUUID(), s.categorie === undefined ? "plomberie_joint" : s.categorie, s.urgence === undefined ? "normale" : s.urgence];
  const declarer = (s: Saisie = {}) => id(APPEL, parametres(s));
  const refuse = (s: Saisie = {}) => refus(APPEL, parametres(s));
  const dossier = async (incident: string) => { await base(); return (await db.query(
    "select categorie, urgence::text urgence, titre, description, lot_id, bien_id, canal::text canal, date_signalement = public.aujourdhui_paris() du_jour, created_by from public.incidents where id=$1", [incident])).rows[0]; };
  const alerte = async (incident: string) => { await base(); return (await db.query(
    "select criticite::text criticite, titre, details from public.alerts where organization_id=$1 and type='incident_a_qualifier' and details->>'incident_id'=$2", [org, incident])).rows; };
  const declaration = async (incident: string) => { await base(); return (await db.query(
    "select acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='declaration'", [incident])).rows; };
  const nombre = async () => { await base(); return (await db.query("select count(*)::int n from public.incidents where organization_id=$1", [org])).rows[0].n as number; };

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai incident du bien fictif','proprietaire_direct','active') returning id");
    const autreOrg = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    proprietaire = await compte(); locataire = await compte(); etranger = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire'),($4,$5,'proprietaire_direct')", [proprietaire, org, locataire, etranger, autreOrg]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','immeuble','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Logement fictif','brouillon') returning id", [org, bien]);
  });

  it("sur un logement : la catégorie et l'urgence choisies sont au dossier, une urgence pose l'alerte critique", async () => {
    await agir(proprietaire);
    const incident = await declarer({ categorie: "plomberie_canalisation", urgence: "urgente", titre: "  Colonne percée  ", note: " Eau au plafond du 2e. " });
    expect(await dossier(incident)).toEqual({
      categorie: "plomberie_canalisation", urgence: "urgente", titre: "Colonne percée", description: "Colonne percée\nEau au plafond du 2e.",
      lot_id: lot, bien_id: bien, canal: "agence", du_jour: true, created_by: proprietaire,
    });
    const alertes = await alerte(incident);
    expect(alertes).toHaveLength(1);
    expect(alertes[0].criticite).toBe("critique");
    expect(alertes[0].titre).toMatch(/^Incident urgent à qualifier — /);
    const fil = await declaration(incident);
    expect(fil).toHaveLength(1);
    expect(fil[0].acteur_account_id).toBe(proprietaire);
    expect(fil[0].details).toMatchObject({ canal: "agence", urgence: "urgente", doublon_possible: false });

    // Sans urgence : alerte ordinaire.
    await agir(proprietaire);
    const calme = await declarer({ categorie: "serrurerie_cle" });
    expect(await dossier(calme)).toMatchObject({ categorie: "serrurerie_cle", urgence: "normale" });
    expect((await alerte(calme))[0]).toMatchObject({ criticite: "normale" });
    expect((await alerte(calme))[0].titre).toMatch(/^Incident à qualifier — /);
  });

  it("chaque catégorie de l'écran est admise par la base", async () => {
    await agir(proprietaire);
    for (const c of CATEGORIES_INCIDENT) {
      const incident = await declarer({ categorie: c.slug, titre: `Essai ${c.slug}` });
      expect((await dossier(incident)).categorie, c.slug).toBe(c.slug);
      await agir(proprietaire);
    }
  });

  it("doublon possible : signalé pour la même catégorie sur le même logement, pas pour une autre", async () => {
    await agir(proprietaire);
    const premier = await declarer({ categorie: "humidite_infiltration" });
    const autre = await declarer({ categorie: "electricite_courant", titre: "Prise arrachée" });
    const second = await declarer({ categorie: "humidite_infiltration", titre: "Tache au plafond, encore" });
    expect((await declaration(premier))[0].details.doublon_possible).toBe(false);
    // Avant ce lot, tout dossier de cette porte portait « autre » : le deuxième était toujours un « doublon ».
    expect((await declaration(autre))[0].details.doublon_possible).toBe(false);
    expect((await declaration(second))[0].details.doublon_possible).toBe(true);
    expect((await alerte(second))[0].details.libelle).toMatch(/^Doublon possible/);
  });

  it("parties communes : l'urgence est écrite au dossier, à l'alerte et au fil ; le doublon se lit sur le bien", async () => {
    await agir(proprietaire);
    const incident = await declarer({ lot: null, categorie: "humidite_infiltration", urgence: "urgente", titre: "Toiture qui fuit" });
    expect(await dossier(incident)).toEqual({
      categorie: "humidite_infiltration", urgence: "urgente", titre: "Toiture qui fuit", description: "Toiture qui fuit",
      lot_id: null, bien_id: bien, canal: "agence", du_jour: true, created_by: proprietaire,
    });
    const alertes = await alerte(incident);
    expect(alertes).toEqual([{ criticite: "critique", titre: "Incident urgent du bâtiment — Toiture qui fuit", details: { incident_id: incident, bien_id: bien } }]);
    expect(await declaration(incident)).toEqual([{ acteur_account_id: proprietaire, details: { bien_id: bien, parties_communes: true, urgence: "urgente", doublon_possible: false } }]);

    // Un incident de la même catégorie sur un LOGEMENT du bien n'est pas un doublon des parties communes, et inversement.
    await agir(proprietaire);
    const logement = await declarer({ categorie: "humidite_infiltration", titre: "Tache dans la chambre" });
    expect((await declaration(logement))[0].details.doublon_possible).toBe(false);

    await agir(proprietaire);
    const second = await declarer({ lot: null, categorie: "humidite_infiltration", titre: "Gouttière percée" });
    expect(await dossier(second)).toMatchObject({ urgence: "normale", lot_id: null });
    expect((await declaration(second))[0].details).toMatchObject({ urgence: "normale", doublon_possible: true });
    const suite = await alerte(second);
    expect(suite[0]).toMatchObject({ criticite: "normale", titre: "Incident du bâtiment — Gouttière percée" });
    expect(suite[0].details.libelle).toBe("Doublon possible : un incident du même type est déjà ouvert sur les parties communes de ce bien");

    // Une autre catégorie sur les parties communes : pas de doublon.
    await agir(proprietaire);
    const autre = await declarer({ lot: null, categorie: "serrurerie_porte", titre: "Porte du hall" });
    expect((await declaration(autre))[0].details.doublon_possible).toBe(false);
    expect((await alerte(autre))[0].details).toEqual({ incident_id: autre, bien_id: bien });
  });

  it("l'appel à sept arguments de la version précédente aboutit et écrit « autre » et « normale », comme avant", async () => {
    await agir(proprietaire);
    // Arguments nommés : c'est ainsi que l'application appelle la base.
    const nomme = await id(`select public.declarer_incident_bien_simple(p_org => $1, p_bien => $2, p_lot => $3, p_titre => 'Ancien appel nommé',
      p_date => public.aujourdhui_paris(), p_note => null, p_commande => gen_random_uuid()) id`, [org, bien, lot]);
    const positionnel = await id("select public.declarer_incident_bien_simple($1,$2,null,'Ancien appel, parties communes',public.aujourdhui_paris(),'Note',gen_random_uuid()) id", [org, bien]);
    expect(await dossier(nomme)).toMatchObject({ categorie: "autre", urgence: "normale", titre: "Ancien appel nommé", lot_id: lot });
    expect(await dossier(positionnel)).toMatchObject({ categorie: "autre", urgence: "normale", lot_id: null, description: "Ancien appel, parties communes\nNote" });
    expect((await alerte(nomme))[0].criticite).toBe("normale");
    expect((await alerte(positionnel))[0]).toMatchObject({ criticite: "normale", titre: "Incident du bâtiment — Ancien appel, parties communes" });
    // Une urgence laissée vide vaut « normale » : jamais un dossier sans niveau.
    await agir(proprietaire);
    expect(await dossier(await declarer({ urgence: null }))).toMatchObject({ urgence: "normale" });
  });

  it("catégorie vide ou inconnue, titre vide : refus, rien n'est créé ; la commande rejouée ne crée rien de plus", async () => {
    const avant = await nombre();
    await agir(proprietaire);
    for (const categorie of [null, "", "   "]) expect(await refuse({ categorie }), String(categorie)).toMatch(/Choisissez la catégorie du problème/);
    expect(await refuse({ categorie: "categorie_bidon" })).toMatch(/incidents_categorie_connue/);
    expect(await refuse({ lot: null, categorie: "categorie_bidon" })).toMatch(/incidents_categorie_connue/);
    expect(await refuse({ titre: "   " })).toMatch(/Vérifiez le titre, la date et la note/);
    expect(await refuse({ urgence: "tres_urgente" })).toMatch(/incident_urgence/);
    expect(await nombre()).toBe(avant);
    await base();
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1", [org])).rows[0].n).toBe(0);

    // Le même formulaire envoyé deux fois : un seul dossier, celui du premier envoi.
    await agir(proprietaire);
    const commande = randomUUID();
    const premier = await declarer({ commande, categorie: "nuisibles", urgence: "urgente" });
    expect(await declarer({ commande, categorie: "autre", urgence: "normale" })).toBe(premier);
    expect(await nombre()).toBe(avant + 1);
    expect(await dossier(premier)).toMatchObject({ categorie: "nuisibles", urgence: "urgente" });
  });

  it("ni le locataire, ni un compte étranger à l'espace, ni un visiteur ne déclarent", async () => {
    const avant = await nombre();
    await agir(locataire);
    expect(await refuse({ urgence: "urgente" })).toMatch(/Accès refusé/);
    await agir(etranger);
    expect(await refuse()).toMatch(/Accès refusé/);
    await agir(null, "anon");
    expect(await refuse()).toMatch(/permission denied|droit refusé/i);
    expect(await nombre()).toBe(avant);
  });

  it("une seule fonction de ce nom ; rejeu sans effet ; le retour rend la signature à sept arguments et le corps du 1er novembre", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const signatures = async () => { await base(); return (await db.query(
      "select pg_get_function_identity_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and proname='declarer_incident_bien_simple'")).rows.map((r) => r.a as string); };
    const droits = async (signature: string) => (await db.query(
      "select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte", [signature])).rows[0];
    const NEUF_ARGUMENTS = "p_org uuid, p_bien uuid, p_lot uuid, p_titre text, p_date date, p_note text, p_commande uuid, p_categorie text, p_urgence incident_urgence";
    const SEPT_ARGUMENTS = "p_org uuid, p_bien uuid, p_lot uuid, p_titre text, p_date date, p_note text, p_commande uuid";

    // Deux fonctions du même nom rendraient l'appel à sept arguments ambigu pour l'API : il n'y en a qu'une.
    expect(await signatures()).toEqual([NEUF_ARGUMENTS]);
    expect(await droits(NEUF)).toEqual({ anon: false, connecte: true });
    await db.query(migration);
    expect(await signatures()).toEqual([NEUF_ARGUMENTS]);
    expect(await droits(NEUF)).toEqual({ anon: false, connecte: true });

    // Un incident urgent est déclaré avant le retour : il doit rester tel quel.
    await agir(proprietaire);
    const garde = await declarer({ categorie: "chauffage_panne", urgence: "urgente" });

    await base();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122220000','incident_bien_categorie_urgence') on conflict do nothing");
    await db.query(retour);
    expect(await signatures()).toEqual([SEPT_ARGUMENTS]);
    expect(await droits(SEPT)).toEqual({ anon: false, connecte: true });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122220000'")).rows[0].n).toBe(0);
    // Le corps rendu est, au caractère près, celui que posait la migration du 1er novembre.
    const origine = readFileSync("supabase/migrations/20261101161444_incidents_parties_communes.sql", "utf8");
    const corps = /create or replace function public\.declarer_incident_bien_simple\([^)]*\)\nreturns uuid language plpgsql security definer set search_path='' as \$\$([\s\S]*?)\$\$;/.exec(origine)?.[1];
    expect(corps, "corps d'origine introuvable").toBeTruthy();
    expect((await db.query("select prosrc, prosecdef, proconfig from pg_proc where oid = to_regprocedure($1)", [SEPT])).rows[0]).toEqual({ prosrc: corps, prosecdef: true, proconfig: ['search_path=""'] });
    expect(await dossier(garde)).toMatchObject({ categorie: "chauffage_panne", urgence: "urgente" });
    expect((await alerte(garde))[0].criticite).toBe("critique");
    // La fonction d'avant marche : elle écrit « autre » et « normale ».
    await agir(proprietaire);
    const ancien = await id("select public.declarer_incident_bien_simple($1,$2,$3,'Après le retour',public.aujourdhui_paris(),null,gen_random_uuid()) id", [org, bien, lot]);
    expect(await dossier(ancien)).toMatchObject({ categorie: "autre", urgence: "normale" });

    // Retour rejoué sans effet, puis migration rejouée : la fonction à neuf arguments revient, seule.
    await base();
    await db.query(retour);
    expect(await signatures()).toEqual([SEPT_ARGUMENTS]);
    await db.query(migration);
    expect(await signatures()).toEqual([NEUF_ARGUMENTS]);
    expect(await droits(NEUF)).toEqual({ anon: false, connecte: true });
    await agir(proprietaire);
    expect(await dossier(await declarer({ categorie: "menuiserie_vitre", urgence: "urgente" }))).toMatchObject({ categorie: "menuiserie_vitre", urgence: "urgente" });
  });
});
