/**
 * Plan de conformité du 23/10/2026 (lots 1B et 1C) : migration 20261024110000_vente_et_impaye.sql et son retour.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, retour
 * atomique, manifeste, LISEZ-MOI, chaîne « Ordre complet »).
 *
 * Sur une vraie base (SUPABASE_DB_URL), dans une transaction annulée à la fin, la migration rejouée d'abord :
 *  · R07 : « unpaid » après un paiement garde « active » ; ouvert à J+14, fermé à J+15 (un courrier parti) ;
 *  · R23 : une seule ligne de palier 0 pour un premier prélèvement échoué ; aucune si une résiliation est demandée ou
 *    si le défaut est ancien ; plus rien une fois ce courrier parti ;
 *  · R27 : aucune fermeture sans courrier ;
 *  · R06 : la preuve de la mise en demeure, une fois, sans adresse ;
 *  · R54 : fenêtre de l'avis de reconduction en mois (31 août, 1er mai) ;
 *  · R37 : la demande de passage à l'annuel datée, une fois ;
 *  · R01 : déclaration de rétractation en ajout seul, idempotente, lue par le seul responsable ;
 *  · R03, R04, R07 : confirmation, accusé de résiliation et courrier d'impayé marqués une fois ;
 *  · R05 : la nature « reclamation » acceptée ;
 *  · droits ; retour arrière (définitions d'avant, rejeu, table non vide conservée), puis marche avant.
 * Rejoue la migration et son retour (DROP/CREATE de fonctions, ALTER de contrainte) : classé en série (vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const VERSION = "20261024110000";
const NOM = `${VERSION}_vente_et_impaye`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const RELANCE_120500 = readFileSync("supabase/migrations/20261019120500_relance_abonnement_periodicite.sql", "utf8");

describe("vente au consommateur et impayé — fichiers (sans base)", () => {
  it("la migration est rejouable sans transaction interne, chaque fonction de confiance fixe son search_path, fermeture à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path = ''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Le jour de Paris toujours qualifié (la migration 20261018231827 et son retour le comptent ainsi).
    expect(code).not.toMatch(/(?<!public\.)aujourdhui_paris\(\)/);
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toMatch(/^-- RETOUR ARRIÈRE de /m);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where version = '${VERSION}'`);
  });

  it("manifeste, LISEZ-MOI (ligne et tête de la chaîne « Ordre complet ») et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024090000_versions_conditions_et_archives_comptes.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Intégration du 24/10 : la chaîne s'ouvre sur les retours du plan de conformité, dans l'ordre inverse du manifeste
    // (140000, 130000, 120000, puis celui-ci, puis 100000 et 090000), avant 20261023184512.
    expect(lisezMoi).toMatch(
      /Ordre complet si tout doit être défait :\s*`20261024140000`[^`]*`20261024130000`[^`]*`20261024120000`[^`]*`20261024110000`[^`]*`20261024100000`[^`]*`20261024090000`[^`]*`20261023184512`/
    );
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/vente-impaye-base.test.ts"');
  });
});

describe.skipIf(!url)("vente au consommateur et impayé (avec base)", () => {
  let db: Client;

  async function compte(prefixe: string, meta: Record<string, unknown> = {}): Promise<string> {
    const { rows: [{ id, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, $2::jsonb, now(), now(),
         '', '', '', '', '')
       returning id, email`,
      [prefixe, JSON.stringify(meta)]
    );
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
    return id;
  }
  async function session(id: string) {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', 'aal1')::text, true)",
      [id]
    );
    await db.query("set local role authenticated");
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
  /** Une organisation propriétaire et son abonnement Stripe (client et souscription fictifs). */
  async function organisation(options: { paye?: boolean; statut?: string; titulaire?: string } = {}) {
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into public.organizations (name, type, status, email_contact, grille_tarifaire, essai_fin)
       values ('Vente fictive', 'proprietaire_direct', $1::public.organization_status, 'vente@example.invalid', '2026-09-28', public.aujourdhui_paris() - 10)
       returning id`,
      [options.statut ?? "active"]
    );
    const suffixe = id.replace(/-/g, "").slice(0, 16);
    const customer = `cus_vente${suffixe}`;
    const subscription = `sub_vente${suffixe}`;
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut, quantite,
         montant_mensuel_cents, montant_periode_cents, periodicite, formule, unites_souscrites, premiere_facture_payee)
       values ($1, $2, $3, 'active', 1, 599, 599, 'mensuel', 'solo', 1, $4)`,
      [id, customer, subscription, options.paye ?? true]
    );
    if (options.titulaire) {
      await db.query("select public.tache_systeme()");
      await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [options.titulaire, id]);
      await db.query("select set_config('gerimmo.systeme', '', true)");
    }
    return { id, customer, subscription };
  }
  async function appliquer(customer: string, subscription: string, statut: string, annulation = false) {
    await db.query("select public.abonnement_appliquer($1, $2, $3, 1, now() + interval '20 days', $4)", [customer, subscription, statut, annulation]);
  }
  async function statut(org: string): Promise<string> {
    return (await db.query<{ s: string }>("select status::text as s from public.organizations where id = $1", [org])).rows[0].s;
  }
  async function ouverte(org: string): Promise<boolean> {
    return (await db.query<{ o: boolean }>("select public.org_ecriture_ouverte($1) as o", [org])).rows[0].o;
  }
  async function dues(org: string) {
    return (await db.query("select * from public.abonnements_a_relancer(500) where organization_id = $1", [org])).rows;
  }
  /** Le jour de Paris figé (la fonction est remplacée dans la transaction du cas, annulée ensuite). */
  async function jourDeParis(jour: string) {
    await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select '${jour}'::date $$`);
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION); // rejeu : sans effet
    // Finitions du 24/10 (relecture transverse 2, point 4) : le retour refuse tant qu'une migration plus récente du plan
    // de conformité est inscrite (la base de la CI les inscrit toutes). Retirées de l'historique, dans la transaction
    // du fichier, annulée à la fin.
    await db.query("delete from supabase_migrations.schema_migrations where left(version, 14) > $1 and left(version, 14) <= '20261024140000'", [VERSION]);
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
    await db.query("release savepoint cas");
  });

  it("R07 : « unpaid » après un paiement garde « active » ; ouvert à J+14, fermé à J+15 une fois le courrier parti", async () => {
    const o = await organisation({ paye: true });
    await appliquer(o.customer, o.subscription, "unpaid");
    expect(await statut(o.id)).toBe("active");
    await db.query("update public.abonnements set relances_paiement = 1, paiement_en_defaut_depuis = public.aujourdhui_paris() - 14 where organization_id = $1", [o.id]);
    expect(await ouverte(o.id)).toBe(true);
    await db.query("update public.abonnements set paiement_en_defaut_depuis = public.aujourdhui_paris() - 15 where organization_id = $1", [o.id]);
    expect(await ouverte(o.id)).toBe(false);
    // Le paiement passe : tout rouvre.
    await appliquer(o.customer, o.subscription, "active");
    expect(await ouverte(o.id)).toBe(true);
  });

  it("R07 : « unpaid » sans aucun paiement gèle comme avant (essai échu)", async () => {
    const o = await organisation({ paye: false });
    await appliquer(o.customer, o.subscription, "unpaid");
    expect(await statut(o.id)).toBe("suspendue");
  });

  it("R27 : aucune lecture seule à J+15 sans courrier parti", async () => {
    const o = await organisation({ paye: true });
    await appliquer(o.customer, o.subscription, "past_due");
    await db.query("update public.abonnements set paiement_en_defaut_depuis = public.aujourdhui_paris() - 20 where organization_id = $1", [o.id]);
    expect(await ouverte(o.id)).toBe(true);
  });

  it("R23 : une seule ligne de palier 0 pour un premier prélèvement échoué, avec la date de résiliation possible", async () => {
    const o = await organisation({ paye: false });
    await appliquer(o.customer, o.subscription, "past_due");
    expect(await statut(o.id)).toBe("suspendue");
    const lignes = await dues(o.id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ palier: 0, premier_prelevement: true });
    const { rows: [{ attendu }] } = await db.query("select (public.aujourdhui_paris() + 30)::text as attendu");
    expect(String(lignes[0].resiliable_le.toISOString?.() ?? lignes[0].resiliable_le).slice(0, 10)).toBe(attendu);
    // Le courrier parti, plus rien : ni rappel, ni avis, ni constat (le compte est déjà gelé).
    await db.query("select public.abonnement_relance_consigner($1, 0, 're_essai', true)", [o.id]);
    await db.query("update public.abonnements set derniere_relance_le = public.aujourdhui_paris() - 1, paiement_en_defaut_depuis = public.aujourdhui_paris() - 7 where organization_id = $1", [o.id]);
    expect(await dues(o.id)).toHaveLength(0);
  });

  it("R23 : aucune ligne si une résiliation est demandée, ni pour un défaut ancien", async () => {
    const a = await organisation({ paye: false });
    await appliquer(a.customer, a.subscription, "past_due", true);
    expect(await dues(a.id)).toHaveLength(0);
    const b = await organisation({ paye: false });
    await appliquer(b.customer, b.subscription, "past_due");
    await db.query("update public.abonnements set paiement_en_defaut_depuis = public.aujourdhui_paris() - 3 where organization_id = $1", [b.id]);
    expect(await dues(b.id)).toHaveLength(0);
    // Un client qui a déjà payé garde ses quatre paliers (la ligne du jour n'est pas « premier prélèvement »).
    const c = await organisation({ paye: true });
    await appliquer(c.customer, c.subscription, "past_due");
    expect((await dues(c.id))[0]).toMatchObject({ palier: 0, premier_prelevement: false });
  });

  it("R06 : la relance consignée laisse une preuve au journal d'audit, une fois, sans l'adresse", async () => {
    const o = await organisation({ paye: true });
    await appliquer(o.customer, o.subscription, "past_due");
    const premier = await db.query("select public.abonnement_relance_consigner($1, 0, 'msg_123', false) as r", [o.id]);
    const second = await db.query("select public.abonnement_relance_consigner($1, 0, 'msg_123', false) as r", [o.id]);
    expect([premier.rows[0].r, second.rows[0].r]).toEqual([true, false]);
    const { rows } = await db.query("select details from public.audit_log where organization_id = $1 and action = 'relance_paiement_envoyee'", [o.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({ palier: 0, message: "msg_123", premier_prelevement: false });
    expect(JSON.stringify(rows[0].details)).not.toContain("@");
    expect(await echec("select public.abonnement_relance_consigner($1, 0, 'a@b.c', false)", [o.id])).toMatch(/Identifiant de message invalide/);
  });

  it("R54 : la fenêtre de l'avis de reconduction se compte en mois, en dates de Paris (31 août et 1er mai)", async () => {
    const o = await organisation({ paye: true });
    await db.query("update public.abonnements set periodicite = 'annuel', montant_periode_cents = 5990 where organization_id = $1", [o.id]);
    const du = async (jour: string, echeance: string) => {
      await jourDeParis(jour);
      await db.query("update public.abonnements set periode_fin = ($2::date + time '12:00') at time zone 'Europe/Paris', avis_reconduction_periode_fin = null where organization_id = $1", [o.id, echeance]);
      return (await db.query("select 1 from public.abonnements_avis_reconduction_dus(500) where organization_id = $1", [o.id])).rows.length === 1;
    };
    // Relecture adverse du 24/10 (M8) : la fenêtre se borne sur la DATE LIMITE de non-reconduction (veille de
    // l'échéance), terme de la période qui autorise le rejet (L. 215-1) — solution la plus protectrice, sans coût.
    expect(await du("2026-08-31", "2026-09-30")).toBe(false); // date limite le 29/09 : moins d'un mois
    expect(await du("2026-08-31", "2026-10-01")).toBe(true); // date limite le 30/09 : un mois pile
    expect(await du("2026-08-31", "2026-12-01")).toBe(true); // date limite le 30/11 : trois mois pile
    expect(await du("2026-08-31", "2026-12-02")).toBe(false);
    expect(await du("2026-05-01", "2026-06-01")).toBe(false);
    expect(await du("2026-05-01", "2026-06-02")).toBe(true);
    expect(await du("2026-05-01", "2026-08-02")).toBe(true);
    expect(await du("2026-05-01", "2026-08-03")).toBe(false);
    const { rows: [l] } = await db.query("select periodicite_suivante, unites_souscrites, unites_a_couvrir from public.abonnements_avis_reconduction_dus(500) where organization_id = $1", [o.id]);
    expect(l).toBeUndefined(); // 2026-08-03 : hors fenêtre
  });

  it("R37 : la demande de passage à l'annuel est datée une fois ; y renoncer l'efface", async () => {
    const titulaire = await compte("vente-titulaire");
    const o = await organisation({ paye: true, titulaire });
    await session(titulaire);
    await db.query("select public.demander_periodicite_suivante($1, 'annuel')", [o.id]);
    await proprietaire();
    const lire = async () => (await db.query("select passage_annuel_demande_le::text as d from public.abonnements where organization_id = $1", [o.id])).rows[0].d;
    const premiere = await lire();
    expect(premiere).not.toBeNull();
    await db.query("update public.abonnements set passage_annuel_demande_le = passage_annuel_demande_le - interval '3 days' where organization_id = $1", [o.id]);
    const recule = await lire();
    await session(titulaire);
    await db.query("select public.demander_periodicite_suivante($1, 'annuel')", [o.id]);
    await proprietaire();
    expect(await lire()).toBe(recule); // redemander ne rouvre pas le délai
    await session(titulaire);
    await db.query("select public.demander_periodicite_suivante($1, 'mensuel')", [o.id]);
    await proprietaire();
    expect(await lire()).toBeNull();
  });

  it("R01 : la déclaration de rétractation est idempotente, en ajout seul, et lue par le seul responsable", async () => {
    const titulaire = await compte("vente-retractation");
    const intrus = await compte("vente-intrus");
    const o = await organisation({ paye: true, titulaire });
    await db.query("update public.abonnements set souscrit_le = now() - interval '2 days' where organization_id = $1", [o.id]);
    const enregistrer = () =>
      db.query(
        "select * from public.retractation_enregistrer($1, $2, 'abonnement', $3, $4, 'vente@example.invalid', $5, 'en_ligne')",
        [o.id, o.subscription, `retractation-abonnement-${o.subscription}`, "Je renonce à mon abonnement Gerimmo, formule Solo.", titulaire]
      );
    const a = (await enregistrer()).rows[0];
    const b = (await enregistrer()).rows[0];
    expect(a.nouvelle).toBe(true);
    expect(b.nouvelle).toBe(false);
    expect(b.id).toBe(a.id);
    expect(String(b.declaree_le)).toBe(String(a.declaree_le));
    const audit = await db.query("select count(*)::int as n from public.audit_log where organization_id = $1 and action = 'abonnement_retractation'", [o.id]);
    expect(audit.rows[0].n).toBe(1);
    // La déclaration ne se réécrit pas, ne se supprime pas ; seule l'exécution et l'accusé se complètent, une fois.
    expect(await echec("update public.retractations_abonnement set texte_declaration = 'Autre texte de déclaration fictive.' where id = $1", [a.id])).toMatch(/ne se réécrit pas/);
    expect(await echec("delete from public.retractations_abonnement where id = $1", [a.id])).toMatch(/ne se supprime pas/);
    expect((await db.query("select nouvelle from public.retractation_executee($1, 599, '[{\"refund\":\"re_1\"}]'::jsonb)", [a.id])).rows[0].nouvelle).toBe(true);
    expect((await db.query("select public.retractation_accuse_envoye($1, 'msg_retractation') as r", [a.id])).rows[0].r).toBe(true);
    expect((await db.query("select public.retractation_accuse_envoye($1, 'msg_retractation') as r", [a.id])).rows[0].r).toBe(false);
    // Une souscription qui n'est pas celle de l'organisation est refusée.
    expect(await echec(
      "select * from public.retractation_enregistrer($1, 'sub_autre123', 'abonnement', 'retractation-abonnement-sub_autre123', 'Je renonce à mon abonnement Gerimmo.', 'vente@example.invalid', null, 'en_ligne')",
      [o.id]
    )).toMatch(/pas celle de l'organisation/);
    // L'écran du responsable la voit ; un autre compte ne voit rien.
    await session(titulaire);
    const vu = await db.query("select retractation_abonnement_le, souscrit_le from public.ma_retractation($1)", [o.id]);
    expect(vu.rows).toHaveLength(1);
    expect(vu.rows[0].retractation_abonnement_le).not.toBeNull();
    await session(intrus);
    expect((await db.query("select * from public.ma_retractation($1)", [o.id])).rows).toHaveLength(0);
    expect(await echec("select * from public.retractations_abonnement")).toMatch(/permission denied/);
    await proprietaire();
  });

  it("finitions du 24/10 (consigne A) : la suppression de l'espace détache la déclaration, elle ne l'efface pas ; rien d'autre ne la détache", async () => {
    const o = await organisation({ paye: true });
    // Insérée directement (sans la ligne du journal d'audit, qui retiendrait l'espace : la fermeture la détache d'abord).
    const d = (await db.query(
      `insert into public.retractations_abonnement (organization_id, subscription_id, nature, cle, texte_declaration, adresse_accuse)
       values ($1, $2, 'abonnement', $3, 'Je renonce à mon abonnement Gerimmo, formule Solo.', 'vente@example.invalid') returning id`,
      [o.id, o.subscription, `retractation-abonnement-${o.subscription}`])).rows[0];
    expect(await echec("update public.retractations_abonnement set organization_id = null where id = $1", [d.id])).toMatch(/ne se réécrit pas/);
    await db.query("select public.tache_systeme()");
    await db.query("delete from public.abonnements where organization_id = $1", [o.id]);
    await db.query("delete from public.organizations where id = $1", [o.id]);
    await db.query("select set_config('gerimmo.systeme', '', true)");
    expect((await db.query("select organization_id, subscription_id, cle from public.retractations_abonnement where id = $1", [d.id])).rows)
      .toEqual([{ organization_id: null, subscription_id: o.subscription, cle: `retractation-abonnement-${o.subscription}` }]);
    expect(await echec("delete from public.retractations_abonnement where id = $1", [d.id])).toMatch(/ne se supprime pas/);
  });

  it("relecture adverse du 24/10 (point 5) : une exécution consignée ne s'écrase pas ; le second appel rend la première", async () => {
    const o = await organisation({ paye: true });
    const { rows: [d] } = await db.query(
      "select * from public.retractation_enregistrer($1, $2, 'passage_annuel', $3, 'Je renonce au passage de mon abonnement Gerimmo à la formule annuelle.', 'vente@example.invalid', null, 'en_ligne', null, now() - interval '1 day')",
      [o.id, o.subscription, `retractation-passage-${o.subscription}-1`]
    );
    expect(d).toMatchObject({ nature: "passage_annuel", adresse_accuse: "vente@example.invalid", passage_effectue: null, executee_le: null });
    const premier = (await db.query("select * from public.retractation_executee($1, 5990, '[{\"refund\":\"re_an\"}]'::jsonb, true)", [d.id])).rows[0];
    const second = (await db.query("select * from public.retractation_executee($1, 0, '[]'::jsonb, false)", [d.id])).rows[0];
    expect(premier).toMatchObject({ nouvelle: true, montant_rembourse_cents: "5990", passage_effectue: true });
    expect(second).toMatchObject({ nouvelle: false, montant_rembourse_cents: "5990", passage_effectue: true, refunds: [{ refund: "re_an" }] });
    const { rows: [l] } = await db.query("select montant_rembourse_cents::int as m, refunds, passage_effectue from public.retractations_abonnement where id = $1", [d.id]);
    expect(l).toEqual({ m: 5990, refunds: [{ refund: "re_an" }], passage_effectue: true });
    expect(await echec("update public.retractations_abonnement set montant_rembourse_cents = 0 where id = $1", [d.id])).toMatch(/déjà consignée/);
    // Relue par l'enregistrement rejoué (même clé) : l'exécution consignée et le texte enregistré.
    const { rows: [r] } = await db.query(
      "select * from public.retractation_enregistrer($1, $2, 'passage_annuel', $3, 'Un autre texte, non retenu : la première déclaration fait foi.', 'autre@example.invalid', null, 'en_ligne', null, now())",
      [o.id, o.subscription, `retractation-passage-${o.subscription}-1`]
    );
    expect(r).toMatchObject({ id: d.id, nouvelle: false, passage_effectue: true, adresse_accuse: "vente@example.invalid" });
    expect(r.texte_declaration).toMatch(/^Je renonce au passage/);
  });

  it("relecture adverse du 24/10 (point 3) : ma_retractation retrouve la déclaration de passage malgré les microsecondes de la demande", async () => {
    const titulaire = await compte("vente-passage-micro");
    const o = await organisation({ paye: true, titulaire });
    await db.query(
      "update public.abonnements set periodicite_suivante = 'annuel', passage_annuel_demande_le = '2026-10-20 10:00:00.909501+00' where organization_id = $1",
      [o.id]
    );
    // L'action envoie la demande telle que le navigateur la lit : à la milliseconde.
    await db.query(
      "select * from public.retractation_enregistrer($1, $2, 'passage_annuel', $3, 'Je renonce au passage de mon abonnement Gerimmo à la formule annuelle.', 'vente@example.invalid', $4, 'en_ligne', null, '2026-10-20T10:00:00.909Z')",
      [o.id, o.subscription, `retractation-passage-${o.subscription}-1792490400`, titulaire]
    );
    await session(titulaire);
    const { rows: [l] } = await db.query("select retractation_passage_le, retractation_passage_effectue from public.ma_retractation($1)", [o.id]);
    await proprietaire();
    expect(l.retractation_passage_le).not.toBeNull();
    expect(l.retractation_passage_effectue).toBeNull();
  });

  it("relecture adverse du 24/10 (I4) : les rétractations restées en chemin sont listées pour la reprise de nuit", async () => {
    const o = await organisation({ paye: true });
    const enregistrer = (cle: string, il: string) =>
      db.query(
        "select * from public.retractation_enregistrer($1, $2, 'abonnement', $3, 'Je renonce à mon abonnement Gerimmo, formule Solo.', 'vente@example.invalid', null, 'courriel', now() - $4::interval)",
        [o.id, o.subscription, cle, il]
      );
    const a = (await enregistrer(`retractation-abonnement-${o.subscription}`, "1 hour")).rows[0];
    const recente = (await enregistrer(`retractation-abonnement-${o.subscription}-recente`, "1 minute")).rows[0];
    const lire = async () => (await db.query("select id from public.retractations_a_terminer(500) where organization_id = $1", [o.id])).rows.map((x) => x.id);
    expect(await lire()).toEqual([a.id]); // la toute récente est encore entre les mains de l'action
    await db.query("select * from public.retractation_executee($1, 599, '[]'::jsonb)", [a.id]);
    expect(await lire()).toEqual([a.id]); // exécutée, accusé non parti
    await db.query("select public.retractation_accuse_envoye($1, 'msg_a')", [a.id]);
    expect(await lire()).toEqual([]);
    expect(recente.id).not.toBe(a.id);
  });

  it("relecture adverse du 24/10 (I3) : lever la résiliation efface la marque de l'accusé ; la suivante est accusée à nouveau", async () => {
    const o = await organisation({ paye: true });
    const fin = "2026-11-24T00:00:00Z";
    const acc = async () => (await db.query("select public.abonnement_resiliation_accusee($1, $2, $3, 'msg_r', 'action') as r", [o.id, o.subscription, fin])).rows[0].r;
    const lever = async () => (await db.query("select public.abonnement_resiliation_levee($1, $2) as r", [o.id, o.subscription])).rows[0].r;
    const compteAccuses = async () => (await db.query("select resiliations_accusees from public.abonnement_courrier_contexte($1)", [o.id])).rows[0].resiliations_accusees;
    expect(await compteAccuses()).toBe(0);
    expect(await acc()).toBe(true);
    expect(await compteAccuses()).toBe(1);
    expect([await lever(), await lever()]).toEqual([true, false]);
    expect(await acc()).toBe(true);
    expect(await compteAccuses()).toBe(2);
  });

  it("R03, R04, R07 : confirmation, accusé de résiliation et courrier d'impayé marqués une fois chacun ; une autre souscription les remet à zéro", async () => {
    const o = await organisation({ paye: true });
    await db.query("select public.abonnement_souscription_datee($1, $2, now() - interval '1 hour')", [o.customer, o.subscription]);
    const dues0 = await db.query("select * from public.abonnements_confirmation_dues(200) where organization_id = $1", [o.id]);
    expect(dues0.rows).toHaveLength(1);
    const conf = async () => (await db.query("select public.abonnement_confirmation_envoyee($1, $2, 'msg_c', true) as r", [o.id, o.subscription])).rows[0].r;
    expect([await conf(), await conf()]).toEqual([true, false]);
    expect((await db.query("select * from public.abonnements_confirmation_dues(200) where organization_id = $1", [o.id])).rows).toHaveLength(0);
    const fin = "2026-11-24T00:00:00Z";
    const acc = async (f: string) => (await db.query("select public.abonnement_resiliation_accusee($1, $2, $3, 'msg_r', 'webhook') as r", [o.id, o.subscription, f])).rows[0].r;
    expect([await acc(fin), await acc(fin)]).toEqual([true, false]);
    // R04 : une notification par la page, dans le quart d'heure, est vue par le webhook (c'est la page qui accuse).
    const parLaPage = async () => (await db.query("select resiliation_par_la_page as r from public.abonnement_contexte_evenement($1)", [o.customer])).rows[0].r;
    expect(await parLaPage()).toBe(false);
    await db.query("select public.abonnement_geste_consigner($1, null, 'abonnement_resiliation_notifiee', jsonb_build_object('souscription', $2::text, 'chemin', 'page'))", [o.id, o.subscription]);
    expect(await parLaPage()).toBe(true);
    const imp = async () => (await db.query("select public.abonnement_resiliation_impaye_notifiee($1, $2, 'msg_i', '[\"in_1\"]'::jsonb) as r", [o.id, o.subscription])).rows[0].r;
    expect([await imp(), await imp()]).toEqual([true, false]);
    // Une nouvelle souscription (autre conclusion) repart de zéro.
    await db.query("select public.abonnement_souscription_datee($1, $2, now())", [o.customer, o.subscription]);
    const { rows: [m] } = await db.query("select confirmation_envoyee_le, resiliation_accusee_pour, resiliation_impaye_notifiee_le from public.abonnements where organization_id = $1", [o.id]);
    expect(m).toEqual({ confirmation_envoyee_le: null, resiliation_accusee_pour: null, resiliation_impaye_notifiee_le: null });
    // Le contexte des courriers : titulaire, offre, acceptation.
    const { rows: [c] } = await db.query("select organisation, formule, periodicite, montant_periode_cents from public.abonnement_courrier_contexte($1)", [o.id]);
    expect(c).toMatchObject({ organisation: "Vente fictive", formule: "solo", periodicite: "mensuel" });
  });

  it("le journal des gestes n'admet qu'une liste fermée, sans coordonnées", async () => {
    const o = await organisation();
    expect(await echec("select public.abonnement_geste_consigner($1, null, 'autre_chose', '{}'::jsonb)", [o.id])).toMatch(/Geste d'abonnement invalide/);
    expect(await echec("select public.abonnement_geste_consigner($1, null, 'abonnement_resiliation_notifiee', '{\"adresse\":\"x@example.invalid\"}'::jsonb)", [o.id])).toMatch(/Détails du geste invalides/);
    expect(await echec("select public.abonnement_geste_consigner($1, null, 'abonnement_commande_confirmee', '{\"montant_cents\":599}'::jsonb)", [o.id])).toBe("");
  });

  it("R05 : une réclamation s'enregistre comme demande d'aide", async () => {
    const auteur = await compte("vente-reclamation");
    await session(auteur);
    const { rows: [{ id }] } = await db.query(
      "select public.soumettre_retour(gen_random_uuid(), 'reclamation', 'Réclamation fictive', 'Le service ne fonctionne pas comme prévu.', null, '/assistance') as id"
    );
    await proprietaire();
    expect((await db.query("select nature from public.retours_utilisateurs where id = $1", [id])).rows[0].nature).toBe("reclamation");
  });

  it("droits : la table des rétractations n'est ouverte ni à anon ni aux comptes ; les fonctions de service non plus", async () => {
    const { rows } = await db.query(`
      select distinct g.grantee from information_schema.role_table_grants g
       where g.table_schema = 'public' and g.table_name = 'retractations_abonnement' and g.grantee in ('anon', 'authenticated')`);
    expect(rows).toEqual([]);
    for (const f of ["public.retractation_enregistrer(uuid,text,text,text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)",
                     "public.retractation_executee(uuid,bigint,jsonb,boolean)", "public.retractations_a_terminer(integer)",
                     "public.abonnement_resiliation_levee(uuid,text)",
                     "public.abonnement_courrier_contexte(uuid)", "public.abonnements_a_relancer(integer)"]) {
      const { rows: [d] } = await db.query(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth, has_function_privilege('service_role', $1, 'execute') as svc",
        [f]
      );
      expect(d, f).toEqual({ anon: false, auth: false, svc: true });
    }
  });

  it("retour : définitions d'avant (abonnements_a_relancer au texte de 20261019120500), rejeu sans effet, puis marche avant", async () => {
    const empreinte = async (s: string) => (await db.query("select md5(pg_get_functiondef($1::regprocedure)) as m", [s])).rows[0].m as string;
    const apres = await empreinte("public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)");
    await db.query(RETOUR);
    await db.query(RETOUR);
    const relance = await empreinte("public.abonnements_a_relancer(integer)");
    await db.query(RELANCE_120500);
    expect(await empreinte("public.abonnements_a_relancer(integer)")).toBe(relance);
    expect((await db.query("select pg_get_functiondef('public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)'::regprocedure) as d")).rows[0].d).not.toContain("'unpaid' then v_statut_actuel");
    expect((await db.query("select pg_get_functiondef('public.org_ecriture_ouverte(uuid)'::regprocedure) as d")).rows[0].d).not.toContain("relances_paiement");
    expect((await db.query("select to_regclass('public.retractations_abonnement') is null as retiree, to_regprocedure('public.ma_retractation(uuid)') is null as f")).rows[0]).toEqual({ retiree: true, f: true });
    expect((await db.query(`select to_regprocedure('public.retractations_a_terminer(integer)') is null as a,
                                   to_regprocedure('public.abonnement_resiliation_levee(uuid,text)') is null as b,
                                   to_regprocedure('public.retractation_executee(uuid,bigint,jsonb,boolean)') is null as c`)).rows[0]).toEqual({ a: true, b: true, c: true });
    await db.query(MIGRATION);
    expect(await empreinte("public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)")).toBe(apres);
  });

  it("retour : une déclaration de rétractation enregistrée fait conserver la table", async () => {
    const o = await organisation({ paye: true });
    await db.query(
      "select * from public.retractation_enregistrer($1, $2, 'abonnement', $3, 'Je renonce à mon abonnement Gerimmo, formule Solo.', 'vente@example.invalid', null, 'en_ligne')",
      [o.id, o.subscription, `retractation-abonnement-${o.subscription}`]
    );
    await db.query(RETOUR);
    expect((await db.query("select count(*)::int as n from public.retractations_abonnement")).rows[0].n).toBe(1);
    await db.query(MIGRATION);
  });
});
