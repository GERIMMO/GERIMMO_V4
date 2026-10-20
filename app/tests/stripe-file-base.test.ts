import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("Réceptions Stripe durables", () => {
  let db: Client;
  const jeton = randomUUID(), autre = randomUUID();
  const ref = { objet: "sub_fictif", client: "cus_fictif" };
  const prendre = async (id = "evt_fictif", token = jeton, reference = ref) =>
    (await db.query("select public.stripe_evenement_prendre($1,'customer.subscription.updated',$2,$3) as etat", [id, reference, token])).rows[0].etat;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  it("ne donne aucun droit de réception à un compte ou visiteur", async () => {
    for (const f of ["stripe_evenement_prendre(text,text,jsonb,uuid)", "stripe_evenement_finir(text,uuid,boolean,text)", "stripe_evenement_appliquer(text,uuid,text,jsonb)", "stripe_controles_a_faire(integer)", "stripe_controle_enregistrer(uuid,text[])"]) {
      const r = (await db.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as compte,has_function_privilege('service_role',$1,'execute') as service", [`public.${f}`])).rows[0];
      expect(r).toEqual({ anon: false, compte: false, service: true });
    }
  });
  it("un doublon actif et un second événement du même client attendent", async () => {
    expect(await prendre()).toBe("pris"); expect(await prendre()).toBe("occupe");
    expect(await prendre("evt_autre", autre)).toBe("occupe");
    expect(await prendre("evt_client2", autre, { objet: "sub_autre", client: "cus_autre" })).toBe("pris");
  });
  it("une interruption conserve le reçu et sa référence, puis autorise la reprise", async () => {
    await prendre();
    expect((await db.query("select public.stripe_evenement_finir('evt_fictif',$1,false,'Reprise') as ok", [jeton])).rows[0].ok).toBe(true);
    expect(await prendre()).toBe("attendre");
    await db.query("update public.abonnement_evenements set reprendre_apres=now()-interval '1 second' where stripe_event_id='evt_fictif'");
    expect(await prendre("evt_fictif", autre)).toBe("pris");
    const ligne = (await db.query("select charge,tentatives from public.abonnement_evenements where stripe_event_id='evt_fictif'")).rows[0];
    expect(ligne).toEqual({ charge: ref, tentatives: 2 });
  });
  it("un ancien travailleur ne peut ni solder ni appliquer après reprise du verrou", async () => {
    await prendre(); await db.query("update public.abonnement_evenements set verrou_jusqua=now()-interval '1 second' where stripe_event_id='evt_fictif'");
    expect(await prendre("evt_fictif", autre)).toBe("pris");
    expect((await db.query("select public.stripe_evenement_finir('evt_fictif',$1,true,null) as ok", [jeton])).rows[0].ok).toBe(false);
    await expect(db.query("select public.stripe_evenement_appliquer('evt_fictif',$1,'abonnement_appliquer',$2)", [jeton, { p_customer: ref.client, p_subscription: ref.objet }])).rejects.toThrow("expirée");
  });
  it("un événement terminé reste terminé sans nouvelle tentative", async () => {
    await prendre(); await db.query("select public.stripe_evenement_finir('evt_fictif',$1,true,null)", [jeton]);
    expect(await prendre("evt_fictif", autre)).toBe("traite");
    expect((await db.query("select tentatives from public.abonnement_evenements where stripe_event_id='evt_fictif'")).rows[0].tentatives).toBe(1);
  });
  it("refuse les coordonnées et le contenu des factures dans les références", async () => {
    await expect(db.query("select public.stripe_evenement_prendre('evt_fictif','invoice.paid',$1,$2)", [{ objet: "in_fictif", client: "cus_fictif", nom: "Confidentiel" }, jeton])).rejects.toThrow("invalide");
  });
  it("refuse de réutiliser un identifiant avec une autre référence", async () => {
    await prendre(); await expect(prendre("evt_fictif", autre, { objet: "sub_autre", client: "cus_fictif" })).rejects.toThrow("incohérente");
  });
  it("le verrou protège une vraie mise à jour et le détail de l’offre", async () => {
    const org = (await db.query("insert into public.organizations(name,type,status) values('Contrôle fictif','proprietaire_direct','essai') returning id")).rows[0].id;
    await db.query("insert into public.abonnements(organization_id,stripe_customer_id) values($1,'cus_fictif')", [org]);
    await prendre();
    const a = (await db.query("select public.stripe_evenement_appliquer('evt_fictif',$1,'abonnement_appliquer',$2) as id", [jeton, { p_customer: ref.client, p_subscription: ref.objet, p_statut: "active", p_quantite: 1, p_periode_fin: "2026-12-01", p_annulation: false }])).rows[0].id;
    expect(a).toBe(org);
    await db.query("select public.stripe_evenement_appliquer('evt_fictif',$1,'abonnement_details',$2)", [jeton, { p_customer: ref.client, p_periodicite: "mensuel", p_formule: "solo", p_unites: 1, p_montant_periode_cents: 599, p_periode_debut: "2026-11-01" }]);
    expect((await db.query("select stripe_statut,montant_periode_cents::text from public.abonnements where organization_id=$1", [org])).rows[0]).toEqual({ stripe_statut: "active", montant_periode_cents: "599" });
  });
  it("ne réémet pas automatiquement un avis ambigu au-delà de la fenêtre de courrier", async () => {
    await db.query("insert into public.abonnement_evenements(stripe_event_id,type,charge,recu_le,avis_debut_le) values('evt_avis','customer.subscription.trial_will_end',$1,now()-interval '2 days',now()-interval '2 days')", [ref]);
    expect((await db.query("select public.stripe_evenement_prendre('evt_avis','customer.subscription.trial_will_end',$1,$2) as etat", [ref, jeton])).rows[0].etat).toBe("examiner");
    expect((await db.query("select traite_le,avis_a_verifier,tentatives from public.abonnement_evenements where stripe_event_id='evt_avis'")).rows[0]).toEqual({ traite_le: null, avis_a_verifier: true, tentatives: 20 });
  });
  it("une ancienne réception indisponible sort des premières places sans être effacée", async () => {
    await db.query("insert into public.abonnement_evenements(stripe_event_id,type) values('evt_ancien','invoice.paid')");
    await db.query("select public.stripe_evenement_lecture_differee('evt_ancien',true)");
    expect((await db.query("select tentatives,traite_le,erreur is not null as signalee from public.abonnement_evenements where stripe_event_id='evt_ancien'")).rows[0]).toEqual({ tentatives: 20, traite_le: null, signalee: true });
  });
  it("un compte ordinaire ne peut lire le bilan de supervision", async () => {
    await db.query("set local role authenticated; select set_config('request.jwt.claims','{}',true)");
    await expect(db.query("select public.supervision_stripe_controles()")).rejects.toThrow("supervision");
  });
});

describe.skipIf(!url)("Concurrence réelle de deux réceptions Stripe", () => {
  it("une seule prise est accordée pour un même événement et pour un même client", async () => {
    const a = new Client({ connectionString: url }), b = new Client({ connectionString: url });
    await a.connect(); await b.connect();
    const suffixe = randomUUID().replaceAll("-", ""); const id = `evt_${suffixe}`, second = `${id}_2`;
    const ref = { objet: `sub_${suffixe}`, client: `cus_${suffixe}` };
    const prise = async (db: Client, event: string) => (await db.query("select public.stripe_evenement_prendre($1,'customer.subscription.updated',$2,$3) as etat", [event, ref, randomUUID()])).rows[0].etat;
    try {
      expect((await Promise.all([prise(a, id), prise(b, id)])).sort()).toEqual(["occupe", "pris"]);
      expect(await prise(b, second)).toBe("occupe");
      await a.query("update public.abonnement_evenements set verrou_jusqua=now()-interval '1 second' where stripe_event_id=$1", [id]);
      expect((await Promise.all([prise(a, id), prise(b, second)])).sort()).toEqual(["occupe", "pris"]);
    } finally {
      await a.query("delete from public.abonnement_evenements where stripe_event_id=any($1::text[])", [[id, second]]); await a.end(); await b.end();
    }
  });
});
