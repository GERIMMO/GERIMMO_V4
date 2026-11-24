/**
 * LES FACTURES D'ABONNEMENT SE GARDENT DIX ANS, ET NON PLUS SIX — textes officiels, lot T4 (24/11/2026), écart R31-A1.
 *
 * Texte lu dans le recueil fourni par le dirigeant (source et version déclarées, non recontrôlé par nous) : loi
 * n° 2026-534 du 25 juin 2026, article 36 — à l'article L. 102 B du livre des procédures fiscales, « doivent être
 * conservés pendant un délai de six » devient « sont conservés pendant un délai de dix », pour « les documents et […]
 * pièces dont le délai de conservation expire après le 1er janvier 2027 ».
 *
 * Ce que ces tests tiennent pour la migration 20261125103000 :
 *  1. sans base : manifeste, retour listé, droits, et les trois fonctions réécrites ne diffèrent de leur texte d'avant
 *     que par les lignes marquées « lot T4 » ; le retour rend ces textes mot pour mot ;
 *  2. le catalogue : règle « archive:facture » à 120 mois, plancher 120 ; seconde reprise (relecture T4R-10) : le
 *     passage de 72 à 120 mois laisse UNE ligne au journal des durées, celle que lit l'écran /admin/conservation ;
 *  3. l'échéance d'une facture : dix ans, quelle que soit la durée enregistrée sur l'archive (jamais moins) ;
 *  4. une archive constituée AVANT le lot (72 mois enregistrés, date d'échéance à six ans) : sa facture de sept ans ne
 *     part plus, ni par la purge, ni à la main ; son client chez le prestataire de paiement n'est plus proposé à la
 *     suppression ; une facture de plus de dix ans part toujours ;
 *  5. la migration se rejoue sans effet ; son retour rend les fonctions, ne raccourcit aucune durée enregistrée, se
 *     rejoue, et la marche avant redonne le même état.
 *
 * Nécessite SUPABASE_DB_URL (base locale fictive). Transaction annulée à la fin de chaque test. Le fichier rejoue du
 * DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125103000_factures_conservation_dix_ans";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
/** Les trois migrations dont cette migration reprend une fonction. */
const CONSERVATION = readFileSync("supabase/migrations/20261024140000_conservation_et_prospection.sql", "utf8");
const REGLAGES = readFileSync("supabase/migrations/20261024105901_reglages_conservation_superadmin.sql", "utf8");
const FERMETURE = readFileSync("supabase/migrations/20261024130000_fermeture_comptes.sql", "utf8");
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith("/gerimmo_ci_"))) {
  throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
}

/** Le corps (entre `$$`) de la DERNIÈRE définition d'une fonction dans un fichier SQL. */
function corps(source: string, nom: string): string {
  const debut = source.lastIndexOf(`create or replace function public.${nom}(`);
  if (debut < 0) throw new Error(`fonction ${nom} introuvable`);
  const m = /as \$\$([\s\S]*?)\$\$;/.exec(source.slice(debut));
  if (!m) throw new Error(`corps de ${nom} introuvable`);
  return m[1];
}

