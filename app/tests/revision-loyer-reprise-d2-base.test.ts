/**
 * RÉVISION ANNUELLE DU LOYER — décisions du dirigeant du 24/11/2026, lot D2, REPRISE après relecture, côté base
 * (migration 20261124130000_revision_loyer_reprise_d2).
 *
 * Ces tests tiennent, chacun avec le cas chiffré du relecteur :
 *  1. une révision non faite n'est plus rattrapée l'année suivante : bail du 15/10/2023, T2 2023 = 100, rien en 2024 ; en
 *     2025, 700 € ne deviennent plus 742 € (deux ans) mais 720,39 € (un an, avec l'indice de l'année précédente) ; même
 *     règle pour la variante « T2 2024 puis T2 2026 » ; le cas normal (une révision par an) donne exactement les montants
 *     d'avant ;
 *  2. un terme rattrapé après un avenant, entre deux révisions, prend le loyer d'avant l'avenant (714 €, pas 800 €) ;
 *  3. une demande antidatée ne fait pas gagner un terme ;
 *  4. un bail terminé ne se révise plus ; un bail en préavis reste révisable ;
 *  5. le locataire lit les révisions de SON bail, et personne d'autre par cette fonction ;
 *  6. sécurité inchangée, rejeu sans effet, retour qui rend la définition d'avant sans rien supprimer.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le jour de Paris est figé dans la transaction.
 * Le fichier rejoue du DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { premierTermeRevise } from "@/lib/baux";

const CODE = "20261124130000";
const NOM = `${CODE}_revision_loyer_reprise_d2`;
/** La fonction d'origine, où tout le calcul est écrit, et la seconde signature qui lui transmet l'indice de l'année précédente. */
const ORIGINE = "public.reviser_loyer(uuid,numeric,text,date)";
const CINQ = "public.reviser_loyer(uuid,numeric,text,date,numeric)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
// Seconde reprise du lot D2 (24/11) : la migration 20261124150000 modifie deux lignes posées par celle-ci (la condition de
// l'année non faite et son message). Tant qu'elle est en place, le rejeu et le retour de celle-ci s'arrêtent sans rien
// modifier (tenu par tests/revision-loyer-seconde-reprise-d2-base.test.ts). Les tests qui rejouent ou défont CETTE migration
// jouent donc d'abord le retour de la seconde reprise, dans leur transaction : c'est l'ordre du LISEZ-MOI.
const retourSecondeReprise = () => lire("supabase/retours-arriere/20261124150000_revision_loyer_seconde_reprise_d2.retour.sql");

describe("révision du loyer, reprise du lot D2 — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, après celle du lot D2, avec son retour listé et en tête de l'ordre des retours", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261124100000_revision_loyer_delai_et_premier_terme.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Son retour se joue AVANT celui de 20261124100000 : les lignes de la reprise se servent des variables de ce lot.
    const chaine = lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    expect(codes.indexOf(CODE)).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf(CODE)).toBeLessThan(codes.indexOf("20261124100000"));
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/revision-loyer-reprise-d2-base.test.ts"');
  });

  it("la migration n'écrit aucune ligne existante, ne recopie pas reviser_loyer à la main et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    // Hors des blocs ajoutés à reviser_loyer et des fonctions, aucune écriture de données.
    const horsFonctions = sql.replace(/\$bloc\$[\s\S]*?\$bloc\$/g, "").replace(/\$fonction\$[\s\S]*?\$fonction\$/g, "");
    expect(horsFonctions).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/\b(update|delete from)\s+public\.(revisions_loyer|appels_loyer|baux)\b/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // La fonction d'origine n'est pas recopiée : elle est relue et complétée. La seule fonction reviser_loyer écrite en
    // clair est la seconde signature, à cinq paramètres, qui ne calcule rien.
    expect(sql.match(/create\s+(or\s+replace\s+)?function\s+public\.reviser_loyer\s*\(([^)]*)\)/gi)).toHaveLength(1);
    expect(sql).toMatch(/create or replace function public\.reviser_loyer\(\s*p_bail uuid, p_irl_nouveau numeric, p_irl_trimestre text, p_date_demande date, p_irl_precedent numeric\)/);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime ni table, ni colonne, ni donnée ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from public\.|update public\./i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });

  it("aucun article de loi dans les textes ajoutés à la base", () => {
    for (const [, bloc] of migration().matchAll(/\$bloc\$([\s\S]*?)\$bloc\$/g)) expect(bloc).not.toMatch(/art\.|article|17-1|alinéa/i);
  });

  it("l'écran calcule le même premier terme révisé que la base (point 3)", () => {
    // Demande du jour : le mois suivant.
    expect(premierTermeRevise("2025-12-02", "2025-12-02", null)).toBe("2026-01-01");
    // Demande antidatée au mois d'avant : c'est le jour d'enregistrement qui compte.
    expect(premierTermeRevise("2025-11-30", "2025-12-02", "2025-11-01")).toBe("2026-01-01");
    // Terme du mois suivant déjà appelé : le terme d'après.
    expect(premierTermeRevise("2025-12-02", "2025-12-02", "2026-01-01")).toBe("2026-02-01");
  });
});

