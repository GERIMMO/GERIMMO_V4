import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = readFileSync("supabase/migrations/20261028143735_patrimoine_consommations_releves.sql", "utf8");
const retour = readFileSync("supabase/retours-arriere/20261028143735_patrimoine_consommations_releves.retour.sql", "utf8");

describe.skipIf(!url)("consommations : isolation réelle, collecte et répartition contrôlée", () => {
  let db: Client;
  let org: string, orgAutre: string, gerant: string, compteA: string, compteB: string, compteAutre: string;
  let bien: string, bienAutre: string, lotA: string, lotB: string, personneA: string, personneB: string, bailA: string, bailB: string;
  let compteurA: string, compteurB: string, demandeA: string, demandeB: string, facture: string, contrat: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  async function compte() {
    const c = await db.query<{ id: string; email: string }>(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id,email`);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [c.rows[0].id, c.rows[0].email]);
    return c.rows[0].id;
  }
  async function session(compteId: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [compteId]);
    await db.query("set local role authenticated");
  }
  async function postgres() { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); }
  async function refus(sql: string, args: unknown[] = [], motif = /refusé|permission|policy|violat|inférieur|invalide|précédent|correspond|régularisables|propriétaire|changé|figées|déjà|Retour|ouverte|enregistrée|fermée/i) {
    await db.query("savepoint refus");
    await expect(db.query(sql, args)).rejects.toThrow(motif);
    await db.query("rollback to savepoint refus");
  }
  const soumettre = (index = 112.125, date = "2026-10-01") => id("select public.soumettre_releve_consommation($1,$2,$3) as id", [demandeA, index, date]);
  const parts = () => JSON.stringify([{ lot_id: lotA, bail_id: bailA, poids: 1, recuperable: true }, { lot_id: lotB, bail_id: bailB, poids: 2, recuperable: true }]);
  const preparer = () => id("select public.preparer_repartition_fourniture($1,$2,'Tantièmes confirmés avec les justificatifs du bâtiment') as id", [facture, parts()]);

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    await db.query(migration);
    await db.query(readFileSync("supabase/migrations/20261028171201_historique_contrats_fourniture.sql", "utf8"));
    await db.query(readFileSync("supabase/migrations/20261028161755_gardes_abonnement_patrimoine.sql", "utf8"));
    org = await id("insert into public.organizations(name,status,type) values('Test consommations','active','agence') returning id");
    orgAutre = await id("insert into public.organizations(name,status,type) values('Autre dossier conso','active','agence') returning id");
    gerant = await compte(); compteA = await compte(); compteB = await compte(); compteAutre = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$5,'admin_agence'),($2,$5,'locataire'),($3,$5,'locataire'),($4,$6,'admin_agence')", [gerant, compteA, compteB, compteAutre, org, orgAutre]);
    personneA = await id("insert into public.persons(organization_id,nom,account_id) values($1,'Locataire A',$2) returning id", [org, compteA]);
    personneB = await id("insert into public.persons(organization_id,nom,account_id) values($1,'Locataire B',$2) returning id", [org, compteB]);
    const mandant = await id("insert into public.persons(organization_id,nom) values($1,'Bailleur') returning id", [org]);
    const creerBien = (o: string) => id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Immeuble test','maison','1 rue fictive','69001','Lyon') returning id", [o]);
    bien = await creerBien(org); bienAutre = await creerBien(orgAutre);
    const lot = (nom: string) => id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2,pieces,meuble) values($1,$2,$3,'disponible',25,1,true) returning id", [org, bien, nom]);
    lotA = await lot("Studio A"); lotB = await lot("Studio B");
    for (const l of [lotA, lotB]) await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, l, mandant]);
    const bail = (l: string, p: string) => id("insert into public.baux(organization_id,lot_id,type,locataire_principal,date_debut,loyer_hc,charges,depot_garantie,charges_mode) values($1,$2,'meuble',$3,'2026-01-01',500,50,500,'provision') returning id", [org, l, p]);
    bailA = await bail(lotA, personneA); bailB = await bail(lotB, personneB);
    await db.query("update public.baux set etat='actif' where id=any($1::uuid[])", [[bailA, bailB]]);
    await session(gerant);
    const compteur = (l: string, b: string, p: string) => id("insert into public.compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande,bail_referent,personne_referente) values($1,$2,$3,'eau_froide','m3','Eau froide',100,'2026-09-01','2026-10-01',$4,$5) returning id", [org, bien, l, b, p]);
    compteurA = await compteur(lotA, bailA, personneA); compteurB = await compteur(lotB, bailB, personneB);
    await db.query("select public.synchroniser_demandes_releves($1)", [org]);
    demandeA = await id("select id from public.demandes_releves where compteur_id=$1", [compteurA]);
    demandeB = await id("select id from public.demandes_releves where compteur_id=$1", [compteurB]);
    const document = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Facture eau',$1::uuid::text||'/facture-conso.pdf','application/pdf',123,repeat('f',64)) returning id", [org]);
    contrat = await id("insert into public.contrats_fourniture(organization_id,bien_id,fournisseur,categorie) values($1,$2,'Eau test','eau') returning id", [org, bien]);
    facture = await id("insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents,frais_gestion_cents,consommation) values($1,$2,$3,'TEST-001','2026-09-01','2026-10-01',101,1,50) returning id", [org, contrat, document]);
    await postgres();
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });

  it("l’abonnement fermé interdit les gestes de gestion et préserve les relevés du locataire", async () => {
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set status='suspendue' where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    await session(gerant);
    expect((await db.query("select id from public.compteurs_consommation where id=$1", [compteurA])).rowCount).toBe(1);
    await refus("update public.compteurs_consommation set libelle='Modification interdite' where id=$1", [compteurA], /Abonnement suspendu/);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Tantièmes confirmés')", [facture, parts()], /Abonnement suspendu/);
    await session(compteA);
    expect((await db.query("select peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ peut_repondre: true }]);
    expect(await soumettre()).toBeTruthy();
  });
  it("la ronde annule les anciennes demandes d’un espace fermé sans en créer ni avancer ses dates", async () => {
    await session(gerant);
    await db.query("update public.compteurs_consommation set actif=false where id=$1", [compteurA]);
    await db.query("update public.compteurs_consommation set prochaine_demande='2026-10-01' where id=$1", [compteurB]);
    await postgres();
    await db.query("select public.tache_systeme()");
    await db.query("update public.organizations set status='suspendue' where id=$1", [org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    await db.query("set local role service_role");
    const r = await db.query("select public.planifier_releves_consommation() as r");
    expect(r.rows[0].r.creees).toBe(0);
    expect((await db.query("select statut from public.demandes_releves where id=$1", [demandeA])).rows[0].statut).toBe('annulee');
    expect((await db.query("select prochaine_demande::text as jour from public.compteurs_consommation where id=$1", [compteurB])).rows[0].jour).toBe('2026-10-01');
    expect((await db.query("select coalesce(current_setting('gerimmo.systeme',true),'') as contexte")).rows[0].contexte).toBe('');
  });
  it("une demande par compteur et échéance, même après un double lancement", async () => {
    await session(gerant);
    expect((await db.query("select public.synchroniser_demandes_releves($1) as n", [org])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.demandes_releves where organization_id=$1", [org])).rows[0].n).toBe(2);
  });
  it("le locataire ne voit que sa demande, pas les compteurs ni factures de l'immeuble", async () => {
    await session(compteA);
    expect((await db.query("select demande_id,peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ demande_id: demandeA, peut_repondre: true }]);
    expect((await db.query("select * from public.compteurs_consommation")).rows).toEqual([]);
    expect((await db.query("select * from public.factures_fourniture")).rows).toEqual([]);
    await refus("select public.soumettre_releve_consommation($1,112,'2026-10-01')", [demandeB]);
  });
  it("un autre propriétaire ne lit et ne modifie aucun objet du dossier", async () => {
    await session(compteAutre);
    expect((await db.query("select * from public.compteurs_consommation where id=$1", [compteurA])).rows).toEqual([]);
    await refus("select public.synchroniser_demandes_releves($1)", [org]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Clé de répartition du test')", [facture, parts()]);
  });
  it("refuse un bâtiment d'une autre organisation et un destinataire du mauvais lot", async () => {
    await session(gerant);
    await refus("update public.compteurs_consommation set bien_id=$1 where id=$2", [bienAutre, compteurA]);
    await refus("update public.compteurs_consommation set personne_referente=$1 where id=$2", [personneB, compteurA], /locataire/);
  });
  it("enregistre puis relit le relevé, et rejoue sans double ligne", async () => {
    await session(compteA); const premier = await soumettre(); expect(await soumettre()).toBe(premier);
    expect((await db.query("select statut,index_releve,peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ statut: "recu", index_releve: "112.125", peut_repondre: false }]);
    await refus("select public.soumettre_releve_consommation($1,113,'2026-10-01')", [demandeA]);
  });
  it("refuse index décroissant, précision excessive, date future et accès SQL direct", async () => {
    await session(compteA);
    await refus("select public.soumettre_releve_consommation($1,99,'2026-10-01')", [demandeA]);
    await refus("select public.soumettre_releve_consommation($1,112.1234,'2026-10-01')", [demandeA]);
    await refus("select public.soumettre_releve_consommation($1,112,'2099-10-01')", [demandeA], /futur/);
    await refus("insert into public.releves_consommation(organization_id,compteur_id,demande_id,date_releve,index_releve) values($1,$2,$3,'2026-10-01',999)", [org, compteurA, demandeA]);
  });
  it("une adhésion inactive garde son historique mais perd toute action", async () => {
    await db.query("update public.memberships set status='inactive' where account_id=$1", [compteA]);
    await session(compteA);
    expect((await db.query("select peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ peut_repondre: false }]);
    await refus("select public.soumettre_releve_consommation($1,112,'2026-10-01')", [demandeA], /plus être remplie/);
  });
  it("un bail terminé n'autorise plus la réponse", async () => {
    await db.query("update public.baux set etat='termine',date_fin='2026-09-30' where id=$1", [bailA]);
    await session(compteA); await refus("select public.soumettre_releve_consommation($1,112,'2026-10-01')", [demandeA], /plus être remplie/);
  });
  it("un changement de responsable retire le droit d'agir sans attendre la ronde", async () => {
    await session(gerant);
    await db.query("update public.compteurs_consommation set bail_referent=null,personne_referente=null where id=$1", [compteurA]);
    await session(compteA);
    expect((await db.query("select peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ peut_repondre: false }]);
    await refus("select public.soumettre_releve_consommation($1,112,'2026-10-01')", [demandeA], /plus être remplie/);
  });
  it("une photo réservée ne devient pas un document sans fichier réellement présent", async () => {
    await session(compteA);
    const p = (await db.query("select public.preparer_photo_releve($1,$2,'image/png',123) as depot", [demandeA, "a".repeat(64)])).rows[0].depot;
    expect(p.storage_path).toMatch(/\/releves\/.+\.png$/);
    await refus("select public.finaliser_photo_releve($1)", [p.id]);
    await session(compteB); await refus("select public.finaliser_photo_releve($1)", [p.id]);
  });
  it("rattache une photo privée présente à son destinataire et rejoue sans doublon", async () => {
    await session(compteA);
    const p = (await db.query("select public.preparer_photo_releve($1,$2,'image/png',123) as depot", [demandeA, "b".repeat(64)])).rows[0].depot;
    await postgres();
    await db.query("insert into storage.objects(bucket_id,name,owner,metadata) values('documents',$1,$2,$3)", [p.storage_path, compteA, { size: 123, mimetype: "image/png" }]);
    await session(compteA);
    const document = await id("select public.finaliser_photo_releve($1) as id", [p.id]);
    expect(await id("select public.finaliser_photo_releve($1) as id", [p.id])).toBe(document);
    await db.query("select public.soumettre_releve_consommation($1,112,'2026-10-01',$2)", [demandeA, document]);
    expect((await db.query("select public.preparer_photo_releve($1,$2,'image/png',123) as depot", [demandeA, "b".repeat(64)])).rows[0].depot.document_id).toBe(document);
    await session(compteB);
    expect((await db.query("select consommations_interne.photo_autorisee($1,false) as oui", [p.storage_path])).rows[0].oui).toBe(false);
  });
  it("le propriétaire peut relever le compteur général sans usurper un locataire", async () => {
    await session(gerant);
    const general = await id("insert into public.compteurs_consommation(organization_id,bien_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande) values($1,$2,'eau_froide','m3','Général',1000,'2026-09-01','2026-10-01') returning id", [org, bien]);
    const r = await id("select public.enregistrer_releve_compteur($1,$2,1050,'2026-10-01') as id", [org, general]);
    expect((await db.query("select demande_id from public.releves_consommation where id=$1", [r])).rows[0].demande_id).toBeNull();
  });
  it("le propriétaire satisfait la demande en cours et peut compléter un ancien index sans modifier les voisins", async () => {
    await session(gerant);
    const r = await id("select public.enregistrer_releve_compteur($1,$2,120,'2026-10-01') as id", [org, compteurA]);
    expect((await db.query("select statut from public.demandes_releves where id=$1", [demandeA])).rows[0].statut).toBe("recu");
    expect((await db.query("select demande_id from public.releves_consommation where id=$1", [r])).rows[0].demande_id).toBe(demandeA);
    const ancien = await id("select public.enregistrer_releve_compteur($1,$2,110,'2026-09-15') as id", [org, compteurA]);
    expect(await id("select public.enregistrer_releve_compteur($1,$2,110,'2026-09-15') as id", [org, compteurA])).toBe(ancien);
    await refus("select public.enregistrer_releve_compteur($1,$2,121,'2026-09-20')", [org, compteurA], /supérieur au relevé suivant/);
    await refus("select public.enregistrer_releve_compteur($1,$2,109,'2026-09-20')", [org, compteurA], /inférieur/);
    await session(compteA);
    expect((await db.query("select peut_repondre,index_releve from public.mes_releves_consommation($1)", [org])).rows[0]).toMatchObject({ peut_repondre: false, index_releve: "120.000" });
  });
  it("fige le type et le rattachement d’un contrat dès sa première facture, avant tout paiement", async () => {
    await session(gerant);
    await refus("update public.contrats_fourniture set categorie='teom' where id=$1", [contrat], /comporte des factures/);
    await refus("update public.contrats_fourniture set lot_id=$1 where id=$2", [lotA, contrat], /comporte des factures/);
    const autreBien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Autre immeuble','maison','2 rue fictive','69001','Lyon') returning id", [org]);
    await refus("update public.contrats_fourniture set bien_id=$1 where id=$2", [autreBien, contrat], /comporte des factures/);
    expect((await db.query("select categorie,bien_id,lot_id from public.contrats_fourniture where id=$1", [contrat])).rows[0]).toEqual({ categorie: 'eau', bien_id: bien, lot_id: null });
  });
  it("garde les réglages et l’archivage disponibles sans changer les factures conservées", async () => {
    await session(gerant);
    await db.query("update public.contrats_fourniture set fournisseur='Eau renommée',reference='Nouveau contact',actif=false where id=$1", [contrat]);
    expect((await db.query("select fournisseur,reference,actif from public.contrats_fourniture where id=$1", [contrat])).rows[0]).toEqual({ fournisseur: 'Eau renommée', reference: 'Nouveau contact', actif: false });
    expect((await db.query("select contrat_id,total_cents::int total from public.factures_fourniture where id=$1", [facture])).rows[0]).toEqual({ contrat_id: contrat, total: 101 });
  });
  it("permet de corriger le type et le logement avant le dépôt de la première facture", async () => {
    await session(gerant);
    const nouveau = await id("insert into public.contrats_fourniture(organization_id,bien_id,fournisseur,categorie) values($1,$2,'Nouveau contrat','eau') returning id", [org, bien]);
    await db.query("update public.contrats_fourniture set categorie='teom',lot_id=$1 where id=$2", [lotB, nouveau]);
    expect((await db.query("select categorie,lot_id from public.contrats_fourniture where id=$1", [nouveau])).rows[0]).toEqual({ categorie: 'teom', lot_id: lotB });
  });
  it("refuse atomiquement de retirer la garde lorsqu’un historique de factures existe", async () => {
    await refus(readFileSync("supabase/retours-arriere/20261028171201_historique_contrats_fourniture.retour.sql", "utf8"), [], /Retour refusé/);
    await session(gerant);
    await refus("update public.contrats_fourniture set categorie='teom' where id=$1", [contrat], /comporte des factures/);
    expect((await db.query("select has_function_privilege('authenticated','consommations_interne.garder_historique_contrat()','execute') autorise")).rows[0].autorise).toBe(false);
  });
  it("la répartition conserve le total exact et les frais de gestion chez le bailleur", async () => {
    await session(gerant); const r = await preparer();
    const valeur = (await db.query("select * from public.repartitions_fourniture where id=$1", [r])).rows[0];
    expect(Number(valeur.total_recuperable_cents)).toBe(100); expect(Number(valeur.total_proprietaire_cents)).toBe(1);
    expect(valeur.lignes.map((l: { montant_cents: number }) => l.montant_cents).sort()).toEqual([33, 67]);
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r]);
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r]);
    await refus("update public.factures_fourniture set total_cents=102 where id=$1", [facture]);
  });
  it("refuse forfait et électricité privative même avec une requête forgée", async () => {
    await db.query("update public.baux set charges_mode='forfait' where id=$1", [bailA]);
    await session(gerant); await refus("select public.preparer_repartition_fourniture($1,$2,'Clé de répartition du test')", [facture, parts()]);
    await postgres(); await db.query("update public.baux set charges_mode='provision' where id=$1", [bailA]);
    await session(gerant);
    const prive = await id("insert into public.contrats_fourniture(organization_id,bien_id,fournisseur,categorie) values($1,$2,'Électricité du logement','electricite_privative') returning id", [org, bien]);
    const piece = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Électricité',$1::uuid::text||'/facture-elec-privee.pdf','application/pdf',123,repeat('e',64)) returning id", [org]);
    const facturePrivee = await id("insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents) values($1,$2,$3,'ELEC-001','2026-09-01','2026-10-01',100) returning id", [org, prive, piece]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Clé de répartition du test')", [facturePrivee, parts()]);
  });
  it("refuse la validation d'un calcul devenu ancien", async () => {
    await session(gerant); const r = await preparer();
    await db.query("update public.factures_fourniture set total_cents=102 where id=$1", [facture]);
    await refus("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r]);
  });
  it("une ancienne fenêtre ne peut valider un décompte écrasé au même identifiant", async () => {
    await session(gerant); const r = await preparer();
    const ancienne = (await db.query("select empreinte from public.repartitions_fourniture where id=$1", [r])).rows[0].empreinte;
    expect(ancienne).toMatch(/^[a-f0-9]{64}$/);
    const nouveau = JSON.stringify([{ lot_id: lotA, bail_id: bailA, poids: 2, recuperable: true }, { lot_id: lotB, bail_id: bailB, poids: 1, recuperable: true }]);
    expect(await id("select public.preparer_repartition_fourniture($1,$2,'Nouvelle clé confirmée du bâtiment') as id", [facture, nouveau])).toBe(r);
    const actuelle = (await db.query("select empreinte from public.repartitions_fourniture where id=$1", [r])).rows[0].empreinte;
    expect(actuelle).not.toBe(ancienne);
    await refus("select public.valider_repartition_fourniture($1,$2)", [r, ancienne], /recalculé/);
    await db.query("select public.valider_repartition_fourniture($1,$2)", [r, actuelle]);
    await refus("select public.valider_repartition_fourniture($1,$2)", [r, ancienne], /recalculé/);
    await db.query("select public.valider_repartition_fourniture($1,$2)", [r, actuelle]);
    expect((await db.query("select to_regprocedure('public.valider_repartition_fourniture(uuid)') as ancien")).rows[0].ancien).toBeNull();
  });
  it("répartit séparément les frais fixes et la consommation", async () => {
    await session(gerant);
    await db.query("update public.factures_fourniture set total_cents=10001,frais_gestion_cents=1,frais_fixes_cents=2000 where id=$1", [facture]);
    const p = JSON.stringify([{ lot_id: lotA, bail_id: bailA, poids: 1, poids_fixe: 1, recuperable: true }, { lot_id: lotB, bail_id: bailB, poids: 3, poids_fixe: 1, recuperable: true }]);
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Variables selon clé et frais fixes à parts égales') as id", [facture, p]);
    const valeur = (await db.query("select lignes from public.repartitions_fourniture where id=$1", [r])).rows[0];
    expect(valeur.lignes.find((l: { lot_id: string }) => l.lot_id === lotA)).toMatchObject({ variable_cents: 2000, fixe_cents: 1000, montant_cents: 3000 });
    expect(valeur.lignes.find((l: { lot_id: string }) => l.lot_id === lotB)).toMatchObject({ variable_cents: 6000, fixe_cents: 1000, montant_cents: 7000 });
  });
  it("recalcule la consommation en base et laisse l'écart général au propriétaire", async () => {
    await session(compteA); await soumettre(110);
    await session(compteB); await db.query("select public.soumettre_releve_consommation($1,120,'2026-10-01')", [demandeB]);
    await session(gerant);
    await db.query("update public.factures_fourniture set total_cents=10001,frais_gestion_cents=1,frais_fixes_cents=2000,consommation=50 where id=$1", [facture]);
    const p = JSON.stringify([{ lot_id: lotA, bail_id: bailA, poids: 999, poids_fixe: 1, compteur_id: compteurA, recuperable: true }, { lot_id: lotB, bail_id: bailB, poids: 1, poids_fixe: 1, compteur_id: compteurB, recuperable: true }]);
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Compteurs individuels et frais fixes égaux','consommations') as id", [facture, p]);
    const valeur = (await db.query("select * from public.repartitions_fourniture where id=$1", [r])).rows[0];
    expect(Number(valeur.total_recuperable_cents)).toBe(6800);
    expect(Number(valeur.total_proprietaire_cents)).toBe(3201);
    expect(valeur.source.ecart_non_reparti_cents).toBe(3200);
    expect(valeur.lignes.find((l: { lot_id: string }) => l.lot_id === lotA)).toMatchObject({ poids: 10000, variable_cents: 1600, fixe_cents: 1000, montant_cents: 2600 });
  });
  it("refuse d'imputer une consommation sans relevés aux dates exactes", async () => {
    await session(gerant);
    const p = JSON.stringify([{ lot_id: lotA, bail_id: bailA, poids: 1, compteur_id: compteurA, recuperable: true }]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Répartition depuis un compteur','consommations')", [facture, p], /dates exactes/);
  });
  it("une facture par consommation chevauchant deux années exige l’index du 1er janvier avant préparation et validation", async () => {
    await session(gerant);
    const c = await id("insert into public.compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande) values($1,$2,$3,'eau_froide','m3','Compteur interannuel',0,'2025-12-01','2026-10-01') returning id", [org, bien, lotA]);
    await db.query("select public.enregistrer_releve_compteur($1,$2,20,'2026-02-01')", [org, c]);
    await db.query("update public.factures_fourniture set periode_debut='2025-12-01',periode_fin='2026-02-01',consommation=20 where id=$1", [facture]);
    const commun = { lot_id: lotA, bail_id: null, compteur_id: c, poids: 1, recuperable: false };
    const rpc = "select public.preparer_repartition_fourniture($1,$2,'Lecture réelle à chaque changement d’année','consommations') as id";
    await refus(rpc, [facture, JSON.stringify([commun])], /1er janvier/);
    // Un ancien brouillon préparé avant cette garde ne doit pas devenir figé.
    const ancien = await id("select public.preparer_repartition_fourniture($1,$2,'Ancien décompte à vérifier','cle') as id", [facture, JSON.stringify([commun])]);
    await postgres();
    await db.query("update public.repartitions_fourniture set source=jsonb_set(source,'{mode}',to_jsonb($2::text)) where id=$1", [ancien, "consommations"]);
    await session(gerant);
    await refus("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [ancien], /1er janvier/);
    await db.query("select public.enregistrer_releve_compteur($1,$2,7,'2026-01-01')", [org, c]);
    const p = [{ ...commun, periode_debut: "2025-12-01", periode_fin: "2026-01-01" }, { ...commun, periode_debut: "2026-01-01", periode_fin: "2026-02-01" }];
    const r = await id(rpc, [facture, JSON.stringify(p)]);
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r]);
    expect((await db.query("select statut,lignes from public.repartitions_fourniture where id=$1", [r])).rows[0]).toMatchObject({ statut: "validee", lignes: expect.arrayContaining([expect.objectContaining({ periode_fin: "2026-01-01" }), expect.objectContaining({ periode_debut: "2026-01-01" })]) });
  });
  it("utilise les index d'un compteur archivé pour sa dernière facture", async () => {
    await session(gerant); await db.query("select public.enregistrer_releve_compteur($1,$2,110,'2026-10-01')", [org, compteurA]);
    await db.query("update public.compteurs_consommation set actif=false where id=$1", [compteurA]);
    const p = JSON.stringify([{ lot_id: lotA, bail_id: bailA, compteur_id: compteurA, poids: 1, recuperable: true }]);
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Dernière consommation du compteur archivé','consommations') as id", [facture, p]);
    expect((await db.query("select lignes from public.repartitions_fourniture where id=$1", [r])).rows[0].lignes[0].poids).toBe(10000);
  });
  it("répartit une sortie en cours de facture grâce au relevé réel intermédiaire", async () => {
    await db.query("update public.baux set etat='termine',date_fin='2026-09-15' where id=$1", [bailA]);
    await session(gerant);
    await db.query("select public.enregistrer_releve_compteur($1,$2,105,'2026-09-15')", [org, compteurA]);
    await db.query("select public.enregistrer_releve_compteur($1,$2,110,'2026-10-01')", [org, compteurA]);
    await db.query("update public.factures_fourniture set consommation=10 where id=$1", [facture]);
    const commun = { lot_id: lotA, compteur_id: compteurA, poids: 1, poids_fixe: 0 };
    const p = [{ ...commun, bail_id: bailA, recuperable: true, periode_debut: "2026-09-01", periode_fin: "2026-09-15" }, { ...commun, bail_id: null, recuperable: false, periode_debut: "2026-09-15", periode_fin: "2026-10-01" }];
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Sortie relevée puis vacance propriétaire','consommations',$3) as id", [facture, JSON.stringify(p), JSON.stringify({ mode_interface: "consommations", colocation: null })]);
    const valeur = (await db.query("select * from public.repartitions_fourniture where id=$1", [r])).rows[0];
    expect(Number(valeur.total_recuperable_cents)).toBe(50); expect(Number(valeur.total_proprietaire_cents)).toBe(51);
    expect(valeur.lignes).toHaveLength(2); expect(valeur.source.reglages.mode_interface).toBe("consommations");
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Tentative de seconde préparation','consommations')", [facture, JSON.stringify(p)]);
  });
  it("répartit un compteur entre une chambre louée et une vacante sans compter deux fois la consommation", async () => {
    await session(gerant);
    await db.query("select public.enregistrer_releve_compteur($1,$2,120,'2026-10-01')", [org, compteurA]);
    await db.query("update public.factures_fourniture set total_cents=10001,frais_fixes_cents=2000,consommation=20 where id=$1", [facture]);
    const commun = { lot_id: lotA, compteur_id: compteurA, poids: 1, poids_fixe: 1, fraction_numerateur: 5000, fraction_denominateur: 10000 };
    const p = [{ ...commun, bail_id: bailA, recuperable: true }, { ...commun, bail_id: null, recuperable: false }];
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Deux chambres dont une vacante','consommations',$3) as id", [facture, JSON.stringify(p), JSON.stringify({ mode_interface: "consommations", colocation: "egales" })]);
    const valeur = (await db.query("select * from public.repartitions_fourniture where id=$1", [r])).rows[0];
    expect(Number(valeur.total_recuperable_cents)).toBe(5000); expect(Number(valeur.total_proprietaire_cents)).toBe(5001);
    expect(valeur.source.ecart_non_reparti_cents).toBe(0);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Clé non confirmée du logement','consommations')", [facture, JSON.stringify(p)], /colocation confirmée/);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Fraction falsifiée du logement','consommations',$3)", [facture, JSON.stringify(p.map(x => ({ ...x, fraction_numerateur: 7000 }))), JSON.stringify({ colocation: "egales" })], /totalité/);
  });
  it("refuse les segments incomplets, chevauchants ou attribués avant l'entrée du bail", async () => {
    await session(gerant);
    const commun = { lot_id: lotA, bail_id: bailA, compteur_id: compteurA, poids: 1, poids_fixe: 0, recuperable: true };
    for (const segments of [
      [{ periode_debut: "2026-09-01", periode_fin: "2026-09-14" }, { periode_debut: "2026-09-15", periode_fin: "2026-10-01" }],
      [{ periode_debut: "2026-09-01", periode_fin: "2026-09-16" }, { periode_debut: "2026-09-15", periode_fin: "2026-10-01" }],
    ]) await refus("select public.preparer_repartition_fourniture($1,$2,'Segments incohérents du compteur','consommations')", [facture, JSON.stringify(segments.map(s => ({ ...commun, ...s })))], /segments doivent couvrir/);
    await postgres(); await db.query("update public.baux set date_debut='2026-09-15' where id=$1", [bailA]); await session(gerant);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Occupation antérieure au bail','consommations')", [facture, JSON.stringify([{ ...commun }])], /bail ne couvre/);
  });
  it("recontrôle les relevés avant validation et refuse des réglages arbitraires", async () => {
    await session(gerant);
    await db.query("select public.enregistrer_releve_compteur($1,$2,110,'2026-10-01')", [org, compteurA]);
    const p = JSON.stringify([{ lot_id: lotA, bail_id: bailA, compteur_id: compteurA, poids: 1, recuperable: true }]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'Réglages de répartition invalides','consommations',$3)", [facture, p, JSON.stringify({ montant: 1 })], /Réglages/);
    const r = await id("select public.preparer_repartition_fourniture($1,$2,'Consommation exacte du logement','consommations') as id", [facture, p]);
    await postgres(); await db.query("update public.releves_consommation set index_releve=111 where compteur_id=$1", [compteurA]); await session(gerant);
    await refus("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))", [r], /relevé a changé/);
  });
  it("réserve la ronde globale au service de planification", async () => {
    await session(gerant); await refus("select public.planifier_releves_consommation()");
    await postgres(); await db.query("set local role service_role");
    expect((await db.query("select public.planifier_releves_consommation() as bilan")).rows[0].bilan.creees).toBe(0);
  });
  it("la ronde crée réellement les demandes dues et annule celles d'un locataire inactif", async () => {
    await db.query("delete from public.demandes_releves where id=$1", [demandeA]);
    await db.query("update public.compteurs_consommation set prochaine_demande='2026-10-01' where id=$1", [compteurA]);
    await db.query("update public.memberships set status='inactive' where account_id=$1", [compteB]);
    await db.query("set local role service_role");
    const bilan = (await db.query("select public.planifier_releves_consommation() as bilan")).rows[0].bilan;
    expect(bilan).toMatchObject({ creees: 1, annulees: 1 });
    expect((await db.query("select public.planifier_releves_consommation() as bilan")).rows[0].bilan).toMatchObject({ creees: 0, annulees: 0 });
    await session(compteA); expect((await db.query("select statut from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ statut: "attendue" }]);
    await session(compteB); expect((await db.query("select statut,peut_repondre from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ statut: "annulee", peut_repondre: false }]);
  });
  it("un agent sans mandat ne voit pas les compteurs d'un collègue", async () => {
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent')", [compteAutre, org]);
    await session(compteAutre);
    expect((await db.query("select * from public.compteurs_consommation where organization_id=$1", [org])).rows).toEqual([]);
    await refus("select public.enregistrer_releve_compteur($1,$2,111,'2026-10-01')", [org, compteurA]);
  });
  it("le retour refuse de détruire des relevés existants", async () => { await refus(retour); });
  it("la migration se rejoue sans perdre les demandes et conserve tous les droits", async () => {
    await db.query(migration); await db.query(migration); await session(compteA);
    expect((await db.query("select demande_id from public.mes_releves_consommation($1)", [org])).rows).toEqual([{ demande_id: demandeA }]);
  });
});
