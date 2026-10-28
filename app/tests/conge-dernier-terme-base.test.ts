/**
 * Audit final du 27/10 (LOY-01, LOY-V01, COD-03) — migration 20261028100100 : le dernier terme suit le congé ; dépôt au centime.
 *
 * Avant : `generer_appels_loyer_interne` ne crée que les périodes absentes. Un congé enregistré APRÈS la génération de l'appel
 * du mois de sortie laissait cet appel au mois plein (500,00 € pour 25 jours : 403,22 € dus) ; un congé ANNULÉ après la
 * génération laissait l'appel au prorata (mois sous-facturé). Et `encaisser_depot` acceptait 10,005 € par appel direct.
 *
 * Ici : l'appel du mois de fin est recalculé avec la règle de la génération (arrondi par composante) à l'enregistrement et à
 * l'annulation du congé, quittance ou reçu resynchronisés ; une quittance déjà envoyée fige l'appel et pose une alerte ; un
 * terme appelé après la fin du bail n'est jamais touché (alerte) ; le mois d'entrée n'est jamais recalculé. La base du
 * recalcul est celle qui a émis l'appel (seconde relecture du 28/10) : une révision datée dans le mois de sortie ne refacture
 * pas ce mois après une annulation. Un document envoyé d'un autre terme que l'imputation remplace est réécrit (cohérent avec
 * l'écran du bail) et une alerte le suit jusqu'au renvoi. Le dépôt, les
 * retenues, les postes de charges et les écritures refusent les millièmes. Le dernier bloc rejoue la migration et son retour
 * dans la transaction du test (DDL sur `ecritures`) : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { versementsDuTerme } from "@/lib/documents/modeles/quittance";

const NOM = "20261028100100_conge_ajuste_dernier_terme_et_depot_au_centime";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("dernier terme et congé — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, en dernier, avec son retour listé au LISEZ-MOI", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261027100500_parcours_demarrage_pluriel_baux.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Hors de la chaîne « Ordre complet » : la migration ne cite pas aujourdhui_paris().
    expect(lisezMoi).not.toMatch(/Ordre complet si tout doit être défait :\s*`20261028100100`/);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
  });

  it("la migration ne lit pas le jour de la session et ferme ses fonctions à anon", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/current_date/i);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql).toContain("revoke execute on function public.ajuster_appel_fin_de_bail(uuid, date) from public, anon, authenticated;");
  });
});

describe.skipIf(!url)("le dernier terme suit le congé ; dépôt au centime (avec base)", () => {
  let db: Client, org: string, compte: string, bail: string, lot: string, jour: string, mois: string, jours: number;
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
  async function appel(periode: string) {
    await db.query("reset role");
    const { rows } = await db.query<{ loyer_hc: string; charges: string; montant_du: string; prorata: boolean }>(
      "select loyer_hc::text, charges::text, montant_du::text, prorata from public.appels_loyer where bail_id=$1 and periode=$2", [bail, periode]);
    await agir(compte);
    return rows[0];
  }
  async function quittance(periode: string) {
    await db.query("reset role");
    const { rows } = await db.query<{ est_quittance: boolean; montant: string; email_envoye_at: string | null }>(
      `select q.est_quittance, q.montant::text, q.email_envoye_at from public.quittances q join public.appels_loyer a on a.id=q.appel_id
        where a.bail_id=$1 and a.periode=$2`, [bail, periode]);
    await agir(compte);
    return rows;
  }
  async function alertes(type = "terme_a_regulariser") {
    await db.query("reset role");
    const { rows } = await db.query<{ statut: string; titre: string; origine_type: string; origine_id: string; motif: string; appel_id: string; closed_action: string | null; consigne: string | null }>(
      `select statut::text, titre, origine_type, origine_id, details->>'motif' motif, details->>'appel_id' appel_id, closed_action,
              details->>'consigne' consigne from public.alerts
        where organization_id=$1 and type=$2 order by created_at`, [org, type]);
    await agir(compte);
    return rows;
  }
  /** Les montants attendus pour 25 jours du mois courant, arrondis par composante comme la génération. */
  async function attendu25() {
    await db.query("reset role");
    const { rows } = await db.query<{ loyer: string; charges: string; total: string }>(
      `select round(450.0*25/$1::int,2)::text loyer, round(50.0*25/$1::int,2)::text charges,
              (round(450.0*25/$1::int,2)+round(50.0*25/$1::int,2))::text total`, [jours]);
    await agir(compte);
    return rows[0];
  }
  /** Le congé du locataire, présenté le 25 du mois précédent : un mois de préavis (zone tendue), fin le 25 du mois courant. */
  const conge = () => db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '1 month' + interval '24 days')::date,1::smallint) id", [bail, mois]);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    ({ jour, mois, jours } = (await db.query<{ jour: string; mois: string; jours: number }>(
      `select public.aujourdhui_paris()::text jour, date_trunc('month', public.aujourdhui_paris())::date::text mois,
              extract(day from (date_trunc('month', public.aujourdhui_paris()) + interval '1 month - 1 day'))::int jours`)).rows[0]);
    compte = await utilisateur();
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST dernier terme','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris',true) returning id", [org])).rows[0].id;
    lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    const personne = (await db.query("insert into persons(organization_id,nom,prenom) values($1,'TEST Locataire','Awa') returning id", [org])).rows[0].id;
    // Entré le 1er, treize mois plus tôt (une révision IRL est donc possible) : loyer 450 + 50 de charges, dépôt 450.
    bail = (await db.query(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue,revision_irl,irl_valeur,irl_trimestre)
      values($1,$2,$3,'nu','actif',($4::date - interval '13 months')::date,450,50,450,1,true,true,140,'T2 2025') returning id`, [org, lot, personne, mois])).rows[0].id;
    await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
    // Tout est payé, mois courant compris : quittances émises.
    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      select $1,$2,a.montant_du,a.date_echeance,'virement' from appels_loyer a where a.bail_id=$2`, [org, bail]);
    await db.query("select * from public.resynchroniser_quittances($1)", [bail]);
    await agir(compte);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("congé saisi après la génération de l'appel du mois de sortie : l'appel passe au prorata et la quittance suit", async () => {
    expect(await appel(mois)).toMatchObject({ montant_du: "500.00", prorata: false });
    await conge();
    const a = await attendu25();
    expect(await appel(mois)).toEqual({ loyer_hc: a.loyer, charges: a.charges, montant_du: a.total, prorata: true });
    // 500 € encaissés pour un terme réduit : il reste « payé », la quittance porte le nouveau montant.
    const etat = (await db.query("select statut, montant_du::text montant_du from public.etat_loyers_bail($1) where periode=$2", [bail, mois])).rows[0];
    expect(etat).toEqual({ statut: "paye", montant_du: a.total });
    expect(await quittance(mois)).toEqual([{ est_quittance: true, montant: a.total, email_envoye_at: null }]);
    expect(await alertes()).toEqual([]);
    // Le mois d'entrée et les mois pleins précédents ne bougent pas.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    expect(await appel(precedent)).toMatchObject({ montant_du: "500.00", prorata: false });
  });

  it("quittance déjà envoyée : l'appel ne bouge pas, une alerte le dit, et un second congé la met à jour sans la doubler", async () => {
    await db.query("reset role");
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    expect(await appel(mois)).toMatchObject({ montant_du: "500.00", prorata: false });
    const [alerte] = await alertes();
    expect(alerte).toMatchObject({ statut: "ouverte", origine_type: "bail", origine_id: bail, motif: "quittance_envoyee" });
    // Le montant exact et quoi faire (seconde relecture du 28/10 : aucun outil de régularisation, l'alerte le dit).
    const total = (await attendu25()).total;
    const ecart = (500 - Number(total)).toFixed(2).replace(".", ",");
    expect(alerte.titre).toContain(`appelé 500,00\u00a0€ au lieu de ${total.replace(".", ",")}\u00a0€`);
    expect(alerte.titre).toContain(`${ecart}\u00a0€ appelés en trop, à régulariser avec le locataire`);
    expect(alerte.consigne).toContain("solde de tout compte");
    // Rétractation : l'appel de 500 € redevient exact, l'alerte n'a plus d'objet et se ferme d'elle-même (relecture du 28/10).
    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    expect(await appel(mois)).toMatchObject({ montant_du: "500.00", prorata: false });
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Congé annulé ou modifié : plus rien à régulariser" }]);
    // Nouveau congé : une seule alerte ouverte, que le même congé repassé met à jour au lieu de la doubler.
    await conge();
    expect((await alertes()).filter((a) => a.statut === "ouverte")).toHaveLength(1);
  });

  it("congé puis annulation : l'appel né au prorata redevient un mois plein, le reçu redevient un reçu partiel", async () => {
    // Le congé précède le cycle du 1er : l'appel du mois naît au prorata.
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST retour avant le cycle') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await db.query("delete from public.appels_loyer where bail_id=$1 and periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    expect((await db.query("select public.generer_appels_loyer($1) n", [bail])).rows[0].n).toBe(1);
    const a = await attendu25();
    expect(await appel(mois)).toEqual({ loyer_hc: a.loyer, charges: a.charges, montant_du: a.total, prorata: true });
    // Le locataire règle le prorata, un reçu… puis se rétracte.
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,$3,$4,'virement')", [org, bail, a.total, jour]);
    await db.query("select * from public.resynchroniser_quittances($1)", [bail]);
    await agir(compte);
    expect(await quittance(mois)).toEqual([{ est_quittance: true, montant: a.total, email_envoye_at: null }]);
    await db.query("select public.annuler_conge($1,'Le locataire reste')", [bail]);
    expect((await db.query("select etat::text etat, date_fin from public.baux where id=$1", [bail])).rows[0]).toEqual({ etat: "actif", date_fin: null });
    expect(await appel(mois)).toEqual({ loyer_hc: "450.00", charges: "50.00", montant_du: "500.00", prorata: false });
    // 403,22 encaissés sur 500 dus : la quittance devient un reçu partiel du montant versé.
    expect(await quittance(mois)).toEqual([{ est_quittance: false, montant: a.total, email_envoye_at: null }]);
    expect((await db.query("select public.generer_appels_loyer($1) n", [bail])).rows[0].n).toBe(0);
    expect(await alertes()).toEqual([]);
  });

  it("congé saisi très tard : le mois de sortie passe au prorata, le terme appelé après la fin du bail reste et s'alerte", async () => {
    // Présenté le 25 d'il y a deux mois : fin le 25 du mois précédent, alors que le mois courant est déjà appelé.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    const joursPrecedent = (await db.query("select extract(day from ($1::date + interval '1 month - 1 day'))::int j", [precedent])).rows[0].j;
    const total = (await db.query("select (round(450.0*25/$1::int,2)+round(50.0*25/$1::int,2))::text t", [joursPrecedent])).rows[0].t;
    expect(await appel(precedent)).toMatchObject({ montant_du: total, prorata: true });
    expect(await appel(mois)).toMatchObject({ montant_du: "500.00", prorata: false });
    const [alerte] = await alertes();
    expect(alerte).toMatchObject({ statut: "ouverte", origine_id: bail, motif: "appel_apres_fin" });
    expect(alerte.titre).toContain("appelé après la fin du bail");
    // Le locataire reste finalement : le mois de sortie redevient plein, le terme suivant redevient dû, l'alerte se ferme.
    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    expect(await appel(precedent)).toMatchObject({ montant_du: "500.00", prorata: false });
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Congé annulé ou modifié : plus rien à régulariser" }]);
  });

  it("révision IRL appliquée après le mois de sortie, puis congé tardif : le prorata part du loyer de l'époque, pas du loyer révisé", async () => {
    // Relecture du 28/10 (scénario A2) : 450 → 482,14 € ce mois-ci ; fin le 25 du mois précédent.
    await db.query("select public.reviser_loyer($1,150,'T2 2026',$2::date)", [bail, jour]);
    expect((await db.query("select loyer_hc::text l from public.baux where id=$1", [bail])).rows[0].l).toBe("482.14");
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    const j = (await db.query("select extract(day from ($1::date + interval '1 month - 1 day'))::int j", [precedent])).rows[0].j;
    const attendu = (await db.query("select round(450.0*25/$1::int,2)::text l, round(50.0*25/$1::int,2)::text c, (round(450.0*25/$1::int,2)+round(50.0*25/$1::int,2))::text t", [j])).rows[0];
    expect(await appel(precedent)).toEqual({ loyer_hc: attendu.l, charges: attendu.c, montant_du: attendu.t, prorata: true });
  });

  it("fin au dernier jour du mois après une révision : le mois plein appelé à l'ancien loyer n'est pas réécrit", async () => {
    // Relecture du 28/10 (scénario A) : la base d'un mois plein est son propre loyer, jamais celui du bail révisé.
    await db.query("select public.reviser_loyer($1,150,'T2 2026',$2::date)", [bail, jour]);
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("reset role");
    await db.query("update public.baux set etat='preavis', date_fin=($1::date - 1) where id=$2", [mois, bail]);
    expect((await db.query("select public.ajuster_appel_fin_de_bail($1) n", [bail])).rows[0].n).toBe(0);
    await agir(compte);
    expect(await appel(precedent)).toEqual({ loyer_hc: "450.00", charges: "50.00", montant_du: "500.00", prorata: false });
    expect(await quittance(precedent)).toEqual([{ est_quittance: true, montant: "500.00", email_envoye_at: null }]);
  });

  it("avis d'échéance déjà envoyé : l'appel est recalculé et le gérant est invité à prévenir le locataire", async () => {
    await db.query("reset role");
    await db.query("update public.appels_loyer set email_envoye_at=now() where bail_id=$1 and periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    expect(await appel(mois)).toMatchObject({ montant_du: (await attendu25()).total, prorata: true });
    await db.query("reset role");
    const { rows } = await db.query("select criticite::text, titre, origine_id from public.alerts where organization_id=$1 and type='avis_echeance_recalcule'", [org]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ criticite: "informative", origine_id: bail });
    expect(rows[0].titre).toContain(`envoyé pour 500,00\u00a0€`);
    expect(rows[0].titre).toContain(`maintenant de ${(await attendu25()).total.replace(".", ",")}\u00a0€`);
    // Seconde relecture du 28/10 : l'annulation ramène le terme au montant de l'avis ENVOYÉ, l'alerte n'a plus d'objet.
    await agir(compte);
    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    await db.query("reset role");
    const apres = await db.query("select statut::text, closed_action from public.alerts where organization_id=$1 and type='avis_echeance_recalcule'", [org]);
    expect(apres.rows).toEqual([{ statut: "fermee", closed_action: "Montant revenu à celui de l’avis envoyé" }]);
  });

  it("avis envoyé, puis deux recalculs successifs : l'alerte garde le montant de l'avis envoyé", async () => {
    await db.query("reset role");
    await db.query("update public.appels_loyer set email_envoye_at=now() where bail_id=$1 and periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    // Préavis modifié : fin le 10 au lieu du 25 (403,22 → ~161 €) ; l'avis envoyé portait toujours 500 €.
    await db.query("reset role");
    await db.query("update public.baux set date_fin=($1::date + 9) where id=$2", [mois, bail]);
    await db.query("select public.ajuster_appel_fin_de_bail($1, ($2::date + 24))", [bail, mois]);
    const { rows } = await db.query("select titre, details->>'montant_envoye' envoye from public.alerts where organization_id=$1 and type='avis_echeance_recalcule' and statut='ouverte'", [org]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].envoye)).toBe(500);
    expect(rows[0].titre).toContain("envoyé pour 500,00\u00a0€");
  });

  it.each([
    ["datée du 20 (ou du jour, s'il précède)", "least($2::date + 19, public.aujourdhui_paris())"],
    ["datée du 1er", "$2::date"],
  ])("appel émis à 450 + 50, révision %s, congé fin au 25 puis annulation : 500,00 € et rien de dû", async (_libelle, dateRevision) => {
    // Seconde relecture du 28/10 (R1, R2) : la révision ne touche pas l'appel déjà émis ; elle ne doit pas le refacturer.
    await db.query(`select public.reviser_loyer($1,150,'T2 2026',${dateRevision})`, [bail, mois]);
    await conge();
    expect(await appel(mois)).toMatchObject({ montant_du: (await attendu25()).total, prorata: true });
    await db.query("select public.annuler_conge($1,'Le locataire reste')", [bail]);
    expect(await appel(mois)).toEqual({ loyer_hc: "450.00", charges: "50.00", montant_du: "500.00", prorata: false });
    await db.query("reset role");
    expect((await db.query("select statut from public.etat_loyers_bail_brut($1) where periode=$2", [bail, mois])).rows[0].statut).toBe("paye");
    expect(Number((await db.query("select impayes from public.montants_reels_bail($1)", [bail])).rows[0].impayes)).toBe(0);
  });

  it("appel né au prorata au loyer 450, révision dans le mois, puis annulation : 500,00 €", async () => {
    // Seconde relecture du 28/10 (R3) : la base mémorisée à l'émission du prorata est celle du bail à ce moment-là.
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST retour avant le cycle') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await db.query("delete from public.appels_loyer where bail_id=$1 and periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    await db.query("select public.generer_appels_loyer($1)", [bail]);
    expect(await appel(mois)).toMatchObject({ montant_du: (await attendu25()).total, prorata: true });
    await db.query("reset role");
    expect((await db.query("select base_loyer_hc::float8 l, base_charges::float8 c from public.appels_loyer where bail_id=$1 and periode=$2", [bail, mois])).rows[0]).toEqual({ l: 450, c: 50 });
    await agir(compte);
    await db.query("select public.reviser_loyer($1,150,'T2 2026',least($2::date + 19, public.aujourdhui_paris()))", [bail, mois]);
    await db.query("select public.annuler_conge($1,'Le locataire reste')", [bail]);
    expect(await appel(mois)).toEqual({ loyer_hc: "450.00", charges: "50.00", montant_du: "500.00", prorata: false });
  });

  it("congé tardif, reçu déjà envoyé sur le terme suivant : le document est recomposé comme l'écran du bail, une alerte le suit jusqu'au renvoi", async () => {
    // Seconde relecture du 28/10 (R5), voie décidée : rien n'est remis en l'état. Le terme courant a été réglé 300 € et
    // son reçu est parti ; le congé tardif (fin le 25 du mois précédent) réduit le mois précédent, l'excédent couvre le terme
    // courant.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST paiement partiel') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,300,$3,'virement')", [org, bail, mois]);
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    expect(await quittance(mois)).toMatchObject([{ est_quittance: false, montant: "300.00" }]);
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);

    // Le document tel que la page, le PDF et l'espace locataire le recomposent (assemblerQuittance) : mêmes lectures.
    const documentEtEcran = async () => {
      await db.query("reset role");
      const q = (await db.query("select q.est_quittance, q.montant::numeric m, q.email_envoye_at, a.id appel, a.montant_du::numeric du from public.quittances q join public.appels_loyer a on a.id=q.appel_id where a.bail_id=$1 and a.periode=$2", [bail, mois])).rows[0];
      const appels = (await db.query("select id, periode::text, montant_du::numeric montant_du from public.appels_loyer where bail_id=$1", [bail])).rows;
      const versements = (await db.query("select date_paiement::text, mode, montant::numeric montant, created_at::text from public.encaissements where bail_id=$1", [bail])).rows;
      const ecran = (await db.query("select montant_du::numeric du, montant_couvert::numeric couvert, statut from public.etat_loyers_bail($1) where periode=$2", [bail, mois])).rows[0];
      await agir(compte);
      const listes = versementsDuTerme(appels.map((a) => ({ ...a, montant_du: Number(a.montant_du) })),
        versements.map((v) => ({ ...v, montant: Number(v.montant) })), q.appel);
      return {
        document: { montant: Number(q.m), versements: Math.round(listes.reduce((t, v) => t + v.montant, 0) * 100) / 100, solde: Math.round((Number(q.du) - Number(q.m)) * 100) / 100, envoye: q.email_envoye_at !== null },
        ecran: { couvert: Number(ecran.couvert), reste: Math.round((Number(ecran.du) - Number(ecran.couvert)) * 100) / 100 },
      };
    };
    const apresConge = await documentEtEcran();
    expect(apresConge.document.montant).toBeGreaterThan(300);
    expect(apresConge.document).toEqual({ montant: apresConge.ecran.couvert, versements: apresConge.ecran.couvert, solde: apresConge.ecran.reste, envoye: false });
    const [alerte] = await alertes("document_envoye_remplace");
    const nouveau = apresConge.document.montant.toFixed(2).replace(".", ",");
    expect(alerte).toMatchObject({ statut: "ouverte", origine_id: bail });
    expect(alerte.titre).toMatch(new RegExp(`^Le reçu (d’|de ).+ envoyé le \\d{2}/\\d{2}/\\d{4} pour 300,00\u00a0€ est remplacé par un reçu de ${nouveau}\u00a0€ — `));
    expect(alerte.titre).toContain("envoyez le nouveau document au locataire");
    expect(await appel(precedent)).toMatchObject({ prorata: true });

    // Le locataire règle le solde : le déclencheur des encaissements réécrit le document, l'alerte suit (quittance de 500 €).
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,$3,$4,'virement')", [org, bail, apresConge.ecran.reste, jour]);
    await agir(compte);
    const solde = await documentEtEcran();
    expect(solde.document).toEqual({ montant: 500, versements: 500, solde: 0, envoye: false });
    expect((await alertes("document_envoye_remplace"))[0].titre).toContain("est remplacé par une quittance de 500,00\u00a0€");

    // Le gérant envoie la quittance à jour : l'alerte n'a plus d'objet.
    await db.query("reset role");
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    expect(await alertes("document_envoye_remplace")).toMatchObject([{ statut: "fermee", closed_action: "Document à jour envoyé au locataire" }]);
  });

  it("annulation qui retire la couverture d'un document envoyé : il est retiré, l'alerte le dit, puis se ferme s'il revient à l'identique", async () => {
    // Le mois précédent est né au prorata (fin le 25), réglé de son seul prorata ; le terme courant, réglé 500 €, a sa
    // quittance envoyée. La rétractation remet le mois précédent à 500 € : l'imputation ne couvre plus tout le terme courant.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST règlement du prorata') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2::date and e.date_paiement<$3::date", [bail, precedent, mois]);
    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      select $1,$2,a.montant_du,a.date_echeance,'virement' from public.appels_loyer a where a.bail_id=$2 and a.periode=$3::date`, [org, bail, precedent]);
    await db.query("select * from public.resynchroniser_quittances($1)", [bail]);
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    expect(await appel(precedent)).toMatchObject({ montant_du: "500.00", prorata: false });
    // Comme sur main : le document suit l'imputation (reçu du montant couvert, à renvoyer).
    const [q] = await quittance(mois);
    expect(q).toMatchObject({ est_quittance: false, email_envoye_at: null });
    const [alerte] = (await alertes("document_envoye_remplace")).filter((a) => a.statut === "ouverte");
    expect(alerte.titre).toMatch(/^La quittance (d’|de ).+ envoyée le .+ pour 500,00 € est remplacée par un reçu de /);
    // Un nouveau congé identique rend la quittance de 500 € : l'alerte n'a plus d'objet.
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    expect(await quittance(mois)).toMatchObject([{ est_quittance: true, montant: "500.00" }]);
    expect(await alertes("document_envoye_remplace")).toMatchObject([{ statut: "fermee", closed_action: "Document revenu à celui envoyé au locataire" }]);
  });

  it("COD-03 : une écriture héritée à millièmes reste annulable (la contre-écriture recopie son montant)", async () => {
    await db.query("reset role");
    await db.query("alter table public.encaissements drop constraint encaissements_montant_centime_check");
    await db.query("alter table public.ecritures drop constraint ecritures_montant_centime_check");
    const id = (await db.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,100.005,$3,'virement') returning id", [org, bail, jour])).rows[0].id;
    await db.query(readFileSync(`supabase/migrations/${NOM}.sql`, "utf8"));
    expect((await db.query("select convalidated v from pg_constraint where conname='ecritures_montant_centime_check'")).rows[0].v).toBe(false);
    await agir(compte);
    await db.query("select public.supprimer_encaissement($1,'TEST encaissement erroné')", [id]);
    await db.query("reset role");
    expect((await db.query("select count(*)::int n from public.ecritures where contre_ecriture_de is not null and montant=100.005 and organization_id=$1", [org])).rows[0].n).toBe(1);
  });

  it("l'alerte d'impayé déjà ouverte suit le nouveau dû du dernier terme", async () => {
    // Le mois courant n'est pas réglé et son échéance est passée : la nuit a posé l'alerte.
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST terme impayé') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await db.query("update public.appels_loyer set date_echeance=public.aujourdhui_paris()-1 where bail_id=$1 and periode=$2", [bail, mois]);
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    await agir(compte);
    await conge();
    await db.query("reset role");
    const { rows } = await db.query("select titre from public.alerts where organization_id=$1 and type='loyer_impaye' and statut='ouverte'", [org]);
    expect(rows).toHaveLength(1);
    expect(rows[0].titre).toContain(`${(await attendu25()).total.replace(".", ",")} €`);
  });

  it("COD-03 : le dépôt refuse les millièmes, en fonction comme en table ; le centime passe", async () => {
    await db.query("savepoint depot");
    await expect(db.query("select public.encaisser_depot($1,10.005,$2,'virement')", [bail, jour])).rejects.toThrow(/au centime près/);
    await db.query("rollback to savepoint depot");
    expect(Number((await db.query("select public.encaisser_depot($1,10.5,$2,'virement') c", [bail, jour])).rows[0].c)).toBe(10.5);
    expect(Number((await db.query("select public.encaisser_depot($1,10,$2,'virement') c", [bail, jour])).rows[0].c)).toBe(20.5);
    await db.query("reset role");
    // Un client qui contournerait la fonction bute sur la table.
    for (const [table, insertion] of [
      ["depot_encaissements", "insert into public.depot_encaissements(organization_id,bail_id,montant,date_encaissement,moyen) values($1,$2,1.005,$3,'virement')"],
      ["ecritures", "insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle) values($1,$2,$4,'travaux','depense',1.005,$3,$3,'TEST')"],
    ] as const) {
      await db.query("savepoint centime");
      await expect(db.query(insertion, table === "ecritures" ? [org, bail, jour, lot] : [org, bail, jour]), table).rejects.toThrow(/centime_check/);
      await db.query("rollback to savepoint centime");
    }
    const contraintes = (await db.query(`select conrelid::regclass::text t, convalidated v from pg_constraint where conname in
      ('depot_encaissements_montant_centime_check','retenues_montant_retenu_centime_check','appel_charges_postes_montant_centime_check','ecritures_montant_centime_check') order by 1`)).rows;
    expect(contraintes).toEqual([
      { t: "appel_charges_postes", v: true }, { t: "depot_encaissements", v: true }, { t: "ecritures", v: true }, { t: "retenues", v: true },
    ]);
  });

  it("rejeu de la migration sans effet ; son retour rend les définitions d'avant ; la marche avant repart", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    const etat = async () => (await db.query(`select
        to_regprocedure('public.ajuster_appel_fin_de_bail(uuid,date)') is not null
          and exists (select 1 from pg_trigger where tgname in ('appel_loyer_base_mensuelle','quittance_suit_document_remplace') having count(*) = 2) ajuster,
        pg_get_functiondef('public.enregistrer_conge(uuid,public.conge_par,date,smallint,text,uuid,numeric,text)'::regprocedure) like '%ajuster_appel_fin_de_bail%' conge,
        pg_get_functiondef('public.annuler_conge(uuid,text)'::regprocedure) like '%ajuster_appel_fin_de_bail%' annulation,
        pg_get_functiondef('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)'::regprocedure) like '%au centime près%' depot,
        (select count(*)::int from pg_constraint where conname like '%\\_centime\\_check' and conrelid <> 'public.encaissements'::regclass) contraintes`)).rows[0];
    expect(await etat()).toEqual({ ajuster: true, conge: true, annulation: true, depot: true, contraintes: 4 });
    await db.query(migration);
    expect(await etat()).toEqual({ ajuster: true, conge: true, annulation: true, depot: true, contraintes: 4 });
    await db.query(retour);
    expect(await etat()).toEqual({ ajuster: false, conge: false, annulation: false, depot: false, contraintes: 0 });
    await db.query(migration);
    expect(await etat()).toEqual({ ajuster: true, conge: true, annulation: true, depot: true, contraintes: 4 });
  });
});
