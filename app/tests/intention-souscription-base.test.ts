/**
 * Migration 20261023162446 (défauts A01 et A02 de la facturation, audit du 23/10/2026), sur Postgres réel.
 *
 *  - UNE intention de souscription en cours par organisation : deux sessions concurrentes (deux onglets) obtiennent la
 *    MÊME intention (la seconde attend le verrou, puis la reprend) ; l'index unique partiel refuse une seconde ligne
 *    même hors de la fonction ;
 *  - la place se libère : page expirée, préparation interrompue, intention close ; une page ne se pose que sur une
 *    intention en cours et non expirée ;
 *  - droits réels : ni anon ni authenticated n'atteignent la table ni les fonctions ; la clé de service, oui ; RLS active ;
 *  - la table reste hors de la garde de lecture seule des comptes gelés (poser_gardes_abonnement rejouée) ;
 *  - la trace d'une hausse refusée (A02) : une ligne d'audit, étapes bornées ;
 *  - rejouable ; le retour retire les fonctions, rend à poser_gardes_abonnement sa définition d'origine, garde
 *    l'historique ; la réapplication rétablit tout.
 *
 * Base locale jetable seulement. Transaction annulée, sauf la fixture de l'essai de concurrence (validée, puis retirée).
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { supprimerOrganisationDeTest } from "./fixtures/nettoyer-organisation";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const nom = "20261023162446_souscription_unique_et_trace_hausse";
const migration = readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");

const E1 = "a".repeat(64);
const E2 = "b".repeat(64);
const FONCTIONS = [
  ["public.intention_souscription_reserver(uuid,text,integer,integer)", "select * from public.intention_souscription_reserver(gen_random_uuid(), repeat('a',64), 45, 120)"],
  ["public.intention_souscription_poser(uuid,uuid,text,text)", "select public.intention_souscription_poser(gen_random_uuid(), gen_random_uuid(), 'cs_test_x', 'https://checkout.stripe.test/x')"],
  ["public.intention_souscription_terminer(uuid,uuid,text)", "select public.intention_souscription_terminer(gen_random_uuid(), gen_random_uuid(), 'echec')"],
  ["public.abonnement_hausse_tracer(uuid,text,jsonb)", "select public.abonnement_hausse_tracer(gen_random_uuid(), 'hausse_incertaine', '[]'::jsonb)"],
] as const;

describe.skipIf(!url)("intentions de souscription : une seule en cours, droits réels, rejeu et retour", () => {
  let db: Client;
  let org: string;
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(migration);
    org = (await db.query("insert into public.organizations(name,type,status) values('Intention fictive','proprietaire_direct','active') returning id")).rows[0].id;
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });

  const service = () => db.query("set local role service_role");
  const reserver = async (empreinte = E1, o = org) =>
    (await db.query("select * from public.intention_souscription_reserver($1,$2,45,120)", [o, empreinte])).rows[0];
  const poser = async (intention: string, session: string, o = org) =>
    (await db.query("select public.intention_souscription_poser($1,$2,$3,$4) as r", [o, intention, session, `https://checkout.stripe.test/c/pay/${session}`])).rows[0].r;
  const terminer = async (intention: string, motif: string) =>
    (await db.query("select public.intention_souscription_terminer($1,$2,$3) as r", [org, intention, motif])).rows[0].r;
  const lignes = async () =>
    (await db.query("select statut, motif from public.intentions_souscription where organization_id=$1 order by cree_le, statut desc", [org])).rows;

  it("réserve une intention, puis la rend telle quelle à la demande suivante (même identifiant, reprise)", async () => {
    await service();
    const a = await reserver();
    expect(a).toMatchObject({ empreinte: E1, stripe_session_id: null, url: null, reprise: false });
    const duree = (new Date(a.expire_le).getTime() - new Date(a.cree_le).getTime()) / 60_000;
    expect(duree).toBe(45);
    const b = await reserver(E2);
    expect(b).toMatchObject({ intention: a.intention, empreinte: E1, reprise: true });
    expect(await poser(a.intention, "cs_test_1")).toBe(true);
    expect(await poser(a.intention, "cs_test_1")).toBe(true); // second onglet, même page : accepté
    expect(await poser(a.intention, "cs_test_2")).toBe(false); // une autre page : refusée
    expect(await reserver()).toMatchObject({ intention: a.intention, stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true });
  });

  it("« echec » ne clôt pas une intention dont un autre onglet a déjà posé la page", async () => {
    await service();
    const a = await reserver();
    await poser(a.intention, "cs_test_1");
    expect(await terminer(a.intention, "echec")).toBe(false);
    expect(await lignes()).toEqual([{ statut: "en_cours", motif: null }]);
    const b = await reserver(E2);
    await terminer(b.intention, "remplacee");
    const c = await reserver();
    expect(await terminer(c.intention, "echec")).toBe(true); // sans page : la place est rendue
  });

  it("une intention close libère la place ; le motif reste dans l'historique", async () => {
    await service();
    const a = await reserver();
    expect(await terminer(a.intention, "remplacee")).toBe(true);
    expect(await terminer(a.intention, "aboutie")).toBe(false); // déjà close
    const b = await reserver(E2);
    expect(b.intention).not.toBe(a.intention);
    expect(b.reprise).toBe(false);
    expect(await lignes()).toEqual([{ statut: "terminee", motif: "remplacee" }, { statut: "en_cours", motif: null }]);
  });

  it("une page expirée ou une préparation interrompue libèrent la place à la réservation suivante", async () => {
    await service();
    const a = await reserver();
    await poser(a.intention, "cs_test_1");
    await db.query("reset role");
    await db.query("update public.intentions_souscription set cree_le=now()-interval '2 hours', expire_le=now()-interval '1 second' where id=$1", [a.intention]);
    await service();
    expect(await poser(a.intention, "cs_test_1")).toBe(false); // expirée : plus rien ne s'y pose
    const b = await reserver();
    expect(b).toMatchObject({ reprise: false, stripe_session_id: null });
    await db.query("reset role");
    // Préparation interrompue : réservée il y a trois minutes, aucune page posée.
    await db.query("update public.intentions_souscription set cree_le=date_trunc('second',now())-interval '3 minutes', expire_le=date_trunc('second',now())+interval '42 minutes' where id=$1", [b.intention]);
    await service();
    const c = await reserver();
    expect(c.reprise).toBe(false);
    expect(await lignes()).toEqual([
      { statut: "terminee", motif: "expiree" },
      { statut: "terminee", motif: "abandonnee" },
      { statut: "en_cours", motif: null },
    ]);
  });

  it("l'index unique partiel refuse une seconde intention en cours, même écrite hors de la fonction", async () => {
    await service();
    await reserver();
    await db.query("reset role");
    await expect(
      db.query("insert into public.intentions_souscription(organization_id,empreinte,expire_le) values($1,$2,now()+interval '45 minutes')", [org, E2])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("refuse les paramètres hors bornes", async () => {
    await service();
    await db.query("savepoint s1");
    await expect(db.query("select * from public.intention_souscription_reserver($1,'pas-une-empreinte',45,120)", [org])).rejects.toThrow(/Demande de souscription invalide/);
    await db.query("rollback to savepoint s1");
    await expect(db.query("select * from public.intention_souscription_reserver($1,$2,20,120)", [org, E1])).rejects.toThrow(/Durée de réservation invalide/);
    await db.query("rollback to savepoint s1");
    await expect(db.query("select * from public.intention_souscription_reserver($1,$2,1441,120)", [org, E1])).rejects.toThrow(/Durée de réservation invalide/);
    await db.query("rollback to savepoint s1");
    const a = await reserver();
    await db.query("savepoint s2");
    await expect(db.query("select public.intention_souscription_poser($1,$2,'pi_123','https://x.test/a')", [org, a.intention])).rejects.toThrow(/Page de paiement invalide/);
    await db.query("rollback to savepoint s2");
    await expect(db.query("select public.intention_souscription_poser($1,$2,'cs_test_1','http://x.test/a')", [org, a.intention])).rejects.toThrow(/Page de paiement invalide/);
    await db.query("rollback to savepoint s2");
    await expect(db.query("select public.intention_souscription_terminer($1,$2,'abandonnee')", [org, a.intention])).rejects.toThrow(/Motif de fin invalide/);
  });

  it("une intention d'une autre organisation n'est ni posée ni close", async () => {
    await service();
    const a = await reserver();
    await db.query("reset role");
    const autre = (await db.query("insert into public.organizations(name,type,status) values('Autre fictive','proprietaire_direct','active') returning id")).rows[0].id;
    await service();
    expect(await poser(a.intention, "cs_test_1", autre)).toBe(false);
    expect((await db.query("select public.intention_souscription_terminer($1,$2,'echec') as r", [autre, a.intention])).rows[0].r).toBe(false);
    expect(await lignes()).toEqual([{ statut: "en_cours", motif: null }]);
  });

  it.each(["anon", "authenticated"])("%s n'atteint ni la table ni les fonctions", async (role) => {
    await db.query(`set local role ${role}`);
    for (const requete of ["select count(*) from public.intentions_souscription", ...FONCTIONS.map(([, sql]) => sql)]) {
      await db.query("savepoint refus");
      await expect(db.query(requete), requete).rejects.toMatchObject({ code: "42501" });
      await db.query("rollback to savepoint refus");
    }
  });

  it("droits du catalogue : RLS active, aucune politique, clé de service seule à exécuter", async () => {
    const t = (await db.query(`select c.relrowsecurity rls,
        (select count(*)::int from pg_policy p where p.polrelid=c.oid) politiques,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') anon,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') authentifie,
        has_table_privilege('service_role',c.oid,'SELECT') service
      from pg_class c where c.oid='public.intentions_souscription'::regclass`)).rows[0];
    expect(t).toEqual({ rls: true, politiques: 0, anon: false, authentifie: false, service: true });
    for (const [f] of FONCTIONS) {
      const d = (await db.query("select has_function_privilege('anon',$1,'EXECUTE') a, has_function_privilege('authenticated',$1,'EXECUTE') b, has_function_privilege('service_role',$1,'EXECUTE') c, (select proconfig from pg_proc where oid=$1::regprocedure) cfg, (select prosecdef from pg_proc where oid=$1::regprocedure) definer", [f])).rows[0];
      expect(d, f).toEqual({ a: false, b: false, c: true, cfg: ['search_path=""'], definer: true });
    }
  });

  it("la table reste hors de la garde de lecture seule, même après une pose complète des gardes", async () => {
    await db.query("select public.poser_gardes_abonnement()");
    const gardes = (await db.query("select tgname from pg_trigger where tgrelid='public.intentions_souscription'::regclass and not tgisinternal order by 1")).rows.map((r) => r.tgname);
    expect(gardes).not.toContain("abonnement_intentions_souscription");
    expect(gardes).toContain("diagnostic_artisan_lecture");
    // Une table d'organisation ordinaire, elle, reste gardée par la même pose.
    expect((await db.query("select count(*)::int n from pg_trigger where tgname='abonnement_lots'")).rows[0].n).toBe(1);
  });

  it("A02 : la trace d'une hausse refusée écrit une ligne d'audit, et refuse des étapes hors bornes", async () => {
    await service();
    const etapes = [
      { etape: "lecture_souscription", ok: true, objet: "sub_1" },
      { etape: "liberation_echeancier", ok: true, objet: "sub_sched_1" },
      { etape: "mise_a_jour", ok: false, objet: "sub_1", erreur: "Your card was declined." },
      { etape: "recreation_echeancier", ok: false, objet: "sub_sched_1", erreur: "An error occurred with our connection to Stripe." },
    ];
    await db.query("select public.abonnement_hausse_tracer($1,'echeancier_a_reprogrammer',$2::jsonb)", [org, JSON.stringify(etapes)]);
    await db.query("reset role");
    const ligne = (await db.query("select action, details from public.audit_log where organization_id=$1 and action='abonnement_hausse_non_appliquee'", [org])).rows;
    expect(ligne).toEqual([{ action: "abonnement_hausse_non_appliquee", details: { issue: "echeancier_a_reprogrammer", etapes } }]);
    await service();
    for (const [issue, contenu] of [
      ["autre_chose", []],
      ["hausse_incertaine", [{ etape: "mise_a_jour", ok: false, carte: "4242424242424242" }]],
      ["hausse_incertaine", [{ etape: "inconnue", ok: true }]],
      ["hausse_incertaine", [{ etape: "mise_a_jour", ok: "oui" }]],
      ["hausse_incertaine", [{ etape: "mise_a_jour", ok: false, objet: "client@example.invalid" }]],
    ] as const) {
      await db.query("savepoint borne");
      await expect(db.query("select public.abonnement_hausse_tracer($1,$2,$3::jsonb)", [org, issue, JSON.stringify(contenu)])).rejects.toThrow(/invalide/);
      await db.query("rollback to savepoint borne");
    }
  });

  it("rejouable ; le retour retire les fonctions et l'exclusion, garde l'historique ; la réapplication rétablit tout", async () => {
    const empreinte = async () => (await db.query(`select
        (select string_agg(p.proname||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(p.proacl::text,''),',' order by p.proname)
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and (p.proname like 'intention_souscription_%' or p.proname in ('abonnement_hausse_tracer','poser_gardes_abonnement'))) fonctions,
        (select string_agg(conname||':'||pg_get_constraintdef(oid),',' order by conname) from pg_constraint where conrelid='public.intentions_souscription'::regclass) contraintes,
        (select string_agg(indexdef,',' order by indexname) from pg_indexes where tablename='intentions_souscription') index,
        (select relacl::text from pg_class where oid='public.intentions_souscription'::regclass) droits,
        (select string_agg(tgname,',' order by tgname) from pg_trigger where tgrelid='public.intentions_souscription'::regclass and not tgisinternal) declencheurs`)).rows[0];
    const gardeOrigine = async () => (await db.query("select md5(pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure)) m")).rows[0].m;
    await service();
    const a = await reserver();
    await terminer(a.intention, "echec");
    await db.query("reset role");
    const avant = await empreinte();
    await db.query(migration);
    await db.query(migration);
    expect(await empreinte()).toEqual(avant);

    await db.query(retour);
    expect((await db.query("select count(*)::int n from pg_proc where proname like 'intention_souscription_%' or proname='abonnement_hausse_tracer'")).rows[0].n).toBe(0);
    expect((await db.query("select strpos(pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure), '''intentions_souscription''') p")).rows[0].p).toBe(0);
    const origine = await gardeOrigine();
    expect(await lignes()).toEqual([{ statut: "terminee", motif: "echec" }]); // historique conservé
    await db.query(retour); // rejoué : rien à faire
    expect(await gardeOrigine()).toBe(origine);

    await db.query(migration);
    expect(await empreinte()).toEqual(avant);
    await service();
    expect((await reserver()).reprise).toBe(false);
  });
});

describe.skipIf(!url)("deux onglets en même temps : deux sessions Postgres, une seule intention", () => {
  let admin: Client;
  let a: Client;
  let b: Client;
  let org: string | undefined;
  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    a = new Client({ connectionString: url });
    b = new Client({ connectionString: url });
    await Promise.all([admin.connect(), a.connect(), b.connect()]);
    // Fixture VALIDÉE : les deux sessions doivent voir l'organisation. Retirée en fin de fichier.
    org = (await admin.query("insert into public.organizations(name,type,status) values('Concurrence intention fictive','proprietaire_direct','active') returning id")).rows[0].id;
  });
  afterAll(async () => {
    await a?.end();
    await b?.end();
    if (admin) await supprimerOrganisationDeTest(admin, org, []);
    await admin?.end();
  });

  it("la seconde demande attend le verrou de la première, puis reprend la MÊME intention", async () => {
    await a.query("begin"); await a.query("set local role service_role");
    await b.query("begin"); await b.query("set local role service_role");
    const premiere = (await a.query("select * from public.intention_souscription_reserver($1,$2,45,120)", [org, E1])).rows[0];
    let seconde: { intention: string; reprise: boolean } | undefined;
    const enAttente = b.query("select * from public.intention_souscription_reserver($1,$2,45,120)", [org, E1]).then((r) => { seconde = r.rows[0]; });
    await new Promise((r) => setTimeout(r, 300));
    expect(seconde, "la seconde demande doit attendre la première").toBeUndefined();
    await a.query("commit");
    await enAttente;
    await b.query("commit");
    expect(premiere.reprise).toBe(false);
    expect(seconde).toMatchObject({ intention: premiere.intention, reprise: true });
    const { rows } = await admin.query("select count(*)::int n from public.intentions_souscription where organization_id=$1 and statut='en_cours'", [org]);
    expect(rows[0].n).toBe(1);
  });
});
