/**
 * Audit final du 27/10 (LOY-10, LOY-11) — migration 20261028100200_loyers_ecrans_nom_et_montants :
 *  · `rappels_loyers_proprietaire` rend « Nom Prénom », comme le quittancement et nomComplet ;
 *  · `montant_fr(numeric)` écrit un montant à la française, et le titre de l'alerte d'impayé l'emploie (« 1 400,00 € dus »).
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon la partie base est ignorée).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { repartitionEncaissement } from "@/lib/finances";

const NOM = "20261028100200_loyers_ecrans_nom_et_montants";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("loyers — écrans et textes : migration, manifeste et retour (sans base)", () => {
  const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
  it("la migration est au manifeste une seule fois, après l'alerte d'impayé, avec son retour au LISEZ-MOI et dans la chaîne complète", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261027100000_alerte_impaye_suit_encaissements.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi).toMatch(/Ordre complet si tout doit être défait :\n`20261028100200`[^\n]*, puis `20261027100000`/);
  });
  it("suivre_impayes_bail garde une seule lecture du jour de Paris et formate par montant_fr ; la fonction est fermée à anon", () => {
    const corps = sql.replace(/^\s*--.*$/gm, "");
    const fonction = corps.slice(corps.indexOf("create or replace function public.suivre_impayes_bail"), corps.indexOf("comment on function public.suivre_impayes_bail"));
    expect(fonction.match(/public\.aujourdhui_paris\(\)/g)).toHaveLength(1);
    expect(fonction).toContain("public.montant_fr(v_du)");
    expect(fonction).not.toContain("to_char(v_du");
    expect(corps).toContain("concat_ws(' ',p.nom,p.prenom)");
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    expect(retour).toContain("concat_ws(' ',p.prenom,p.nom)");
    expect(retour).toContain("replace(to_char(v_du, 'FM999999990.00'), '.', ',') || ' €'");
    expect(retour).toContain("drop function if exists public.montant_fr(numeric);");
    // Relectures de LOY-07 : quittancement_mois rend la date d'échéance et le détail de la dette ; droits remis à l'identique.
    expect(corps).toContain("drop function if exists public.quittancement_mois(uuid, date);");
    expect(corps).toContain("grant execute on function public.quittancement_mois(uuid, date) to authenticated, service_role;");
    expect(retour).toContain("drop function if exists public.quittancement_mois(uuid, date);");
  });
});

describe.skipIf(!url)("loyers — écrans et textes (avec base)", () => {
  let db: Client, org: string, compte: string, bail: string;
  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    compte = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [compte, `${compte}@test.local`]);
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST loyers écrans','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appt 1','loue') returning id", [org, bien])).rows[0].id;
    const personne = (await db.query("insert into persons(organization_id,nom,prenom) values($1,'Durand','Paul') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-100,650,50,5) returning id", [org, lot, personne])).rows[0].id;
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,(date_trunc('month',public.aujourdhui_paris())-interval '2 month')::date,public.aujourdhui_paris()-60,650,50,700),
      ($1,$2,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,650,50,700)`, [org, bail]);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("montant_fr écrit les montants comme l'écran : espace fine insécable des milliers, virgule, espace insécable avant €", async () => {
    const { rows: [r] } = await db.query("select public.montant_fr(1400) a, public.montant_fr(256.66) b, public.montant_fr(1234567.891) c, public.montant_fr(-1400.5) d, public.montant_fr(0) e, public.montant_fr(null) f");
    expect(r).toEqual({ a: "1 400,00 €", b: "256,66 €", c: "1 234 567,89 €", d: "-1 400,50 €", e: "0,00 €", f: null });
    // Indépendant de la locale numérique de la session.
    await db.query("set local lc_numeric = 'C'");
    expect((await db.query("select public.montant_fr(1400) a")).rows[0].a).toBe("1 400,00 €");
  });

  it("les rappels du propriétaire nomment le locataire « Durand Paul », comme le quittancement (LOY-10)", async () => {
    await agir(compte);
    const rappels = (await db.query("select locataire from public.rappels_loyers_proprietaire($1)", [org])).rows;
    expect(rappels).toHaveLength(2);
    expect(rappels.every((r) => r.locataire === "Durand Paul")).toBe(true);
    const quittancement = (await db.query("select locataire from public.quittancement_mois($1,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date)", [org])).rows;
    expect(quittancement.map((q) => q.locataire)).toEqual(["Durand Paul"]);
    // Sans prénom : le nom seul, jamais une espace de tête ni un vide.
    await db.query("reset role");
    await db.query("update persons set prenom=null where organization_id=$1", [org]);
    await agir(compte);
    expect((await db.query("select distinct locataire from public.rappels_loyers_proprietaire($1)", [org])).rows).toEqual([{ locataire: "Durand" }]);
  });

  it("le titre de l'alerte d'impayé porte « 1 400,00 € dus » et le nom dans le même ordre (LOY-11)", async () => {
    await db.query("reset role");
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    const { rows: [alerte] } = await db.query("select titre, criticite::text from public.alerts where organization_id=$1 and type='loyer_impaye' and statut='ouverte'", [org]);
    expect(alerte.criticite).toBe("critique");
    expect(alerte.titre).toContain("Durand Paul (TEST Appt 1) : 1 400,00 € dus depuis le ");
    expect(alerte.titre).not.toContain("1400,00");
    // Un règlement partiel : le titre suit, au même format.
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,350,public.aujourdhui_paris(),'virement')", [org, bail]);
    const { rows: [apres] } = await db.query("select titre from public.alerts where organization_id=$1 and type='loyer_impaye' and statut='ouverte'", [org]);
    expect(apres.titre).toContain(": 1 050,00 € dus");
  });

  it("quittancement_mois rend l'échéance et la dette mois par mois ; la répartition affichée est celle de l'imputation réelle", async () => {
    // Août 700 (300 reçus), septembre 700, octobre 700 : trois termes échus, lus sur octobre.
    await db.query("reset role");
    await db.query("delete from public.appels_loyer where bail_id=$1", [bail]);
    const mois = (n: number) => `(date_trunc('month',public.aujourdhui_paris())-interval '${n} month')::date`;
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,${mois(3)},${mois(3)}+4,650,50,700),($1,$2,${mois(2)},${mois(2)}+4,650,50,700),($1,$2,${mois(1)},${mois(1)}+4,650,50,700)`, [org, bail]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,300,public.aujourdhui_paris(),'virement')", [org, bail]);
    await agir(compte);
    const { rows: [ligne] } = await db.query(`select date_echeance::text, dette_anterieure_detail, dette_anterieure_reste from public.quittancement_mois($1,${mois(1)})`, [org]);
    const periodes = (await db.query(`select ${mois(3)}::text a, ${mois(2)}::text b, (${mois(1)}+4)::text e`)).rows[0];
    expect(ligne.date_echeance).toBe(periodes.e);
    expect(ligne.dette_anterieure_detail).toEqual([{ periode: periodes.a, reste: 400 }, { periode: periodes.b, reste: 700 }]);
    const repartition = repartitionEncaissement(700, ligne.dette_anterieure_detail);
    expect(repartition).toEqual({ anterieur: [{ periode: periodes.a, montant: 400 }, { periode: periodes.b, montant: 300 }], terme: 0 });
    // La base, elle, fait la même chose : simulation d'un encaissement de 700 € (transaction du test, annulée à la fin).
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,700,public.aujourdhui_paris(),'virement')", [org, bail]);
    const etat = (await db.query("select periode::text, montant_couvert::float couvert from public.etat_loyers_bail_brut($1) order by periode", [bail])).rows;
    expect(etat).toEqual([{ periode: periodes.a, couvert: 700 }, { periode: periodes.b, couvert: 300 }, { periode: (await db.query(`select ${mois(1)}::text p`)).rows[0].p, couvert: 0 }]);
  });

  it("plus de 1 000 baux : toutes les lignes, chacune avec sa date d'échéance, dans un ordre total qui se pagine", async () => {
    await db.query("reset role");
    const bien = (await db.query("select bien_id from lots where organization_id=$1 limit 1", [org])).rows[0].bien_id;
    await db.query(`with l as (insert into lots(organization_id,bien_id,nom,etat) select $1,$2,'TEST Lot '||g,'loue' from generate_series(1,1100) g returning id, nom),
      p as (insert into persons(organization_id,nom,prenom) select $1,'TEST','Masse '||g from generate_series(1,1100) g returning id, prenom),
      lp as (select l.id lot, p.id personne from (select id, row_number() over (order by nom) r from l) l join (select id, row_number() over (order by prenom) r from p) p using (r)),
      b as (insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance)
        select $1,lot,personne,'nu','actif',public.aujourdhui_paris()-100,650,50,5 from lp returning id)
      insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du)
        select $1,b.id,date_trunc('month',public.aujourdhui_paris())::date,date_trunc('month',public.aujourdhui_paris())::date+4,650,50,700 from b`, [org, bien]);
    await agir(compte);
    const tout = (await db.query("select bail_id, appel_id, date_echeance from public.quittancement_mois($1,public.aujourdhui_paris())", [org])).rows;
    expect(tout.length).toBeGreaterThan(1000);
    expect(tout.every((r) => r.date_echeance !== null)).toBe(true);
    const pages = [...(await db.query("select appel_id from public.quittancement_mois($1,public.aujourdhui_paris()) limit 1000 offset 0", [org])).rows,
      ...(await db.query("select appel_id from public.quittancement_mois($1,public.aujourdhui_paris()) limit 1000 offset 1000", [org])).rows].map((r) => r.appel_id);
    expect(pages).toEqual(tout.map((r) => r.appel_id));
    expect(new Set(pages).size).toBe(tout.length);
  });

  it("la migration se rejoue sans effet et son retour rend les définitions précédentes", async () => {
    await db.query("reset role");
    await db.query(readFileSync(`supabase/migrations/${NOM}.sql`, "utf8"));
    expect((await db.query("select public.montant_fr(1400) a")).rows[0].a).toBe("1 400,00 €");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await db.query(retour);
    expect((await db.query("select count(*)::int n from pg_proc where proname='montant_fr'")).rows[0].n).toBe(0);
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    expect((await db.query("select titre from public.alerts where organization_id=$1 and type='loyer_impaye' and statut='ouverte'", [org])).rows[0].titre).toContain("1400,00 € dus");
    await agir(compte);
    expect((await db.query("select distinct locataire from public.rappels_loyers_proprietaire($1)", [org])).rows).toEqual([{ locataire: "Paul Durand" }]);
  });
});
