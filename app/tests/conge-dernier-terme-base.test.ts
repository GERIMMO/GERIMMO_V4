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
import { recapitulatifFiscal, type ComposantesFiscales, type EcritureFiscale } from "@/lib/fiscal";

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
    // Quatrième relecture : etat_loyers_bail_brut cite aujourdhui_paris() ; le retour ouvre la chaîne « Ordre complet »,
    // derrière le seul retour plus récent (20261028100200, loyers et écrans), ordre inverse du manifeste, comme le prévoit
    // la consigne d'intégration du chantier (fix-loyers_calculs/rapport.json, « integration », point 4).
    expect(lisezMoi).toMatch(/Ordre complet si tout doit être défait :\s*(?:`20261028100200`[^\n]*?, puis )?`20261028100100`/);
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
    // Quatrième relecture du 28/10 : non dû, une seule source de vérité (etat_loyers_bail_brut) : 0 dû, aucun règlement
    // imputé, la quittance du terme (payé avant le congé) est retirée ; ce qui a été versé est en trop-perçu.
    expect(alerte.titre).toContain("500,00\u00a0€ non dus, ne les réclamez pas");
    await db.query("reset role");
    expect((await db.query("select montant_du::float8 du, montant_couvert::float8 couvert, statut from public.etat_loyers_bail_brut($1) where periode=$2", [bail, mois])).rows[0])
      .toEqual({ du: 0, couvert: 0, statut: "non_du" });
    expect(Number((await db.query("select trop_percu from public.montants_reels_bail($1)", [bail])).rows[0].trop_percu)).toBe(Number((1000 - Number(total)).toFixed(2)));
    await agir(compte);
    expect(await quittance(mois)).toEqual([]);
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

  it("congé tardif, reçu déjà envoyé sur le terme qui suit la fin : non dû partout (échéancier, relances, décompte), le reçu retiré est signalé", async () => {
    // Quatrième relecture du 28/10 : la relance automatique réclamait ce terme alors que l'alerte disait « ne le réclamez
    // pas ». Le terme courant a été réglé 300 € et son reçu est parti ; relances automatiques activées.
    await db.query("reset role");
    await db.query("update public.organizations set relances_envoi_auto=true where id=$1", [org]);
    await db.query("update public.persons set email='locataire-test@example.invalid' where id=(select locataire_principal from public.baux where id=$1)", [bail]);
    await db.query("select public.supprimer_encaissement(e.id,'TEST paiement partiel') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    // Échu depuis 30 jours, au-delà des délais de relance de l'espace.
    await db.query("update public.appels_loyer set date_echeance=public.aujourdhui_paris()-30 where bail_id=$1 and periode=$2", [bail, mois]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,300,$3,'virement')", [org, bail, mois]);
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    // Avant le congé, le terme est bien relancé (contrôle du montage).
    expect((await db.query("select count(*)::int n from public.relances_loyer_dues(500) where bail_id=$1", [bail])).rows[0].n).toBe(1);
    await agir(compte);
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    const du = Number((await appel(precedent)).montant_du);

    await db.query("reset role");
    // Échéancier : non dû, rien d'imputé ; aucune relance (ni niveau 1 ni niveau 2) ; aucune alerte d'impayé.
    expect((await db.query("select montant_du::float8 du, montant_couvert::float8 couvert, statut from public.etat_loyers_bail_brut($1) where periode=$2", [bail, mois])).rows[0])
      .toEqual({ du: 0, couvert: 0, statut: "non_du" });
    expect((await db.query("select count(*)::int n from public.relances_loyer_dues(500) where bail_id=$1", [bail])).rows[0].n).toBe(0);
    await db.query("insert into public.relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,'relance_1',public.aujourdhui_paris()-20)", [org, bail]);
    expect((await db.query("select count(*)::int n from public.relances_loyer_dues(500) where bail_id=$1", [bail])).rows[0].n).toBe(0);
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1 and type='loyer_impaye' and statut='ouverte'", [org])).rows[0].n).toBe(0);
    // Écran et décompte disent la même chose : rien dû, l'excédent versé est un trop-perçu.
    const ecran = (await db.query(`select coalesce(sum(montant_du),0)::numeric - (select coalesce(sum(montant),0) from public.encaissements where bail_id=$1) solde
      from public.etat_loyers_bail_brut($1)`, [bail])).rows[0];
    const decompte = (await db.query("select impayes::numeric, trop_percu::numeric from public.montants_reels_bail($1)", [bail])).rows[0];
    expect(Number(decompte.impayes)).toBe(0);
    expect(Number(decompte.trop_percu)).toBe(Number((300 + 500 - du).toFixed(2)));
    expect(-Number(ecran.solde)).toBe(Number(decompte.trop_percu));
    await agir(compte);
    // Le reçu envoyé n'est plus couvert : retiré, le gérant le sait.
    expect(await quittance(mois)).toEqual([]);
    const [alerte] = (await alertes("document_envoye_remplace")).filter((a) => a.statut === "ouverte");
    expect(alerte.titre).toMatch(/^Le reçu (d’|de ).+ envoyé le \d{2}\/\d{2}\/\d{4} pour 300,00\u00a0€ n’est plus couvert par les règlements — /);
    expect((await alertes()).find((a) => a.motif === "appel_apres_fin")?.titre).toContain("non dus, ne les réclamez pas");
  });

  it("quittance envoyée retirée par un congé tardif, puis annulation après un règlement corrigé : le nouveau reçu est recomposé comme l'écran et signalé", async () => {
    // Tout est réglé, la quittance du terme courant (500 €) est partie. Le congé tardif rend ce terme non dû : la quittance
    // est retirée. Le règlement du mois précédent est ramené à son prorata, puis le locataire se rétracte : le terme
    // courant redevient dû et n'est couvert qu'en partie. Voie (a) : le document est recomposé, l'alerte le dit.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("reset role");
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    expect(await quittance(mois)).toEqual([]);
    expect((await alertes("document_envoye_remplace"))[0].titre).toMatch(/^La quittance (d’|de ).+ envoyée le .+ pour 500,00\u00a0€ n’est plus couverte par les règlements/);
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST règlement du prorata') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2::date and e.date_paiement<$3::date", [bail, precedent, mois]);
    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      select $1,$2,a.montant_du,a.date_echeance,'virement' from public.appels_loyer a where a.bail_id=$2 and a.periode=$3::date`, [org, bail, precedent]);
    await agir(compte);
    const prorata = Number((await appel(precedent)).montant_du);
    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    expect(await appel(precedent)).toMatchObject({ montant_du: "500.00", prorata: false });
    // Le document tel que la page, le PDF et l'espace locataire le recomposent (assemblerQuittance) : mêmes lectures.
    await db.query("reset role");
    const q = (await db.query("select q.est_quittance, q.montant::numeric m, q.email_envoye_at, a.id appel, a.montant_du::numeric du from public.quittances q join public.appels_loyer a on a.id=q.appel_id where a.bail_id=$1 and a.periode=$2", [bail, mois])).rows[0];
    const appels = (await db.query("select id, periode::text, montant_du::numeric montant_du from public.appels_loyer where bail_id=$1", [bail])).rows;
    const versements = (await db.query("select date_paiement::text, mode, montant::numeric montant, created_at::text from public.encaissements where bail_id=$1", [bail])).rows;
    const ecran = (await db.query("select montant_du::numeric du, montant_couvert::numeric couvert from public.etat_loyers_bail_brut($1) where periode=$2", [bail, mois])).rows[0];
    await agir(compte);
    const listes = versementsDuTerme(appels.map((a) => ({ ...a, montant_du: Number(a.montant_du) })),
      versements.map((v) => ({ ...v, montant: Number(v.montant) })), q.appel);
    expect({ est_quittance: q.est_quittance, montant: Number(q.m), envoye: q.email_envoye_at !== null }).toEqual({ est_quittance: false, montant: prorata, envoye: false });
    expect(Math.round(listes.reduce((t, v) => t + v.montant, 0) * 100) / 100).toBe(Number(ecran.couvert));
    expect(Math.round((Number(q.du) - Number(q.m)) * 100) / 100).toBe(Math.round((Number(ecran.du) - Number(ecran.couvert)) * 100) / 100);
    const [alerte] = (await alertes("document_envoye_remplace")).filter((a) => a.statut === "ouverte");
    expect(alerte.titre).toMatch(/^La quittance (d’|de ).+ envoyée le .+ pour 500,00\u00a0€ est remplacée par un reçu de /);
    // Le locataire règle le solde : la quittance de 500 € redevient celle qu'il a reçue ; marque d'envoi rendue.
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,$3,$4,'virement')", [org, bail, (500 - prorata).toFixed(2), jour]);
    await agir(compte);
    expect(await quittance(mois)).toMatchObject([{ est_quittance: true, montant: "500.00" }]);
    expect((await quittance(mois))[0].email_envoye_at).not.toBeNull();
    const [fermee] = await alertes("document_envoye_remplace");
    expect(fermee).toMatchObject({ statut: "fermee", closed_action: "Document revenu à celui envoyé au locataire" });
    expect(fermee.titre).toContain("est revenue à l’identique du document envoyé");
  });

  it("reçu envoyé, congé tardif puis annulation : le reçu redevenu identique reprend sa marque d'envoi ; un second congé rouvre une alerte", async () => {
    // Troisième relecture du 28/10 (N2) : sans la marque, le gérant voyait « Envoyer le reçu » et le remplacement suivant
    // passait sans alerte.
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST paiement partiel') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,300,$3,'virement')", [org, bail, mois]);
    const envoi = (await db.query("update public.quittances q set email_envoye_at=now() - interval '3 days' from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2 returning q.email_envoye_at::text e, q.date_emission::text d", [bail, mois])).rows[0];
    await agir(compte);
    const congeTardif = () => db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    const etatEnvoi = async () => {
      await db.query("reset role");
      const r = (await db.query("select q.est_quittance, q.montant::text, q.email_envoye_at::text e, q.date_emission::text d from public.quittances q join public.appels_loyer a on a.id=q.appel_id where a.bail_id=$1 and a.periode=$2", [bail, mois])).rows[0];
      await agir(compte);
      return r;
    };
    const ouvertes = async () => (await alertes("document_envoye_remplace")).filter((a) => a.statut === "ouverte");

    // Le terme qui suit la fin n'est pas dû (quatrième relecture) : le reçu est retiré, l'alerte le dit.
    await congeTardif();
    expect(await etatEnvoi()).toBeUndefined();
    expect(await ouvertes()).toHaveLength(1);

    await db.query("select public.annuler_conge($1,'TEST rétractation')", [bail]);
    // Revenu à l'identique : marque d'envoi et date d'émission d'origine, aucune alerte ouverte.
    expect(await etatEnvoi()).toEqual({ est_quittance: false, montant: "300.00", e: envoi.e, d: envoi.d });
    expect(await ouvertes()).toHaveLength(0);
    expect((await alertes("document_envoye_remplace"))[0]).toMatchObject({ statut: "fermee", closed_action: "Document revenu à celui envoyé au locataire" });

    await congeTardif();
    expect(await etatEnvoi()).toBeUndefined();
    const [nouvelle] = await ouvertes();
    expect(nouvelle.titre).toContain("pour 300,00\u00a0€ n’est plus couvert par les règlements");
    expect((await alertes("document_envoye_remplace")).filter((a) => a.statut === "fermee")[0].titre).toContain("est revenu à l’identique du document envoyé");
  });

  it("décompte de sortie (D1) : le terme appelé après la fin ne compte pas ; non payé, l'alerte dit de ne pas le réclamer", async () => {
    // Troisième relecture du 28/10 : avant, ce terme (500 €) était retenu sur le dépôt.
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST impayé') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, precedent]);
    await agir(compte);
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    const du = (await appel(precedent)).montant_du;
    await db.query("reset role");
    expect((await db.query("select impayes::text, trop_percu::text from public.montants_reels_bail($1)", [bail])).rows[0]).toEqual({ impayes: du, trop_percu: "0.00" });
    await agir(compte);
    const [alerte] = (await alertes()).filter((a) => a.motif === "appel_apres_fin");
    expect(alerte.titre).toContain("500,00\u00a0€ non dus, ne les réclamez pas");
    expect(alerte.consigne).toContain("il n’est pas dû (500,00\u00a0€ appelés), ne le réclamez pas");
    // L'échéancier dit la même chose que le décompte (avant : octobre « partiel », reste dû affiché).
    await db.query("reset role");
    expect((await db.query("select statut from public.etat_loyers_bail_brut($1) where periode=$2", [bail, mois])).rows[0].statut).toBe("non_du");
    await agir(compte);
    // Le locataire avait tout réglé (2 000 € sur quatre mois) : le trop versé lui revient au décompte.
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,500,$3,'virement')", [org, bail, precedent]);
    const attendu = (500 - Number(du)).toFixed(2);
    expect((await db.query("select impayes::text, trop_percu::text from public.montants_reels_bail($1)", [bail])).rows[0]).toEqual({ impayes: "0.00", trop_percu: attendu });
  });

  it("décompte de sortie (D2) : quittance de 500 € déjà envoyée pour un dernier terme dû au prorata : le trop-perçu revient au locataire", async () => {
    await db.query("reset role");
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    await agir(compte);
    await conge();
    expect(await appel(mois)).toMatchObject({ montant_du: "500.00" });
    const total = (await attendu25()).total;
    await db.query("reset role");
    expect((await db.query("select impayes::text, trop_percu::text from public.montants_reels_bail($1)", [bail])).rows[0])
      .toEqual({ impayes: "0.00", trop_percu: (500 - Number(total)).toFixed(2) });
    await agir(compte);
    expect((await alertes())[0].consigne).toContain(`Le décompte de sortie ne retient que les ${total.replace(".", ",")}\u00a0€ dus.`);
  });

  it("un document envoyé retiré hors de tout congé (règlement retiré) est signalé, puis l'alerte se ferme s'il revient", async () => {
    // Quatrième relecture du 28/10 : une resynchronisation qui SUPPRIME un document déjà envoyé (encaissement retiré,
    // terme devenu non dû) le faisait en silence.
    await db.query("reset role");
    await db.query("update public.quittances q set email_envoye_at=now() from public.appels_loyer a where a.id=q.appel_id and a.bail_id=$1 and a.periode=$2", [bail, mois]);
    const enc = (await db.query("select e.id, e.montant::text m, e.date_paiement::text d from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois])).rows[0];
    await db.query("select public.supprimer_encaissement($1,'TEST règlement retiré')", [enc.id]);
    await agir(compte);
    expect(await quittance(mois)).toEqual([]);
    const [alerte] = (await alertes("document_envoye_remplace")).filter((a) => a.statut === "ouverte");
    expect(alerte.titre).toMatch(/^La quittance (d’|de ).+ envoyée le .+ pour 500,00\u00a0€ n’est plus couverte par les règlements/);
    // Le règlement est ressaisi : la quittance redevient celle qui a été envoyée, marque d'envoi rendue, alerte fermée.
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,$3,$4,'virement')", [org, bail, enc.m, enc.d]);
    await agir(compte);
    expect((await quittance(mois))[0]).toMatchObject({ est_quittance: true, montant: "500.00" });
    expect((await quittance(mois))[0].email_envoye_at).not.toBeNull();
    expect(await alertes("document_envoye_remplace")).toMatchObject([{ statut: "fermee", closed_action: "Document revenu à celui envoyé au locataire" }]);
  });

  // Sixième relecture du 28/10 : la ligne 211 suit le loyer DÛ. Le récapitulatif est calculé par recapitulatifFiscal sur
  // les écritures et les composantes conservées en base, comme l'écran et le PDF de la 2044.
  async function ligne211(annee: number) {
    await db.query("reset role");
    const ecritures = (await db.query("select id, categorie, sens, montant::float8 montant, date_piece::text, contre_ecriture_de, lot_id, bail_id, encaissement_id, libelle from public.ecritures where bail_id=$1", [bail])).rows as EcritureFiscale[];
    const composantes = (await db.query("select c.ecriture_id, c.loyer_hc::float8 loyer_hc, c.charges::float8 charges, c.non_ventile::float8 non_ventile from public.fiscal_encaissements_composantes c join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1", [bail])).rows as ComposantesFiscales[];
    await agir(compte);
    const r = recapitulatifFiscal(ecritures, annee, { composantes: new Map(composantes.map((c) => [c.ecriture_id, c])) });
    return { l211: r.rubriques.find((x) => x.code === "211")!.montant, aQualifier: r.aQualifier };
  }
  const restituer = async () => {
    const r = (await db.query("select public.demarrer_restitution($1, public.aujourdhui_paris(), true) r", [bail])).rows[0].r;
    return Number((await db.query("select public.finaliser_decompte($1) s", [r])).rows[0].s);
  };

  it("fiscalité (F1) : terme payé au loyer appelé puis congé : la restitution retranche de la 211 le loyer rendu, sans réécrire les captures", async () => {
    const annee = Number(jour.slice(0, 4));
    // Tout est payé, mois courant compris (500 €) ; le congé ramène le mois courant à 25 jours.
    const avant = await ligne211(annee);
    await db.query("reset role");
    const capturesAvant = (await db.query("select c.ecriture_id, c.loyer_hc::text, c.charges::text from public.fiscal_encaissements_composantes c join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1 order by 1", [bail])).rows;
    await agir(compte);
    await conge();
    expect((await ligne211(annee)).l211).toBe(avant.l211);
    const rendu = await restituer();
    const a = await attendu25();
    expect(rendu).toBeCloseTo(500 - Number(a.total), 2);
    await db.query("reset role");
    const correction = (await db.query(`select c.loyer_hc::float8 hc, c.charges::float8 ch, c.non_ventile::float8 nv from public.fiscal_encaissements_composantes c
      join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1 and x.categorie='trop_percu_restitue'`, [bail])).rows[0];
    expect(correction).toEqual({ hc: Number((450 - Number(a.loyer)).toFixed(2)), ch: Number((50 - Number(a.charges)).toFixed(2)), nv: 0 });
    // Aucune capture antérieure n'est réécrite.
    expect((await db.query("select c.ecriture_id, c.loyer_hc::text, c.charges::text from public.fiscal_encaissements_composantes c join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1 and x.categorie='loyer' order by 1", [bail])).rows).toEqual(capturesAvant);
    await agir(compte);
    // Payé et rendu la même année : 211 = loyer HT dû des paiements de l'année.
    expect((await ligne211(annee)).l211).toBeCloseTo(avant.l211 - (450 - Number(a.loyer)), 2);
  });

  it("fiscalité (F2) : terme non dû payé après un congé tardif : non ventilé à l'encaissement ; la restitution retranche le reste", async () => {
    const annee = Number(jour.slice(0, 4));
    const precedent = (await db.query("select ($1::date - interval '1 month')::date::text m", [mois])).rows[0].m;
    // Le mois courant n'est pas encore payé ; congé tardif (fin le 25 du mois précédent, déjà payé 500 €).
    await db.query("reset role");
    await db.query("select public.supprimer_encaissement(e.id,'TEST pas encore payé') from public.encaissements e where e.bail_id=$1 and e.date_paiement>=$2", [bail, mois]);
    await agir(compte);
    await db.query("select public.enregistrer_conge($1,'locataire',($2::date - interval '2 months' + interval '24 days')::date,1::smallint)", [bail, mois]);
    // Le locataire paie ensuite le terme non dû : rien n'en est ventilé en loyer.
    await db.query("reset role");
    const enc = (await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,500,$3,'virement') returning id", [org, bail, jour])).rows[0].id;
    expect((await db.query("select c.loyer_hc::float8 hc, c.non_ventile::float8 nv from public.fiscal_encaissements_composantes c join public.ecritures x on x.id=c.ecriture_id where x.encaissement_id=$1 and x.contre_ecriture_de is null", [enc])).rows[0]).toEqual({ hc: 0, nv: 500 });
    await agir(compte);
    const du = Number((await appel(precedent)).montant_du);
    const rendu = await restituer();
    expect(rendu).toBeCloseTo(500 + 500 - du, 2);
    await db.query("reset role");
    const jours = (await db.query("select extract(day from ($1::date + interval '1 month - 1 day'))::int j", [precedent])).rows[0].j;
    const htPrecedent = Number((await db.query("select round(450.0*25/$1::int,2)::float8 l", [jours])).rows[0].l);
    const correction = (await db.query(`select c.loyer_hc::float8 hc, c.non_ventile::float8 nv from public.fiscal_encaissements_composantes c
      join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1 and x.categorie='trop_percu_restitue'`, [bail])).rows[0];
    expect(correction).toEqual({ hc: Number((450 - htPrecedent).toFixed(2)), nv: 500 });
    await agir(compte);
  });

  it("fiscalité : un trop-perçu ordinaire (versement en plus, rien de ventilé en trop) reste inchangé", async () => {
    const annee = Number(jour.slice(0, 4));
    await db.query("reset role");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,100,$3,'virement')", [org, bail, jour]);
    await agir(compte);
    const avant = await ligne211(annee);
    // Congé présenté le 1er du mois : fin le 1er du mois suivant, aucun terme appelé n'est recalculé ni rendu non dû.
    await db.query("select public.enregistrer_conge($1,'locataire',$2::date,1::smallint)", [bail, mois]);
    const rendu = await restituer();
    expect(rendu).toBe(100);
    await db.query("reset role");
    expect((await db.query("select count(*)::int n from public.fiscal_encaissements_composantes c join public.ecritures x on x.id=c.ecriture_id where x.bail_id=$1 and x.categorie='trop_percu_restitue'", [bail])).rows[0].n).toBe(0);
    await agir(compte);
    const apres = await ligne211(annee);
    expect(apres.l211).toBe(avant.l211);
    expect(apres.aQualifier).toBe(avant.aQualifier + 100);
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
    // Intégration avec 20261028100200 (LOY-11, validé : fix-loyers_ecrans) : le titre écrit le montant par montant_fr, à
    // la française (espace insécable avant « € », espace fine des milliers) — même montant, écrit par la même fonction.
    const ecrit = (await db.query("select public.montant_fr($1::numeric) m", [(await attendu25()).total])).rows[0].m as string;
    expect(ecrit).toBe(`${(await attendu25()).total.replace(".", ",")}\u00a0€`);
    expect(rows[0].titre).toContain(`: ${ecrit} dus depuis le `);
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
