import { Client } from "pg";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("facture fournisseur : paiement et journal atomiques", () => {
  let db: Client;
  let org: string, bien: string, lot: string, lotB: string, contrat: string, facture: string, doc: string;
  let gerant: string, autre: string, locataire: string, agent: string, bail: string;
  let contratInitial: string, factureInitiale: string, docInitial: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  async function compte() {
    const r = await db.query<{ id: string; email: string }>(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id,email`);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [r.rows[0].id,r.rows[0].email]);
    return r.rows[0].id;
  }
  async function session(c: string) { await db.query("reset role"); await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[c]); await db.query("set local role authenticated"); }
  async function postgres() { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); }
  async function refus(sql: string,args: unknown[]=[],motif=/refusé|permission|policy|violat|invalide|déjà|clôturé|figé|finances|administrateur|fermées/i) {
    await db.query("savepoint refus"); await expect(db.query(sql,args)).rejects.toThrow(motif); await db.query("rollback to savepoint refus");
  }
  const payer=(date="2026-10-01")=>id("select public.payer_facture_fourniture($1,$2,$3) as id",[org,facture,date]);
  const parts=()=>JSON.stringify([{lot_id:lot,bail_id:null,poids:1,recuperable:false},{lot_id:lotB,bail_id:null,poids:1,recuperable:false}]);
  const preparer=()=>id("select public.preparer_repartition_fourniture($1,$2,'Parts égales confirmées pour les deux logements') as id",[facture,parts()]);
  async function journal() { return (await db.query("select e.lot_id,e.categorie,e.sens,e.montant,e.date_piece::text,e.date_imputation::text,e.contre_ecriture_de,l.phase,p.document_id from public.ecritures e join public.ecritures_factures_fourniture l on l.ecriture_id=e.id join public.paiements_factures_fourniture p on p.id=l.paiement_id where p.facture_id=$1 order by e.created_at,e.id",[facture])).rows; }
  beforeAll(async()=>{
    db=new Client({connectionString:url});await db.connect();await db.query("begin");
    org=await id("insert into public.organizations(name,status,type) values('TEST journal fournitures','active','proprietaire_direct') returning id");
    gerant=await compte();autre=await compte();locataire=await compte();agent=await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$4,'proprietaire_direct'),($2,$4,'locataire'),($3,$4,'agent')",[gerant,locataire,agent,org]);
    bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bâtiment test','maison','1 rue fictive','69001','Lyon') returning id",[org]);
    const creerLot=(nom:string)=>id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2,pieces,meuble) values($1,$2,$3,'disponible',25,1,true) returning id",[org,bien,nom]);
    lot=await creerLot('Lot A');lotB=await creerLot('Lot B');
    doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Facture test',$1::uuid::text||'/facture-journal.pdf','application/pdf',123,repeat('f',64)) returning id",[org]);
    contrat=await id("insert into public.contrats_fourniture(organization_id,bien_id,fournisseur,categorie) values($1,$2,'Eau test','eau') returning id",[org,bien]);
    facture=await id("insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents,frais_gestion_cents) values($1,$2,$3,'FACTURE-TEST','2026-09-01','2026-09-30',10001,101) returning id",[org,contrat,doc]);
    contratInitial=contrat;factureInitiale=facture;docInitial=doc;
    const personne=await id("insert into public.persons(organization_id,nom,account_id) values($1,'Locataire TEST',$2) returning id",[org,locataire]);
    bail=await id("insert into public.baux(organization_id,lot_id,type,locataire_principal,date_debut,loyer_hc,charges,depot_garantie,charges_mode) values($1,$2,'meuble',$3,'2026-09-01',500,10,500,'provision') returning id",[org,lot,personne]);
    await db.query("update public.baux set etat='actif' where id=$1",[bail]);
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-09-01','2026-09-05',500,10,510)",[org,bail]);
  });
  afterAll(async()=>{await db?.query("rollback");await db?.end();});
  beforeEach(async()=>{contrat=contratInitial;facture=factureInitiale;doc=docInitial;await db.query("savepoint cas");});
  afterEach(async()=>{await db.query("rollback to savepoint cas");await postgres();});

  it("enregistre la date et la dépense entière, conserve le justificatif et rejoue sans doublon",async()=>{
    await session(gerant);const paiement=await payer();expect(await payer()).toBe(paiement);
    const lignes=await journal();expect(lignes).toHaveLength(2);expect(lignes.reduce((s,l)=>s+Number(l.montant),0)).toBe(100.01);
    expect(lignes.every(l=>l.lot_id===null&&l.sens==='depense'&&l.document_id===doc&&l.date_piece==='2026-10-01')).toBe(true);
    expect((await db.query("select payee_le::text from public.factures_fourniture where id=$1",[facture])).rows[0].payee_le).toBe('2026-10-01');
    await refus("select public.payer_facture_fourniture($1,$2,'2026-10-02')",[org,facture]);
  });
  it("rattache immédiatement la facture d'un lot et sépare la TEOM de ses frais",async()=>{
    doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Facture TEOM test',$1::uuid::text||'/facture-teom.pdf','application/pdf',123,repeat('a',64)) returning id",[org]);
    contrat=await id("insert into public.contrats_fourniture(organization_id,bien_id,lot_id,fournisseur,categorie) values($1,$2,$3,'TEOM test','teom') returning id",[org,bien,lot]);
    facture=await id("insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents,frais_gestion_cents) values($1,$2,$3,'TEOM-TEST','2026-09-01','2026-09-30',10001,101) returning id",[org,contrat,doc]);
    await session(gerant);await payer();const lignes=await journal();
    expect(lignes.map(l=>[l.lot_id,l.categorie,Number(l.montant)]).sort()).toEqual([[lot,'autre',1.01],[lot,'teom',99]].sort());
    expect((await db.query("select etat from public.paiements_factures_fourniture where facture_id=$1",[facture])).rows[0].etat).toBe('ventile');
  });
  it("une répartition déjà validée ventile le paiement sans doubler la part propriétaire",async()=>{
    await session(gerant);const r=await preparer();await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);await payer();
    const lignes=await journal();expect(lignes.filter(l=>l.lot_id!==null)).toHaveLength(2);
    expect(lignes.filter(l=>l.lot_id!==null).map(l=>Number(l.montant))).toEqual([49.5,49.5]);
    expect(lignes.filter(l=>l.lot_id===null).map(l=>Number(l.montant))).toEqual([1.01]);
  });
  it("une validation tardive reclasse l'attente par contre-écritures sans changer le total payé",async()=>{
    await session(gerant);await payer();const r=await preparer();await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);
    const lignes=await journal();expect(lignes.filter(l=>l.phase==='annulation')).toHaveLength(2);
    expect(lignes.filter(l=>l.phase==='ventilation')).toHaveLength(3);
    expect(Math.round(lignes.reduce((s,l)=>s+Number(l.montant)*(l.sens==='depense'?1:-1),0)*100)).toBe(10001);
    const n=lignes.length;await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);expect(await journal()).toHaveLength(n);expect(await payer()).toBeTruthy();expect(await journal()).toHaveLength(n);
  });
  it("refuse locataire, compte étranger et agent hors portefeuille, sans écriture partielle",async()=>{
    for(const c of [locataire,autre,agent]){await session(c);await refus("select public.payer_facture_fourniture($1,$2,'2026-10-01')",[org,facture]);expect((await db.query("select * from public.paiements_factures_fourniture where facture_id=$1",[facture])).rows).toEqual([]);}
    await postgres();expect((await db.query("select payee_le from public.factures_fourniture where id=$1",[facture])).rows[0].payee_le).toBeNull();
  });
  it("refuse date future, date infinie, montant nul et mois clos atomiquement",async()=>{
    await session(gerant);for(const d of ['2099-01-01','infinity'])await refus("select public.payer_facture_fourniture($1,$2,$3)",[org,facture,d]);
    await db.query("select public.cloturer_mois($1,'2026-09-01')",[org]);await refus("select public.payer_facture_fourniture($1,$2,'2026-09-30')",[org,facture]);
    expect(await journal()).toEqual([]);expect((await db.query("select payee_le from public.factures_fourniture where id=$1",[facture])).rows[0].payee_le).toBeNull();
    await postgres();await db.query("update public.factures_fourniture set total_cents=0,frais_gestion_cents=0 where id=$1",[facture]);await session(gerant);await refus("select public.payer_facture_fourniture($1,$2,'2026-10-01')",[org,facture],/nul/);
  });
  it("interdit les mutations directes de paiement, les liens forgés et les changements après paiement",async()=>{
    await session(gerant);await refus("update public.factures_fourniture set payee_le='2026-10-01' where id=$1",[facture]);await payer();
    await refus("update public.factures_fourniture set total_cents=20000 where id=$1",[facture]);
    await refus("update public.paiements_factures_fourniture set date_paiement='2026-10-02' where facture_id=$1",[facture]);
    const e=(await db.query("select ecriture_id as id from public.ecritures_factures_fourniture limit 1")).rows[0].id;
    await refus("select public.contre_ecriture($1,'Annulation directe interdite')",[e],/automatiquement/);
    await refus("insert into public.ecritures_factures_fourniture(ecriture_id,paiement_id,phase) values($1,gen_random_uuid(),'paiement')",[e]);
  });
  it("refuse une adhésion devenue inactive et un dossier dont les écritures sont fermées",async()=>{
    await db.query("update public.memberships set status='inactive' where account_id=$1 and organization_id=$2",[gerant,org]);await session(gerant);
    await refus("select public.payer_facture_fourniture($1,$2,'2026-10-01')",[org,facture]);
    await postgres();await db.query("update public.memberships set status='active' where account_id=$1 and organization_id=$2",[gerant,org]);
    await db.query("select public.tache_systeme()");await db.query("update public.organizations set status='suspendue' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");
    await session(gerant);await refus("select public.payer_facture_fourniture($1,$2,'2026-10-01')",[org,facture]);
  });
  it("conserve la date du paiement quand une dépense d'un mois clos est ventilée ensuite",async()=>{
    await session(gerant);await payer('2026-09-20');await db.query("select public.cloturer_mois($1,'2026-09-01')",[org]);const r=await preparer();await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);
    const lignes=await journal();expect(lignes.every(l=>l.date_piece==='2026-09-20')).toBe(true);expect(lignes.filter(l=>l.phase!=='paiement').every(l=>l.date_imputation!=='2026-09-20')).toBe(true);
    expect(Math.round(lignes.reduce((s,l)=>s+Number(l.montant)*(l.sens==='depense'?1:-1),0)*100)).toBe(10001);
  });

  async function repartitionLocataire() {
    const r=await id("select public.preparer_repartition_fourniture($1,$2,'Parts égales confirmées sur la facture') as id",[facture,JSON.stringify([{lot_id:lot,bail_id:bail,poids:1,recuperable:true},{lot_id:lotB,bail_id:null,poids:1,recuperable:false}])]);
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);return r;
  }
  const brouillon=()=>id("select public.preparer_regularisation_fourniture($1,$2,2026) as id",[org,bail]);
  const emettre=(d:string,complet=true,enCours=true)=>id("select public.emettre_regularisation_fourniture($1,$2,(select empreinte from public.brouillons_regularisation_fourniture where id=$2),$3,$4,false,$5,'application/pdf',123,repeat('e',64)) as id",[org,d,complet,enCours,`${org}/decompte-test.pdf`]);
  it("prépare sans ressaisie, sans second prorata ni émission immédiate",async()=>{
    await session(gerant);await repartitionLocataire();const d=await brouillon();expect(await brouillon()).toBe(d);
    const r=(await db.query("select source from public.brouillons_regularisation_fourniture where id=$1",[d])).rows[0].source;
    expect(r.charges_reelles).toBe(49.5);expect(r.provisions).toBe(10);expect(r.ecart).toBe(-39.5);expect(r.factures).toHaveLength(1);
    expect((await db.query("select * from public.regularisations_charges where bail_id=$1",[bail])).rows).toEqual([]);
  });
  it("émet une seule régularisation avec PDF lié et visible par le seul locataire concerné",async()=>{
    await session(gerant);await repartitionLocataire();const d=await brouillon();const r=await emettre(d);expect(await emettre(d)).toBe(r);
    const reg=(await db.query("select provisions,charges_reelles,ecart,justificatif_document from public.regularisations_charges where id=$1",[r])).rows[0];
    expect([Number(reg.provisions),Number(reg.charges_reelles),Number(reg.ecart)]).toEqual([10,49.5,-39.5]);
    expect((await db.query("select count(*)::int n from public.regularisations_charges where bail_id=$1",[bail])).rows[0].n).toBe(1);
    await session(locataire);expect((await db.query("select document_id from public.mes_pieces_locataire($1) where document_id=$2",[org,reg.justificatif_document])).rows).toHaveLength(1);
    expect((await db.query("select id from public.brouillons_regularisation_fourniture where id=$1",[d])).rows).toHaveLength(0);
    await session(autre);expect((await db.query("select document_id from public.mes_pieces_locataire($1) where document_id=$2",[org,reg.justificatif_document])).rows).toHaveLength(0);
  });
  it("refuse les données ou confirmations périmées sans document orphelin",async()=>{
    await session(gerant);await repartitionLocataire();const d=await brouillon();
    await refus("select public.emettre_regularisation_fourniture($1,$2,(select empreinte from public.brouillons_regularisation_fourniture where id=$2),false,true,false,$3,'application/pdf',123,repeat('e',64))",[org,d,`${org}/decompte-test.pdf`],/Confirmez/);
    await refus("select public.emettre_regularisation_fourniture($1,$2,(select empreinte from public.brouillons_regularisation_fourniture where id=$2),true,false,false,$3,'application/pdf',123,repeat('e',64))",[org,d,`${org}/decompte-test.pdf`],/pas terminé/);
    await postgres();await db.query("update public.appels_loyer set charges=20,montant_du=520 where bail_id=$1",[bail]);await session(gerant);
    await refus("select public.emettre_regularisation_fourniture($1,$2,(select empreinte from public.brouillons_regularisation_fourniture where id=$2),true,true,false,$3,'application/pdf',123,repeat('e',64))",[org,d,`${org}/decompte-test.pdf`],/changé/);
    expect((await db.query("select id from public.documents where storage_path=$1",[`${org}/decompte-test.pdf`])).rows).toEqual([]);
  });
  it("respecte forfait, année, décompte validé, portefeuille et unicité avec le parcours manuel",async()=>{
    await session(gerant);await refus("select public.preparer_regularisation_fourniture($1,$2,2026)",[org,bail],/Aucun/);
    await repartitionLocataire();for(const c of [autre,locataire,agent]){await session(c);await refus("select public.preparer_regularisation_fourniture($1,$2,2026)",[org,bail]);}
    await session(gerant);await refus("select public.preparer_regularisation_fourniture($1,$2,2099)",[org,bail],/exercice/);
    await postgres();await db.query("update public.baux set charges_mode='forfait' where id=$1",[bail]);await session(gerant);await refus("select public.preparer_regularisation_fourniture($1,$2,2026)",[org,bail],/provisions/);
    await postgres();await db.query("update public.baux set charges_mode='provision' where id=$1",[bail]);
    await db.query("insert into public.regularisations_charges(organization_id,bail_id,annee,provisions,charges_reelles,ecart,justificatif_document) values($1,$2,2026,10,10,0,$3)",[org,bail,doc]);
    await session(gerant);await refus("select public.preparer_regularisation_fourniture($1,$2,2026)",[org,bail],/déjà été régularisé/);
  });
  async function consommationAnnuelle(fin: string, intermediaire: boolean) {
    await db.query("update public.baux set date_debut='2025-09-01' where id=$1", [bail]);
    await db.query("update public.factures_fourniture set periode_debut='2025-12-01',periode_fin=$2,total_cents=10000,frais_gestion_cents=0,consommation=20,unite_consommation='m3' where id=$1", [facture,fin]);
    await session(gerant);
    const compteur = await id("insert into public.compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande) values($1,$2,$3,'eau_froide','m3','Annuel',100,'2025-12-01','2026-01-01') returning id", [org,bien,lot]);
    if(intermediaire) await db.query("select public.enregistrer_releve_compteur($1,$2,105,'2026-01-01')",[org,compteur]);
    await db.query("select public.enregistrer_releve_compteur($1,$2,120,$3)",[org,compteur,fin]);
    const commun={lot_id:lot,bail_id:bail,compteur_id:compteur,poids:1,poids_fixe:0,recuperable:true};
    const segments=intermediaire ? [{...commun,periode_debut:'2025-12-01',periode_fin:'2026-01-01'},{...commun,periode_debut:'2026-01-01',periode_fin:fin}] : [commun];
    const r=await id("select public.preparer_repartition_fourniture($1,$2,'Consommations avec périodes vérifiées','consommations') as id",[facture,JSON.stringify(segments)]);
    await db.query("select public.valider_repartition_fourniture($1,(select empreinte from public.repartitions_fourniture where id=$1))",[r]);
  }
  async function sourceAnnuelle(annee:number) {
    const d=await id("select public.preparer_regularisation_fourniture($1,$2,$3) as id",[org,bail,annee]);
    return (await db.query("select source from public.brouillons_regularisation_fourniture where id=$1",[d])).rows[0].source;
  }
  it("affecte intégralement à décembre un relevé du 1er décembre au 1er janvier exclusif",async()=>{
    await consommationAnnuelle('2026-01-01',false);
    const source=await sourceAnnuelle(2025);expect(source.charges_reelles).toBe(100);
    expect(source.factures[0]).toMatchObject({debut:'2025-12-01',fin:'2025-12-31',montant_cents:10000});
    await refus("select public.preparer_regularisation_fourniture($1,$2,2026)",[org,bail],/Aucun/);
  });
  it("une facture décembre-février avec index au 1er janvier alimente deux exercices sans double compte",async()=>{
    await consommationAnnuelle('2026-02-01',true);
    const precedent=await sourceAnnuelle(2025),suivant=await sourceAnnuelle(2026);
    expect(precedent.charges_reelles).toBe(25);expect(suivant.charges_reelles).toBe(75);
    expect(precedent.charges_reelles+suivant.charges_reelles).toBe(100);
    expect(precedent.factures[0]).toMatchObject({debut:'2025-12-01',fin:'2025-12-31',montant_cents:2500});
    expect(suivant.factures[0]).toMatchObject({debut:'2026-01-01',fin:'2026-01-31',montant_cents:7500});
  });
  it("bloque aussi un ancien décompte validé dont le segment traversait janvier sans ventilation",async()=>{
    await consommationAnnuelle('2026-02-01',true);
    // Reconstitue sous le rôle de fixture un ancien décompte antérieur à la
    // garde de validation ; le client n'a aucun droit de modifier ces lignes.
    await postgres();
    await db.query("update public.repartitions_fourniture set lignes=jsonb_build_array((lignes->0)||jsonb_build_object('periode_fin','2026-02-01','montant_cents',10000)) where facture_id=$1",[facture]);
    await session(gerant);
    for(const annee of [2025,2026])await refus("select public.preparer_regularisation_fourniture($1,$2,$3)",[org,bail,annee],/sans ventilation vérifiée au 1er janvier/);
  });
  it("la clé forfaitaire conserve sa fin inclusive au 1er janvier et ne devine pas un prorata",async()=>{
    await db.query("update public.baux set date_debut='2025-09-01' where id=$1",[bail]);
    await db.query("update public.factures_fourniture set periode_debut='2025-12-01',periode_fin='2026-01-01' where id=$1",[facture]);
    await session(gerant);await repartitionLocataire();
    await refus("select public.preparer_regularisation_fourniture($1,$2,2025)",[org,bail],/sans ventilation vérifiée au 1er janvier/);
  });

  it("un retour financier avec des paiements refuse atomiquement sans perdre droits ni preuve",async()=>{
    await session(gerant);const p=await payer();await postgres();
    await refus(readFileSync('supabase/retours-arriere/20261028154615_factures_fourniture_journal_atomique.retour.sql','utf8'),[],/Retour refusé/);
    expect((await db.query("select id from public.paiements_factures_fourniture where id=$1",[p])).rows).toHaveLength(1);
    await session(gerant);expect(await payer()).toBe(p);
  });
  it("un retour annuel conserve les brouillons et refuse sans désactiver leur préparation",async()=>{
    await session(gerant);await repartitionLocataire();const d=await brouillon();await postgres();
    await refus(readFileSync('supabase/retours-arriere/20261028155855_regularisations_depuis_fournitures.retour.sql','utf8'),[],/Retour refusé/);
    await session(gerant);expect(await brouillon()).toBe(d);
  });

});