describe("factures conservées dix ans — manifeste, droits et textes des fonctions (sans base)", () => {
  it("la migration est au manifeste une seule fois, en dernier de son lot, avec son retour listé et son test en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261024140000_conservation_et_prospection.sql", "20261024105901_reglages_conservation_superadmin.sql", "20261024130000_fermeture_comptes.sql"]) {
      expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/factures-conservation-dix-ans-base.test.ts"');
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });

  it("trois fonctions réécrites, aucun droit ouvert, aucune suppression, aucune règle d'accès touchée", () => {
    for (const sql of [MIGRATION, RETOUR]) {
      const code = sql.replace(/^\s*--.*$/gm, "");
      expect(code.match(/create or replace function public\.(\w+)/g)).toEqual([
        "create or replace function public.echeance_facture_archivee",
        "create or replace function public.archives_comptes_echeances",
        "create or replace function public.clients_stripe_au_terme",
      ]);
      expect(code).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|authenticated)\b/i);
      expect(code).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column|policy)\b|create policy|disable (trigger|row level security)/i);
      expect(code).toContain("select public.fermer_fonctions_a_anon();");
    }
    // La migration n'écrit qu'une ligne du catalogue, et seulement pour l'allonger.
    const hors = MIGRATION.replace(/^\s*--.*$/gm, "").replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(hors.match(/\bupdate\s+public\.\w+/gi)).toEqual(["update public.retention_rules"]);
    expect(hors).toContain("set duree_mois = greatest(r.duree_mois, 120)");
    // Seconde reprise (relecture T4R-10). Ce test interdisait toute insertion ; le changement de durée doit pourtant
    // laisser une ligne au journal des durées, sans quoi l'écran de conservation affirme qu'aucune durée n'a changé.
    // Une seule insertion est admise, dans le journal, sous l'action que cet écran lit ; le retour n'en fait aucune.
    expect(hors.match(/insert into\s+[\w.]+/gi)).toEqual(["insert into public.audit_log"]);
    expect(hors).toContain("select 'conservation_regle_modifiee', jsonb_build_object(");
    expect(RETOUR.replace(/^\s*--.*$/gm, "")).not.toMatch(/insert into/i);
    expect(readFileSync("src/app/admin/conservation/page.tsx", "utf8")).toContain('.eq("action", "conservation_regle_modifiee")');
  });

  it("chaque fonction ne diffère de son texte d'avant que par les lignes marquées « lot T4 » ; le retour rend ce texte mot pour mot", () => {
    const avant = {
      echeance_facture_archivee: corps(CONSERVATION, "echeance_facture_archivee"),
      archives_comptes_echeances: corps(REGLAGES, "archives_comptes_echeances"),
      clients_stripe_au_terme: corps(FERMETURE, "clients_stripe_au_terme"),
    };
    for (const [nom, texte] of Object.entries(avant)) expect(corps(RETOUR, nom), nom).toBe(texte);

    expect(corps(MIGRATION, "echeance_facture_archivee")).toBe(avant.echeance_facture_archivee.replace(
      "+ make_interval(months => greatest(coalesce(p_mois, 72), 72)))::date;",
      "+ make_interval(months => greatest(coalesce(p_mois, 120), 120)))::date;  -- lot T4 : 120 mois au lieu de 72"));
    expect(corps(MIGRATION, "archives_comptes_echeances")).toBe(avant.archives_comptes_echeances
      .replace("new.factures_duree_mois := greatest(72, coalesce(v_mois, 72));", "new.factures_duree_mois := greatest(120, coalesce(v_mois, 120));  -- lot T4 : 120 mois au lieu de 72")
      .replace(
        "  -- Factures : voir echeance_facture_archivee (six ans, livre des procédures fiscales, L. 102 B ; éditeur non\n  -- commerçant, décision du 23/10). Échéance de la dernière ; chacune se retire à la sienne.",
        "  -- Factures : voir echeance_facture_archivee (dix ans, livre des procédures fiscales, L. 102 B, modifié par\n  -- l'article 36 de la loi n° 2026-534). Échéance de la dernière ; chacune se retire à la sienne."));
    expect(corps(MIGRATION, "clients_stripe_au_terme")).toBe(avant.clients_stripe_au_terme
      .replace(
        "      from public.archives_comptes a\n     where a.stripe_customer_id is not null",
        "      from public.archives_comptes a\n" +
          "      -- lot T4 : l'échéance des factures encore archivées, recalculée avec le plancher de dix ans.\n" +
          "      left join lateral (select max(public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye, a.factures_duree_mois)) as echeance\n" +
          "                           from jsonb_array_elements(a.factures) e) f on true\n" +
          "     where a.stripe_customer_id is not null")
      .replace(
        "    having max(greatest(coalesce(a.factures_conservees_jusqu_au, (a.archive_le at time zone 'Europe/Paris')::date),\n                        (a.fin_dernier_abonnement_paye + interval '6 years')::date)) < v_jour",
        "    having max(greatest(coalesce(f.echeance, a.factures_conservees_jusqu_au, (a.archive_le at time zone 'Europe/Paris')::date),\n                        (a.fin_dernier_abonnement_paye + interval '10 years')::date)) < v_jour  -- lot T4 : dix ans au lieu de six"));
  });
});

