/**
 * Tests d'intégration — le parrainage sur la grille du 28/09/2026, réactivé
 * par la décision du porteur du 30/09/2026 : « 1 mois offert au parrain à la
 * conversion du filleul ».
 *
 * CE QUE CES TESTS GARDENT.
 *  · le filleul n'a aucun avantage (ligne « sans objet », essai inchangé) ;
 *  · la conversion, c'est la PREMIÈRE FACTURE NON NULLE PAYÉE du filleul —
 *    ni l'inscription, ni le passage en `active` d'une souscription en essai
 *    Stripe (facture à 0 €) ;
 *  · parrain mensuel → avoir de son mensuel ; annuel → annuel ÷ 12 arrondi
 *    au centime ; en essai → un mois d'essai de plus ;
 *  · un rejeu ne récompense pas deux fois.
 *
 * Nécessite SUPABASE_DB_URL. Chaque test tourne dans une transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;

async function un<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.query("reset role");
  return (await db.query(sql, params)).rows[0] as T;
}

async function creerUtilisateur(): Promise<string> {
  const { id } = await un<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-pg26-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

type Org = { id: string; code: string };

/** Une organisation de la grille du 28/09/2026 (la valeur par défaut). */
async function organisation(statut = "essai", essaiFin = "current_date + 20"): Promise<Org> {
  return un<Org>(
    `insert into public.organizations (name, status, type, essai_fin)
     values ('Grille 2026 '||gen_random_uuid(), $1::public.organization_status, 'proprietaire_direct', ${essaiFin})
     returning id, code_parrainage as code`,
    [statut]
  );
}

/** Une souscription Stripe suivie : renvoie l'identifiant client. */
async function abonnement(
  org: string,
  periodicite: "mensuel" | "annuel",
  montantPeriodeCents: number,
  statutStripe = "active",
  premiereFacturePayee = true
): Promise<string> {
  const { c } = await un<{ c: string }>(
    `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut,
       periodicite, montant_periode_cents, montant_mensuel_cents, unites_souscrites, formule, premiere_facture_payee)
     values ($1, 'cus_'||gen_random_uuid(), 'sub_'||gen_random_uuid(), $2, $3, $4::bigint,
       case when $3 = 'annuel' then round($4::bigint / 12.0)::bigint else $4::bigint end, 1, 'solo', $5)
     returning stripe_customer_id as c`,
    [org, statutStripe, periodicite, montantPeriodeCents, premiereFacturePayee]
  );
  return c;
}

async function simuler(accountId: string) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }),
  ]);
  await db.query("set local role authenticated");
}

/** Le filleul s'inscrit avec le code, comme depuis « Mes espaces ». */
async function inscrireFilleul(code: string): Promise<{ filleul: Org; parrainage: string }> {
  const filleul = await organisation();
  const compte = await creerUtilisateur();
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct')`,
    [compte, filleul.id]
  );
  await simuler(compte);
  const { rows } = await db.query<{ id: string }>("select public.enregistrer_parrainage($1,$2) as id", [
    filleul.id,
    code,
  ]);
  await db.query("reset role");
  return { filleul, parrainage: rows[0].id };
}

/** Le filleul souscrit (essai Stripe, facture à 0 €), comme le webhook l'applique. */
async function souscrireEnEssai(filleul: string): Promise<{ customer: string; sub: string }> {
  const customer = await abonnement(filleul, "mensuel", 599, "trialing", false);
  const { s } = await un<{ s: string }>(
    "select stripe_subscription_id as s from public.abonnements where organization_id = $1",
    [filleul]
  );
  await un("select public.abonnement_appliquer($1, $2, 'trialing', 1, now() + interval '30 days', false)", [
    customer,
    s,
  ]);
  return { customer, sub: s };
}

/** invoice.paid d'un montant > 0 (le webhook ignore les factures à 0 €). */
async function facturePayee(customer: string, sub: string) {
  await un("select public.abonnement_facture_payee($1, $2)", [customer, sub]);
}

async function avantages(parrainage: string) {
  await db.query("reset role");
  const { rows } = await db.query(
    `select nature, jours, montant_cents::int as montant_cents, etat, beneficiaire_organization_id as beneficiaire
       from public.avantages_parrainage where parrainage_id = $1 order by nature`,
    [parrainage]
  );
  return rows;
}

const coteParrain = async (p: string) => (await avantages(p)).filter((l) => l.nature !== "essai_filleul");

