import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {sansSyntheseAlertes} from './aides';

const ORG='3c1d1e95-3570-400b-8012-44530be145b1';
test('PAY01 : Encaisser le reste transmet sa commande et solde une seule fois le loyer',async({page},testInfo)=>{
 test.setTimeout(90_000);
 const url=process.env.SUPALOCAL_DB;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale requise');
 const db=new Client({connectionString:url});await db.connect();
 const bien=randomUUID(),lot=randomUUID(),personne=randomUUID(),bail=randomUUID(),appel=randomUUID();
 const nom=`TEST PAY01 ${lot.slice(0,8)}`;
 const preuve:Record<string,unknown>={id:'PAY01-E2E',startedAt:new Date().toISOString(),expected:'Un clic UI crée une commande et un encaissement de 840 €, couvre le loyer et conserve un reste de zéro après rechargement.',fixture:{bien,lot,personne,bail,appel},status:'en cours',cleanup:null};
 try{
  await db.query('begin');
  const {periode,annee,mois}= (await db.query("select to_char(now() at time zone 'Europe/Paris','YYYY-MM-01') periode,extract(year from now() at time zone 'Europe/Paris')::int annee,extract(month from now() at time zone 'Europe/Paris')::int mois")).rows[0];
  await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue TEST PAY01','75001','Paris')",[bien,ORG,nom]);
  await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')",[lot,ORG,bien,nom]);
  await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')",[personne,ORG,nom]);
  await db.query("insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,$3,'nu','actif',780,60,($4::date-interval '1 month')::date,5,$5)",[bail,ORG,lot,periode,personne]);
  // Échue la veille du plus ancien des deux jours (Paris, UTC de la base) : l'état « Impayé » ne dépend pas de la plage 22 h–24 h UTC,
  // pendant laquelle la vue des loyers (current_date) et l'application (jour de Paris) divergent encore (décision X13 élargie, en attente du dirigeant).
  await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,$3,$4,least((now() at time zone 'Europe/Paris')::date,current_date)-1,780,60,840)",[appel,ORG,bail,periode]);
  await db.query('commit');
  expect((await db.query('select count(*)::int n from encaissements where bail_id=$1',[bail])).rows[0].n).toBe(0);
  await sansSyntheseAlertes(page);await page.goto('/connexion');
  await page.locator('#email').fill('proprietaire@gerimmo-demo.fr');
  await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE??'Gerimmo-Demo-2026');
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await page.waitForURL(/\/(espaces|agence)\//);
  await page.goto(`/agence/${ORG}/loyers?annee=${annee}&mois=${mois}&bien=${bien}`);
  await expect(page.getByRole('heading',{name:'Finances',exact:true})).toBeVisible();
  const reste=page.getByText('Reste à encaisser',{exact:true}).locator('..').locator('dd');
  await expect(reste).toHaveText(/840,00\s*€/);
  const ouvrir=()=>page.locator('#loyers summary').filter({hasText:/^Gérer les 1 loyers/}).click();
  await ouvrir();
  const ligne=page.locator('#loyers li:visible').filter({has:page.getByText(nom,{exact:true})});
  await expect(ligne.getByText('Impayé',{exact:true})).toBeVisible();
  await ligne.getByRole('button',{name:/^Encaisser 840,00/}).click();
  // Ce geste n'a pas de dialogue préalable ; son compte rendu positif confirme l'écriture.
  await expect(ligne.getByText(/840,00\s*€ encaissés/)).toBeVisible();
  await expect(ligne.getByText('Payé',{exact:true})).toBeVisible();
  await expect(reste).toHaveText(/0,00\s*€/);
  await expect(ligne.getByRole('button',{name:/^Encaisser/})).toHaveCount(0);
  const encaissements=(await db.query('select id,montant::float montant from encaissements where bail_id=$1',[bail])).rows;
  expect(encaissements).toHaveLength(1);expect(encaissements[0].montant).toBe(840);
  const commandes=(await db.query('select id,appel_id,encaissement_id,requete,resultat from commandes_encaissement_reste where bail_id=$1',[bail])).rows;
  expect(commandes).toHaveLength(1);
  expect(commandes[0]).toMatchObject({appel_id:appel,encaissement_id:encaissements[0].id,requete:{reste:840,anterieure:0},resultat:{statut:'enregistre',montant:840}});
  expect(commandes[0].id).toMatch(/^[0-9a-f-]{36}$/);
  const etat=(await db.query('select statut,(montant_du-montant_couvert)::float reste from etat_loyers_bail_brut($1) where appel_id=$2',[bail,appel])).rows[0];
  expect(etat).toEqual({statut:'paye',reste:0});
  preuve.actual={encaissements,commande:{id:commandes[0].id,requete:commandes[0].requete},etat};
  await page.screenshot({path:testInfo.outputPath('pay01-encaissement-confirme.png'),fullPage:true});
  await page.reload();await expect(reste).toHaveText(/0,00\s*€/);await ouvrir();
  await expect(ligne.getByText('Payé',{exact:true})).toBeVisible();
  await expect(ligne.getByRole('button',{name:/^Encaisser/})).toHaveCount(0);
  expect((await db.query('select count(*)::int n,sum(montant)::float montant from encaissements where bail_id=$1',[bail])).rows[0]).toEqual({n:1,montant:840});
  expect((await db.query('select count(*)::int n from commandes_encaissement_reste where bail_id=$1',[bail])).rows[0].n).toBe(1);
  preuve.status='exécuté avec succès';preuve.reloadPreservesResult=true;
 }finally{
  await db.query('rollback');
  try{
   await db.query('begin');
   // Uniquement les UUID créés par ce test, sans neutraliser de déclencheur.
   // Retirer leurs pièces avant l'encaissement évite de fabriquer une contre-écriture de nettoyage.
   await db.query('delete from commandes_encaissement_reste where bail_id=$1',[bail]);
   await db.query('delete from fiscal_qualifications_ecritures where ecriture_id in(select id from ecritures where bail_id=$1)',[bail]);
   await db.query('delete from fiscal_encaissements_composantes where ecriture_id in(select id from ecritures where bail_id=$1)',[bail]);
   await db.query('delete from ecritures where bail_id=$1',[bail]);
   await db.query('delete from encaissements where bail_id=$1',[bail]);
   await db.query('delete from quittances where bail_id=$1',[bail]);
   await db.query('delete from appels_loyer where bail_id=$1',[bail]);
   await db.query('delete from automation_events where organization_id=$1 and dossier_id=$2',[ORG,bail]);
   await db.query('delete from baux where id=$1',[bail]);
   await db.query('delete from lots where id=$1',[lot]);
   await db.query('delete from biens where id=$1',[bien]);
   await db.query('delete from persons where id=$1',[personne]);
   await db.query("delete from audit_log where organization_id=$1 and (details->>'bail_id'=$2 or details->>'lot_id'=$3 or details->>'bien_id'=$4)",[ORG,bail,lot,bien]);
   await db.query('commit');
   const restant=(await db.query('select (select count(*) from baux where id=$1)+(select count(*) from lots where id=$2)+(select count(*) from biens where id=$3)+(select count(*) from persons where id=$4)+(select count(*) from appels_loyer where id=$5)+(select count(*) from encaissements where bail_id=$1)+(select count(*) from ecritures where bail_id=$1)+(select count(*) from commandes_encaissement_reste where bail_id=$1) as n',[bail,lot,bien,personne,appel])).rows[0];
   expect(Number(restant.n)).toBe(0);preuve.cleanup={success:true,remainingRows:0};
  }catch(error){await db.query('rollback');preuve.cleanup={success:false,error:error instanceof Error?error.message:String(error)};throw error;}
  finally{preuve.finishedAt=new Date().toISOString();writeFileSync(testInfo.outputPath('pay01-preuve.json'),JSON.stringify(preuve,null,2)+'\n');await db.end();}
 }
});