describe.skipIf(!url)("révision du loyer, reprise du lot D2 (avec base)", () => {
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
  /** Le cycle mensuel : appelle les loyers jusqu'au mois du jour de Paris. */
  const appeler = async (b: string) => { await base(); await db.query("select public.generer_appels_loyer_interne($1)", [b]); };
  /** La demande de révision du gérant ; `precedent` absent : appel à quatre arguments, comme avant la reprise. */
  const APPEL = (precedent?: number | null) => precedent === undefined
    ? "select public.reviser_loyer($1,$2,$3,$4::date)::float8 as loyer"
    : `select public.reviser_loyer($1,$2,$3,$4::date,${precedent === null ? "null" : precedent})::float8 as loyer`;
  async function reviser(b: string, indice: number, trimestre: string, demande: string, precedent?: number | null) {
    await enGerant();
    const { loyer } = await un(APPEL(precedent), [b, indice, trimestre, demande]);
    await base();
    return Number(loyer);
  }
  async function refusRevision(b: string, indice: number, trimestre: string, demande: string, precedent?: number | null) {
    await enGerant();
    const message = await refus(APPEL(precedent), [b, indice, trimestre, demande]);
    await base();
    return message;
  }
  /** Les révisions du bail : montants, indices utilisés, trimestre de l'indice de l'année précédente, premier terme. */
  const revisions = async (b: string) => {
    await base();
    return (await db.query(`select ancien_loyer::float8 ancien, nouveau_loyer::float8 nouveau, irl_reference::float8 reference, irl_nouveau::float8 indice,
      irl_trimestre trimestre, irl_reference_trimestre reference_trimestre, premier_terme::text premier_terme
      from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
  };
  /** Un terme du bail : [loyer, base mensuelle du loyer]. */
  const terme = async (b: string, mois: string) => {
    await base();
    const r = await un("select loyer_hc::float8 loyer, base_loyer_hc::float8 base from public.appels_loyer where bail_id=$1 and periode=$2::date", [b, mois]);
    return r ? [r.loyer, r.base] : null;
  };
  const etat = async () => un(
    `select (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure($1)) as origine,
            (select md5(pg_get_functiondef(p.oid)) || p.proacl::text from pg_proc p where p.oid = to_regprocedure($2)) as cinq,
            (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid = to_regprocedure('public.appliquer_revision_a_l_appel()')) as declencheur,
            to_regprocedure('public.revisions_de_mon_loyer_locataire(uuid)') is not null as lecture_locataire`, [ORIGINE, CINQ]);
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) d", [ORIGINE])).d);

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai reprise D2 fictif','proprietaire_direct','active') returning id");
    gerant = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Camille') returning id", [org]);
  });

  describe("point 1 — une révision non faite n'est plus rattrapée l'année suivante", () => {
    it("preuve du relecteur : bail du 15/10/2023 (T2 2023 = 100), rien en 2024 ; en 2025, 700 € → 720,39 € sur un an, plus 742 €", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      // Sans l'indice de l'année précédente : refus clair, rien n'est écrit, le loyer ne bouge pas.
      const message = await refusRevision(b, 106, "T2 2025", "2025-11-24");
      expect(message).toContain("Indice du T2 2024 obligatoire");
      // Seconde reprise du lot D2 : le message n'affirme plus qu'une révision « n'a pas été faite » (la base sait seulement
      // qu'aucune n'est enregistrée) ; la règle, elle, est dite de la même façon.
      expect(message).toContain("Une révision qui n'a pas été faite n'est pas rattrapée : le loyer se révise sur un an");
      expect(await refusRevision(b, 106, "T2 2025", "2025-11-24", null)).toContain("Indice du T2 2024 obligatoire");
      expect(await refusRevision(b, 106, "T2 2025", "2025-11-24", 0)).toContain("Indice du T2 2024 obligatoire");
      expect(await revisions(b)).toEqual([]);
      // Avec l'indice du T2 2024 (103) : 700 × 106 / 103 = 720,39 €. Les deux indices utilisés sont écrits.
      expect(await reviser(b, 106, "T2 2025", "2025-11-24", 103)).toBe(720.39);
      expect(await revisions(b)).toEqual([{ ancien: 700, nouveau: 720.39, reference: 103, indice: 106, trimestre: "T2 2025", reference_trimestre: "T2 2024", premier_terme: "2025-12-01" }]);
    });

    it("variante du relecteur : indice T2 2024 en 2025, puis T2 2026 un an après — la seconde se calcule avec le T2 2025, pas avec le T2 2024", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      // Première révision : un an d'écart entre les indices (T2 2023 → T2 2024).
      // Seconde reprise du lot D2 : ce bail est dans sa deuxième année sans révision la première ; l'indice de l'année
      // précédente est désormais exigé même ici (c'est celui du bail, 100). Même montant, et son trimestre est écrit.
      expect(await reviser(b, 103, "T2 2024", "2025-11-24", 100)).toBe(721);
      await nousSommesLe("2026-10-15");
      // Seconde : T2 2026 contre une référence T2 2024. Avant la reprise : 721 × 109 / 103 = 763,00 €.
      expect(await refusRevision(b, 109, "T2 2026", "2026-10-15")).toContain("Indice du T2 2025 obligatoire");
      expect(await reviser(b, 109, "T2 2026", "2026-10-15", 106)).toBe(741.41); // 721 × 109 / 106
      expect((await revisions(b)).map((r) => [r.ancien, r.nouveau, r.reference, r.indice, r.reference_trimestre])).toEqual([
        [700, 721, 100, 103, "T2 2023"],
        [721, 741.41, 106, 109, "T2 2025"],
      ]);
    });

    it("cas normal (une révision par an) : exactement les mêmes montants qu'avant la reprise, avec ou sans le nouveau paramètre", async () => {
      /** Deux révisions annuelles de suite ; `precedent` est transmis tel quel (il ne doit pas être lu). */
      async function deuxAnnees(precedent?: number | null) {
        await nousSommesLe("2025-10-15");
        const b = await bail();
        await reviser(b, 101.37, "T2 2025", "2025-10-15", precedent);
        await nousSommesLe("2026-10-15");
        await reviser(b, 103.61, "T2 2026", "2026-10-15", precedent);
        return (await revisions(b)).map((r) => [r.ancien, r.nouveau, r.reference, r.indice, r.trimestre, r.reference_trimestre]);
      }
      const attendu = [[700, 709.59, 100, 101.37, "T2 2025", null], [709.59, 725.27, 101.37, 103.61, "T2 2026", null]];
      expect(await deuxAnnees()).toEqual(attendu);       // appel à quatre arguments, comme le code d'avant
      expect(await deuxAnnees(null)).toEqual(attendu);
      expect(await deuxAnnees(55)).toEqual(attendu);     // un indice « précédent » fourni à tort n'est pas lu
      // La définition d'avant la reprise, rétablie par le retour, donne les mêmes lignes.
      await base();
      await db.query(retourSecondeReprise());
      await db.query(retour());
      const avant = await (async () => {
        await nousSommesLe("2025-10-15");
        const b = await bail();
        await reviser(b, 101.37, "T2 2025", "2025-10-15");
        await nousSommesLe("2026-10-15");
        await reviser(b, 103.61, "T2 2026", "2026-10-15");
        await base();
        return (await db.query("select ancien_loyer::float8 a, nouveau_loyer::float8 n, irl_reference::float8 r, irl_nouveau::float8 i, irl_trimestre t from public.revisions_loyer where bail_id=$1 order by date_effet", [b]))
          .rows.map((r) => [r.a, r.n, r.r, r.i, r.t, null]);
      })();
      expect(avant).toEqual(attendu);
    });

    it("les refus d'avant restent : même année que la référence, autre trimestre", async () => {
      await nousSommesLe("2025-10-15");
      const b = await bail();
      expect(await refusRevision(b, 101, "T2 2024", "2025-10-15", 99)).toMatch(/l'indice de référence est déjà celui de 2024/);
      expect(await refusRevision(b, 101, "T3 2026", "2025-10-15", 99)).toMatch(/même trimestre/);
    });
  });

  describe("point 2 — terme rattrapé après un avenant, entre deux révisions", () => {
    it("cas du relecteur : R1 le 03/12/2025 (700 → 714), avenant à 800 € au 01/03/2026, R2 le 03/12/2026 ; février 2026 appelé tard = 714 €", async () => {
      await nousSommesLe("2025-12-03");
      const b = await bail();
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      await nousSommesLe("2026-01-05");
      await appeler(b);
      // L'avenant signé le 20/01, effet au 01/03/2026 : loyer convenu 800 €.
      await nousSommesLe("2026-01-20");
      await enGerant();
      await db.query(
        "select public.enregistrer_avenant_bail($1,$2,'Loyer convenu avec le locataire','2026-01-20'::date,'2026-03-01'::date,800,50,$3,'application/pdf',1234,gen_random_uuid()::text)",
        [org, b, `${org}/avenant-${randomUUID()}.pdf`]);
      await base();
      // Février n'est jamais appelé (cycle sauté) ; mars à décembre le sont, l'avenant s'applique en mars.
      await nousSommesLe("2026-12-03");
      await db.query(`insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance,prorata)
        select b.organization_id,b.id,g::date,b.loyer_hc,b.charges,b.loyer_hc+b.charges,g::date+4,false
          from public.baux b, generate_series('2026-03-01'::date,'2026-12-01','1 month') g where b.id=$1`, [b]);
      expect(await terme(b, "2026-03-01")).toEqual([800, 800]);
      expect(await reviser(b, 104, "T2 2026", "2026-12-03")).toBe(815.69); // 800 × 104 / 102
      // Le cycle rattrape février : le loyer qui valait pour février est celui d'avant l'avenant, 714 €.
      await appeler(b);
      expect(await terme(b, "2026-02-01")).toEqual([714, 714]);
      // Les autres termes rattrapés ou à venir ne sont pas dérangés.
      expect(await terme(b, "2026-12-01")).toEqual([800, 800]);
    });

    it("sans avenant, rien ne change : un terme d'avant la révision appelé tard garde le loyer d'avant", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail();
      await nousSommesLe("2025-12-03");
      await reviser(b, 102, "T2 2025", "2025-12-03");
      await appeler(b);
      expect(await terme(b, "2025-12-01")).toEqual([700, 700]);
      await nousSommesLe("2026-01-02");
      await appeler(b);
      expect(await terme(b, "2026-01-01")).toEqual([714, 714]);
    });
  });

  describe("point 3 — une demande antidatée ne fait pas gagner un terme", () => {
    it("saisie le 02/12 d'une demande datée du 30/11 : premier terme révisé janvier (comme une demande du 02/12), décembre reste à 700 €", async () => {
      await nousSommesLe("2025-11-30");
      const b = await bail();
      await appeler(b); // jusqu'à novembre
      await nousSommesLe("2025-12-02");
      expect(await reviser(b, 102, "T2 2025", "2025-11-30")).toBe(714);
      expect((await revisions(b))[0].premier_terme).toBe("2026-01-01");
      await appeler(b);
      expect(await terme(b, "2025-12-01")).toEqual([700, 700]);
    });

    it("demande du jour : inchangé, le mois qui suit", async () => {
      await nousSommesLe("2025-12-02");
      const b = await bail();
      await reviser(b, 102, "T2 2025", "2025-12-02");
      expect((await revisions(b))[0].premier_terme).toBe("2026-01-01");
    });
  });

  describe("point 7 — bail terminé", () => {
    it("un bail terminé ne se révise plus (rien n'est écrit) ; un bail en préavis reste révisable", async () => {
      await nousSommesLe("2025-11-24");
      const fini = await bail({ etat: "termine", date_fin: "2025-11-20" });
      expect(await refusRevision(fini, 102, "T2 2025", "2025-11-24")).toBe("Révision refusée : ce bail est terminé, son loyer ne se révise plus");
      expect(await revisions(fini)).toEqual([]);
      const preavis = await bail({ etat: "preavis", date_fin: "2026-02-28" });
      expect(await reviser(preavis, 102, "T2 2025", "2025-11-24")).toBe(714);
    });
  });

  describe("point 4 — le locataire lit les révisions de son bail", () => {
    it("le locataire du bail lit ses révisions ; un autre locataire, le gérant et un compte sans espace n'en lisent aucune par cette fonction", async () => {
      await nousSommesLe("2025-12-03");
      const b = await bail();
      await reviser(b, 102, "T2 2025", "2025-12-03");
      const titulaire = await compte(), voisin = await compte(), inconnu = await compte();
      await db.query("update public.persons set account_id=$1 where id=$2", [titulaire, locataire]);
      const autre = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Fictif','Dominique',$2) returning id", [org, voisin]);
      await bail({ locataire_principal: autre });
      for (const c of [titulaire, voisin]) await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'locataire','active')", [c, org]);
      const lues = async (c: string) => { await enCompte(c); const r = (await db.query("select bail_id, ancien_loyer::float8 ancien, nouveau_loyer::float8 nouveau, premier_terme::text premier_terme from public.revisions_de_mon_loyer_locataire($1)", [org])).rows; await base(); return r; };
      expect(await lues(titulaire)).toEqual([{ bail_id: b, ancien: 700, nouveau: 714, premier_terme: "2026-01-01" }]);
      expect(await lues(voisin)).toEqual([]);
      expect(await lues(gerant)).toEqual([]);
      expect(await lues(inconnu)).toEqual([]);
    });
  });

  describe("sécurité, rejeu et retour", () => {
    it("la fonction d'origine garde signature, SECURITY DEFINER, chemin vide et droits ; la seconde signature s'exécute avec les droits de l'appelant ; rien n'est ouvert aux visiteurs", async () => {
      const { rows } = await db.query(
        `select pg_get_function_arguments(p.oid) arguments, p.prosecdef definer, p.proconfig::text config, p.proacl::text acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='reviser_loyer' order by p.pronargs`);
      expect(rows).toHaveLength(2);
      const [origine, cinq] = rows;
      expect(origine.arguments).toMatch(/^p_bail uuid, p_irl_nouveau numeric, p_irl_trimestre text, p_date_demande date DEFAULT (public\.)?aujourdhui_paris\(\)$/);
      expect(origine).toMatchObject({ definer: true, config: '{"search_path=\\"\\""}' });
      expect(cinq.arguments).toBe("p_bail uuid, p_irl_nouveau numeric, p_irl_trimestre text, p_date_demande date, p_irl_precedent numeric");
      expect(cinq).toMatchObject({ definer: false, config: '{"search_path=\\"\\""}' });
      for (const f of rows) expect(f.acl).not.toMatch(/anon|^\{=|,=/);
      const droits = await un(
        `select has_function_privilege('anon',$1,'execute') origine_anon, has_function_privilege('authenticated',$1,'execute') origine_connecte,
                has_function_privilege('anon',$2,'execute') cinq_anon, has_function_privilege('authenticated',$2,'execute') cinq_connecte,
                has_function_privilege('anon','public.revisions_de_mon_loyer_locataire(uuid)','execute') lecture_anon,
                has_function_privilege('authenticated','public.revisions_de_mon_loyer_locataire(uuid)','execute') lecture_connecte,
                has_function_privilege('anon','public.appliquer_revision_a_l_appel()','execute') declencheur_anon,
                has_function_privilege('authenticated','public.appliquer_revision_a_l_appel()','execute') declencheur_connecte`, [ORIGINE, CINQ]);
      expect(droits).toEqual({ origine_anon: false, origine_connecte: true, cinq_anon: false, cinq_connecte: true,
        lecture_anon: false, lecture_connecte: true, declencheur_anon: false, declencheur_connecte: false });
      // Le jour de Paris n'est toujours lu que deux fois dans la fonction d'origine (en-tête et corps), comme l'attend le lot
      // « jour de Paris » ; le contrôle de l'appelant y est toujours, une seule fois.
      const def = await definition();
      expect(def.match(/aujourdhui_paris\(\)/g)).toHaveLength(2);
      expect(def.match(/org_ids_avec_roles/g)).toHaveLength(1);
      const lecture = await un("select prosecdef definer, proconfig::text config from pg_proc where oid = 'public.revisions_de_mon_loyer_locataire(uuid)'::regprocedure");
      expect(lecture).toEqual({ definer: true, config: '{"search_path=\\"\\""}' });
    });

    it("l'indice de l'année précédente ne reste pas en mémoire après l'appel : la révision suivante, à quatre arguments, ne le lit pas", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      const b2 = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      await reviser(b, 106, "T2 2025", "2025-11-24", 103);
      // Même transaction, autre bail dans le même cas, appel à quatre arguments : refusé, l'indice 103 n'a pas été gardé.
      expect(await refusRevision(b2, 106, "T2 2025", "2025-11-24")).toContain("Indice du T2 2024 obligatoire");
    });

    it("le contrôle de l'appelant est inchangé : le gérant d'un autre espace et un locataire sont refusés, avec ou sans le nouveau paramètre", async () => {
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      const etranger = await compte();
      const ailleurs = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
      await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [etranger, ailleurs]);
      const habitant = await compte();
      await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'locataire','active')", [habitant, org]);
      for (const c of [etranger, habitant]) {
        await enCompte(c);
        expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date)", [b])).toBe("Accès refusé");
        expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date,103)", [b])).toBe("Accès refusé");
      }
      await base();
      await db.query("set local role anon");
      expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date,103)", [b])).toMatch(/permission denied/);
      expect(await refus("select public.reviser_loyer($1,106,'T2 2025','2025-11-24'::date)", [b])).toMatch(/permission denied/);
      await base();
      expect(await revisions(b)).toEqual([]);
    });

    it("rejouée deux fois, la migration ne change rien ; les migrations précédentes de cette fonction se rejouent aussi sans effet ; une définition inattendue l'arrête", async () => {
      await db.query(retourSecondeReprise());
      const avant = await etat();
      await db.query(migration());
      await db.query(migration());
      expect(await etat()).toEqual(avant);
      // La reprise ne touche à aucun texte posé dans reviser_loyer par le lot « jour de Paris » ni par le lot D2 : leurs
      // rejeux laissent la fonction telle quelle.
      await db.query(lire("supabase/migrations/20261014821000_jour_de_paris_irl_terme_charges_rapports.sql"));
      expect(await etat()).toEqual(avant);
      await db.query(lire("supabase/migrations/20261124100000_revision_loyer_delai_et_premier_terme.sql"));
      // Le lot D2 écrit en clair la fonction du déclencheur : rejoué APRÈS la reprise, il remet la sienne (dit dans l'en-tête
      // de la migration). La reprise, rejouée ensuite, la rétablit.
      const apresD2 = await etat();
      expect({ ...apresD2, declencheur: avant.declencheur }).toEqual(avant);
      expect(apresD2.declencheur).not.toBe(avant.declencheur);
      await db.query(migration());
      expect(await etat()).toEqual(avant);
      // Un des six endroits réécrit : forme inconnue, refusée.
      await db.query((await definition()).replace("v_reference := v_irl_precedent;", "v_reference := v_irl_precedent * 1;"));
      const modifiee = await etat();
      expect(modifiee.origine).not.toBe(avant.origine);
      expect(await refus(migration())).toMatch(/ne porte ni la définition attendue ni celle de cette reprise \(1 endroit\(s\) d'avant, 5 de la reprise, sur 6\) : définition inattendue, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });

    it("le retour rend la définition d'avant et retire la seconde signature, garde la colonne et les révisions, se rejoue ; la migration se rejoue ensuite", async () => {
      await db.query(retourSecondeReprise());
      await nousSommesLe("2025-11-24");
      const b = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      await reviser(b, 106, "T2 2025", "2025-11-24", 103);
      const migre = await etat();
      await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'revision_loyer_reprise_d2') on conflict do nothing", [CODE]);
      await db.query(retour());
      const revenu = await etat();
      expect(revenu.cinq).toBeNull();
      expect(revenu.origine).not.toBe(migre.origine);
      expect(revenu.lecture_locataire).toBe(false);
      expect(revenu.declencheur).not.toBe(migre.declencheur);
      expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
      expect(await definition()).not.toMatch(/irl_precedent|v_reference_trimestre|termine/);
      // Mêmes droits qu'avant ; la révision enregistrée garde ses deux indices et le trimestre de la référence.
      expect(await un("select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte", [ORIGINE])).toEqual({ anon: false, connecte: true });
      expect((await revisions(b))[0]).toMatchObject({ nouveau: 720.39, reference: 103, reference_trimestre: "T2 2024" });
      // L'état d'avant est revenu : le rattrapage sur deux ans repasse (700 → 742 €).
      const b2 = await bail({ date_debut: "2023-10-15", irl_trimestre: "T2 2023" });
      expect(await reviser(b2, 106, "T2 2025", "2025-11-24")).toBe(742);
      // Le retour du lot D2 (20261124100000) se joue alors sans refus : c'est l'ordre du LISEZ-MOI. Sur la base ainsi
      // revenue avant le lot D2, le retour de la reprise, rejoué, ne fait rien et ne crée rien.
      await base();
      await db.query("savepoint d2");
      await db.query(lire("supabase/retours-arriere/20261124100000_revision_loyer_delai_et_premier_terme.retour.sql"));
      await db.query(retour());
      expect((await un("select to_regprocedure('public.appliquer_revision_a_l_appel()') is null as absente")).absente).toBe(true);
      await db.query("rollback to savepoint d2");

      await db.query(retour());
      expect(await etat()).toEqual(revenu);
      await db.query(migration());
      expect(await etat()).toEqual(migre);
    });

    it("joué avant celui de la reprise, le retour du lot D2 s'arrête sans rien modifier (l'ordre des retours est tenu par la base)", async () => {
      const avant = await etat();
      expect(await refus(lire("supabase/retours-arriere/20261124100000_revision_loyer_delai_et_premier_terme.retour.sql"))).toMatch(/"v_premier_terme" is not a known variable/);
      expect(await etat()).toEqual(avant);
    });

    it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
      await db.query((await definition()).replace("v_reference := v_irl_precedent;", "v_reference := v_irl_precedent * 1;"));
      const modifiee = await etat();
      expect(await refus(retour())).toMatch(/ne porte qu'une partie de la reprise \(5 endroit\(s\) sur 6\) : définition réécrite depuis, rien n'est modifié/);
      expect(await etat()).toEqual(modifiee);
    });
  });
});
