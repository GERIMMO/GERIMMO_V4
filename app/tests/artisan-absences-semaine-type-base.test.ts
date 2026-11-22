/**
 * ARTISAN : ABSENCES ET SEMAINE TYPE — audit palier 1 du 22/11/2026, P2-03, côté base.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. l'artisan déclare, lit et retire ses absences ; chevauchement, période passée, bornes inversées, durée de plus
 *     d'un an, déclaration à plus de deux ans : refus, rien n'est écrit ;
 *  2. personne d'autre n'écrit ni ne lit ses absences : gestionnaire, autre artisan, visiteur ; les deux tables n'ont
 *     aucun droit direct ; une session de diagnostic du support y reste en lecture seule ;
 *  3. pendant une absence, une NOUVELLE demande est refusée avec la date de retour, et rien n'est créé ; avant, après,
 *     ou une fois l'absence retirée, la demande part comme avant ; l'artisan absent reste « affectable » (son devis
 *     déjà déposé peut toujours être retenu) ;
 *  4. le gestionnaire ne lit que « absent aujourd'hui, jusqu'au … », et seulement pour un artisan qu'il peut voir ;
 *  5. la semaine type : enregistrée, relue, remplacée, effacée ; saisie invalide refusée sans rien changer ;
 *  6. la migration se rejoue sans effet ; son retour rend la fonction de sollicitation mot pour mot, supprime les six
 *     fonctions et garde les deux tables avec ce qui y est écrit.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122235500_artisan_absences_semaine_type";
const SOLLICITER = "public.solliciter_artisan_interne(uuid,uuid,uuid)";
const FONCTIONS = [
  "public.mes_absences_artisan()", "public.declarer_mon_absence(date,date)", "public.retirer_mon_absence(uuid)",
  "public.absences_artisans_en_cours(uuid,uuid[])", "public.ma_semaine_type()", "public.enregistrer_ma_semaine_type(jsonb)",
];
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("absences et semaine type — manifeste, retour, chaîne (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/artisan-absences-semaine-type-base.test.ts"');
  });

  it("elle cite la fonction du jour de Paris : son retour est en tête de l'ordre complet des retours", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("public.aujourdhui_paris()");
    expect(sql).not.toMatch(/current_date|poser_gardes_abonnement|poser_gardes_diagnostic_artisan/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    const chaine = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8").split("Ordre complet si tout doit être défait :")[1] ?? "";
    expect(chaine.trimStart().startsWith("`20261122235500` (")).toBe(true);
  });

  it("le retour ne supprime ni table ni ligne", () => {
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop table|truncate|delete from public\./i);
    for (const f of FONCTIONS) expect(retour, f).toContain(`drop function if exists ${f.replace(/,/g, ", ")}`);
  });
});

describe.skipIf(!url)("absences et semaine type de l'artisan (avec base)", () => {
  let db: Client;
  let org = "", autre = "", lot = "", compte = "", compteB = "", gerant = "", etranger = "", artisan = "", artisanB = "", jour = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const utilisateur = () => id("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),gen_random_uuid()::text||'@test.local','{}','{}') returning id");
  async function agir(c: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(c ? { sub: c, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Un jour de Paris décalé de n jours, au format AAAA-MM-JJ. */
  const j = (n: number) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fr = (iso: string) => iso.split("-").reverse().join("/");
  const declarer = (du: string | null, au: string | null) => refus("select public.declarer_mon_absence($1,$2)", [du, au]);
  const absences = async (a = artisan) => { await base(); return (await db.query("select du::text, au::text from public.artisan_absences where artisan_id=$1 order by du", [a])).rows as { du: string; au: string }[]; };
  async function consultation() {
    await base();
    const inc = await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Test absences','qualifie','proprietaire','Essai fictif') returning id", [org, lot]);
    return id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [org, inc]);
  }
  const solliciter = async (cons: string, a = artisan) => { await agir(gerant); return refus("select public.solliciter_artisan($1,$2,$3)", [org, cons, a]); };
  const demandes = async (cons: string) => { await base(); return (await db.query("select count(*)::int n from public.incident_sollicitations where consultation_id=$1", [cons])).rows[0].n as number; };

  beforeEach(async () => {
    await db.query("begin");
    jour = (await db.query("select public.aujourdhui_paris()::text j")).rows[0].j;
    org = await id("insert into public.organizations(name,status) values('Essai absences fictif','active') returning id");
    autre = await id("insert into public.organizations(name,status) values('Autre espace fictif','active') returning id");
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','immeuble','1 rue Test','75011','Paris') returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','disponible') returning id", [org, bien]);
    compte = await utilisateur(); compteB = await utilisateur(); gerant = await utilisateur(); etranger = await utilisateur();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [gerant, org, etranger, autre]);
    const siret = () => `${Math.floor(Math.random() * 9e13) + 1e13}`;
    artisan = await id("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Artisan fictif A',$2,'0600000000','valide','verifie') returning id", [compte, siret()]);
    artisanB = await id("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Artisan fictif B',$2,'0600000001','valide','verifie') returning id", [compteB, siret()]);
    for (const a of [artisan, artisanB]) {
      await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [a]);
      await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75011')", [a]);
    }
    // L'artisan A est dans le carnet de l'espace ; l'artisan B n'a de relation avec personne et reste privé.
    await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisan]);
  });

  it("l'artisan déclare, lit et retire ses absences ; le drapeau « en cours » suit le jour de Paris", async () => {
    await agir(compte);
    expect(await declarer(j(-1), j(2))).toBe("");
    expect(await declarer(j(10), j(10))).toBe("");
    await agir(compte);
    const lues = (await db.query("select id, du::text, au::text, en_cours from public.mes_absences_artisan()")).rows;
    expect(lues.map(({ du, au, en_cours }) => ({ du, au, en_cours }))).toEqual([{ du: j(-1), au: j(2), en_cours: true }, { du: j(10), au: j(10), en_cours: false }]);
    // Une absence terminée n'est plus listée (elle reste en base, elle ne gêne plus personne).
    await base();
    await db.query("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$3)", [artisan, j(-30), j(-20)]);
    await agir(compte);
    expect((await db.query("select count(*)::int n from public.mes_absences_artisan()")).rows[0].n).toBe(2);
    expect(await refus("select public.retirer_mon_absence($1)", [lues[1].id])).toBe("");
    expect((await absences()).map((a) => a.du)).toEqual([j(-30), j(-1)]);
    // L'autre artisan ne lit rien de tout cela et ne peut rien en retirer.
    await agir(compteB);
    expect((await db.query("select count(*)::int n from public.mes_absences_artisan()")).rows[0].n).toBe(0);
    expect(await refus("select public.retirer_mon_absence($1)", [lues[0].id])).toMatch(/Absence introuvable/);
    expect(await absences()).toHaveLength(2);
  });

  it("chevauchement, période passée, bornes inversées ou manquantes, trop longue, trop lointaine : refus, rien n'est écrit", async () => {
    await agir(compte);
    expect(await declarer(j(5), j(9))).toBe("");
    for (const [du, au] of [[j(9), j(12)], [j(1), j(5)], [j(6), j(7)], [j(0), j(30)]]) {
      expect(await declarer(du, au), `${du} ${au}`).toBe(`Cette période chevauche une absence déjà déclarée, du ${fr(j(5))} au ${fr(j(9))} : retirez-la d'abord`);
    }
    // Deux périodes qui se suivent sans se toucher sont acceptées.
    expect(await declarer(j(10), j(12))).toBe("");
    expect(await declarer(j(-9), j(-1))).toMatch(/déjà passée/);
    expect(await declarer(j(20), j(19))).toMatch(/ne peut pas précéder/);
    expect(await declarer(null, j(3))).toMatch(/premier et le dernier jour/);
    expect(await declarer(j(3), null)).toMatch(/premier et le dernier jour/);
    expect(await declarer(j(40), j(40 + 367))).toMatch(/au plus un an/);
    expect(await declarer(j(731), j(732))).toMatch(/deux ans à l'avance/);
    expect((await absences()).map((a) => [a.du, a.au])).toEqual([[j(5), j(9)], [j(10), j(12)]]);
    // Même hors des fonctions, la table refuse des bornes inversées.
    expect(await refus("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$3)", [artisan, j(50), j(49)])).toMatch(/artisan_absences_bornes/);
  });

  it("au plus 24 absences à venir", async () => {
    await base();
    for (let n = 0; n < 24; n++) await db.query("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$2)", [artisan, j(20 + 2 * n)]);
    await agir(compte);
    expect(await declarer(j(200), j(201))).toMatch(/déjà 24 absences à venir/);
  });

  it("personne d'autre n'écrit ni ne lit : gestionnaire, compte sans fiche d'artisan, visiteur ; aucun droit direct sur les tables", async () => {
    for (const qui of [gerant, etranger]) {
      await agir(qui);
      expect(await declarer(j(1), j(2)), qui).toMatch(/Accès refusé/);
      expect(await refus("select public.retirer_mon_absence($1)", [randomUUID()])).toMatch(/Accès refusé/);
      expect(await refus("select public.enregistrer_ma_semaine_type('[]'::jsonb)")).toMatch(/Accès refusé/);
      expect((await db.query("select count(*)::int n from public.mes_absences_artisan()")).rows[0].n).toBe(0);
      expect((await db.query("select count(*)::int n from public.ma_semaine_type()")).rows[0].n).toBe(0);
    }
    await agir(null, "anon");
    for (const appel of ["select public.declarer_mon_absence(current_date,current_date)", "select * from public.mes_absences_artisan()", "select * from public.ma_semaine_type()",
      "select public.enregistrer_ma_semaine_type('[]'::jsonb)", `select * from public.absences_artisans_en_cours('${org}', array['${artisan}']::uuid[])`]) {
      expect(await refus(appel), appel).toMatch(/permission denied|droit refusé/i);
    }
    for (const role of [compte, gerant]) {
      await agir(role);
      for (const table of ["artisan_absences", "artisan_semaine_type"]) {
        expect(await refus(`select 1 from public.${table}`), table).toMatch(/permission denied/);
        expect(await refus(`delete from public.${table}`), table).toMatch(/permission denied/);
      }
    }
    await base();
    const { rows } = await db.query(`select c.relname, c.relrowsecurity rls,
        has_table_privilege('authenticated', c.oid, 'select') lit, has_table_privilege('anon', c.oid, 'select') visiteur,
        exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='diagnostic_artisan_lecture') garde
      from pg_class c where c.oid in ('public.artisan_absences'::regclass, 'public.artisan_semaine_type'::regclass) order by 1`);
    expect(rows).toEqual([
      { relname: "artisan_absences", rls: true, lit: false, visiteur: false, garde: true },
      { relname: "artisan_semaine_type", rls: true, lit: false, visiteur: false, garde: true },
    ]);
    for (const f of FONCTIONS) {
      expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') c", [f])).rows[0], f).toEqual({ a: false, c: true });
    }
  });

  it("pendant une absence, une nouvelle demande est refusée avec la date de retour ; avant, après ou absence retirée, elle part", async () => {
    const cons = await consultation();
    // Absence à venir ou passée : la demande part comme avant.
    await base();
    await db.query("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$3),($1,$4,$5)", [artisan, j(-10), j(-1), j(1), j(8)]);
    const autreCons = await consultation();
    expect(await solliciter(autreCons)).toBe("");
    expect(await demandes(autreCons)).toBe(1);

    // Absence en cours (bornes comprises : elle commence aujourd'hui).
    await db.query("delete from public.artisan_absences where artisan_id=$1", [artisan]);
    await db.query("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$3)", [artisan, j(0), j(6)]);
    expect(await solliciter(cons)).toBe(`Cet artisan a indiqué être absent jusqu'au ${fr(j(6))} : aucune demande ne peut lui être envoyée d'ici là`);
    expect(await demandes(cons)).toBe(0);
    expect((await db.query("select count(*)::int n from public.incident_evenements e join public.incident_consultations c on c.incident_id=e.incident_id where c.id=$1 and e.type='sollicitation'", [cons])).rows[0].n).toBe(0);
    // Dernier jour compris.
    await db.query("update public.artisan_absences set du=$2, au=$3 where artisan_id=$1", [artisan, j(-3), j(0)]);
    expect(await solliciter(cons)).toMatch(new RegExp(`absent jusqu'au ${fr(j(0)).replaceAll("/", "\\/")}`));

    // L'artisan reste « affectable » : son devis déjà déposé peut toujours être retenu pendant son absence.
    await base();
    expect((await db.query("select public.artisan_affectable($1,$2,'plomberie','entretien_courant',null) ok", [artisan, org])).rows[0].ok).toBe(true);

    // Il retire son absence : la même demande part.
    await agir(compte);
    const { rows: [mienne] } = await db.query("select id from public.mes_absences_artisan()");
    expect(await refus("select public.retirer_mon_absence($1)", [mienne.id])).toBe("");
    expect(await solliciter(cons)).toBe("");
    expect(await demandes(cons)).toBe(1);
  });

  it("le gestionnaire ne lit que « absent aujourd'hui, jusqu'au » et seulement pour un artisan qu'il peut voir", async () => {
    await base();
    await db.query("insert into public.artisan_absences(artisan_id,du,au) values($1,$2,$3),($1,$4,$5),($6,$2,$3)", [artisan, j(-1), j(4), j(20), j(25), artisanB]);
    const lire = async (qui: string, espace: string, liste: string[]) => {
      await agir(qui);
      return (await db.query("select artisan_id, au::text from public.absences_artisans_en_cours($1,$2::uuid[]) order by 1", [espace, liste])).rows;
    };
    // L'artisan A est dans son carnet : absent jusqu'à la fin de l'absence EN COURS (pas celle à venir).
    // L'artisan B est privé et sans relation avec cet espace : jamais rendu.
    expect(await lire(gerant, org, [artisan, artisanB, randomUUID()])).toEqual([{ artisan_id: artisan, au: j(4) }]);
    // Un profil public se voit sans relation.
    await base();
    await db.query("update public.artisans set visibilite='publique' where id=$1", [artisanB]);
    expect((await lire(gerant, org, [artisan, artisanB])).map((r) => r.artisan_id).sort()).toEqual([artisan, artisanB].sort());
    // Un gestionnaire ne lit pas au nom d'un espace qui n'est pas le sien ; un artisan ne lit rien par cette porte.
    expect(await lire(gerant, autre, [artisan, artisanB])).toEqual([]);
    expect(await lire(etranger, org, [artisan])).toEqual([]);
    expect(await lire(compte, org, [artisan])).toEqual([]);
    // Liste vide, nulle ou démesurée : rien.
    expect(await lire(gerant, org, [])).toEqual([]);
    await agir(gerant);
    expect((await db.query("select count(*)::int n from public.absences_artisans_en_cours($1,null)", [org])).rows[0].n).toBe(0);
    expect(await lire(gerant, org, [artisan, ...Array.from({ length: 200 }, () => randomUUID())])).toEqual([]);
  });

  it("semaine type : enregistrée, relue dans l'ordre, remplacée, effacée ; celle d'un autre artisan n'est pas touchée", async () => {
    const enregistrer = (jours: unknown) => refus("select public.enregistrer_ma_semaine_type($1::jsonb)", [JSON.stringify(jours)]);
    const lire = async () => (await db.query("select jour::int, debut, fin from public.ma_semaine_type()")).rows;
    await agir(compteB);
    expect(await enregistrer([{ jour: 6, debut: "09:00", fin: "12:00" }])).toBe("");
    await agir(compte);
    expect(await enregistrer([{ jour: 3, debut: "08:30", fin: "17:00" }, { jour: 1, debut: "08:00", fin: "12:00" }])).toBe("");
    expect(await lire()).toEqual([{ jour: 1, debut: "08:00", fin: "12:00" }, { jour: 3, debut: "08:30", fin: "17:00" }]);
    expect(await enregistrer([{ jour: 5, debut: "14:00", fin: "18:00" }])).toBe("");
    expect(await lire()).toEqual([{ jour: 5, debut: "14:00", fin: "18:00" }]);
    for (const invalide of [
      [{ jour: 8, debut: "08:00", fin: "12:00" }], [{ jour: 0, debut: "08:00", fin: "12:00" }], [{ jour: 1, debut: "8h", fin: "12:00" }],
      [{ jour: 1, debut: "08:00", fin: "24:00" }], [{ jour: 1, debut: "12:00", fin: "12:00" }], [{ jour: 1, debut: "13:00", fin: "12:00" }],
      [{ jour: 1, debut: "08:00", fin: "12:00" }, { jour: 1, debut: "14:00", fin: "18:00" }], [{ jour: 1 }], ["lundi"], { jour: 1 },
      Array.from({ length: 8 }, (_, n) => ({ jour: (n % 7) + 1, debut: "08:00", fin: "12:00" })),
    ]) {
      expect(await enregistrer(invalide), JSON.stringify(invalide)).toMatch(/Semaine type illisible|doit suivre|qu'une fois/);
      expect(await lire()).toEqual([{ jour: 5, debut: "14:00", fin: "18:00" }]);
    }
    expect(await refus("select public.enregistrer_ma_semaine_type(null)")).toMatch(/Semaine type illisible/);
    expect(await enregistrer([])).toBe("");
    expect(await lire()).toEqual([]);
    await agir(compteB);
    expect(await lire()).toEqual([{ jour: 6, debut: "09:00", fin: "12:00" }]);
  });

  it("rejeu sans effet ; le retour rend la sollicitation mot pour mot, supprime les fonctions et garde les tables ; la migration se rejoue", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const definition = async () => String((await db.query("select pg_get_functiondef($1::regprocedure) d", [SOLLICITER])).rows[0].d);
    const presentes = async () => (await db.query("select count(*)::int n from unnest($1::text[]) f where to_regprocedure(f) is not null", [FONCTIONS])).rows[0].n as number;

    await agir(compte);
    expect(await declarer(j(0), j(3))).toBe("");
    expect(await refus("select public.enregistrer_ma_semaine_type($1::jsonb)", [JSON.stringify([{ jour: 2, debut: "08:00", fin: "12:00" }])])).toBe("");
    await base();
    const posee = await definition();
    expect(posee.match(/P2-03 absence déclarée/g)).toHaveLength(1);
    await db.query(migration);
    expect(await definition()).toBe(posee);
    expect(await presentes()).toBe(6);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122235500','artisan_absences_semaine_type') on conflict do nothing");
    await db.query(retour);
    const rendue = await definition();
    expect(rendue).not.toMatch(/artisan_absences|P2-03/);
    // Mot pour mot la fonction d'avant : la définition posée, moins les huit lignes du bloc (sept de code, une vide).
    const lignesPosees = posee.split("\n"), lignesRendues = rendue.split("\n");
    expect(lignesPosees.length - lignesRendues.length).toBe(8);
    expect(lignesRendues.filter((l) => !lignesPosees.includes(l))).toEqual([]);
    expect(await presentes()).toBe(0);
    expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') c", [SOLLICITER])).rows[0]).toEqual({ a: false, c: false });
    expect(await absences()).toEqual([{ du: j(0), au: j(3) }]);
    expect((await db.query("select count(*)::int n from public.artisan_semaine_type where artisan_id=$1", [artisan])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122235500'")).rows[0].n).toBe(0);
    // Avec la fonction d'avant, un artisan absent redevient sollicitable.
    const cons = await consultation();
    expect(await solliciter(cons)).toBe("");
    await base();
    await db.query(retour);
    expect(await definition()).toBe(rendue);

    await db.query(migration);
    expect(await definition()).toBe(posee);
    expect(await presentes()).toBe(6);
    expect(await absences()).toEqual([{ du: j(0), au: j(3) }]);
    expect(await solliciter(await consultation())).toMatch(/absent jusqu'au/);
  });
});
