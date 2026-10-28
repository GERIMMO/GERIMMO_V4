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