describe.skipIf(!url)("factures conservées dix ans (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await db.query(MIGRATION);
    await db.query("update public.retention_rules set actif = true where data_type in ('archive:facture', 'archive:preuve_contrat')");
  });
  afterEach(async () => { await db.query("rollback"); });

  const un = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const jour = async (expression: string) => (await un<{ d: string }>(`select (${expression})::date::text as d`)).d;
  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try { await db.query(sql, params); return ""; }
    catch (e) { await db.query("rollback to savepoint essai"); return `${(e as { code: string }).code} ${(e as Error).message}`; }
    finally { await db.query("release savepoint essai"); }
  }
  type Archive = { id: string; factures: string | null; duree: number };
  /** Une archive de compte fermé : fin du dernier abonnement payé et factures données par leur âge, en mois. */
  const archiver = (client: string | null, finIlYaMois: number, facturesIlYaMois: number[]) => un<Archive>(
    `insert into public.archives_comptes (account_id_origine, stripe_customer_id, fin_dernier_abonnement_paye, factures)
     values (gen_random_uuid(), $1, (current_date - make_interval(months => $2::int))::date,
             (select coalesce(jsonb_agg(jsonb_build_object('numero', 'F-' || m, 'emise_le', (current_date - make_interval(months => m))::date::text)), '[]'::jsonb)
                from unnest($3::int[]) m))
     returning id, factures_conservees_jusqu_au::text as factures, factures_duree_mois as duree`, [client, finIlYaMois, facturesIlYaMois]);
  /** La même archive, telle qu'elle aurait été constituée AVANT le lot : 72 mois enregistrés, échéance à six ans. */
  async function archiverCommeAvantLeLot(client: string | null, finIlYaMois: number, facturesIlYaMois: number[]): Promise<Archive> {
    await db.query(RETOUR);
    await db.query("update public.retention_rules set duree_mois = 72 where data_type = 'archive:facture'");
    const a = await archiver(client, finIlYaMois, facturesIlYaMois);
    await db.query(MIGRATION);
    return a;
  }
  const facturesRestantes = async (id: string) =>
    (await un<{ n: number } | undefined>("select jsonb_array_length(factures) as n from public.archives_comptes where id = $1", [id]))?.n ?? null;
  const clientsAuTerme = async () => {
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    const { rows } = await db.query<{ stripe_customer_id: string }>("select stripe_customer_id from public.clients_stripe_au_terme(500)");
    await db.query("select set_config('request.jwt.claims', '', true)");
    return rows.map((r) => r.stripe_customer_id);
  };

  it("catalogue : la règle des factures archivées est à 120 mois, avec un plancher de 120 ; la preuve du contrat reste à 120", async () => {
    expect(await un("select duree_mois, duree_initiale_mois, minimum_mois, actif from public.retention_rules where data_type = 'archive:facture'"))
      .toEqual({ duree_mois: 120, duree_initiale_mois: 120, minimum_mois: 120, actif: true });
    expect((await un<{ d: number }>("select duree_mois as d from public.retention_rules where data_type = 'archive:preuve_contrat'")).d).toBe(120);
    expect((await un<{ d: string }>("select column_default as d from information_schema.columns where table_schema = 'public' and table_name = 'archives_comptes' and column_name = 'factures_duree_mois'")).d).toBe("120");
  });

  // Relecture T4R-10 : le catalogue passait de 72 à 120 mois sans ligne au journal (0 ligne « conservation_regle_modifiee »).
  it("T4R-10 — le passage de 72 à 120 mois laisse une ligne au journal des durées, avec l'ancienne et la nouvelle durée ; rien au rejeu", async () => {
    const lignes = async () => (await db.query<{ account_id: string | null; details: Record<string, unknown> }>(
      "select account_id, details from public.audit_log where action = 'conservation_regle_modifiee' and details ->> 'categorie' = 'archive:facture' order by created_at, id")).rows;
    // Dans cette transaction, la migration vient d'être rejouée sur une base déjà à 120 mois : aucune ligne.
    const avant = await lignes();
    // L'état d'avant le lot : 72 mois, plancher 72.
    await db.query(RETOUR);
    await db.query("update public.retention_rules set duree_mois = 72, duree_initiale_mois = 72 where data_type = 'archive:facture'");
    await db.query(MIGRATION);
    const apres = await lignes();
    expect(apres).toHaveLength(avant.length + 1);
    // Les lignes d'une même transaction portent la même date : la nouvelle se reconnaît à son contenu, pas à son rang.
    const nouvelles = apres.filter((l) => !avant.some((a) => JSON.stringify(a) === JSON.stringify(l)));
    expect(nouvelles).toHaveLength(1);
    const ligne = nouvelles[0];
    // Sans auteur : c'est la mise à jour du logiciel, pas une personne.
    expect(ligne.account_id).toBeNull();
    expect(ligne.details).toMatchObject({
      categorie: "archive:facture", libelle: "Factures de l'abonnement (archive des comptes fermés)",
      ancienne_duree_mois: 72, nouvelle_duree_mois: 120, actif: true,
    });
    // Les quatre champs que l'écran /admin/conservation affiche sont là, et le motif dit d'où vient le changement.
    expect(String(ligne.details.motif)).toMatch(/^Mise à jour de Gerimmo du 24\/11\/2026, sans intervention d'une personne : factures d'abonnement conservées dix ans/);
    expect(String(ligne.details.motif)).toContain("article 36 de la loi n° 2026-534");
    // Rejouée, la migration ne récrit rien.
    await db.query(MIGRATION);
    expect(await lignes()).toHaveLength(avant.length + 1);
    // Une durée déjà réglée à 120 mois ou plus ne « change » pas : le plancher monte, sans ligne au journal.
    await db.query(RETOUR);
    await db.query("update public.retention_rules set duree_mois = 144 where data_type = 'archive:facture'");
    await db.query(MIGRATION);
    expect(await lignes()).toHaveLength(avant.length + 1);
    expect(await un("select duree_mois, minimum_mois from public.retention_rules where data_type = 'archive:facture'")).toEqual({ duree_mois: 144, minimum_mois: 120 });
    // Une durée intermédiaire réglée à la main (96 mois) : la ligne dit la vraie durée d'avant.
    await db.query(RETOUR);
    await db.query("update public.retention_rules set duree_mois = 96 where data_type = 'archive:facture'");
    await db.query(MIGRATION);
    const toutes = await lignes();
    expect(toutes).toHaveLength(avant.length + 2);
    expect(toutes.filter((l) => l.details.ancienne_duree_mois === 96 && l.details.nouvelle_duree_mois === 120)).toHaveLength(1);
  });

  it("échéance d'une facture : dix ans après la plus tardive de l'émission et de la fin d'exercice (à défaut, de la fin du dernier abonnement payé), jamais moins", async () => {
    const e = async (facture: Record<string, string>, fin: string, mois: number | null) =>
      (await un<{ d: string }>("select public.echeance_facture_archivee($1::jsonb, $2::date, $3::int)::text as d", [JSON.stringify(facture), fin, mois])).d;
    expect(await e({ emise_le: "2026-03-15" }, "2026-06-30", 120)).toBe("2036-06-30");
    expect(await e({ emise_le: "2026-03-15", exercice_clos_le: "2026-12-31" }, "2026-06-30", 120)).toBe("2036-12-31");
    expect(await e({ emise_le: "2027-02-01" }, "2026-06-30", 120)).toBe("2037-02-01");
    // Une durée enregistrée plus courte (archive d'avant le lot, ou valeur absente) ne raccourcit rien.
    expect(await e({ emise_le: "2026-03-15" }, "2026-06-30", 72)).toBe("2036-06-30");
    expect(await e({ emise_le: "2026-03-15" }, "2026-06-30", null)).toBe("2036-06-30");
    // Une durée plus longue, réglée par le superadmin, s'applique.
    expect(await e({ emise_le: "2026-03-15" }, "2026-06-30", 144)).toBe("2038-06-30");
  });

  it("nouvelle archive : 120 mois enregistrés, factures gardées dix ans ; une facture de sept ans ne part pas, une facture de plus de dix ans part", async () => {
    const a = await archiver(null, 12, [84, 130]);
    expect(a.duree).toBe(120);
    // Échéance affichée : celle de la plus récente, dix ans après la fin du dernier abonnement payé (il y a douze mois).
    expect(a.factures).toBe(await jour("(current_date - interval '12 months')::date + interval '120 months'"));
    expect((await db.query("select id from public.cibles_conservation_complementaire() where categorie = 'archive:facture' and id = $1", [a.id])).rowCount).toBe(0);
    // Tout est encore dans le délai (la facture de 130 mois suit la fin de l'abonnement, il y a douze mois).
    expect(await echec("update public.archives_comptes set factures = '[]' where id = $1", [a.id])).toMatch(/^42501 Seules les factures arrivées au terme/);
    await db.query("select public.purger_archives_comptes()");
    expect(await facturesRestantes(a.id)).toBe(2);
    // Fin d'abonnement et facture de plus de dix ans : la facture part.
    const b = await archiver(null, 100, [84]);
    const c = await archiver(null, 125, [126]);
    await db.query("select public.purger_archives_comptes()");
    expect(await facturesRestantes(b.id)).toBe(1);
    // L'archive c n'a plus de facture ; sa preuve (dix ans après la fin de l'abonnement) est échue aussi : la ligne part.
    expect(await facturesRestantes(c.id)).toBeNull();
  });

  it("archive constituée AVANT le lot (72 mois, échéance à six ans dépassée) : sa facture de sept ans reste, par la purge comme à la main", async () => {
    const a = await archiverCommeAvantLeLot(null, 80, [84]);
    expect(a.duree).toBe(72);
    // La date enregistrée à l'époque est dépassée (six ans après la fin de l'abonnement, il y a 80 mois)…
    expect(a.factures! < (await jour("current_date"))).toBe(true);
    // … mais ni la liste des suppressions, ni la purge, ni un retrait à la main ne la retirent avant dix ans.
    expect((await db.query("select id from public.cibles_conservation_complementaire() where categorie = 'archive:facture' and id = $1", [a.id])).rowCount).toBe(0);
    await db.query("select public.purger_archives_comptes()");
    expect(await facturesRestantes(a.id)).toBe(1);
    expect(await echec("update public.archives_comptes set factures = '[]' where id = $1", [a.id])).toMatch(/^42501 Seules les factures arrivées au terme/);
    // Au-delà de dix ans, elle part comme avant.
    const vieille = await archiverCommeAvantLeLot(null, 110, [125]);
    const tresVieille = await archiverCommeAvantLeLot(null, 121, [125]);
    await db.query("select public.purger_archives_comptes()");
    expect(await facturesRestantes(vieille.id)).toBe(1);
    expect(await facturesRestantes(tresVieille.id)).toBeNull();
  });

  it("client chez le prestataire de paiement : jamais proposé à la suppression avant dix ans, même pour une archive d'avant le lot", async () => {
    // Sept ans : l'ancien texte le proposait (six ans dépassés) ; plus maintenant.
    await archiverCommeAvantLeLot("cus_t4_sept_ans", 84, [85]);
    // Archive d'avant le lot dont les factures ont déjà été retirées à six ans (liste vide, date enregistrée dépassée).
    await archiverCommeAvantLeLot("cus_t4_factures_retirees", 90, []);
    // Fin de l'abonnement il y a plus de dix ans, mais une facture rattachée à un exercice clos il y a neuf ans.
    const exercice = await jour("current_date - interval '108 months'");
    await db.query(
      `insert into public.archives_comptes (account_id_origine, stripe_customer_id, fin_dernier_abonnement_paye, factures)
       values (gen_random_uuid(), 'cus_t4_exercice_tardif', (current_date - interval '125 months')::date,
               jsonb_build_array(jsonb_build_object('emise_le', (current_date - interval '126 months')::date::text, 'exercice_clos_le', $1::text)))`, [exercice]);
    // Plus de dix ans pour tout : proposé.
    await archiver("cus_t4_onze_ans", 132, [133]);
    await archiverCommeAvantLeLot("cus_t4_onze_ans_avant_lot", 132, [133]);
    const clients = (await clientsAuTerme()).filter((c) => c.startsWith("cus_t4_"));
    expect(clients.sort()).toEqual(["cus_t4_onze_ans", "cus_t4_onze_ans_avant_lot"]);
    // L'ancien texte, lui, proposait bien le client de sept ans : c'est ce que la migration corrige.
    await db.query(RETOUR);
    expect((await clientsAuTerme()).filter((c) => c.startsWith("cus_t4_"))).toContain("cus_t4_sept_ans");
  });

  it("droits : aucune des trois fonctions n'est ouverte à un visiteur ni à un compte connecté", async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; connecte: boolean }>(
      `select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as connecte
         from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('echeance_facture_archivee', 'archives_comptes_echeances', 'clients_stripe_au_terme')`);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r, r.proname).toMatchObject({ anon: false, connecte: false });
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)");
    expect(await echec("select * from public.clients_stripe_au_terme(10)")).toMatch(/^42501/);
  });

  it("la migration se rejoue sans effet ; le retour rend les fonctions sans raccourcir la durée du catalogue, se rejoue, puis la marche avant redonne le même état", async () => {
    const etat = () => un<{ f: string; c: string; d: string }>(
      `select (select md5(string_agg(p.proname || ':' || p.prosrc || coalesce(p.proacl::text, ''), '|' order by p.proname, p.oid))
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('echeance_facture_archivee', 'archives_comptes_echeances', 'clients_stripe_au_terme')) as f,
              (select duree_mois || '/' || duree_initiale_mois || '/' || minimum_mois from public.retention_rules where data_type = 'archive:facture') as c,
              (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'archives_comptes' and column_name = 'factures_duree_mois') as d`);
    const apres = await etat();
    expect(apres).toMatchObject({ c: "120/120/120", d: "120" });
    const revision = (await un<{ r: string }>("select revision::text as r from public.retention_rules where data_type = 'archive:facture'")).r;
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
    // Rejouée sur une base déjà à jour, la migration n'écrit rien : la révision du catalogue ne bouge pas.
    expect((await un<{ r: string }>("select revision::text as r from public.retention_rules where data_type = 'archive:facture'")).r).toBe(revision);
    // Une durée plus longue réglée à la main n'est pas ramenée à 120.
    await db.query("update public.retention_rules set duree_mois = 144 where data_type = 'archive:facture'");
    await db.query(MIGRATION);
    expect((await un<{ d: number }>("select duree_mois as d from public.retention_rules where data_type = 'archive:facture'")).d).toBe(144);
    await db.query("update public.retention_rules set duree_mois = 120 where data_type = 'archive:facture'");

    const avantRetour = await archiver(null, 12, [20]);
    await db.query(RETOUR);
    const src = async (nom: string) => (await un<{ s: string }>("select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [nom])).s;
    expect(await src("echeance_facture_archivee")).toBe(corps(CONSERVATION, "echeance_facture_archivee"));
    expect(await src("archives_comptes_echeances")).toBe(corps(REGLAGES, "archives_comptes_echeances"));
    expect(await src("clients_stripe_au_terme")).toBe(corps(FERMETURE, "clients_stripe_au_terme"));
    // Le plancher revient à 72, la durée reste à 120 : rien n'est raccourci, et l'archive faite entre-temps garde ses 120 mois.
    const revenu = await etat();
    expect(revenu).toMatchObject({ c: "120/120/72", d: "72" });
    expect((await un<{ d: number }>("select factures_duree_mois as d from public.archives_comptes where id = $1", [avantRetour.id])).d).toBe(120);
    expect((await db.query("select 1 from public.archives_comptes where id = $1", [avantRetour.id])).rowCount).toBe(1);
    await db.query(RETOUR);
    expect(await etat()).toEqual(revenu);
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
  });
});
