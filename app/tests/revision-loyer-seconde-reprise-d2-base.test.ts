/**
 * RÉVISION ANNUELLE DU LOYER — décisions du dirigeant du 24/11/2026, lot D2, SECONDE reprise après relecture, côté base
 * (migration 20261124150000_revision_loyer_seconde_reprise_d2).
 *
 * Ces tests tiennent, chacun avec le cas chiffré du relecteur (ses sondes a.mjs à d.mjs) :
 *  1. l'année non faite se reconnaît à l'année de bail : un bail dont le trimestre de référence est écrit « T2 »,
 *     « 2e trimestre », « T2 23 » ou n'est pas renseigné ne passe plus de 700 à 742 € ;
 *  2. les indices « NaN », infinis ou invraisemblables sont refusés (garde-fou de saisie) ;
 *  3 et 4. un terme appelé en retard autour d'un avenant porte le loyer ET les charges qui valaient pour lui ;
 *  5. le locataire lit ses révisions dans un ordre fixe ;
 *  7. l'indice de la révision suivante est refusé ;
 *  - le cas normal (une révision par an, sans avenant) donne les mêmes révisions et les mêmes appels de loyer avec et
 *    sans la migration, sur vingt baux tirés ;
 *  - sécurité inchangée, rejeu sans effet, retour qui rend les définitions d'avant sans rien supprimer.
 * (Le constat 6 et la partie « écran » du constat 5 sont tenus par tests/revision-loyer-seconde-reprise-d2.test.ts.)
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le jour de Paris est figé dans la transaction.
 * Le fichier rejoue du DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261124150000";
const NOM = `${CODE}_revision_loyer_seconde_reprise_d2`;
const REPRISE = "20261124130000_revision_loyer_reprise_d2";
const ORIGINE = "public.reviser_loyer(uuid,numeric,text,date)";
const CINQ = "public.reviser_loyer(uuid,numeric,text,date,numeric)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
// Troisième reprise du lot D2 (24/11) : la migration 20261124170000 modifie deux lignes posées par celle-ci (sa borne sur
// l'année de l'indice et sa condition de l'indice précédent). Tant qu'elle est en place, le rejeu et le retour de celle-ci
// s'arrêtent sans rien modifier (tenu par tests/revision-loyer-troisieme-reprise-d2-base.test.ts). Les tests qui rejouent
// ou défont CETTE migration jouent donc d'abord le retour de la troisième reprise, dans leur transaction : c'est l'ordre
// du LISEZ-MOI.
const retourTroisiemeReprise = () => lire("supabase/retours-arriere/20261124170000_revision_loyer_troisieme_reprise_d2.retour.sql");

describe("révision du loyer, seconde reprise du lot D2 — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, après la reprise, avec son retour listé et en tête de l'ordre des retours", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(`${REPRISE}.sql`));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Son retour se joue AVANT celui de la reprise, qui attend ses propres lignes intactes.
    const chaine = lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    // Troisième reprise (24/11) : son retour (20261124170000) passe désormais en tête ; celui-ci le suit immédiatement.
    const ordre = [...new Set(codes)];
    // Lot D3 (24/11) : une migration plus récente qui cite la fonction du jour (20261124190000, source des repères fiscaux)
    // entre en tête de la chaîne, comme attendu (ordre inverse du manifeste). Ce que le test tient reste entier : l'ORDRE
    // des retours du lot D2 entre eux, et seuls des retours de migrations PLUS RÉCENTES les précèdent.
    const rang = ordre.indexOf("20261124170000");
    expect(rang).toBeGreaterThanOrEqual(0);
    expect(ordre.slice(0, rang).every((c) => c > "20261124170000")).toBe(true);
    expect(ordre.slice(rang, rang + 2)).toEqual(["20261124170000", CODE]);
    expect(ordre.indexOf(CODE)).toBeLessThan(ordre.indexOf("20261124130000"));
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/revision-loyer-seconde-reprise-d2-base.test.ts"');
  });

  it("la règle est écrite en trois phrases en tête de la migration, et le garde-fou des indices se dit garde-fou de saisie", () => {
    const sql = migration();
    expect(sql.indexOf("LA RÈGLE, EN TROIS PHRASES")).toBeGreaterThan(0);
    expect(sql.indexOf("LA RÈGLE, EN TROIS PHRASES")).toBeLessThan(sql.indexOf("do $seconde_reprise_d2$"));
    expect(sql).toContain("GARDE-FOU DE SAISIE, PAS UNE RÈGLE DE DROIT");
    expect(sql).toContain("GARDE-FOU DE SAISIE, pas une règle de droit");
  });

  it("la migration n'écrit aucune ligne existante, ne recopie pas reviser_loyer à la main et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/alter table|drop /i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.reviser_loyer/i);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime ni table, ni colonne, ni fonction, ni donnée ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop |truncate|delete from public\.|update public\.|alter table/i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
    // Les deux fonctions rendues sont celles de la reprise, recopiées telles quelles.
    const reprise = lire(`supabase/migrations/${REPRISE}.sql`);
    for (const fonction of ["appliquer_revision_a_l_appel\\(\\)", "revisions_de_mon_loyer_locataire\\(p_org uuid\\)"]) {
      const texte = reprise.match(new RegExp(`create or replace function public\\.${fonction}[\\s\\S]*?\\$fonction\\$;\\n`))?.[0] ?? "absente";
      expect(retour()).toContain(texte);
    }
  });

  it("aucun article de loi dans les textes ajoutés à la base", () => {
    for (const [, bloc] of migration().matchAll(/\$bloc\$([\s\S]*?)\$bloc\$/g)) expect(bloc).not.toMatch(/art\.|article|17-1|alinéa/i);
  });
});

describe.skipIf(!url)("révision du loyer, seconde reprise du lot D2 (avec base)", () => {
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
  /** Un bail en cours : 700 € + 50 €, révisable, indice de référence 100,00. Par défaut entré le 15/10/2024 (T2 2024). */
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
  /** Le bail des preuves du relecteur pour l'année non faite : entré le 15/10/2023, aucune révision en 2024. */
  const ANNEE_NON_FAITE = { date_debut: "2023-10-15", irl_trimestre: "T2 2023" };
  /** Le cycle mensuel : appelle les loyers jusqu'au mois du jour de Paris. */
  const appeler = async (b: string) => { await base(); await db.query("select public.generer_appels_loyer_interne($1)", [b]); };
  /** Des termes écrits tels que le cycle les aurait appelés (loyer et charges du bail), pour laisser un mois manquant avant eux. */
  const appelerSeulement = async (b: string, du: string, au: string) => {
    await base();
    await db.query(`insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance,prorata)
      select b.organization_id,b.id,g::date,b.loyer_hc,b.charges,b.loyer_hc+b.charges,g::date+4,false
        from public.baux b, generate_series($2::date,$3::date,'1 month') g where b.id=$1`, [b, du, au]);
  };
  /** La demande de révision du gérant ; `precedent` (texte SQL) absent : appel à quatre arguments. */
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
  /** L'avenant signé du gérant (pièce fictive) : rend « » s'il est enregistré, sinon le message du refus. */
  async function avenant(b: string, signe: string, effet: string, loyer: number, charges: number) {
    await enGerant();
    const message = await refus(
      "select public.enregistrer_avenant_bail($1,$2,'Loyer convenu avec le locataire',$3::date,$4::date,$5,$6,$7,'application/pdf',1234,gen_random_uuid()::text)",
      [org, b, signe, effet, loyer, charges, `${org}/avenant-${randomUUID()}.pdf`]);
    await base();
    return message;
  }
  const revisions = async (b: string) => {
    await base();
    return (await db.query(`select ancien_loyer::text ancien, nouveau_loyer::text nouveau, irl_reference::text reference, irl_nouveau::text indice,
      irl_trimestre trimestre, irl_reference_trimestre reference_trimestre, premier_terme::text premier_terme, date_echeance::text echeance
      from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
  };
  /** Un terme du bail : « loyer+charges ». */
  const terme = async (b: string, mois: string) => {
    await base();
    const r = await un("select loyer_hc::text l, charges::text c, base_loyer_hc::text bl, base_charges::text bc, montant_du::text d from public.appels_loyer where bail_id=$1 and periode=$2::date", [b, mois]);
    return r ? `${r.l}+${r.c}` : null;
  };
  /** Tous les termes du bail, colonnes de montant comprises : « mois:loyer+charges=dû (bases) ». */
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

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai seconde reprise D2 fictif','proprietaire_direct','active') returning id");
    gerant = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Camille') returning id", [org]);
  });

  describe("constat 1 — l'année non faite se reconnaît à l'année de bail, même quand l'année de la référence ne se lit pas", () => {
    it.each([["T2"], ["2e trimestre"], ["T2 23"], [null]])(
      "preuve du relecteur : bail du 15/10/2023 dont le trimestre de référence est écrit %j — en 2025, 700 € ne deviennent plus 742 €",
      async (libelle) => {
        await nousSommesLe("2025-11-24");
        const b = await bail({ date_debut: "2023-10-15", irl_trimestre: libelle });
        // Sans l'indice de l'année précédente : refus, rien n'est écrit, le loyer ne bouge pas.
        const message = await refusRevision(b, 106, "T2 2025", "2025-11-24");
        expect(message).toBe("Indice du T2 2024 obligatoire : aucune révision n'est enregistrée pour l'année de bail précédente, ou l'indice de référence de ce bail est plus ancien. Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an, avec l'indice du même trimestre de l'année précédente (T2 2024). Saisissez cet indice");
        expect(await revisions(b)).toEqual([]);
        expect(Number((await un("select loyer_hc from public.baux where id=$1", [b])).loyer_hc)).toBe(700);
        // Avec lui : 700 × 106 / 103 = 720,39 €, sur un an.
        expect(await reviser(b, 106, "T2 2025", "2025-11-24", 103)).toBe(720.39);
        expect((await revisions(b))[0]).toMatchObject({ ancien: "700.00", nouveau: "720.39", reference: "103", indice: "106", reference_trimestre: "T2 2024" });
      });

    it("preuve du relecteur : dernière révision ancienne, sans trimestre (2022) — en 2025, l'indice de l'année précédente est exigé", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2021-10-15", irl_trimestre: "T2 2021" });
      await db.query("insert into public.revisions_loyer(organization_id,bail_id,date_effet,ancien_loyer,nouveau_loyer,irl_reference,irl_nouveau) values($1,$2,'2022-10-15',690,700,98,100)", [org, b]);
      expect(await refusRevision(b, 106, "T2 2025", "2025-11-24")).toContain("Indice du T2 2024 obligatoire");
      expect(await reviser(b, 106, "T2 2025", "2025-11-24", 103)).toBe(720.39); // plus 742 €
    });

    it("la première année de bail, et l'année qui suit une révision faite, ne demandent rien de plus (cas normal)", async () => {
      await nousSommesLe("2025-10-15");
      const b = await bail({ irl_trimestre: "T2" }); // année de la référence illisible : sans effet sur le cas normal
      expect(await reviser(b, 102, "T2 2025", "2025-10-15")).toBe(714);
      await nousSommesLe("2026-10-15");
      expect(await reviser(b, 104, "T2 2026", "2026-10-15")).toBe(728);
      expect((await revisions(b)).map((r) => [r.nouveau, r.reference, r.reference_trimestre])).toEqual([["714.00", "100.00", null], ["728.00", "102", null]]);
    });

    it("l'ancienne détection reste : référence lisible plus ancienne de plus d'un an, alors que l'année de bail précédente a été révisée", async () => {
      // Troisième reprise du lot D2 (24/11) : ce test enregistrait, pour un bail du 15/01/2024 en T3 2023, la révision du
      // 15/01/2026 avec le T3 2026 — l'indice de la révision SUIVANTE, le défaut relevé ensuite par le relecteur (preuve J1).
      // La base le refuse désormais pour ce bail : sa révision du 15/01/2026 attend le T3 2025.
      await nousSommesLe("2025-01-15");
      const origine = await bail({ date_debut: "2024-01-15", irl_trimestre: "T3 2023" });
      expect(await reviser(origine, 102, "T3 2024", "2025-01-15")).toBe(714);
      await nousSommesLe("2026-11-02");
      expect(await refusRevision(origine, 106, "T3 2026", "2026-11-02", 104)).toContain("son indice est celui du T3 2025");
      // L'ancienne détection reste pour un bail dont l'année de l'indice ne se lit pas (« T3 ») : première année révisée
      // avec le T3 2023, deuxième avec le T3 2025 (deux ans après) — le calcul reste sur un an, l'indice du T3 2024 est exigé.
      await nousSommesLe("2025-01-15");
      const b = await bail({ date_debut: "2024-01-15", irl_trimestre: "T3" });
      expect(await reviser(b, 102, "T3 2023", "2025-01-15")).toBe(714);
      await nousSommesLe("2026-11-02");
      expect(await refusRevision(b, 106, "T3 2025", "2026-11-02")).toContain("Indice du T3 2024 obligatoire");
      expect(await reviser(b, 106, "T3 2025", "2026-11-02", 104)).toBe(727.73); // 714 × 106 / 104
    });
  });

  describe("constat 2 — garde-fou de saisie sur la valeur des indices", () => {
    const VERIFIEZ = /^Révision refusée : vérifiez les indices saisis\. L'indice nouveau \(.+\) et l'indice de référence \(.+\) doivent être deux nombres positifs proches l'un de l'autre$/;

    it.each([["'NaN'::numeric"], ["'Infinity'::numeric"], ["1"], ["150"], ["0.0001"]])(
      "preuve du relecteur : indice de l'année précédente %s — refusé, rien n'est écrit (avant : loyer NaN, 0 €, 74 200 €…)",
      async (precedent) => {
        await nousSommesLe("2025-11-24");
        const b = await bail(ANNEE_NON_FAITE);
        expect(await refusRevision(b, 106, "T2 2025", "2025-11-24", precedent)).toMatch(VERIFIEZ);
        expect(await revisions(b)).toEqual([]);
        expect(String((await un("select loyer_hc::text from public.baux where id=$1", [b])).loyer_hc)).toBe("700.00");
      });

    it("indice de l'année précédente nul ou négatif : toujours le refus d'avant (indice obligatoire)", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail(ANNEE_NON_FAITE);
      for (const precedent of ["0", "-5"]) expect(await refusRevision(b, 106, "T2 2025", "2025-11-24", precedent)).toContain("Indice du T2 2024 obligatoire");
    });

    it("indice nouveau « NaN » ou infini : refusé aussi (avant : un loyer NaN était enregistré)", async () => {
      await nousSommesLe("2025-10-15");
      const b = await bail();
      for (const indice of ["'NaN'::numeric", "'Infinity'::numeric"]) expect(await refusRevision(b, indice, "T2 2025", "2025-10-15")).toMatch(VERIFIEZ);
      expect(await revisions(b)).toEqual([]);
    });

    it("la plage est large : un rapport de 0,8 à 1,25 passe (hausse ou baisse), au-delà c'est une faute de saisie", async () => {
      await nousSommesLe("2025-10-15");
      for (const [indice, loyer] of [[125, 875], [80, 560], [102.5, 717.5], [98, 686]] as const) {
        expect(await reviser(await bail(), indice, "T2 2025", "2025-10-15")).toBe(loyer);
      }
      for (const indice of [125.01, 79.99, 1002.5, 10.25]) {
        const b = await bail();
        expect(await refusRevision(b, indice, "T2 2025", "2025-10-15")).toBe(`Révision refusée : vérifiez les indices saisis. L'indice nouveau (${indice}) et l'indice de référence (100.00) doivent être deux nombres positifs proches l'un de l'autre`);
        expect(await revisions(b)).toEqual([]);
      }
    });
  });

  describe("constats 3 et 4 — un terme appelé en retard autour d'un avenant porte le loyer et les charges qui valaient pour lui", () => {
    it("preuve du relecteur (E2) : avenant enregistré AVANT une révision et appliqué après — janvier, rattrapé, est appelé 714 € (pas 700 €)", async () => {
      await nousSommesLe("2025-11-10");
      const b = await bail();
      await appeler(b);
      expect(await avenant(b, "2025-11-10", "2026-02-01", 800, 50)).toBe("");
      await nousSommesLe("2025-12-03");
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      // Janvier n'est pas appelé (cycle sauté) ; février l'est : l'avenant s'applique. Son « ancien loyer » est resté 700 €,
      // lu le jour de son enregistrement, avant la révision.
      await nousSommesLe("2026-02-03");
      await appelerSeulement(b, "2026-02-01", "2026-02-01");
      expect(await un("select ancien_loyer_hc::text ancien, applique_le is not null applique from public.avenants_bail where bail_id=$1", [b])).toEqual({ ancien: "700.00", applique: true });
      await appeler(b);
      expect(await terme(b, "2025-12-01")).toBe("700.00+50.00");
      expect(await terme(b, "2026-01-01")).toBe("714.00+50.00");
      expect(await terme(b, "2026-02-01")).toBe("800.00+50.00");
    });

    it("preuve du relecteur (E1) : bail sans révision, avenant sur le loyer ET les charges — février, rattrapé, est appelé 700 € + 50 € (pas 700 € + 90 €)", async () => {
      await nousSommesLe("2026-01-05");
      const b = await bail();
      await appeler(b);
      await nousSommesLe("2026-01-20");
      expect(await avenant(b, "2026-01-20", "2026-03-01", 800, 90)).toBe("");
      await nousSommesLe("2026-04-03");
      await appelerSeulement(b, "2026-03-01", "2026-04-01");
      await appeler(b);
      expect((await termes(b)).slice(-4)).toEqual([
        "2026-01:700.00+50.00=750.00 (700.00/50.00) entier 2026-01-05",
        "2026-02:700.00+50.00=750.00 (700.00/50.00) entier 2026-02-05",
        "2026-03:800.00+90.00=890.00 (800.00/90.00) entier 2026-03-05",
        "2026-04:800.00+90.00=890.00 (800.00/90.00) entier 2026-04-05",
      ]);
    });

    it("terme rattrapé au prorata (mois d'entrée) avant un avenant : loyer et charges d'avant, au prorata des jours dus comme le générateur", async () => {
      await nousSommesLe("2024-11-20");
      const b = await bail(); // entré le 15/10/2024 : 17 jours dus sur 31 en octobre
      // Octobre n'est pas appelé (cycle sauté) ; novembre l'est. L'avenant prend effet en décembre : 800 € + 90 €.
      await appelerSeulement(b, "2024-11-01", "2024-11-01");
      expect(await avenant(b, "2024-11-20", "2024-12-01", 800, 90)).toBe("");
      await nousSommesLe("2024-12-02");
      await appelerSeulement(b, "2024-12-01", "2024-12-01"); // décembre : l'avenant s'applique
      await appeler(b); // octobre est rattrapé après
      expect(await termes(b)).toEqual([
        "2024-10:383.87+27.42=411.29 (700.00/50.00) prorata 2024-10-15", // 700 × 17/31 et 50 × 17/31 ; avant : 49,35 € de charges (90 × 17/31)
        "2024-11:700.00+50.00=750.00 (700.00/50.00) entier 2024-11-05",
        "2024-12:800.00+90.00=890.00 (800.00/90.00) entier 2024-12-05",
      ]);
    });

    it("révision et avenant au même premier terme, dans les deux ordres : le terme porte le montant de l'avenant, appliqué en dernier, comme le bail", async () => {
      // (E3) révision le 03/12 puis avenant le 10/12, tous deux pour janvier.
      await nousSommesLe("2025-12-03");
      const b = await bail();
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      await nousSommesLe("2025-12-10");
      expect(await avenant(b, "2025-12-10", "2026-01-01", 800, 50)).toBe("");
      // (E3b) avenant le 01/12 puis révision le 03/12.
      await nousSommesLe("2025-12-01");
      const b2 = await bail();
      await appeler(b2);
      expect(await avenant(b2, "2025-12-01", "2026-01-01", 800, 50)).toBe("");
      await nousSommesLe("2025-12-03");
      expect(await reviser(b2, 102, "T2 2025", "2025-12-03")).toBe(714);
      // Janvier 2026 n'est jamais appelé (cycle sauté) : février l'est, l'avenant s'applique. Seconde révision en octobre
      // 2026 ; janvier est rattrapé après elle.
      for (const x of [b, b2]) {
        await nousSommesLe("2026-10-16");
        await appelerSeulement(x, "2026-02-01", "2026-10-01");
        expect(await reviser(x, 104, "T2 2026", "2026-10-16")).toBe(815.69); // 800 × 104 / 102
        await nousSommesLe("2026-11-03");
        await appeler(x);
        expect(await terme(x, "2026-01-01")).toBe("800.00+50.00");
        expect(await terme(x, "2026-10-01")).toBe("800.00+50.00");
        expect(await terme(x, "2026-11-01")).toBe("815.69+50.00");
      }
    });

    it("quatorze mois de cycle normal avec une révision, un avenant intercalé (signé à une date passée) et une seconde révision : rien n'est bloqué, chaque terme a son montant", async () => {
      await nousSommesLe("2025-10-20");
      const b = await bail();
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2025-10-20")).toBe(714);
      for (const jour of ["2025-11-02", "2025-12-02", "2026-01-02"]) { await nousSommesLe(jour); await appeler(b); }
      // La sonde du relecteur datait la signature du 10/01 alors qu'on était le 02/01 : l'avenant était refusé (date future).
      await nousSommesLe("2026-01-10");
      expect(await avenant(b, "2026-01-08", "2026-02-01", 760, 60)).toBe("");
      for (const jour of ["2026-02-02", "2026-03-02", "2026-06-02", "2026-10-16"]) { await nousSommesLe(jour); await appeler(b); }
      expect(await reviser(b, 104, "T2 2026", "2026-10-16")).toBe(774.9); // 760 × 104 / 102
      await nousSommesLe("2026-12-02");
      await appeler(b);
      const attendu = (await termes(b)).map((t) => t.split("=")[0]);
      expect(attendu).toEqual([
        "2024-10:383.87+27.42",
        ...["2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10"].map((m) => `${m}:700.00+50.00`),
        ...["2025-11", "2025-12", "2026-01"].map((m) => `${m}:714.00+50.00`),
        ...["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((m) => `${m}:760.00+60.00`),
        "2026-11:774.90+60.00", "2026-12:774.90+60.00",
      ]);
    });

    it("même histoire, mais trois termes manquent et sont rattrapés à la fin : décembre 2025 (714 € + 50 €), mars 2026 (760 € + 60 €), et un terme d'avant tout changement", async () => {
      await nousSommesLe("2025-08-03");
      const b = await bail();
      await appeler(b);
      // Septembre 2025 manque ; octobre est appelé, puis la révision (premier terme novembre).
      await nousSommesLe("2025-10-20");
      await appelerSeulement(b, "2025-10-01", "2025-10-01");
      expect(await reviser(b, 102, "T2 2025", "2025-10-20")).toBe(714);
      await nousSommesLe("2025-11-02");
      await appeler(b); // rattrape septembre (700 €) et appelle novembre (714 €)
      // Décembre manque ; janvier est appelé, puis l'avenant (effet février) ; mars manque.
      await nousSommesLe("2026-01-10");
      await appelerSeulement(b, "2026-01-01", "2026-01-01");
      expect(await avenant(b, "2026-01-08", "2026-02-01", 760, 60)).toBe("");
      await nousSommesLe("2026-10-16");
      await appelerSeulement(b, "2026-02-01", "2026-02-01");
      await appelerSeulement(b, "2026-04-01", "2026-10-01");
      expect(await reviser(b, 104, "T2 2026", "2026-10-16")).toBe(774.9);
      await nousSommesLe("2026-11-03");
      await appeler(b);
      expect(await terme(b, "2025-09-01")).toBe("700.00+50.00");
      expect(await terme(b, "2025-12-01")).toBe("714.00+50.00");
      expect(await terme(b, "2026-02-01")).toBe("760.00+60.00");
      expect(await terme(b, "2026-03-01")).toBe("760.00+60.00");
      expect(await terme(b, "2026-11-01")).toBe("774.90+60.00");
    });

    it("une révision d'avant le 24/11/2026 (sans premier terme) compte comme un changement passé : après un avenant puis elle, un terme rattrapé porte SON loyer révisé", async () => {
      await nousSommesLe("2025-03-05");
      const b = await bail();
      await appeler(b);
      expect(await avenant(b, "2025-03-04", "2025-04-01", 800, 50)).toBe("");
      await nousSommesLe("2025-10-03");
      await appeler(b); // avril à octobre 2025 : 800 €
      // Révision d'avant le lot D2, telle qu'elle était enregistrée : sans premier terme. 800 → 816 €.
      await db.query(`insert into public.revisions_loyer(organization_id,bail_id,date_effet,ancien_loyer,nouveau_loyer,irl_reference,irl_nouveau,date_echeance,date_demande,irl_trimestre)
        values($1,$2,'2025-10-15',800,816,100,102,'2025-10-15','2025-10-15','T2 2025')`, [org, b]);
      await db.query("update public.baux set loyer_hc=816 where id=$1", [b]);
      // Novembre 2025 manque ; les termes suivants sont appelés ; puis la révision de 2026 (premier terme novembre 2026).
      await nousSommesLe("2026-10-16");
      await appelerSeulement(b, "2025-12-01", "2026-10-01");
      expect(await reviser(b, 104, "T2 2026", "2026-10-16")).toBe(832); // 816 × 104 / 102
      await appeler(b);
      expect(await terme(b, "2025-11-01")).toBe("816.00+50.00"); // ni 800 € (l'avenant), ni 832 €
    });

    it("comme avant : seule, une révision sans premier terme ne fait pas revenir un terme en arrière ; sans changement postérieur, le déclencheur ne touche à rien", async () => {
      await nousSommesLe("2025-10-03");
      const b = await bail();
      await db.query(`insert into public.revisions_loyer(organization_id,bail_id,date_effet,ancien_loyer,nouveau_loyer,irl_reference,irl_nouveau,date_echeance,date_demande,irl_trimestre)
        values($1,$2,'2025-10-15',700,714,100,102,'2025-10-15','2025-10-15','T2 2025')`, [org, b]);
      await db.query("update public.baux set loyer_hc=714 where id=$1", [b]);
      await nousSommesLe("2025-11-03");
      await appeler(b);
      // Tous les termes, appelés après cette révision d'avant le lot, portent le loyer du bail (comportement d'avant le lot D2).
      expect(await terme(b, "2025-09-01")).toBe("714.00+50.00");
      expect(await terme(b, "2025-11-01")).toBe("714.00+50.00");
    });
  });

  describe("constat 5 — les révisions du locataire sont rendues dans un ordre fixe", () => {
    it("deux révisions en attente du même terme : la plus ancienne d'abord (date d'enregistrement), quel que soit l'ordre des lignes", async () => {
      await nousSommesLe("2026-10-15");
      const b = await bail();
      const titulaire = await compte();
      await db.query("update public.persons set account_id=$1 where id=$2", [titulaire, locataire]);
      await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'locataire','active')", [titulaire, org]);
      // La révision du 15/10 (714 → 728) est écrite la première, celle du 14/10 (700 → 714) la seconde : l'ordre des lignes
      // est l'inverse de l'ordre d'enregistrement.
      const ecrire = (effet: string, ancien: number, nouveau: number, cree: string) => db.query(
        `insert into public.revisions_loyer(organization_id,bail_id,date_effet,ancien_loyer,nouveau_loyer,irl_reference,irl_nouveau,premier_terme,created_at)
         values($1,$2,$3,$4,$5,100,102,'2026-11-01',$6)`, [org, b, effet, ancien, nouveau, cree]);
      await ecrire("2026-10-15", 714, 728, "2026-10-15T09:00:00Z");
      await ecrire("2026-10-14", 700, 714, "2026-10-14T09:00:00Z");
      await enCompte(titulaire);
      const lues = (await db.query("select ancien_loyer::float8 ancien, nouveau_loyer::float8 nouveau from public.revisions_de_mon_loyer_locataire($1)", [org])).rows;
      await base();
      expect(lues).toEqual([{ ancien: 700, nouveau: 714 }, { ancien: 714, nouveau: 728 }]);
      expect(String((await un("select pg_get_functiondef('public.revisions_de_mon_loyer_locataire(uuid)'::regprocedure) d")).d)).toContain("order by rv.premier_terme, rv.created_at, rv.date_effet");
    });

    it("preuve du relecteur (D1) : révisions du 14/10 et du 15/10/2026 par la fonction de révision — même premier terme, octobre reste appelé 700 €", async () => {
      await nousSommesLe("2026-10-14");
      const b = await bail();
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2026-10-14")).toBe(714);
      await nousSommesLe("2026-10-15");
      expect(await reviser(b, 104, "T2 2026", "2026-10-15")).toBe(728);
      expect((await revisions(b)).map((r) => [r.ancien, r.nouveau, r.premier_terme])).toEqual([["700.00", "714.00", "2026-11-01"], ["714.00", "728.00", "2026-11-01"]]);
      expect(await terme(b, "2026-10-01")).toBe("700.00+50.00");
      await nousSommesLe("2026-11-02");
      await appeler(b);
      expect(await terme(b, "2026-11-01")).toBe("728.00+50.00");
    });
  });

  describe("constat 7 — l'indice de la révision suivante est refusé", () => {
    it("preuve du relecteur : bail du 15/10/2023, le 01/09/2025 — la révision du 15/10/2024 ne prend pas l'indice T2 2025", async () => {
      await nousSommesLe("2025-09-01");
      const b = await bail(ANNEE_NON_FAITE);
      for (const precedent of [undefined, 103]) {
        // Troisième reprise du lot D2 (24/11) : même refus, dit par la règle qui remplace la borne de cette migration
        // (l'indice attendu est nommé).
        expect(await refusRevision(b, 106, "T2 2025", "2025-09-01", precedent))
          .toBe("Indice du T2 2025 refusé : la révision demandée est celle du 15/10/2024, et son indice est celui du T2 2024 (le trimestre de l'indice du bail, une année de plus par année de bail écoulée)");
      }
      expect(await revisions(b)).toEqual([]);
      // Avec l'indice de son année : la révision de 2024 passe (700 × 103 / 100), puis celle de 2025 à sa date.
      expect(await reviser(b, 103, "T2 2024", "2025-09-01")).toBe(721);
      await nousSommesLe("2025-10-15");
      expect(await reviser(b, 106, "T2 2025", "2025-10-15")).toBe(742); // 721 × 106 / 103 : deux révisions, chacune sur un an
      expect((await revisions(b)).map((r) => [r.echeance, r.trimestre, r.reference_trimestre])).toEqual([["2024-10-15", "T2 2024", null], ["2025-10-15", "T2 2025", null]]);
    });

    it("un indice d'une année antérieure à la date de révision reste accepté (indice du 3e trimestre pour une date de janvier)", async () => {
      await nousSommesLe("2025-01-15");
      const b = await bail({ date_debut: "2024-01-15", irl_trimestre: "T3 2023" });
      // Troisième reprise du lot D2 (24/11), demande du relecteur : et l'indice du T3 2025, celui de la révision suivante,
      // est refusé pour cette date de révision (la borne de cette migration, sur la seule année civile, le laissait passer).
      expect(await refusRevision(b, 104, "T3 2025", "2025-01-15", 102))
        .toBe("Indice du T3 2025 refusé : la révision demandée est celle du 15/01/2025, et son indice est celui du T3 2024 (le trimestre de l'indice du bail, une année de plus par année de bail écoulée)");
      expect(await reviser(b, 102, "T3 2024", "2025-01-15")).toBe(714);
    });
  });

  describe("cas normal — une révision par an, sans avenant : identique avec et sans la migration", () => {
    it("vingt baux tirés : mêmes révisions et mêmes appels de loyer, caractère pour caractère, avant (retour joué) et après", async () => {
      // Tirage à graine fixe (celui de la sonde du relecteur) : loyer, indice de référence, variations annuelles, trimestre,
      // jour et mois d'entrée, retard de la demande (jusqu'à 39 jours après la date anniversaire).
      let graine = 12345;
      const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
      const tirages = Array.from({ length: 20 }, () => ({
        loyer: Math.round((300 + alea() * 2500) * 100) / 100, reference: Math.round((120 + alea() * 30) * 100) / 100,
        v1: 1 + alea() * 0.04 - 0.005, v2: 1 + alea() * 0.04 - 0.005, trimestre: 1 + Math.floor(alea() * 4),
        jour: 1 + Math.floor(alea() * 28), mois: 1 + Math.floor(alea() * 12), retard: Math.floor(alea() * 40),
      }));
      const plusJours = async (jour: string, n: number) => String((await un("select ($1::date + $2::int)::text j", [jour, n])).j);
      async function serie() {
        const lignes: string[] = [];
        for (const t of tirages) {
          const mm = String(t.mois).padStart(2, "0"), jj = String(t.jour).padStart(2, "0");
          const b = await bail({ date_debut: `2024-${mm}-${jj}`, loyer_hc: t.loyer, depot_garantie: 300, irl_trimestre: `T${t.trimestre} 2024`, irl_valeur: t.reference });
          const i1 = Math.round(t.reference * t.v1 * 100) / 100, i2 = Math.round(i1 * t.v2 * 100) / 100;
          const j1 = await plusJours(`2025-${mm}-${jj}`, t.retard), j2 = await plusJours(`2026-${mm}-${jj}`, t.retard);
          await nousSommesLe(j1); await appeler(b);
          const r1 = await reviser(b, i1, `T${t.trimestre} 2025`, j1);
          await nousSommesLe(j2); await appeler(b);
          const r2 = await reviser(b, i2, `T${t.trimestre} 2026`, j2);
          await nousSommesLe(await plusJours(j2, 70)); await appeler(b);
          await base();
          const rv = (await db.query(`select date_effet::text, ancien_loyer::text, nouveau_loyer::text, irl_reference::text, irl_reference_trimestre, irl_nouveau::text,
            date_echeance::text, date_demande::text, irl_trimestre, premier_terme::text from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
          lignes.push(JSON.stringify([r1, r2, rv, await termes(b), (await un("select loyer_hc::text l, charges::text c from public.baux where id=$1", [b]))]));
        }
        return lignes;
      }
      // Troisième reprise (24/11) : son retour d'abord (ordre du LISEZ-MOI). Le test compare, comme avant, cette migration
      // à l'état d'avant elle ; l'égalité avec et sans la TROISIÈME reprise est tenue par son propre test de base.
      await base();
      await db.query(retourTroisiemeReprise());
      const apres = await serie();
      await base();
      await db.query(retour());
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
    });
  });

  describe("sécurité, rejeu et retour", () => {
    it("les trois fonctions gardent SECURITY DEFINER, chemin vide et droits ; rien n'est ouvert aux visiteurs ; le contrôle de l'appelant est toujours là", async () => {
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
      expect(def.match(/aujourdhui_paris\(\)/g)).toHaveLength(2);
      expect(def.match(/org_ids_avec_roles/g)).toHaveLength(1);
      expect(String((await un("select pg_get_functiondef('public.revisions_de_mon_loyer_locataire(uuid)'::regprocedure) d")).d)).toContain("public.mon_bail_locataire(p_org)");
      // Le déclencheur est toujours celui-là, avant insertion, sur les appels de loyer.
      expect((await un("select pg_get_triggerdef(oid) d from pg_trigger where tgrelid='public.appels_loyer'::regclass and tgname='a_revision_du_bail'")).d)
        .toBe("CREATE TRIGGER a_revision_du_bail BEFORE INSERT ON public.appels_loyer FOR EACH ROW EXECUTE FUNCTION appliquer_revision_a_l_appel()");
    });

    it("le contrôle de l'appelant est inchangé : le gérant d'un autre espace, un locataire et un visiteur sont refusés avant tout nouveau contrôle", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail(ANNEE_NON_FAITE);
      const etranger = await compte();
      const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
      await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [etranger, ailleurs]);
      const habitant = await compte();
      await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'locataire','active')", [habitant, org]);
      for (const c of [etranger, habitant]) {
        await enCompte(c);
        // Même avec des indices que les nouveaux contrôles refuseraient, c'est « Accès refusé » qui répond.
        expect(await refus("select public.reviser_loyer($1,'NaN'::numeric,'T2 2026','2025-11-24'::date)", [b])).toBe("Accès refusé");
        expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date,1)", [b])).toBe("Accès refusé");
        expect((await db.query("select * from public.revisions_de_mon_loyer_locataire($1)", [org])).rows).toEqual([]);
      }
      await base();
      await db.query("set local role anon");
      expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date,103)", [b])).toMatch(/permission denied/);
      expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date)", [b])).toMatch(/permission denied/);
      expect(await refus("select * from public.revisions_de_mon_loyer_locataire($1)", [org])).toMatch(/permission denied/);
      await base();
      expect(await revisions(b)).toEqual([]);
    });

    it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête ; la migration de la reprise, rejouée par-dessus, s'arrête sans rien modifier", async () => {
      await db.query(retourTroisiemeReprise());
      const avant = await etat();
      await db.query(migration());
      await db.query(migration());
      expect(await etat()).toEqual(avant);
      // Rejouer la reprise tant que la seconde reprise est en place : elle ne reconnaît plus ses lignes et s'arrête.
      expect(await refus(lire(`supabase/migrations/${REPRISE}.sql`))).toMatch(/ne porte ni la définition attendue ni celle de cette reprise \(1 endroit\(s\) d'avant, 5 de la reprise, sur 6\) : définition inattendue, rien n'est modifié/);
      expect(await etat()).toEqual(avant);
      // Un des quatre endroits réécrit : forme inconnue, refusée.
      await db.query((await definition()).replace("between 0.8 and 1.25", "between 0.5 and 2"));
      const modifiee = await etat();
      expect(modifiee.origine).not.toBe(avant.origine);
      expect(await refus(migration())).toMatch(/ne porte ni la définition attendue ni celle de cette seconde reprise \(1 endroit\(s\) d'avant, 3 de la seconde reprise, sur 4\) : définition inattendue, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });

    it("le retour rend les définitions d'avant, garde les révisions, les appels et les avenants, se rejoue ; la migration se rejoue ensuite", async () => {
      await db.query(retourTroisiemeReprise());
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2" });
      await appeler(b);
      await reviser(b, 106, "T2 2025", "2025-11-24", 103);
      const compter = async () => un("select (select count(*)::int from public.revisions_loyer where bail_id=$1) revisions, (select count(*)::int from public.appels_loyer where bail_id=$1) appels, (select md5(string_agg(a::text,'|' order by periode)) from public.appels_loyer a where bail_id=$1) empreinte", [b]);
      const donnees = await compter();
      const migre = await etat();
      await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'revision_loyer_seconde_reprise_d2') on conflict do nothing", [CODE]);
      await db.query(retour());
      const revenu = await etat();
      expect(revenu.origine).not.toBe(migre.origine);
      expect(revenu.declencheur).not.toBe(migre.declencheur);
      expect(revenu.lecture_locataire).not.toBe(migre.lecture_locataire);
      expect(revenu.cinq).toBe(migre.cinq);
      expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
      expect(await definition()).not.toMatch(/Seconde reprise|between 0\.8 and 1\.25|révision suivante/);
      expect(await compter()).toEqual(donnees);
      // L'état d'avant est vraiment revenu : le rattrapage de deux années repasse quand l'année de la référence ne se lit pas.
      const b2 = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2" });
      expect(await reviser(b2, 106, "T2 2025", "2025-11-24")).toBe(742);
      // Rejoué, le retour ne fait rien. Le retour de la reprise se joue alors sans refus : c'est l'ordre du LISEZ-MOI.
      await base();
      await db.query(retour());
      expect(await etat()).toEqual(revenu);
      await db.query("savepoint reprise");
      await db.query(lire(`supabase/retours-arriere/${REPRISE}.retour.sql`));
      expect((await un("select to_regprocedure($1) is null as absente", [CINQ])).absente).toBe(true);
      // Sur la base ainsi revenue avant la reprise, le retour de la seconde reprise, rejoué, ne fait rien et ne crée rien.
      const avantLaReprise = await etat();
      await db.query(retour());
      expect(await etat()).toEqual(avantLaReprise);
      expect(avantLaReprise.lecture_locataire).toBeNull();
      expect(avantLaReprise.declencheur).not.toBe(revenu.declencheur);
      await db.query("rollback to savepoint reprise");

      await db.query(migration());
      expect(await etat()).toEqual(migre);
    });

    it("joué avant celui de la seconde reprise, le retour de la reprise s'arrête sans rien modifier (l'ordre des retours est tenu par la base)", async () => {
      const avant = await etat();
      expect(await refus(lire(`supabase/retours-arriere/${REPRISE}.retour.sql`))).toMatch(/ne porte qu'une partie de la reprise \(5 endroit\(s\) sur 6\) : définition réécrite depuis, rien n'est modifié/);
      expect(await etat()).toEqual(avant);
    });

    it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
      await db.query(retourTroisiemeReprise());
      await db.query((await definition()).replace("between 0.8 and 1.25", "between 0.5 and 2"));
      const modifiee = await etat();
      expect(await refus(retour())).toMatch(/ne porte qu'une partie de la seconde reprise \(3 endroit\(s\) sur 4\) : définition réécrite depuis, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });
  });
});
