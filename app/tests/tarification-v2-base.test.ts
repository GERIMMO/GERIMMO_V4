/** Nouvelle grille : base isolée, transactions annulées, aucun appel Stripe. */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Tarification v2 — droits, consentements et volumes", () => {
  let db: Client;
  let org: string;
  let acteur: string;
  async function compte() {
    const { rows } = await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','tarif-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
    return rows[0].id as string;
  }
  async function devenir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
    await db.query("set local role authenticated");
  }
  async function refus(sql: string, args: unknown[] = []) {
    await db.query("savepoint tentative");
    try { await db.query(sql, args); await db.query("release savepoint tentative"); return ""; }
    catch (e) { await db.query("rollback to savepoint tentative"); return (e as Error).message; }
  }
  async function bien(nom = "Logement", type = "appartement") {
    const { rows } = await db.query(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3::public.bien_type,'1 rue Test','69001','Lyon') returning id`, [org, nom, type]);
    return rows[0].id as string;
  }
  async function lot(b: string, nom = "Logement", annexe: string | null = null) {
    const { rows } = await db.query(`insert into public.lots(organization_id,bien_id,nom,annexe_du_lot_id) values($1,$2,$3,$4) returning id`, [org, b, nom, annexe]);
    return rows[0].id as string;
  }
  async function volume() { return Number((await db.query("select public.abonnement_volume_v2($1) as n", [org])).rows[0].n); }
  async function expirer() {
    await db.query("reset role");
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set essai_fin_v2=now()-interval '1 second',essai_fin=current_date-1 where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
  }
  async function contexte() {
    await devenir(acteur);
    return (await db.query("select public.lire_abonnement_v2($1) as c", [org])).rows[0].c;
  }
  async function proposition(cible: number, periodicite = "mensuel", type = "souscription") {
    await db.query("reset role");
    await db.query("select public.abonnement_v2_poser_client($1,$2)", [org, "cus_" + org.replaceAll("-", "")]);
    const c = await contexte();
    await db.query("reset role");
    const prix = (await db.query("select public.tarif_abonnement_v2($1,$2,$3) as p", [c.public_tarif, cible, periodicite])).rows[0].p;
    const snapshot = { ...prix, acteur_id: acteur, type, volume_source: c.volume_actuel, volume_cible: cible,
      total_centimes: prix.montant_centimes, taxe_centimes: 0, prorata_centimes: 0,
      revision_abonnement: c.revision_abonnement, date_effet: new Date().toISOString(),
      stripe_customer_id: c.stripe_customer_id, stripe_subscription_id: c.stripe_subscription_id,
      fiscalite: { mode: "fixture_exoneree", mention: "Cas fictif de test : taxe explicitement nulle" } };
    const { rows } = await db.query("select public.enregistrer_proposition_abonnement_v2($1,$2,$3,now()+interval '15 minutes') as id", [org, acteur, snapshot]);
    return { id: rows[0].id as string, snapshot };
  }
  async function souscrire(cible = 1, periodicite = "mensuel") {
    const p = await proposition(cible, periodicite);
    await devenir(acteur);
    await db.query("select public.consentir_proposition_abonnement_v2($1)", [p.id]);
    await db.query("reset role");
    const snapshot = { ...p.snapshot, stripe_subscription_id: "sub_" + org.replaceAll("-", ""), stripe_statut: "active",
      volume_facture: cible, periode_fin: new Date(Date.now() + 30 * 86400000).toISOString(), annulation_demandee: false, pending_update: false };
    await db.query("select public.appliquer_abonnement_v2($1,$2,$3)", [org, snapshot, "evt_" + crypto.randomUUID()]);
    await db.query("select public.finir_proposition_abonnement_v2($1,'executee')", [p.id]);
    return snapshot;
  }
  beforeAll(async () => { db = new Client({ connectionString: DB_URL }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    acteur = await compte();
    org = (await db.query("insert into public.organizations(name,type,tarification_version) values('Nouvelle grille','proprietaire_direct','2026-09-v2') returning id")).rows[0].id;
    await db.query("insert into public.memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [org, acteur]);
  });
  afterEach(async () => { await db.query("rollback"); });

  it.each([[0,599,1],[1,599,1],[2,999,3],[3,999,3],[4,1999,10],[10,1999,10],[11,2999,20],[20,2999,20],[21,3099,21],[25,3499,25]])("particulier %i biens : %i centimes, capacité %i", async (n, montant, capacite) => {
    for (const periodicite of ["mensuel", "annuel"]) {
      const p = (await db.query("select public.tarif_abonnement_v2('proprietaire_direct',$1,$2) as p", [n, periodicite])).rows[0].p;
      expect(p.montant_centimes).toBe(montant * (periodicite === "annuel" ? 10 : 1));
      expect(p.capacite).toBe(capacite);
    }
  });
  it.each([[0,3900],[10,3900],[11,4100],[20,5900],[50,11900],[51,12050],[100,19400],[200,34400],[201,34500],[300,44400],[500,64400]])("agence %i lots : %i centimes HT", async (n, montant) => {
    const p = (await db.query("select public.tarif_abonnement_v2('agence',$1,'mensuel') as p", [n])).rows[0].p;
    expect(p.montant_centimes).toBe(montant); expect(p.capacite).toBe(Math.max(10,n));
  });
  it("l'agence n'a pas d'offre annuelle", async () => {
    expect(await refus("select public.tarif_abonnement_v2('agence',20,'annuel')")).toMatch(/mensuel/);
  });
  it("un nouveau compte reçoit exactement 14 jours sans carte, puis zéro bien ne donne aucun abonnement permanent", async () => {
    const { rows: [c] } = await db.query("select tarification_version,essai_fin_v2-created_at as duree,extract(epoch from essai_fin_v2-created_at) as secondes from public.organizations where id=$1", [org]);
    expect(c.tarification_version).toBe("2026-09-v2"); expect(Number(c.secondes)).toBe(14*86400);
    expect((await contexte()).statut).toBe("sans_abonnement");
    await expirer(); expect((await contexte()).ecriture_ouverte).toBe(false);
    expect(await refus(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Refus','appartement','1 rue Test','69001','Lyon')`,[org])).toMatch(/Abonnement suspendu/);
  });
  it("l'essai accepte plusieurs logements et les droits acquis historiques sont conservés", async () => {
    for(let i=0;i<21;i++) await bien(String(i));
    expect(await volume()).toBe(21);
    const ancien = (await db.query("insert into public.organizations(tarification_version,name,type,status,essai_fin) values('historique','Ancien','proprietaire_direct','essai',current_date-1) returning id")).rows[0].id;
    expect((await db.query("select public.org_ecriture_ouverte($1) as o",[ancien])).rows[0].o).toBe(true);
  });
  it("les logements vacants et parkings séparés comptent, les annexes rattachées ne doublent pas le logement", async () => {
    const b=await bien(); const principal=await lot(b); await lot(b,"Annexe",principal);
    await lot(b,"Second logement vacant");
    const parking=await bien("Parking séparé","parking");await lot(parking);
    expect(await volume()).toBe(3);
  });
  it("refuse les cycles, le rattachement hors bien et le bail séparé d'une annexe", async () => {
    const b=await bien();const principal=await lot(b);const annexe=await lot(b,"Annexe",principal);
    expect(await refus("update public.lots set annexe_du_lot_id=$1 where id=$2",[annexe,principal])).toMatch(/circulaire/);
    const autre=await lot(await bien());
    expect(await refus("update public.lots set annexe_du_lot_id=$1 where id=$2",[principal,autre])).toMatch(/même bien/);
    expect(await refus("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance) values($1,$2,'nu','brouillon',50,0,current_date,5)",[org,annexe])).toMatch(/annexe rattachée/);
  });
  it("archiver baisse le volume seulement ; détacher ou restaurer au-delà de la capacité est refusé et réversible", async () => {
    const b=await bien();const principal=await lot(b);const annexe=await lot(b,"Annexe",principal);
    const autre=await bien("Archivé");
    await devenir(acteur);await db.query("select public.retirer_bien($1,$2)",[org,autre]);
    await db.query("reset role");await souscrire(1);await expirer();await devenir(acteur);
    expect(await refus("select public.retablir_bien($1,$2)",[org,autre])).toMatch(/capacité supplémentaire/);
    expect(await refus("select public.configurer_annexe_abonnement_v2($1,$2,null)",[org,annexe])).toMatch(/capacité supplémentaire/);
    expect((await db.query("select archived_at from public.biens where id=$1",[autre])).rows[0].archived_at).not.toBeNull();
    expect((await db.query("select annexe_du_lot_id from public.lots where id=$1",[annexe])).rows[0].annexe_du_lot_id).toBe(principal);
  });
  it("un appel direct ne peut augmenter la capacité ni passer en historique", async () => {
    await bien();await souscrire();await expirer();await devenir(acteur);
    expect(await refus("update public.organizations set tarification_version='historique' where id=$1",[org])).toMatch(/super admin/);
    expect(await refus("update public.abonnements_v2 set capacite=999 where organization_id=$1",[org])).toMatch(/permission denied/);
    expect(await refus(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Au-delà','parking','1 rue Test','69001','Lyon')`,[org])).toMatch(/capacité supplémentaire/);
  });
  it("le consentement est personnel, stable, idempotent et n'ouvre pas les droits avant Stripe", async () => {
    await bien();const p=await proposition(3);const intrus=await compte();await devenir(intrus);
    expect(await refus("select public.consentir_proposition_abonnement_v2($1)",[p.id])).toMatch(/responsable/);
    await devenir(acteur);
    const c1=(await db.query("select public.consentir_proposition_abonnement_v2($1) as p",[p.id])).rows[0].p;
    const c2=(await db.query("select public.consentir_proposition_abonnement_v2($1) as p",[p.id])).rows[0].p;
    expect(c2.consentie_le).toBe(c1.consentie_le);expect((await contexte()).capacite).toBe(0);
    await db.query("reset role");expect(await refus("update public.propositions_abonnement_v2 set snapshot=jsonb_set(snapshot,'{total_centimes}','1') where id=$1",[p.id])).toMatch(/ne se réécrit pas/);
  });
  it("refuse une proposition périmée, un portefeuille modifié et une fiscalité inconnue", async () => {
    const p=await proposition(3);await bien();await devenir(acteur);
    expect(await refus("select public.consentir_proposition_abonnement_v2($1)",[p.id])).toMatch(/portefeuille a changé/);
    await db.query("reset role");
    const c=await contexte();await db.query("reset role");
    expect(await refus("select public.enregistrer_proposition_abonnement_v2($1,$2,$3,now()-interval '1 second')",[org,acteur,{...p.snapshot,volume_source:1}])).toMatch(/validité/);
    expect(await refus("select public.enregistrer_proposition_abonnement_v2($1,$2,$3,now()+interval '10 minutes')",[org,acteur,{...p.snapshot,volume_source:1,revision_abonnement:c.revision_abonnement,taxe_centimes:null}])).toMatch(/fiscalité/);
  });
  it("deux onglets ne peuvent lancer deux souscriptions simultanées", async () => {
    const p=await proposition(1);const autre=await proposition(1);await devenir(acteur);
    await db.query("select public.consentir_proposition_abonnement_v2($1)",[p.id]);
    expect(await refus("select public.consentir_proposition_abonnement_v2($1)",[autre.id])).toMatch(/confirmation précédente/);
  });
  it("le webhook est idempotent, les annuels restent annuels, pending_update ne donne pas de capacité", async () => {
    await bien();const snapshot=await souscrire(1,"annuel");
    const larger={...snapshot,capacite:3,formule:"bailleur",volume_facture:3,montant_centimes:9990,total_centimes:9990,pending_update:true};
    expect((await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_pending') as ok",[org,larger])).rows[0].ok).toBe(true);
    expect((await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_pending') as ok",[org,larger])).rows[0].ok).toBe(false);
    const c=await contexte();expect(c.capacite).toBe(1);expect(c.periodicite).toBe("annuel");expect(c.montant_centimes).toBe(5990);
  });
  it("la résiliation garde l'accès payé, puis lecture et documents restent accessibles après échéance", async () => {
    await bien();const snapshot=await souscrire();await expirer();
    await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_cancel')",[org,{...snapshot,stripe_statut:"canceled",annulation_demandee:true}]);
    expect((await contexte()).ecriture_ouverte).toBe(true);
    await db.query("reset role");await db.query("update public.abonnements_v2 set periode_fin=now()-interval '1 second' where organization_id=$1",[org]);
    expect((await contexte()).ecriture_ouverte).toBe(false);
    expect((await db.query("select id from public.biens where organization_id=$1",[org])).rows).toHaveLength(1);
  });
  it("le nouveau barème n'entre jamais dans la synchronisation historique automatique", async () => {
    await db.query("insert into public.abonnements(organization_id,stripe_subscription_id,a_resynchroniser) values($1,'sub_historique_erreur',true)",[org]);
    expect((await db.query("select * from public.abonnements_a_synchroniser() where organization_id=$1",[org])).rows).toHaveLength(0);
  });
  it("un collaborateur ou un utilisateur extérieur ne lit pas les montants et ne consent pas", async () => {
    const autre=await compte();await db.query("insert into public.memberships(organization_id,account_id,role) values($1,$2,'agent')",[org,autre]);
    await devenir(autre);expect(await refus("select public.lire_abonnement_v2($1)",[org])).toMatch(/responsable/);
    expect(await refus("select public.abonnement_v2_poser_client($1,'cus_test')",[org])).toMatch(/permission denied/);
  });
  it("une hausse réellement confirmée donne la capacité ; une baisse programmée attend l'échéance", async () => {
    await bien();const initial=await souscrire(1);await expirer();
    const p=await proposition(3,"mensuel","augmentation");await devenir(acteur);
    await db.query("select public.consentir_proposition_abonnement_v2($1)",[p.id]);await db.query("reset role");
    const nouveau={...initial,...p.snapshot,stripe_subscription_id:initial.stripe_subscription_id,stripe_statut:"active",volume_facture:3};
    await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_upgrade')",[org,nouveau]);
    await db.query("select public.finir_proposition_abonnement_v2($1,'executee')",[p.id]);
    await bien("Deuxième logement");expect(await volume()).toBe(2);
    const changement={formule:"solo",capacite:1,date_effet:initial.periode_fin};
    await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_schedule')",[org,{...nouveau,changement_programme:changement}]);
    // Une notification omettant le calendrier ne l'efface pas.
    await db.query("select public.appliquer_abonnement_v2($1,$2,'evt_refresh')",[org,nouveau]);
    const c=await contexte();expect(c.capacite).toBe(3);expect(c.changement_programme).toEqual(changement);
  });
  it("l'agence compte les lots distincts sous mandat, même vacants et archivés, et réserve les lignes futures", async () => {
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set type='agence' where id=$1",[org]);
    await db.query("update public.memberships set role='admin_agence' where organization_id=$1",[org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    const mandant=(await db.query("insert into public.persons(organization_id,nom) values($1,'Mandant fictif') returning id",[org])).rows[0].id;
    const mandat=(await db.query("insert into public.mandats(organization_id,person_id,etat,date_debut) values($1,$2,'actif',current_date) returning id",[org,mandant])).rows[0].id;
    const b=await bien("Immeuble","autre");
    const lots:string[]=[];
    for(let i=0;i<11;i++) {
      const l=await lot(b,"Lot "+i);lots.push(l);
      await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date)",[org,l,mandant]);
      if(i<10) await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,current_date)",[org,mandat,l]);
    }
    expect(await volume()).toBe(10);
    await souscrire(10);await expirer();await devenir(acteur);
    // Un lot archivé reste facturé tant que le mandat reste actif.
    await db.query("update public.lots set etat='archive' where id=$1",[lots[0]]);
    await db.query("reset role");expect(await volume()).toBe(10);
    // Ni une ligne immédiate, ni une ligne future n'évite la confirmation.
    expect(await refus("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,current_date)",[org,mandat,lots[10]])).toMatch(/capacité supplémentaire/);
    expect(await refus("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,current_date+30)",[org,mandat,lots[10]])).toMatch(/capacité supplémentaire/);
    const brouillon=(await db.query("insert into public.mandats(organization_id,person_id,etat) values($1,$2,'brouillon') returning id",[org,mandant])).rows[0].id;
    await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires) values($1,$2,$3,7)",[org,brouillon,lots[10]]);
    await devenir(acteur);
    expect((await db.query("select public.apercu_volume_mandat_v2($1,$2) as n",[org,brouillon])).rows[0].n).toBe(11);
    expect(await refus("update public.mandats set etat='actif' where id=$1",[brouillon])).toMatch(/capacité supplémentaire/);
  });

});
