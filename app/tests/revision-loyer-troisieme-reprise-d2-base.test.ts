/**
 * RÉVISION ANNUELLE DU LOYER — décisions du dirigeant du 24/11/2026, lot D2, TROISIÈME reprise après relecture, côté base
 * (migration 20261124170000_revision_loyer_troisieme_reprise_d2).
 *
 * Ces tests tiennent, avec les cas chiffrés du relecteur (ses sondes m1.mjs et m2.mjs) :
 *  1. l'indice de la révision SUIVANTE est refusé, aussi pour les baux dont l'indice est de l'année civile d'avant leur
 *     début : preuves J1 (bail du 01/01/2024, T3 2023 : 717,27 € et plus 706,10 €), J2 (libellé « T3 » : plus 723,53 €),
 *     baux du 29/02 et du 01/03 en T4, et toute la matrice m1 ;
 *  2. un indice plus ancien que celui de l'échéance est refusé (borne basse) ;
 *  3. bail repris en cours, révisé ailleurs l'an dernier : l'indice du bail sert de référence, sans ressaisie ;
 *  - aucun cas légitime refusé : pour chaque trimestre (T1 à T4) et chaque mois de début de bail, l'indice de l'échéance
 *    est accepté à l'heure, en retard et le dernier jour du délai, et celui de l'année suivante est refusé ;
 *  - le cas normal (une révision par an, avec l'indice de son échéance) donne les mêmes révisions et les mêmes appels de
 *    loyer avec et sans la migration, sur vingt baux tirés ;
 *  - sécurité inchangée, rejeu sans effet, retour qui rend la définition d'avant, ordre complet des quatre retours.
 * (Les points 4 et 5 de la relecture sont tenus par tests/conge-dernier-terme-base.test.ts et
 * tests/export-droits-par-colonne-base.test.ts ; la proposition d'indice et le formulaire par tests/indice-revision.test.ts
 * et tests/revision-loyer-reprise-d2-ecran.test.ts.)
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le jour de Paris est figé dans la transaction.
 * Le fichier rejoue du DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261124170000";
const NOM = `${CODE}_revision_loyer_troisieme_reprise_d2`;
const SECONDE = "20261124150000_revision_loyer_seconde_reprise_d2";
const REPRISE = "20261124130000_revision_loyer_reprise_d2";
const LOT = "20261124100000_revision_loyer_delai_et_premier_terme";
const ORIGINE = "public.reviser_loyer(uuid,numeric,text,date)";
const CINQ = "public.reviser_loyer(uuid,numeric,text,date,numeric)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
const blocs = (sql: string) => [...sql.matchAll(/\$bloc\$([\s\S]*?)\$bloc\$/g)].map((m) => m[1]);

describe("révision du loyer, troisième reprise du lot D2 — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est la dernière du manifeste, une seule fois, avec son retour listé et en tête de l'ordre des retours", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(`${SECONDE}.sql`));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Son retour se joue AVANT celui de la seconde reprise, qui attend ses propres lignes intactes ; puis les deux autres.
    const chaine = lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    // Lot D3 (24/11) : une migration plus récente qui cite la fonction du jour (20261124190000, source des repères fiscaux)
    // entre en tête de la chaîne, comme attendu (ordre inverse du manifeste). Ce que le test tient reste entier : l'ORDRE
    // des retours du lot D2 entre eux, et seuls des retours de migrations PLUS RÉCENTES les précèdent.
    const ordre = [...new Set(codes)];
    const rang = ordre.indexOf(CODE);
    expect(rang).toBeGreaterThanOrEqual(0);
    expect(ordre.slice(0, rang).every((c) => c > CODE)).toBe(true);
    expect(ordre.slice(rang, rang + 4)).toEqual([CODE, "20261124150000", "20261124130000", "20261124100000"]);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/revision-loyer-troisieme-reprise-d2-base.test.ts"');
  });

  it("la règle complète est écrite en tête de la migration ; les dates de publication sont des repères de calendrier, pas du droit", () => {
    const sql = migration();
    const tete = sql.slice(0, sql.indexOf("do $troisieme_reprise_d2$"));
    for (const titre of [
      "LA RÈGLE COMPLÈTE", "A. À QUELLE ÉCHÉANCE LA DEMANDE EST RATTACHÉE", "B. QUEL INDICE EST ATTENDU POUR QUELLE ÉCHÉANCE",
      "C. QUEL INDICE SERT DE RÉFÉRENCE", "L'INDICE PRÉCÉDENT EST DEMANDÉ", "D. QUEL LOYER PORTE QUEL TERME",
      "C'EST UN REPÈRE DE CALENDRIER, PAS UNE RÈGLE DE DROIT", "C'EST UN GARDE-FOU DE SAISIE, PAS UNE RÈGLE DE DROIT",
    ]) expect(tete, titre).toContain(titre);
    expect(blocs(sql)[1]).toMatch(/REPÈRE DE\s+-- CALENDRIER, pas une règle de droit/);
    expect(sql).toContain("GARDE-FOU DE SAISIE, pas une règle de droit");
  });

  it("la migration n'écrit aucune ligne, ne crée ni ne supprime rien, ne recopie pas reviser_loyer à la main et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/alter table|drop |create\s+(or\s+replace\s+)?(function|trigger|table)/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime ni table, ni colonne, ni fonction, ni donnée ; il porte les mêmes textes que la migration et retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop |truncate|delete from public\.|update public\.|alter table|\bgrant\b|create\s+(or\s+replace\s+)?function/i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
    expect(blocs(retour())).toEqual(blocs(migration()));
    expect(blocs(migration())).toHaveLength(4);
    // Les deux textes « d'avant » sont ceux que la seconde reprise a posés : ils se lisent tels quels dans sa migration.
    const seconde = lire(`supabase/migrations/${SECONDE}.sql`);
    expect(seconde).toContain(blocs(migration())[0]);
    expect(seconde).toContain(blocs(migration())[2]);
  });

  it("aucun article de loi dans les textes ajoutés à la base, ni dans l'en-tête de la migration", () => {
    for (const bloc of [blocs(migration())[1], blocs(migration())[3]]) expect(bloc).not.toMatch(/art\.|article|17-1|alinéa|décret|loi du/i);
    expect(migration().slice(0, migration().indexOf("do $troisieme_reprise_d2$"))).not.toMatch(/art\.|article|17-1|alinéa|décret|loi du/i);
  });
});

describe.skipIf(!url)("révision du loyer, troisième reprise du lot D2 (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", bien = "", locataire = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const base = async () => { await db.query("reset role"); };
  async function enCompte(compte: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  const enGerant = () => enCompte(gerant);
  /** Joue une requête qui doit être refusée ; rend le message du refus (« » si elle passe). */
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Le jour de Paris figé : la fonction est remplacée dans la transaction du test, annulée avec lui. */
  async function nousSommesLe(jour: string) {
    await base();
    await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '${jour}' $$`);
  }
  async function compte() {
    const c = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [c, `${c}@test.local`]);
    return c;
  }
  /** Un bail en cours : 700 € + 50 €, révisable. Par défaut entré le 15/10/2024, indice du bail T2 2024 = 100,00. */
  async function bail(champs: Record<string, unknown> = {}) {
    await base();
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Logement fictif '||gen_random_uuid(),'loue') returning id", [org, bien]);
    const donnees: Record<string, unknown> = {
      organization_id: org, lot_id: lot, locataire_principal: locataire, type: "nu", etat: "actif", date_debut: "2024-10-15",
      loyer_hc: 700, charges: 50, depot_garantie: 700, jour_echeance: 5, zone_tendue: false,
      revision_irl: true, irl_trimestre: "T2 2024", irl_valeur: 100, ...champs,
    };
    const cols = Object.keys(donnees);
    return id(`insert into public.baux(${cols.join(",")}) values(${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(donnees));
  }
  /** Le cycle mensuel : appelle les loyers jusqu'au mois du jour de Paris. */
  const appeler = async (b: string) => { await base(); await db.query("select public.generer_appels_loyer_interne($1)", [b]); };
  /** La demande de révision du gérant ; `precedent` absent : appel à quatre arguments. */
  const APPEL = (indice: string, precedent?: string) =>
    `select public.reviser_loyer($1,${indice},$2,$3::date${precedent === undefined ? "" : `,${precedent}`})::text as loyer`;
  async function reviser(b: string, indice: number | string, trimestre: string, demande: string, precedent?: number | string) {
    await enGerant();
    const { loyer } = await un(APPEL(String(indice), precedent === undefined ? undefined : String(precedent)), [b, trimestre, demande]);
    await base();
    return Number(loyer);
  }
  async function refusRevision(b: string, indice: number | string, trimestre: string, demande: string, precedent?: number | string) {
    await enGerant();
    const message = await refus(APPEL(String(indice), precedent === undefined ? undefined : String(precedent)), [b, trimestre, demande]);
    await base();
    return message;
  }
  const revisions = async (b: string) => {
    await base();
    return (await db.query(`select ancien_loyer::text ancien, nouveau_loyer::text nouveau, irl_reference::text reference, irl_nouveau::text indice,
      irl_trimestre trimestre, irl_reference_trimestre reference_trimestre, premier_terme::text premier_terme, date_echeance::text echeance
      from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
  };
  const termes = async (b: string) => {
    await base();
    return (await db.query("select periode::text p, loyer_hc::text l, charges::text c, montant_du::text d, base_loyer_hc::text bl, base_charges::text bc, prorata, date_echeance::text e from public.appels_loyer where bail_id=$1 order by periode", [b]))
      .rows.map((r) => `${String(r.p).slice(0, 7)}:${r.l}+${r.c}=${r.d} (${r.bl}/${r.bc}) ${r.prorata ? "prorata" : "entier"} ${r.e}`);
  };
  const etat = async () => un(
    `select (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure($1)) as origine,
            (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure($2)) as cinq,
            (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.appliquer_revision_a_l_appel()')) as declencheur,
            (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.revisions_de_mon_loyer_locataire(uuid)')) as lecture_locataire`, [ORIGINE, CINQ]);
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) d", [ORIGINE])).d);

  // Les messages des deux refus de la règle B.
  const REFUS_B1 = (indice: string, echeance: string, attendu: string) =>
    `Indice du ${indice} refusé : la révision demandée est celle du ${echeance}, et son indice est celui du ${attendu} (le trimestre de l'indice du bail, une année de plus par année de bail écoulée)`;
  const REFUS_PAS_TERMINE = (indice: string, echeance: string) =>
    `Indice du ${indice} refusé : ce trimestre n'était pas terminé à la date de révision demandée (${echeance}), son indice ne pouvait pas encore être publié. C'est l'indice d'une révision suivante`;
  const REFUS_TROP_ANCIEN = (indice: string, echeance: string) =>
    `Indice du ${indice} refusé : cet indice est trop ancien pour la révision du ${echeance}. Vérifiez l'année de l'indice`;
  const OBLIGATOIRE = /^Indice du T\d \d{4} obligatoire : aucune révision n'est enregistrée pour l'année de bail précédente/;

  // Outils de dates (indépendants de la base) : anniversaire n du bail, repli du 29 février compris ; jour ± n.
  const anniversaire = (debut: string, n: number) => {
    const [a, m, j] = debut.split("-").map(Number);
    const dernier = new Date(Date.UTC(a + n, m, 0)).getUTCDate();
    return `${a + n}-${String(m).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
  };
  const plusJours = (jour: string, n: number) => {
    const d = new Date(`${jour}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const fr = (iso: string) => iso.split("-").reverse().join("/");
  /** Le premier jour qui suit le trimestre (repère de calendrier) : écrit ici à la main, indépendamment du code testé. */
  const lendemain = (q: number, annee: number) => ["", `${annee}-04-01`, `${annee}-07-01`, `${annee}-10-01`, `${annee + 1}-01-01`][q];

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai troisième reprise D2 fictif','proprietaire_direct','active') returning id");
    gerant = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue du Test','69001','Lyon',false) returning id", [org]);
    locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Camille') returning id", [org]);
  });

  describe("point 1 — l'indice de la révision suivante est refusé, quel que soit le décalage entre l'indice et le début du bail", () => {
    it("preuve J1 : bail du 01/01/2024, T3 2023 = 141,03 ; demande tardive du 28/10/2025 — T3 2025 refusé, T3 2024 → 717,27 € (plus 706,10 €)", async () => {
      await nousSommesLe("2025-10-28");
      const b = await bail({ date_debut: "2024-01-01", irl_trimestre: "T3 2023", irl_valeur: 141.03 });
      // Le chemin par défaut d'avant (dernier indice publié, avec ou sans l'indice précédent) est refusé, rien n'est écrit.
      for (const precedent of [undefined, 144.51]) {
        expect(await refusRevision(b, 145.77, "T3 2025", "2025-10-28", precedent)).toBe(REFUS_B1("T3 2025", "01/01/2025", "T3 2024"));
      }
      expect(await revisions(b)).toEqual([]);
      // L'indice de l'échéance : 700 × 144,51 / 141,03.
      expect(await reviser(b, 144.51, "T3 2024", "2025-10-28")).toBe(717.27);
      expect(await revisions(b)).toEqual([{ ancien: "700.00", nouveau: "717.27", reference: "141.03", indice: "144.51", trimestre: "T3 2024", reference_trimestre: null, premier_terme: "2025-11-01", echeance: "2025-01-01" }]);
      // L'année suivante : l'échéance du 01/01/2026 attend T3 2025 (717,27 × 145,77 / 144,51), et refuse T3 2026 même publié.
      await nousSommesLe("2026-10-20");
      expect(await refusRevision(b, 147.5, "T3 2026", "2026-10-20")).toBe(REFUS_B1("T3 2026", "01/01/2026", "T3 2025"));
      expect(await reviser(b, 145.77, "T3 2025", "2026-10-20")).toBe(723.52);
    });

    it("preuve J2 : même bail, libellé « T3 » sans année — T3 2025 refusé (plus 723,53 €, deux années d'un coup), T3 2024 → 717,27 €", async () => {
      await nousSommesLe("2025-10-28");
      const b = await bail({ date_debut: "2024-01-01", irl_trimestre: "T3", irl_valeur: 141.03 });
      for (const precedent of [undefined, 144.51]) {
        expect(await refusRevision(b, 145.77, "T3 2025", "2025-10-28", precedent)).toBe(REFUS_PAS_TERMINE("T3 2025", "01/01/2025"));
      }
      expect(await reviser(b, 144.51, "T3 2024", "2025-10-28")).toBe(717.27);
    });

    it.each([["2024-02-29", "28/02/2025", "2025-12-20"], ["2024-03-01", "01/03/2025", "2026-01-20"]])(
      "bail du %s en T4 2023 : demande tardive, T4 2025 refusé, T4 2024 accepté", async (debut, echeance, jour) => {
        await nousSommesLe(jour);
        for (const libelle of ["T4 2023", "T4"]) {
          const b = await bail({ date_debut: debut, irl_trimestre: libelle });
          const message = libelle === "T4" ? REFUS_PAS_TERMINE("T4 2025", echeance) : REFUS_B1("T4 2025", echeance, "T4 2024");
          expect(await refusRevision(b, 104, "T4 2025", jour), libelle).toBe(message);
          expect(await refusRevision(b, 104, "T4 2025", jour, 102), libelle).toBe(message);
          expect(await reviser(b, 102, "T4 2024", jour), libelle).toBe(714);
        }
      });

    it("matrice m1 du relecteur, en entier : six baux × cinq moments × deux indices — chaque ligne est juste", async () => {
      // Son modèle d'indices (fictif) et ses baux : [début, trimestre, année de l'indice du bail].
      const I = (q: number, y: number) => (100 + 2.5 * (y - 2020) + q * 0.3).toFixed(2);
      const arrondi = (x: number) => Math.round(x * 100 + 1e-7) / 100;
      const baux: [string, number, number][] = [["2024-01-01", 3, 2023], ["2024-02-29", 4, 2023], ["2023-10-31", 3, 2023], ["2023-10-15", 2, 2023], ["2024-03-01", 4, 2023], ["2024-07-20", 2, 2024]];
      let lignes = 0;
      for (const [debut, q, yr] of baux) {
        const ech1 = anniversaire(debut, 1), ech2 = anniversaire(debut, 2);
        const attendu = arrondi(700 * Number(I(q, yr + 1)) / Number(I(q, yr)));
        const moments: [string, string, string][] = [
          ["à l'heure", ech1, ech1], ["tardive de dix mois", plusJours(ech1, 300), plusJours(ech1, 300)], ["dernier jour", plusJours(ech2, -1), plusJours(ech2, -1)],
          ["antidatée, enregistrée le dernier jour", ech1, plusJours(ech2, -1)], ["antidatée, enregistrée le lendemain du délai", ech1, ech2],
        ];
        for (const [nom, demande, jour] of moments) {
          const cas = `bail du ${debut} T${q} ${yr}, ${nom}`;
          const horsDelai = jour === ech2;
          await nousSommesLe(jour);
          // L'indice de la révision suivante : refusé, avec ou sans l'indice précédent ; rien n'est écrit.
          const b = await bail({ date_debut: debut, irl_trimestre: `T${q} ${yr}`, irl_valeur: I(q, yr) });
          const refusAttendu = horsDelai ? /^Révision refusée : la révision prévue le / : new RegExp(`^Indice du T${q} ${yr + 2} refusé : la révision demandée est celle du ${fr(ech1)}, et son indice est celui du T${q} ${yr + 1} `);
          expect(await refusRevision(b, I(q, yr + 2), `T${q} ${yr + 2}`, demande), cas).toMatch(refusAttendu);
          expect(await refusRevision(b, I(q, yr + 2), `T${q} ${yr + 2}`, demande, I(q, yr + 1)), cas).toMatch(refusAttendu);
          expect(await revisions(b), cas).toEqual([]);
          // L'indice de l'échéance : accepté pendant tout le délai, au montant du modèle ; refusé le lendemain du délai.
          if (horsDelai) expect(await refusRevision(b, I(q, yr + 1), `T${q} ${yr + 1}`, demande), cas).toMatch(/^Révision refusée : la révision prévue le /);
          else {
            expect(await reviser(b, I(q, yr + 1), `T${q} ${yr + 1}`, demande), cas).toBe(attendu);
            expect((await revisions(b)).map((r) => [r.echeance, r.trimestre, r.reference_trimestre]), cas).toEqual([[ech1, `T${q} ${yr + 1}`, null]]);
          }
          lignes += 2;
        }
      }
      expect(lignes).toBe(60);
    });

    it("le test de la seconde reprise, complété : bail du 15/01/2024 en T3 2023 — T3 2024 accepté le 15/01/2025, T3 2025 refusé jusqu'au dernier jour", async () => {
      for (const jour of ["2025-01-15", "2025-10-20", "2026-01-14"]) {
        await nousSommesLe(jour);
        const b = await bail({ date_debut: "2024-01-15", irl_trimestre: "T3 2023" });
        expect(await refusRevision(b, 104, "T3 2025", jour, 102), jour).toBe(REFUS_B1("T3 2025", "15/01/2025", "T3 2024"));
        expect(await reviser(b, 102, "T3 2024", jour), jour).toBe(714);
      }
    });
  });

  describe("point 2 — borne basse : un indice plus ancien que celui de l'échéance est refusé", () => {
    it("preuve K : bail du 15/10/2023 (T2 2023), le 20/10/2025 — T2 2024 n'est pas l'indice de l'échéance du 15/10/2025", async () => {
      await nousSommesLe("2025-10-20");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      expect(await refusRevision(b, 103, "T2 2024", "2025-10-20", 100)).toBe(REFUS_B1("T2 2024", "15/10/2025", "T2 2025"));
      expect(await refusRevision(b, 100, "T2 2023", "2025-10-20", 99)).toBe(REFUS_B1("T2 2023", "15/10/2025", "T2 2025"));
      expect(await revisions(b)).toEqual([]);
      expect(await reviser(b, 106, "T2 2025", "2025-10-20", 103)).toBe(720.39);
    });

    it("preuve K, libellé vide : T2 2019 refusé pour l'échéance du 15/10/2024 ; les deux derniers indices connus à l'échéance restent acceptés", async () => {
      await nousSommesLe("2024-10-20");
      for (const libelle of [null, "T2", "2e trimestre"]) {
        const b = await bail({ date_debut: "2023-10-15", irl_trimestre: libelle });
        const trimestre = "T2";
        expect(await refusRevision(b, 101, `${trimestre} 2019`, "2024-10-20"), String(libelle)).toBe(REFUS_TROP_ANCIEN("T2 2019", "15/10/2024"));
        expect(await refusRevision(b, 101, `${trimestre} 2022`, "2024-10-20"), String(libelle)).toBe(REFUS_TROP_ANCIEN("T2 2022", "15/10/2024"));
        expect(await refusRevision(b, 101, `${trimestre} 2025`, "2024-10-20"), String(libelle)).toBe(REFUS_PAS_TERMINE("T2 2025", "15/10/2024"));
        expect(await reviser(b, 101, `${trimestre} 2024`, "2024-10-20"), String(libelle)).toBe(707);
        const b2 = await bail({ date_debut: "2023-10-15", irl_trimestre: libelle });
        expect(await reviser(b2, 101, `${trimestre} 2023`, "2024-10-20"), String(libelle)).toBe(707);
      }
    });
  });

  describe("point 3 — bail repris en cours, révisé ailleurs l'an dernier : l'indice du bail sert de référence, sans ressaisie", () => {
    it("preuve L : bail du 15/10/2020 repris avec l'indice T2 2025 = 145,17 ; le 15/10/2026, T2 2026 = 146,68 à quatre paramètres → 707,28 €", async () => {
      await nousSommesLe("2026-10-15");
      const b = await bail({ date_debut: "2020-10-15", irl_trimestre: "T2 2025", irl_valeur: 145.17, loyers_suivis_depuis: "2026-09-01" });
      expect(await reviser(b, 146.68, "T2 2026", "2026-10-15")).toBe(707.28);
      // La référence est l'indice du bail : rien n'a été ressaisi, aucun « indice de l'année précédente » n'est noté.
      expect(await revisions(b)).toEqual([{ ancien: "700.00", nouveau: "707.28", reference: "145.17", indice: "146.68", trimestre: "T2 2026", reference_trimestre: null, premier_terme: "2026-11-01", echeance: "2026-10-15" }]);
      // L'indice de la révision suivante reste refusé pour ce bail (son trimestre n'est pas terminé à l'échéance).
      const b2 = await bail({ date_debut: "2020-10-15", irl_trimestre: "T2 2025", irl_valeur: 145.17 });
      expect(await refusRevision(b2, 148, "T2 2027", "2026-10-15", 146.68)).toBe(REFUS_PAS_TERMINE("T2 2027", "15/10/2026"));
    });

    it("le même bail gardé à son indice d'origine (T2 2020), ou repris avec un indice de deux ans : l'indice précédent reste demandé", async () => {
      await nousSommesLe("2026-10-15");
      for (const [libelle, valeur] of [["T2 2020", 130.57], ["T2 2024", 143]] as const) {
        const b = await bail({ date_debut: "2020-10-15", irl_trimestre: libelle, irl_valeur: valeur });
        expect(await refusRevision(b, 146.68, "T2 2026", "2026-10-15"), libelle).toMatch(OBLIGATOIRE);
        expect(await reviser(b, 146.68, "T2 2026", "2026-10-15", 145.17), libelle).toBe(707.28);
        expect((await revisions(b)).map((r) => [r.reference, r.reference_trimestre]), libelle).toEqual([["145.17", "T2 2025"]]);
      }
    });

    it("bail du 01/02/2024 repris avec l'indice T4 2024 (révisé ailleurs en février 2025) : T4 2025 pour le 01/02/2026, jamais T4 2026", async () => {
      // Sans la règle « trimestre terminé au début du bail », cet indice mis à jour serait pris pour l'indice d'origine et
      // la base attendrait T4 2026 pour le 01/02/2026 : un indice qui n'existe pas encore à cette date.
      for (const jour of ["2026-02-01", "2026-11-24", "2027-01-31"]) {
        await nousSommesLe(jour);
        const b = await bail({ date_debut: "2024-02-01", irl_trimestre: "T4 2024", irl_valeur: 100 });
        expect(await refusRevision(b, 104, "T4 2026", jour, 102), jour).toBe(REFUS_PAS_TERMINE("T4 2026", "01/02/2026"));
        expect(await reviser(b, 102, "T4 2025", jour), jour).toBe(714);
      }
    });
  });

  describe("aucun cas légitime refusé — chaque trimestre (T1 à T4) × chaque mois de début de bail", () => {
    it("l'indice de l'échéance est accepté à l'heure, en retard et le dernier jour du délai ; celui de l'année suivante est refusé", async () => {
      // Bail entré le 15 de chaque mois de 2024. Son indice est le dernier de ce trimestre terminé à son début (repère de
      // calendrier) : année 2024 ou 2023. Trois écritures du même bail :
      //  - « origine » : libellé complet (règle B1) ;
      //  - « sans année » : libellé « T3 » (règle B2) ;
      //  - « repris » : bail repris en deuxième année, indice du bail mis à jour d'un an (règles B2 et C3), échéance n° 2.
      const tableau: string[] = [];
      for (const q of [1, 2, 3, 4]) {
        const ligne: string[] = [];
        for (let mois = 1; mois <= 12; mois++) {
          const debut = `2024-${String(mois).padStart(2, "0")}-15`;
          const yr = lendemain(q, 2024) <= debut ? 2024 : 2023;
          for (const [mode, libelle, n] of [["origine", `T${q} ${yr}`, 1], ["sans année", `T${q}`, 1], ["repris", `T${q} ${yr + 1}`, 2]] as const) {
            const echeance = anniversaire(debut, n), suivante = anniversaire(debut, n + 1);
            for (const [moment, jour] of [["à l'heure", echeance], ["en retard", plusJours(echeance, 200)], ["dernier jour", plusJours(suivante, -1)]] as const) {
              const cas = `T${q}, bail du ${debut}, ${mode}, ${moment} (${jour})`;
              await nousSommesLe(jour);
              const b = await bail({ date_debut: debut, irl_trimestre: libelle });
              // L'indice de l'année suivante : refusé, avec ou sans indice précédent.
              const suivant = `T${q} ${yr + n + 1}`;
              const message = mode === "origine" ? REFUS_B1(suivant, fr(echeance), `T${q} ${yr + n}`) : REFUS_PAS_TERMINE(suivant, fr(echeance));
              expect(await refusRevision(b, 104, suivant, jour), cas).toBe(message);
              expect(await refusRevision(b, 104, suivant, jour, 102), cas).toBe(message);
              // L'indice de l'échéance : accepté à quatre paramètres (700 × 102 / 100), la référence est l'indice du bail.
              expect(await reviser(b, 102, `T${q} ${yr + n}`, jour), cas).toBe(714);
              expect((await revisions(b)).map((r) => [r.echeance, r.trimestre, r.reference, r.reference_trimestre]), cas).toEqual([[echeance, `T${q} ${yr + n}`, "100.00", null]]);
            }
          }
          ligne.push(`T${q} ${yr}→${yr + 1}`);
        }
        tableau.push(ligne.join(" | "));
      }
      // Le tableau lu : indice du bail → indice attendu à la première échéance, par mois de début (janvier à décembre).
      expect(tableau).toEqual([
        "T1 2023→2024 | T1 2023→2024 | T1 2023→2024 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025 | T1 2024→2025",
        "T2 2023→2024 | T2 2023→2024 | T2 2023→2024 | T2 2023→2024 | T2 2023→2024 | T2 2023→2024 | T2 2024→2025 | T2 2024→2025 | T2 2024→2025 | T2 2024→2025 | T2 2024→2025 | T2 2024→2025",
        "T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2023→2024 | T3 2024→2025 | T3 2024→2025 | T3 2024→2025",
        "T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024 | T4 2023→2024",
      ]);
    }, 120_000);

    it("l'indice du bail d'une année plus ancien (trimestre publié à cheval sur le début du bail) : accepté de la même façon", async () => {
      // Bail du 05/04/2024 : le T1 2024 est terminé mais pas encore publié, le bail porte le T4 2023. Bail du 05/10/2024 en
      // T2 2024 (le T3 n'est pas encore publié). Bail du 05/01/2024 en T3 2023.
      for (const [debut, q, yr] of [["2024-04-05", 4, 2023], ["2024-10-05", 2, 2024], ["2024-01-05", 3, 2023], ["2024-07-05", 1, 2024]] as const) {
        for (const libelle of [`T${q} ${yr}`, `T${q}`]) {
          const echeance = anniversaire(debut, 1);
          await nousSommesLe(plusJours(echeance, 30));
          const b = await bail({ date_debut: debut, irl_trimestre: libelle });
          expect(await reviser(b, 102, `T${q} ${yr + 1}`, plusJours(echeance, 30)), `${debut} ${libelle}`).toBe(714);
        }
      }
    });
  });

  describe("cas normal — une révision par an, avec l'indice de son échéance : identique avec et sans la migration", () => {
    it("vingt baux tirés : mêmes révisions et mêmes appels de loyer, caractère pour caractère, avant (retour joué) et après", async () => {
      // Tirage à graine fixe : loyer, indice du bail, variations annuelles, trimestre, jour et mois d'entrée, retard de la
      // demande (jusqu'à 39 jours après la date anniversaire). L'indice du bail est le dernier de son trimestre terminé à
      // l'entrée (2024 ou 2023) : c'est le cas normal.
      let graine = 12345;
      const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
      const tirages = Array.from({ length: 20 }, () => ({
        loyer: Math.round((300 + alea() * 2500) * 100) / 100, reference: Math.round((120 + alea() * 30) * 100) / 100,
        v1: 1 + alea() * 0.04 - 0.005, v2: 1 + alea() * 0.04 - 0.005, trimestre: 1 + Math.floor(alea() * 4),
        jour: 1 + Math.floor(alea() * 28), mois: 1 + Math.floor(alea() * 12), retard: Math.floor(alea() * 40),
      }));
      async function serie() {
        const lignes: string[] = [];
        for (const t of tirages) {
          const debut = `2024-${String(t.mois).padStart(2, "0")}-${String(t.jour).padStart(2, "0")}`;
          const yr = lendemain(t.trimestre, 2024) <= debut ? 2024 : 2023;
          const b = await bail({ date_debut: debut, loyer_hc: t.loyer, depot_garantie: 300, irl_trimestre: `T${t.trimestre} ${yr}`, irl_valeur: t.reference });
          const i1 = Math.round(t.reference * t.v1 * 100) / 100, i2 = Math.round(i1 * t.v2 * 100) / 100;
          const j1 = plusJours(anniversaire(debut, 1), t.retard), j2 = plusJours(anniversaire(debut, 2), t.retard);
          await nousSommesLe(j1); await appeler(b);
          const r1 = await reviser(b, i1, `T${t.trimestre} ${yr + 1}`, j1);
          await nousSommesLe(j2); await appeler(b);
          const r2 = await reviser(b, i2, `T${t.trimestre} ${yr + 2}`, j2);
          await nousSommesLe(plusJours(j2, 70)); await appeler(b);
          await base();
          const rv = (await db.query(`select date_effet::text, ancien_loyer::text, nouveau_loyer::text, irl_reference::text, irl_reference_trimestre, irl_nouveau::text,
            date_echeance::text, date_demande::text, irl_trimestre, premier_terme::text from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
          lignes.push(JSON.stringify([r1, r2, rv, await termes(b), (await un("select loyer_hc::text l, charges::text c from public.baux where id=$1", [b]))]));
        }
        return lignes;
      }
      const apres = await serie();
      await base();
      await db.query(retour());
      expect(await definition()).not.toContain("Troisième reprise");
      const avant = await serie();
      expect(apres).toHaveLength(20);
      expect(apres).toEqual(avant);
      // Le tirage couvre bien deux révisions et des appels par bail (aucune comparaison à vide).
      for (const ligne of apres) {
        const [r1, r2, rv, appels] = JSON.parse(ligne) as [number, number, unknown[], string[]];
        expect(r1).toBeGreaterThan(0);
        expect(r2).toBeGreaterThan(0);
        expect(rv).toHaveLength(2);
        expect(appels.length).toBeGreaterThanOrEqual(24);
      }
    }, 60_000);
  });

  describe("sécurité, rejeu et retour", () => {
    it("les quatre fonctions gardent SECURITY DEFINER, chemin vide et droits ; rien n'est ouvert aux visiteurs ; le contrôle de l'appelant est toujours là", async () => {
      const fonctions = (await db.query(
        `select p.oid::regprocedure::text f, p.prosecdef definer, p.proconfig::text config, p.proacl::text acl,
                has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') connecte
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname in ('reviser_loyer','appliquer_revision_a_l_appel','revisions_de_mon_loyer_locataire')`)).rows
        .sort((a, b) => (a.f < b.f ? -1 : 1));
      const vide = '{"search_path=\\"\\""}';
      expect(fonctions).toEqual([
        { f: "appliquer_revision_a_l_appel()", definer: true, config: vide, acl: "{postgres=X/postgres}", anon: false, connecte: false },
        { f: "reviser_loyer(uuid,numeric,text,date)", definer: true, config: vide, acl: "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", anon: false, connecte: true },
        { f: "reviser_loyer(uuid,numeric,text,date,numeric)", definer: false, config: vide, acl: "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", anon: false, connecte: true },
        { f: "revisions_de_mon_loyer_locataire(uuid)", definer: true, config: vide, acl: "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", anon: false, connecte: true },
      ]);
      const def = await definition();
      expect(def).toContain("Troisième reprise du lot D2 (24/11/2026), règle B");
      expect(def).toContain("Troisième reprise du lot D2, règle C3");
      expect(def).not.toContain("année de son indice ne peut pas dépasser");
      expect(def.match(/aujourdhui_paris\(\)/g)).toHaveLength(2);
      expect(def.match(/org_ids_avec_roles/g)).toHaveLength(1);
      // Le contrôle de l'appelant reste AVANT tout le reste : il précède les lignes de cette reprise.
      expect(def.indexOf("org_ids_avec_roles")).toBeLessThan(def.indexOf("Troisième reprise"));
      expect((await un("select pg_get_triggerdef(oid) d from pg_trigger where tgrelid='public.appels_loyer'::regclass and tgname='a_revision_du_bail'")).d)
        .toBe("CREATE TRIGGER a_revision_du_bail BEFORE INSERT ON public.appels_loyer FOR EACH ROW EXECUTE FUNCTION appliquer_revision_a_l_appel()");
    });

    it("le contrôle de l'appelant est inchangé : le gérant d'un autre espace, un locataire et un visiteur sont refusés avant les nouveaux contrôles", async () => {
      await nousSommesLe("2025-10-28");
      const b = await bail({ date_debut: "2024-01-01", irl_trimestre: "T3 2023", irl_valeur: 141.03 });
      const etranger = await compte();
      const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
      await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [etranger, ailleurs]);
      const habitant = await compte();
      await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'locataire','active')", [habitant, org]);
      for (const c of [etranger, habitant]) {
        await enCompte(c);
        // Avec l'indice juste comme avec celui que la règle B refuse, c'est « Accès refusé » qui répond.
        expect(await refus("select public.reviser_loyer($1,144.51,'T3 2024','2025-10-28'::date)", [b])).toBe("Accès refusé");
        expect(await refus("select public.reviser_loyer($1,145.77,'T3 2025','2025-10-28'::date,144.51)", [b])).toBe("Accès refusé");
      }
      await base();
      await db.query("set local role anon");
      expect(await refus("select public.reviser_loyer($1,144.51,'T3 2024','2025-10-28'::date)", [b])).toMatch(/permission denied/);
      expect(await refus("select public.reviser_loyer($1,144.51,'T3 2024','2025-10-28'::date,141.03)", [b])).toMatch(/permission denied/);
      await base();
      expect(await revisions(b)).toEqual([]);
    });

    it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête ; la seconde reprise, rejouée par-dessus, s'arrête sans rien modifier", async () => {
      const avant = await etat();
      await db.query(migration());
      await db.query(migration());
      expect(await etat()).toEqual(avant);
      // Rejouer la seconde reprise tant que celle-ci est en place : elle ne reconnaît plus deux de ses lignes et s'arrête.
      expect(await refus(lire(`supabase/migrations/${SECONDE}.sql`))).toMatch(/ne porte ni la définition attendue ni celle de cette seconde reprise \(1 endroit\(s\) d'avant, 2 de la seconde reprise, sur 4\) : définition inattendue, rien n'est modifié/);
      expect(await etat()).toEqual(avant);
      // Un des trois endroits réécrit : forme inconnue, refusée.
      await db.query((await definition()).replace("v_annee <> v_annee_bail + v_n", "v_annee > v_annee_bail + v_n"));
      const modifiee = await etat();
      expect(modifiee.origine).not.toBe(avant.origine);
      expect(await refus(migration())).toMatch(/ne porte ni la définition attendue ni celle de cette troisième reprise \(0 endroit\(s\) d'avant, 2 de la troisième reprise, sur 3\) : définition inattendue, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });

    it("le retour rend la définition d'avant, garde les révisions et les appels, se rejoue ; puis l'ordre complet des quatre retours, et les quatre migrations rejouées", async () => {
      await nousSommesLe("2025-10-28");
      const b = await bail({ date_debut: "2024-01-01", irl_trimestre: "T3 2023", irl_valeur: 141.03 });
      await appeler(b);
      await reviser(b, 144.51, "T3 2024", "2025-10-28");
      const compter = async () => un("select (select count(*)::int from public.revisions_loyer where bail_id=$1) revisions, (select count(*)::int from public.appels_loyer where bail_id=$1) appels, (select md5(string_agg(a::text,'|' order by periode)) from public.appels_loyer a where bail_id=$1) empreinte, (select md5(string_agg(r::text,'|' order by date_effet)) from public.revisions_loyer r where bail_id=$1) empreinte_revisions, (select md5(x::text) from public.baux x where id=$1) empreinte_bail", [b]);
      const donnees = await compter();
      const migre = await etat();
      await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'revision_loyer_troisieme_reprise_d2') on conflict do nothing", [CODE]);

      // 1. Le retour de cette reprise, seul : seule reviser_loyer à quatre paramètres change.
      await db.query(retour());
      const revenu = await etat();
      expect(revenu.origine).not.toBe(migre.origine);
      expect({ ...revenu, origine: "" }).toEqual({ ...migre, origine: "" });
      expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
      const def = await definition();
      expect(def).not.toMatch(/Troisième reprise|v_annee_bail|trop ancien/);
      expect(def).toContain("année de son indice ne peut pas dépasser");
      expect(await compter()).toEqual(donnees);
      // L'état d'avant est vraiment revenu : la preuve J1 du relecteur repasse (706,10 € avec l'indice de la révision suivante).
      const b2 = await bail({ date_debut: "2024-01-01", irl_trimestre: "T3 2023", irl_valeur: 141.03 });
      expect(await reviser(b2, 145.77, "T3 2025", "2025-10-28", 144.51)).toBe(706.1);
      // Rejoué, le retour ne fait rien.
      await db.query(retour());
      expect(await etat()).toEqual(revenu);

      // 2. L'ordre complet du LISEZ-MOI : après celui-ci, les retours des trois migrations précédentes passent sans refus.
      await db.query("savepoint chaine");
      for (const nom of [SECONDE, REPRISE, LOT]) await db.query(lire(`supabase/retours-arriere/${nom}.retour.sql`));
      const def0 = await definition();
      expect(def0).not.toMatch(/Décision Q23|Reprise du lot D2|Seconde reprise|Troisième reprise|v_premier_terme|v_irl_precedent/);
      expect((await un("select to_regprocedure($1) is null as absente", [CINQ])).absente).toBe(true);
      expect((await un("select count(*)::int n from pg_trigger where tgrelid='public.appels_loyer'::regclass and tgname='a_revision_du_bail'")).n).toBe(0);
      // Aucune donnée n'a bougé pendant les quatre retours.
      expect(await compter()).toEqual(donnees);
      // Sur cette base revenue au plus loin, le retour de cette reprise, rejoué, ne fait rien.
      const auPlusLoin = await etat();
      await db.query(retour());
      expect(await etat()).toEqual(auPlusLoin);
      // Les quatre migrations rejouées dans l'ordre du manifeste : l'état migré revient, à l'octet.
      for (const nom of [LOT, REPRISE, SECONDE, NOM]) await db.query(lire(`supabase/migrations/${nom}.sql`));
      expect(await etat()).toEqual(migre);
      expect(await compter()).toEqual(donnees);
      await db.query("rollback to savepoint chaine");

      // 3. La migration seule, rejouée après son retour : même état migré.
      await db.query(migration());
      expect(await etat()).toEqual(migre);
    });

    it("joué avant celui-ci, le retour de la seconde reprise s'arrête sans rien modifier (l'ordre des retours est tenu par la base)", async () => {
      const avant = await etat();
      expect(await refus(lire(`supabase/retours-arriere/${SECONDE}.retour.sql`))).toMatch(/ne porte qu'une partie de la seconde reprise \(2 endroit\(s\) sur 4\) : définition réécrite depuis, rien n'est modifié/);
      expect(await etat()).toEqual(avant);
    });

    it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
      await db.query((await definition()).replace("v_annee <> v_annee_bail + v_n", "v_annee > v_annee_bail + v_n"));
      const modifiee = await etat();
      expect(await refus(retour())).toMatch(/ne porte qu'une partie de la troisième reprise \(2 endroit\(s\) sur 3\) : définition réécrite depuis, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });
  });
});