describe.skipIf(!DB_URL)("parrainage — grille du 28/09/2026 (décision du 30/09)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("le filleul qui entre un code n'a aucun avantage : essai inchangé, ligne « sans objet »", async () => {
    const parrain = await organisation("active", "null");
    const filleulAvant = await organisation();
    const essaiOrdinaire = (await un<{ d: string }>("select essai_fin::text as d from public.organizations where id = $1", [filleulAvant.id])).d;
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    const { d } = await un<{ d: string }>("select essai_fin::text as d from public.organizations where id = $1", [filleul.id]);
    expect(d).toBe(essaiOrdinaire);
    expect(await avantages(parrainage)).toMatchObject([
      { nature: "essai_filleul", jours: 0, etat: "sans_objet", beneficiaire: filleul.id },
    ]);
  });

  it("rien pour le parrain à l'inscription, ni à la souscription en essai (facture à 0 €)", async () => {
    const parrain = await organisation("active", "null");
    await abonnement(parrain.id, "mensuel", 1299);
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    expect(await coteParrain(parrainage)).toHaveLength(0);

    await souscrireEnEssai(filleul.id);
    // La souscription en essai rend l'organisation `active`…
    expect((await un<{ s: string }>("select status::text as s from public.organizations where id = $1", [filleul.id])).s).toBe("active");
    // … mais rien n'a été payé : pas de récompense.
    expect(await coteParrain(parrainage)).toHaveLength(0);
  });

  it("première facture payée du filleul → avoir du mensuel au parrain abonné au mois", async () => {
    const parrain = await organisation("active", "null");
    const customerParrain = await abonnement(parrain.id, "mensuel", 1299);
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    const { customer, sub } = await souscrireEnEssai(filleul.id);

    await facturePayee(customer, sub);

    expect(await coteParrain(parrainage)).toMatchObject([
      { nature: "avoir_parrain", montant_cents: 1299, etat: "a_appliquer", beneficiaire: parrain.id },
    ]);
    // La tâche planifiée le voit, avec le client Stripe du parrain.
    const { rows } = await db.query("select * from public.avantages_parrainage_a_appliquer()");
    expect(rows.filter((r) => r.organization_id === parrain.id)).toMatchObject([
      { montant_cents: "1299", stripe_customer_id: customerParrain },
    ]);
  });

  it("parrain annuel → annuel ÷ 12, arrondi au centime", async () => {
    const parrain = await organisation("active", "null");
    await abonnement(parrain.id, "annuel", 12990); // 1 082,50 → 1 083 centimes
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    const { customer, sub } = await souscrireEnEssai(filleul.id);

    await facturePayee(customer, sub);

    expect(await coteParrain(parrainage)).toMatchObject([
      { nature: "avoir_parrain", montant_cents: 1083, etat: "a_appliquer" },
    ]);
  });

  it("parrain encore en essai → son essai est prolongé d'un mois", async () => {
    const parrain = await organisation("essai", "current_date + 10");
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    const { customer, sub } = await souscrireEnEssai(filleul.id);

    await facturePayee(customer, sub);

    const { d, attendu } = await un<{ d: string; attendu: string }>(
      `select essai_fin::text as d, ((current_date + 10) + interval '1 month')::date::text as attendu
         from public.organizations where id = $1`,
      [parrain.id]
    );
    expect(d).toBe(attendu);
    const [ligne] = await coteParrain(parrainage);
    expect(ligne).toMatchObject({ nature: "essai_parrain", etat: "applique" });
    expect(ligne.jours).toBeGreaterThanOrEqual(28);
    expect(ligne.jours).toBeLessThanOrEqual(31);
  });

  it("parrain sans montant facturé → « sans objet » ; parrain archivé → rien", async () => {
    const sansMontant = await organisation("active", "null");
    const a = await inscrireFilleul(sansMontant.code);
    const sa = await souscrireEnEssai(a.filleul.id);
    await facturePayee(sa.customer, sa.sub);
    expect(await coteParrain(a.parrainage)).toMatchObject([
      { nature: "avoir_parrain", montant_cents: 0, etat: "sans_objet" },
    ]);

    const archive = await organisation("active", "null");
    const b = await inscrireFilleul(archive.code);
    await un("select set_config('gerimmo.systeme','on',true)");
    await un("update public.organizations set status = 'archivee' where id = $1", [archive.id]);
    await un("select set_config('gerimmo.systeme','',true)");
    const sb = await souscrireEnEssai(b.filleul.id);
    await facturePayee(sb.customer, sb.sub);
    expect(await coteParrain(b.parrainage)).toHaveLength(0);
  });

  it("un rejeu (webhook rejoué, impayé puis régularisé) ne récompense pas deux fois", async () => {
    const parrain = await organisation("active", "null");
    await abonnement(parrain.id, "mensuel", 1299);
    const { filleul, parrainage } = await inscrireFilleul(parrain.code);
    const { customer, sub } = await souscrireEnEssai(filleul.id);

    await facturePayee(customer, sub);
    await facturePayee(customer, sub);
    // Même si le drapeau était reposé à la main, la récompense reste unique.
    await un("select set_config('gerimmo.systeme','on',true)");
    await un("update public.abonnements set premiere_facture_payee = false where organization_id = $1", [filleul.id]);
    await un("select set_config('gerimmo.systeme','',true)");
    await facturePayee(customer, sub);
    await un("select public.abonnement_appliquer($1, $2, 'past_due', 1, null, false)", [customer, sub]);
    await un("select public.abonnement_appliquer($1, $2, 'active', 1, null, false)", [customer, sub]);

    expect(await coteParrain(parrainage)).toHaveLength(1);
  });

  it("une facture payée sans parrainage ne crée rien", async () => {
    const seule = await organisation();
    const { customer, sub } = await souscrireEnEssai(seule.id);
    await facturePayee(customer, sub);
    const { n } = await un<{ n: number }>(
      "select count(*)::int as n from public.avantages_parrainage where beneficiaire_organization_id = $1",
      [seule.id]
    );
    expect(n).toBe(0);
  });
});
