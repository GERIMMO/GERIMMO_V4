/**
 * RÉVISION ANNUELLE DU LOYER — décisions du dirigeant du 24/11/2026, lot D2, côté base
 * (migration 20261124100000_revision_loyer_delai_et_premier_terme).
 *
 *  Q23 « refus au-delà » : la révision d'une année se demande pendant un an à compter de sa date de révision ; passé ce
 *      délai, `reviser_loyer` la refuse, même avec une demande datée d'avant.
 *  Q43 : le loyer révisé ne s'applique jamais à des jours antérieurs à la demande ; il s'applique au premier terme dont la
 *      période commence après la demande et qui n'est pas déjà appelé. Les termes d'avant gardent le loyer d'avant.
 *
 * Le bail de ces tests est entré le 15/10/2024 : sa première révision est prévue le 15/10/2025, à demander au plus tard le
 * 14/10/2026. Loyer 700 €, charges 50 €, indice de référence 100,00 (T2 2024).
 *
 * Ces tests tiennent :
 *  1. demande le jour anniversaire ; demande tardive en cours de mois ; terme déjà appelé ; baisse de l'indice ; mois au
 *     prorata ; colocation ;
 *  2. dernier jour du délai (acceptée), lendemain (refusée, rien n'est écrit), et la révision de l'année suivante ;
 *  3. une révision d'avant ce lot (sans premier terme) se comporte comme avant ; un avenant plus récent fait foi ;
 *  4. colonne, déclencheur, droits ; la migration se rejoue sans effet et refuse une définition inattendue ; le retour rend
 *     la définition d'avant sans supprimer ni colonne ni donnée, se rejoue, refuse une fonction réécrite depuis.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le jour de Paris est figé dans la transaction.
 * Le fichier rejoue du DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { dateLimiteRevision, premierTermeApresDemande } from "@/lib/baux";

const CODE = "20261124100000";
const NOM = `${CODE}_revision_loyer_delai_et_premier_terme`;
const FONCTION = "public.reviser_loyer(uuid,numeric,text,date)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);

describe("révision du loyer, lot D2 — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, en dernier, avec son retour listé", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261123170000_contrat_individuel_message_plafond.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lire("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/revision-loyer-delai-premier-terme-base.test.ts"');
  });

  it("la migration n'écrit aucune ligne (ni révision ni appel existants), ne recopie pas reviser_loyer et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\.(revisions_loyer|appels_loyer|baux)\s+(set|where|\()/i);
    // Hors du bloc ajouté à reviser_loyer (qui porte son `insert` d'origine complété), aucune écriture de données.
    const horsFonctions = sql.replace(/\$bloc\$[\s\S]*?\$bloc\$/g, "").replace(/\$fonction\$[\s\S]*?\$fonction\$/g, "");
    expect(horsFonctions).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.reviser_loyer/i);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime ni table, ni colonne, ni donnée ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from public\.|update public\./i);
    expect(sql).toContain("drop trigger if exists a_revision_du_bail on public.appels_loyer");
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });

  it("aucun article de loi nouveau : le refus renvoie à la fiche officielle lue, pas à un article", () => {
    const bloc = /\$bloc\$([\s\S]*?)\$bloc\$/.exec(migration())![1];
    expect(bloc).toContain("selon la fiche officielle Service-Public consultée le 24/11/2026");
    expect(bloc).not.toMatch(/art\.|article|17-1|alinéa/i);
  });

  it("l'écran calcule la même date limite et le même premier terme que la base", () => {
    expect(dateLimiteRevision("2024-10-15", "2025-10-15")).toBe("2026-10-14");
    // Exemple de la fiche officielle lue le 24/11 : révision le 13 mars 2025, possible jusqu'au 12 mars 2026.
    expect(dateLimiteRevision("2023-03-13", "2025-03-13")).toBe("2026-03-12");
    // Bail entré un 29 février : les dates anniversaires se replient au 28, comme en base.
    expect(dateLimiteRevision("2024-02-29", "2025-02-28")).toBe("2026-02-27");
    expect(dateLimiteRevision("2020-02-29", "2023-02-28")).toBe("2024-02-28");
    expect(dateLimiteRevision(null, "2025-10-15")).toBeNull();
    expect(premierTermeApresDemande("2025-10-15")).toBe("2025-11-01");
    expect(premierTermeApresDemande("2025-10-31")).toBe("2025-11-01");
    // Une demande le 1er du mois : la période de ce mois ne commence pas APRÈS la demande, le terme suivant est décembre.
    expect(premierTermeApresDemande("2025-11-01")).toBe("2025-12-01");
    expect(premierTermeApresDemande("2025-12-03")).toBe("2026-01-01");
  });
});

describe.skipIf(!url)("révision du loyer, lot D2 (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", bien = "", locataire = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const base = async () => { await db.query("reset role"); };
  async function enGerant() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: gerant, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
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
  /** Un bail en cours entré le 15/10/2024 : 700 € + 50 €, révisable, indice de référence 100,00 (T2 2024). */
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
  /** La demande de révision du gérant, datée ; rend le nouveau loyer. */
  async function reviser(b: string, indice: number, trimestre: string, demande: string) {
    await enGerant();
    const { loyer } = await un("select public.reviser_loyer($1,$2,$3,$4::date)::float8 as loyer", [b, indice, trimestre, demande]);
    await base();
    return Number(loyer);
  }
  async function refusRevision(b: string, indice: number, trimestre: string, demande: string) {
    await enGerant();
    const message = await refus("select public.reviser_loyer($1,$2,$3,$4::date)", [b, indice, trimestre, demande]);
    await base();
    return message;
  }
  const revisions = async (b: string) => {
    await base();
    return (await db.query(`select date_echeance::text echeance, date_demande::text demande, date_effet::text effet, premier_terme::text premier_terme,
      ancien_loyer::float8 ancien, nouveau_loyer::float8 nouveau from public.revisions_loyer where bail_id=$1 order by date_effet`, [b])).rows;
  };
  /** Les termes du bail à partir d'un mois : [mois, loyer, charges, total dû, base mensuelle du loyer]. */
  const termes = async (b: string, depuis: string) => {
    await base();
    return (await db.query(`select to_char(periode,'YYYY-MM') mois, loyer_hc::float8 loyer, charges::float8 charges, montant_du::float8 du, base_loyer_hc::float8 base
      from public.appels_loyer where bail_id=$1 and periode >= $2::date order by periode`, [b, depuis])).rows.map((r) => [r.mois, r.loyer, r.charges, r.du, r.base]);
  };
  const loyerDuBail = async (b: string) => { await base(); return Number((await un("select loyer_hc::float8 l from public.baux where id=$1", [b])).l); };
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [FONCTION])).d);
  const empreinte = async () => un(
    `select md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl, p.prosecdef as definer,
            (select count(*)::int from pg_trigger t where t.tgrelid = 'public.appels_loyer'::regclass and t.tgname = 'a_revision_du_bail') as declencheur,
            to_regprocedure('public.appliquer_revision_a_l_appel()') is not null as fonction
       from pg_proc p where p.oid = $1::text::regprocedure`,
    [FONCTION]
  );

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai révision D2 fictif','proprietaire_direct','active') returning id");
    gerant = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [gerant, `${gerant}@test.local`]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Camille') returning id", [org]);
  });

  describe("Q43 — le loyer révisé s'applique au premier terme qui suit la demande", () => {
    it("demande le jour anniversaire (15/10) : octobre reste à 700 €, novembre est le premier terme à 714 €", async () => {
      await nousSommesLe("2025-10-15");
      const b = await bail();
      await appeler(b); // le terme d'octobre est déjà appelé, comme chaque mois
      expect(await reviser(b, 102, "T2 2025", "2025-10-15")).toBe(714);
      expect(await revisions(b)).toEqual([{ echeance: "2025-10-15", demande: "2025-10-15", effet: "2025-10-15", premier_terme: "2025-11-01", ancien: 700, nouveau: 714 }]);
      expect(await loyerDuBail(b)).toBe(714);
      // Le terme d'octobre, dont la période contient la demande, n'est pas modifié : ni complément, ni nouvelle ligne.
      expect(await termes(b, "2025-10-01")).toEqual([["2025-10", 700, 50, 750, 700]]);
      await nousSommesLe("2025-11-01");
      await appeler(b);
      expect(await termes(b, "2025-10-01")).toEqual([["2025-10", 700, 50, 750, 700], ["2025-11", 714, 50, 764, 714]]);
    });

    it("demande tardive en cours de mois (03/12), décembre pas encore appelé : décembre reste à 700 €, janvier passe à 714 €", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail();
      await appeler(b); // jusqu'à novembre
      await nousSommesLe("2025-12-03");
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      expect(await revisions(b)).toEqual([{ echeance: "2025-10-15", demande: "2025-12-03", effet: "2025-12-03", premier_terme: "2026-01-01", ancien: 700, nouveau: 714 }]);
      // Décembre est appelé APRÈS la révision : avant ce lot, il partait à 714 € pour le mois entier, 1er et 2 décembre compris.
      await appeler(b);
      expect(await termes(b, "2025-11-01")).toEqual([["2025-11", 700, 50, 750, 700], ["2025-12", 700, 50, 750, 700]]);
      await nousSommesLe("2026-01-02");
      await appeler(b);
      expect((await termes(b, "2025-12-01"))).toEqual([["2025-12", 700, 50, 750, 700], ["2026-01", 714, 50, 764, 714]]);
    });

    it("demande le 1er du mois : ce mois ne commence pas après la demande, le premier terme est le suivant", async () => {
      await nousSommesLe("2025-10-31");
      const b = await bail();
      await appeler(b);
      await nousSommesLe("2025-11-01");
      await reviser(b, 102, "T2 2025", "2025-11-01");
      expect((await revisions(b))[0].premier_terme).toBe("2025-12-01");
      await appeler(b);
      expect(await termes(b, "2025-11-01")).toEqual([["2025-11", 700, 50, 750, 700]]);
    });

    it("terme déjà appelé : une demande du 03/12 enregistrée le 20/02 ne touche ni janvier ni février ; mars est le premier terme", async () => {
      await nousSommesLe("2026-02-20");
      const b = await bail();
      await appeler(b); // jusqu'à février, tous à 700 €
      const avant = await termes(b, "2024-10-01");
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      expect((await revisions(b))[0]).toMatchObject({ demande: "2025-12-03", premier_terme: "2026-03-01" });
      // Aucun terme existant n'est modifié, aucun n'est ajouté : ni complément, ni avoir.
      expect(await termes(b, "2024-10-01")).toEqual(avant);
      await nousSommesLe("2026-03-01");
      await appeler(b);
      expect(await termes(b, "2026-01-01")).toEqual([["2026-01", 700, 50, 750, 700], ["2026-02", 700, 50, 750, 700], ["2026-03", 714, 50, 764, 714]]);
    });

    it("baisse de l'indice : même règle — décembre reste à 700 € (aucune déduction), janvier passe à 686 €", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail();
      await appeler(b);
      await nousSommesLe("2025-12-03");
      expect(await reviser(b, 98, "T2 2025", "2025-12-03")).toBe(686);
      await appeler(b);
      await nousSommesLe("2026-01-02");
      await appeler(b);
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 700, 50, 750, 700], ["2026-01", 686, 50, 736, 686]]);
    });

    it("mois de sortie au prorata : le terme d'avant le premier terme révisé est calculé sur le loyer d'avant", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail({ date_fin: "2025-12-20" });
      await appeler(b);
      await nousSommesLe("2025-12-03");
      await reviser(b, 102, "T2 2025", "2025-12-03");
      await appeler(b);
      // 20 jours sur 31 : 700 × 20 / 31 = 451,61 € (et non 714 × 20 / 31 = 460,65 €) ; charges 50 × 20 / 31 = 32,26 €.
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 451.61, 32.26, 483.87, 700]]);
    });

    it("colocation : la base ne distingue pas ce bail, la règle est la même", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail({ type: "colocation" });
      await appeler(b);
      await nousSommesLe("2025-12-03");
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      expect((await revisions(b))[0].premier_terme).toBe("2026-01-01");
      await appeler(b);
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 700, 50, 750, 700]]);
    });

    it("deux révisions successives : chaque terme rattrapé prend le loyer qui valait pour lui", async () => {
      // Aucun loyer n'est appelé avant le 20/12/2026 (cas d'un rattrapage) : les deux révisions sont déjà enregistrées.
      const b = await bail();
      await nousSommesLe("2025-12-03");
      expect(await reviser(b, 102, "T2 2025", "2025-12-03")).toBe(714);
      await nousSommesLe("2026-10-20");
      expect(await reviser(b, 104, "T2 2026", "2026-10-20")).toBe(728);
      expect((await revisions(b)).map((r) => r.premier_terme)).toEqual(["2026-01-01", "2026-11-01"]);
      await nousSommesLe("2026-12-20");
      await appeler(b);
      const parMois = Object.fromEntries((await termes(b, "2025-11-01")).map(([mois, loyer]) => [mois, loyer]));
      expect([parMois["2025-12"], parMois["2026-01"], parMois["2026-10"], parMois["2026-11"], parMois["2026-12"]]).toEqual([700, 714, 714, 728, 728]);
    });

    it("une révision d'avant ce lot (sans premier terme) se comporte comme avant : le terme appelé ensuite porte le loyer du bail", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail();
      await appeler(b);
      await nousSommesLe("2025-12-03");
      await reviser(b, 102, "T2 2025", "2025-12-03");
      // On remet la révision dans l'état d'une révision enregistrée avant le 24/11/2026 (dans la transaction du test).
      await db.query("update public.revisions_loyer set premier_terme = null where bail_id = $1", [b]);
      await appeler(b);
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 714, 50, 764, 714]]);
    });

    it("un avenant enregistré après la révision, avec effet au terme en cause, fait foi pour ce terme", async () => {
      await nousSommesLe("2025-11-28");
      const b = await bail();
      await appeler(b);
      await nousSommesLe("2025-12-03");
      await reviser(b, 102, "T2 2025", "2025-12-03");
      await enGerant();
      const message = await refus(
        "select public.enregistrer_avenant_bail($1,$2,'Loyer convenu avec le locataire','2025-12-03'::date,'2025-12-01'::date,800,50,$3,'application/pdf',1234,gen_random_uuid()::text)",
        [org, b, `${org}/avenant-${randomUUID()}.pdf`]
      );
      await base();
      expect(message).toBe("");
      await appeler(b);
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 800, 50, 850, 800]]);
    });
  });

  describe("Q23 — refus passé un an après la date de révision", () => {
    it("le dernier jour du délai (14/10/2026) : la révision prévue le 15/10/2025 est acceptée", async () => {
      await nousSommesLe("2026-10-14");
      const b = await bail();
      await appeler(b);
      expect(await reviser(b, 102, "T2 2025", "2026-10-14")).toBe(714);
      expect(await revisions(b)).toEqual([{ echeance: "2025-10-15", demande: "2026-10-14", effet: "2026-10-14", premier_terme: "2026-11-01", ancien: 700, nouveau: 714 }]);
    });

    it("le lendemain (15/10/2026) : la révision de l'année passée est refusée, même antidatée, et rien n'est écrit", async () => {
      await nousSommesLe("2026-10-15");
      const b = await bail();
      await appeler(b);
      const message = await refusRevision(b, 102, "T2 2025", "2026-10-14");
      expect(message).toBe(
        "Révision refusée : la révision prévue le 15/10/2025 pouvait être demandée jusqu'au 14/10/2026. Ce délai d'un an est passé : " +
        "la révision de cette année-là n'est plus possible (selon la fiche officielle Service-Public consultée le 24/11/2026). " +
        "Pour la révision de l'année en cours, datez la demande d'aujourd'hui"
      );
      // Avant ce lot, cette demande antidatée passait : le loyer du bail changeait.
      expect(await revisions(b)).toEqual([]);
      expect(await loyerDuBail(b)).toBe(700);
      // Même refus pour une demande datée du 03/12/2025, enregistrée le 16/10/2026.
      await nousSommesLe("2026-10-16");
      expect(await refusRevision(b, 102, "T2 2025", "2025-12-03")).toMatch(/^Révision refusée : la révision prévue le 15\/10\/2025 pouvait être demandée jusqu'au 14\/10\/2026\./);
      expect(await revisions(b)).toEqual([]);
    });

    it("le 16/10/2026, la révision de la nouvelle année (prévue le 15/10/2026) reste possible, au premier terme qui suit", async () => {
      await nousSommesLe("2026-10-16");
      const b = await bail();
      await appeler(b);
      // Reprise du lot D2 (24/11) : ce test enregistrait ici l'indice T2 2026 contre la référence T2 2024 du bail, soit
      // 700 × 104 / 100 = 728 € — le rattrapage de deux années que la reprise a retiré. La révision de la nouvelle année
      // reste possible (c'est ce que tient ce test) ; elle se calcule sur un an, avec l'indice du T2 2025 (102), par la
      // signature à cinq paramètres : 700 × 104 / 102 = 713,73 €.
      expect(await refusRevision(b, 104, "T2 2026", "2026-10-16")).toMatch(/Indice du T2 2025 obligatoire/);
      await enGerant();
      expect(Number((await un("select public.reviser_loyer($1,104,'T2 2026','2026-10-16'::date,102)::float8 as loyer", [b])).loyer)).toBe(713.73);
      await base();
      expect(await revisions(b)).toEqual([{ echeance: "2026-10-15", demande: "2026-10-16", effet: "2026-10-16", premier_terme: "2026-11-01", ancien: 700, nouveau: 713.73 }]);
    });

    it("les autres refus restent en place : demande datée de demain, deuxième révision de la même année", async () => {
      await nousSommesLe("2025-12-03");
      const b = await bail();
      expect(await refusRevision(b, 102, "T2 2025", "2025-12-04")).toMatch(/Révision anticipée/);
      await reviser(b, 102, "T2 2025", "2025-12-03");
      expect(await refusRevision(b, 104, "T2 2026", "2025-12-03")).toMatch(/Une seule révision par année de bail/);
    });
  });

  describe("structure, droits, rejeu et retour", () => {
    it("la colonne existe, vide pour l'existant ; le déclencheur est placé après l'avenant et avant la base mensuelle ; droits fermés", async () => {
      const colonne = await un("select data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='revisions_loyer' and column_name='premier_terme'");
      expect(colonne).toEqual({ data_type: "date", is_nullable: "YES", column_default: null });
      const { rows } = await db.query("select tgname from pg_trigger where tgrelid = 'public.appels_loyer'::regclass and not tgisinternal and tgtype & 4 = 4 and tgtype & 2 = 2 order by tgname");
      const ordre = rows.map((r) => r.tgname as string);
      expect(ordre.indexOf("a_revision_du_bail")).toBeGreaterThan(ordre.indexOf("a_avenant_du_bail"));
      expect(ordre.indexOf("a_revision_du_bail")).toBeLessThan(ordre.indexOf("appel_loyer_base_mensuelle"));
      const droits = await un(
        `select has_function_privilege('anon','public.appliquer_revision_a_l_appel()','execute') declencheur_anon,
                has_function_privilege('authenticated','public.appliquer_revision_a_l_appel()','execute') declencheur_connecte,
                has_function_privilege('anon',$1,'execute') reviser_anon,
                has_function_privilege('authenticated',$1,'execute') reviser_connecte`, [FONCTION]);
      expect(droits).toEqual({ declencheur_anon: false, declencheur_connecte: false, reviser_anon: false, reviser_connecte: true });
      // Le jour de Paris n'est lu que deux fois dans reviser_loyer (en-tête et corps), comme l'attend le lot « jour de Paris ».
      expect((await definition()).match(/aujourdhui_paris\(\)/g)).toHaveLength(2);
    });

    it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête sans rien modifier", async () => {
      const avant = await empreinte();
      await db.query(migration());
      expect(await empreinte()).toEqual(avant);
      await db.query(migration());
      expect(await empreinte()).toEqual(avant);

      // Un des cinq endroits réécrit : forme inconnue, refusée.
      await db.query((await definition()).replace("v_echeance, p_date_demande, v_trimestre, v_premier_terme);", "v_echeance, p_date_demande, v_trimestre, null);"));
      const modifiee = await empreinte();
      expect(modifiee.def).not.toBe(avant.def);
      expect(await refus(migration())).toMatch(/reviser_loyer\(uuid,numeric,text,date\) ne porte ni la définition attendue ni celle de ce lot \(0 endroit\(s\) d'avant, 4 de ce lot, sur 5\)/);
      expect(await empreinte()).toEqual(modifiee);
    });

    it("le retour rend la définition d'avant sans supprimer la colonne ni les révisions, se rejoue ; la migration se rejoue ensuite", async () => {
      // Reprise du lot D2 (24/11) : la migration 20261124130000 complète la même fonction avec des lignes qui se servent des
      // variables de ce lot. Son retour se joue donc d'abord (ordre du LISEZ-MOI) ; joué avant lui, le retour de ce lot
      // s'arrête sans rien modifier (tenu par tests/revision-loyer-reprise-d2-base.test.ts). Ce test vérifie ensuite, comme
      // avant, le retour et le rejeu de CE lot.
      await db.query(lire("supabase/retours-arriere/20261124130000_revision_loyer_reprise_d2.retour.sql"));
      await nousSommesLe("2025-12-03");
      const b = await bail();
      await reviser(b, 102, "T2 2025", "2025-12-03");
      const migre = await empreinte();
      await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'revision_loyer_delai_et_premier_terme') on conflict do nothing", [CODE]);
      await db.query(retour());
      const def = await definition();
      expect(def).not.toMatch(/v_premier_terme|v_limite|v_aujourdhui/);
      expect(await empreinte()).toMatchObject({ declencheur: 0, fonction: false });
      expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
      // La révision déjà enregistrée garde son premier terme : aucune donnée n'est perdue.
      expect((await revisions(b))[0].premier_terme).toBe("2026-01-01");
      // L'état d'avant est revenu : le terme appelé après la révision porte le loyer révisé, et l'antidatage repasse.
      await appeler(b);
      expect(await termes(b, "2025-12-01")).toEqual([["2025-12", 714, 50, 764, 714]]);
      const b2 = await bail();
      await nousSommesLe("2026-10-16");
      expect(await reviser(b2, 102, "T2 2025", "2025-12-03")).toBe(714);

      const revenu = await empreinte();
      await db.query(retour());
      expect(await empreinte()).toEqual(revenu);
      await db.query(migration());
      expect(await empreinte()).toEqual(migre);
    });

    it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
      await db.query((await definition()).replace("v_echeance, p_date_demande, v_trimestre, v_premier_terme);", "v_echeance, p_date_demande, v_trimestre, null);"));
      const avant = await empreinte();
      expect(await refus(retour())).toMatch(/reviser_loyer\(uuid,numeric,text,date\) ne porte ni la définition de la migration ni celle d'avant \(4 endroit\(s\) de la migration, 0 d'avant, sur 5\) : définition réécrite depuis, rien n'est modifié/);
      expect(await empreinte()).toEqual(avant);
    });
  });
});
