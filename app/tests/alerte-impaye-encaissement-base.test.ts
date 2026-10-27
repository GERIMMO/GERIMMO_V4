/**
 * Audit de la PR #264 (27/10, LAT-01) : l'alerte « Loyer impayé » suit les encaissements, sans attendre la tâche de nuit.
 *
 * Avant 20261027100000, un bail soldé depuis le tableau de bord gardait son alerte ouverte jusqu'au lendemain, et l'accueil
 * la présentait comme l'action prioritaire. Ici : fermeture dès la réception complète (tableau de bord ET bail), réouverture
 * quand le règlement est annulé, montant à jour après un règlement partiel, aucune fermeture par une simple lecture, aucun
 * doublon quand le geste se répète, et une alerte fermée à la main reste fermée.
 *
 * Le dernier bloc rejoue la migration dans la transaction du test (déclencheur recréé sur `encaissements`) : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261027100000_alerte_impaye_suit_encaissements";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("alerte d'impayé et encaissements — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé au LISEZ-MOI", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter(l => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261026110449_reception_loyer_idempotence_durable.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
  });

  it("suivre_impayes_bail garde une seule lecture du jour de Paris (le retour de 20261014501000 en compte une)", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    const fonction = sql.slice(sql.indexOf("create or replace function public.suivre_impayes_bail"), sql.indexOf("comment on function public.suivre_impayes_bail"));
    expect(fonction.match(/public\.aujourdhui_paris\(\)/g)).toHaveLength(1);
    expect(fonction).not.toMatch(/current_date/i);
  });
});

describe.skipIf(!url)("alerte d'impayé et encaissements (avec base)", () => {
  let db: Client, org: string, compte: string, bail: string, ancien: string, recent: string, jour: string;
  async function utilisateur() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  /** Le passage de nuit, tel que la tâche planifiée le fait pour ce bail. */
  async function nuit() {
    await db.query("reset role");
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    await agir(compte);
  }
  async function alertes() {
    await db.query("reset role");
    const { rows } = await db.query<{ statut: string; criticite: string; seuil: string; titre: string; closed_action: string | null }>(
      `select statut::text, criticite::text, details->>'seuil' seuil, titre, closed_action from public.alerts
        where organization_id=$1 and type='loyer_impaye' order by created_at`, [org]);
    await agir(compte);
    return rows;
  }
  async function reception(appel: string, choix: "recu" | "partiel", montant: number, reste: number, cle = randomUUID()) {
    return (await db.query("select public.declarer_reception_loyer($1,$2,$3,$4,$5,'virement',$6,$7) r",
      [org, appel, choix, montant, jour, cle, reste])).rows[0].r;
  }
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    jour = (await db.query("select public.aujourdhui_paris()::text jour")).rows[0].jour;
    compte = await utilisateur();
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST alerte impayé','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    const personne = (await db.query("insert into persons(organization_id,nom) values($1,'TEST Locataire') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-100,750,50,5) returning id", [org, lot, personne])).rows[0].id;
    [ancien, recent] = [randomUUID(), randomUUID()];
    await db.query(`insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$3,$4,(date_trunc('month',public.aujourdhui_paris())-interval '2 month')::date,public.aujourdhui_paris()-60,750,50,800),
      ($2,$3,$4,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,750,50,800)`, [ancien, recent, org, bail]);
    await nuit();
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("la nuit pose une alerte critique ; la lire, lire les rappels ou l'état du bail ne la ferme pas", async () => {
    expect(await alertes()).toMatchObject([{ statut: "ouverte", criticite: "critique", seuil: "2" }]);
    expect((await db.query("select * from public.rappels_loyers_proprietaire($1)", [org])).rows).toHaveLength(2);
    expect((await db.query("select * from public.etat_loyers_bail($1)", [bail])).rows).toHaveLength(2);
    expect((await db.query("select id from public.alerts where organization_id=$1", [org])).rows).toHaveLength(1);
    expect(await alertes()).toMatchObject([{ statut: "ouverte", criticite: "critique", seuil: "2" }]);
  });

  it("deux réceptions depuis le tableau de bord : l'alerte suit le premier terme, puis se ferme « Impayé soldé »", async () => {
    expect((await reception(ancien, "recu", 800, 800)).statut).toBe("enregistre");
    const [apresUn] = await alertes();
    expect(apresUn).toMatchObject({ statut: "ouverte", criticite: "normale", seuil: "1" });
    expect(apresUn.titre).toContain("800,00 €");
    expect((await reception(recent, "recu", 800, 800)).statut).toBe("enregistre");
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Impayé soldé" }]);
    // Geste répété avec un ancien formulaire, puis passage de nuit : rien ne se rouvre, rien ne se double.
    expect((await reception(recent, "recu", 800, 800)).statut).toBe("deja_solde");
    await nuit();
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Impayé soldé" }]);
  });

  it("un règlement partiel au même nombre de termes met le montant de l'alerte à jour", async () => {
    await reception(ancien, "recu", 800, 800);
    await reception(recent, "partiel", 300, 800);
    const [alerte] = await alertes();
    expect(alerte).toMatchObject({ statut: "ouverte", seuil: "1" });
    expect(alerte.titre).toContain("500,00 €");
  });

  it("l'annulation du règlement rouvre la même alerte, sans doublon, autant de fois qu'elle se répète", async () => {
    await reception(ancien, "recu", 800, 800);
    for (let tour = 0; tour < 2; tour++) {
      await reception(recent, "recu", 800, 800);
      expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Impayé soldé" }]);
      const dernier = (await db.query("select id from public.encaissements where bail_id=$1 order by created_at desc, id desc limit 1", [bail])).rows[0].id;
      await db.query("select public.supprimer_encaissement($1,$2)", [dernier, "TEST annulation d’un règlement fictif"]);
      const rouvertes = await alertes();
      expect(rouvertes).toHaveLength(1);
      expect(rouvertes[0]).toMatchObject({ statut: "ouverte", seuil: "1", closed_action: null });
    }
  });

  it("l'encaissement depuis le bail ferme aussi l'alerte", async () => {
    await reception(ancien, "recu", 800, 800);
    const r = (await db.query("select public.encaisser_reste_atomique($1,$2,$3,$4,800,0) r", [org, bail, recent, randomUUID()])).rows[0].r;
    expect(r.statut).toBe("enregistre");
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Impayé soldé" }]);
  });

  it("un nouveau terme impayé après un solde rouvre l'alerte fermée d'elle-même, à la date du nouveau terme", async () => {
    // Avant : l'alerte fermée « Impayé soldé » au seuil « 1 » bloquait toute nouvelle alerte au même seuil.
    await reception(ancien, "recu", 800, 800);
    await nuit();
    await reception(recent, "recu", 800, 800);
    await nuit();
    await db.query("reset role");
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du)
      values($1,$2,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()-1,750,50,800)`, [org, bail]);
    await nuit();
    const lignes = await alertes();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ statut: "ouverte", seuil: "1" });
    const veille = (await db.query("select to_char(public.aujourdhui_paris()-1,'DD/MM/YYYY') d")).rows[0].d;
    expect(lignes[0].titre).toContain(`depuis le ${veille}`);
  });

  it("une alerte fermée à la main reste fermée après un encaissement partiel ou la nuit", async () => {
    await db.query("reset role");
    await db.query("update public.alerts set statut='fermee', closed_at=now(), closed_action='Arrangement amiable' where organization_id=$1", [org]);
    await agir(compte);
    await reception(ancien, "partiel", 100, 800);
    await nuit();
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Arrangement amiable" }]);
  });

  it("un encaissement saisi ou retiré sur un bail sans alerte n'en pose aucune : la nuit reste seule à les poser", async () => {
    await db.query("reset role");
    await db.query("delete from public.alerts where organization_id=$1", [org]);
    await agir(compte);
    await reception(ancien, "partiel", 100, 800);
    expect(await alertes()).toEqual([]);
    const reglement = (await db.query("select id from public.encaissements where bail_id=$1", [bail])).rows[0].id;
    await db.query("select public.supprimer_encaissement($1,$2)", [reglement, "TEST annulation d’un règlement fictif"]);
    expect(await alertes()).toEqual([]);
    await nuit();
    expect(await alertes()).toMatchObject([{ statut: "ouverte", criticite: "critique", seuil: "2" }]);
  });

  it("la migration se rejoue sans erreur et sans second déclencheur", async () => {
    await db.query("reset role");
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    await db.query(sql);
    await db.query(sql);
    expect((await db.query("select count(*)::int n from pg_trigger where tgrelid='public.encaissements'::regclass and tgname='encaissement_impaye'")).rows[0].n).toBe(1);
    expect((await db.query("select has_function_privilege('authenticated','public.suivre_impayes_bail(uuid)','execute') a, has_function_privilege('authenticated','public.encaissement_actualise_impaye()','execute') b")).rows[0]).toEqual({ a: false, b: false });
    await agir(compte);
    await reception(ancien, "recu", 800, 800);
    await reception(recent, "recu", 800, 800);
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Impayé soldé" }]);
  });
});
