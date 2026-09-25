import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {sansSyntheseAlertes} from './aides';

// Données fictives, exclusivement sur la base API locale jetable de la recette.
const cible=process.env.SUPALOCAL_DB;
test.describe('Études, validation et visibilité par profil',()=>{
 test.skip(!cible,'La base API de recette est requise.');
 test.use({storageState:'e2e/.auth/superadmin.json',actionTimeout:10000});
 test.beforeEach(async({page})=>{await sansSyntheseAlertes(page);});
 let db:Client;const id=randomUUID(),titre='E2E · Préparer les diagnostics sans double saisie';
 test.beforeAll(async()=>{
  const url=new URL(cible!);
  if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1)))throw new Error('Une base de recette locale est obligatoire.');
  db=new Client({connectionString:cible});await db.connect();
  await db.query('begin');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await db.query('set local role service_role');
  await db.query("insert into public.regulatory_watch(id,source_url,titre,source_nom) values($1,$2,$3,'Source fictive de recette')",[id,'https://www.service-public.gouv.fr/particuliers/actualites/E2E-'+id,titre]);
  await db.query('select public.conserver_etude_veille($1,$2)',[id,{id,resume:'Étude fictive : vérifier les informations du diagnostic avant de préparer le dossier.',action:'Consulter le diagnostic enregistré dans le dossier.',publics:['artisan','bailleur'],application:null,incertitudes:'Exemple de recette, sans portée réglementaire.',evolution:'Vérifier la reprise des informations déjà enregistrées dans les formulaires.',benefice:'Éviter une nouvelle saisie des mêmes informations.',controles:'Tester un dossier complet et un dossier incomplet.',preuve:'Extrait fictif réservé au banc de recette.'}]);
  await db.query('commit');
 });
 test.afterAll(async()=>{if(db){await db.query("delete from public.development_proposals where source='veille_reglementaire' and source_id=$1",[id]);await db.query('delete from public.regulatory_watch where id=$1',[id]);await db.end();}});
 test('Gerimmo prépare l’étude ; le superviseur valide puis retire la diffusion',async({page,browser})=>{
  const utilisateur=await browser.newContext({storageState:'e2e/.auth/artisan.json'});const lecture=await utilisateur.newPage();await sansSyntheseAlertes(lecture);
  try{
   await lecture.goto('/veille?public=artisan');await expect(lecture.getByRole('heading',{name:titre,exact:true})).toHaveCount(0);
   await page.goto('/admin/veille');const carte=page.locator('article').filter({has:page.getByRole('heading',{name:titre,exact:true})});
   await expect(carte.getByRole('heading',{name:'L’étude préparée par Gerimmo'})).toBeVisible();
   await expect(carte).toContainText('Éviter une nouvelle saisie');
   await page.screenshot({path:'e2e/.results/veille-etude.png',fullPage:true});
   await carte.getByText('Relire la présentation aux utilisateurs et décider',{exact:true}).click();
   await expect(carte.getByLabel('Ce qui change')).toHaveValue(/Étude fictive/);
   await carte.getByRole('button',{name:'Valider et informer les utilisateurs'}).click();await expect(page.getByRole('heading',{name:titre,exact:true})).toHaveCount(0);
   await lecture.reload();await lecture.screenshot({path:'e2e/.results/veille-utilisateur.png',fullPage:true});await expect(lecture.getByRole('heading',{name:titre,exact:true})).toBeVisible();await expect(lecture.locator('body')).not.toContainText('Tester un dossier complet');
   // L'artisan lit la veille dans sa coquille (/artisan/regles, 25/09), sans filtre d'autres publics : la lecture « locataire » se fait par l'adresse publique.
   await lecture.goto('/veille?public=locataire');await expect(lecture.getByRole('heading',{name:titre,exact:true})).toHaveCount(0);
   await page.goto('/admin/autonomie#ameliorations');const proposition=page.locator('article').filter({has:page.getByRole('heading',{name:'Adapter Gerimmo : '+titre,exact:true})});
   await expect(proposition).toContainText('Éviter une nouvelle saisie');
   await proposition.getByText('Autoriser la préparation d’une correction',{exact:true}).click();
   await expect(proposition.getByLabel('Demande à préparer, sans donnée personnelle')).toHaveValue(/Vérifier la reprise des informations/);
   await expect(proposition.getByRole('button',{name:'Autoriser cette préparation'})).toBeVisible();
   // Le bouton de préparation n'est pas cliqué : aucun atelier externe n'est lancé.
   await page.goto('/admin/veille?etat=publie');const publiee=page.locator('article').filter({has:page.getByRole('heading',{name:titre,exact:true})});
   await publiee.getByText('Relire la présentation aux utilisateurs et décider',{exact:true}).click();await publiee.getByRole('button',{name:'Écarter ou retirer'}).click();
   await expect(page.getByRole('heading',{name:titre,exact:true})).toHaveCount(0);await lecture.goto('/veille?public=artisan');await expect(lecture.getByRole('heading',{name:titre,exact:true})).toHaveCount(0);
   await page.screenshot({path:'e2e/.results/veille-supervision.png',fullPage:true});
  }finally{await utilisateur.close();}
 });
 test('une étude territoriale conserve un résultat sourcé sans lancer de campagne',async({page})=>{
  const fin=new Date().toISOString().slice(0,10),debut=new Date(Date.now()-7*86400000).toISOString().slice(0,10),source='E2E étude locale '+id;
  try{
   await page.goto('/admin/territoire');await page.getByText('Compléter une étude ou les résultats d’un essai local',{exact:true}).click();
   await page.getByLabel('Département',{exact:true}).selectOption('75');await page.getByLabel('Information à compléter').selectOption('acquisition');
   await page.getByLabel('Nombre de clients réellement gagnés').fill('2');await page.getByLabel('Dépense totale attribuée au département (€)').fill('10');
   await page.getByLabel('Début de la période').fill(debut);await page.getByLabel('Fin de la période').fill(fin);await page.getByLabel('Source vérifiable').fill(source);await page.getByLabel('Méthode et limites').fill('Résultats entièrement fictifs et attribution locale pour la recette.');
   await page.getByRole('button',{name:'Enregistrer l’étude'}).click();await expect(page.getByRole('status')).toContainText('L’étude est conservée');
   expect((await db.query('select valeur from public.territory_studies where source=$1',[source])).rows).toEqual([{valeur:500}]);
  }finally{await db.query('delete from public.territory_studies where source=$1',[source]);}
 });
 test('la supervision contrôle le mode automatique, et l’artisan trouve la veille',async({page,browser})=>{
  await page.goto('/admin/marketing');const auto=page.getByLabel('Publier automatiquement');
  if(await auto.isDisabled()){
   // Sans Page Facebook reliée (audit 25/09, C21) : la case est décochée et désactivée, et le dit.
   await expect(auto).not.toBeChecked();await expect(page.getByText('la Page Facebook n’est pas reliée')).toBeVisible();
  }else{
   await expect(auto).toBeChecked();
   await auto.uncheck();await page.getByRole('button',{name:'Enregistrer les réglages'}).click();await expect(page.getByRole('status')).toContainText('mis à jour');
   await page.reload();await expect(page.getByLabel('Publier automatiquement')).not.toBeChecked();
   await page.getByLabel('Publier automatiquement').check();await page.getByRole('button',{name:'Enregistrer les réglages'}).click();await expect(page.getByRole('status')).toContainText('mis à jour');
  }
  const artisan=await browser.newContext({storageState:'e2e/.auth/artisan.json'});const ecran=await artisan.newPage();await sansSyntheseAlertes(ecran);
  try{await ecran.goto('/artisan/entreprise');await ecran.getByRole('link',{name:'Les règles à connaître pour mon activité'}).click();await expect(ecran).toHaveURL(/\/artisan\/regles/);}finally{await artisan.close();}
 });

});
