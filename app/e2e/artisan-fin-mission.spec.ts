import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';
import { pdfFictif } from './pdf-fictif';

test.use({ storageState: 'e2e/.auth/artisan.json' });
test('intervention acceptée : démarrage, photo, bilan, facture et réception gestionnaire', async ({page,browser},info)=>{
 test.setTimeout(120000);
 const cible=process.env.SUPALOCAL_DB;
 test.skip(!cible||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),'Base API fictive locale requise');
 const db=new Client({connectionString:cible});await db.connect();
 const incident=randomUUID(),mission=randomUUID(),numero=`E2E-FIN-${randomUUID().slice(0,8)}`;
 const bilan=`Joint remplacé et étanchéité vérifiée — ESSAI ${mission}`;
 const preuve:Record<string,unknown>={mission,statut:'en cours',fixture:'Mission acceptée sans devis ; tous les gestes suivants sont faits dans le navigateur'};
 const gestion=await browser.newContext({storageState:'e2e/.auth/admin.json'});
 try {
  const {rows:[a]}=await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
  const {rows:[lot]}=await db.query("select i.organization_id,i.lot_id from incidents i join organizations o on o.id=i.organization_id where o.name='Agence Alpha' and i.id in (select incident_id from incident_interventions where artisan_id=$1) order by i.id limit 1",[a.id]);
  await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation','ESSAI fin de mission fictive','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')",[incident,lot.organization_id,lot.lot_id,numero]);
  await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())",[mission,lot.organization_id,incident,a.id]);
  await sansSyntheseAlertes(page);
  await page.goto(`/artisan/missions/${mission}/compte-rendu/bilan`);
  await expect(page).toHaveURL(url => url.pathname === `/artisan/missions/${mission}` && url.searchParams.get('raison') === 'demarrer');
  await page.getByRole('button',{name:"Je démarre l'intervention",exact:true}).click();
  await expect.poll(async()=>(await db.query('select statut from incident_interventions where id=$1',[mission])).rows[0].statut).toBe('en_cours');
  await page.goto(`/artisan/missions/${mission}/compte-rendu/bilan`);
  await expect(page).toHaveURL(url => url.pathname === `/artisan/missions/${mission}/compte-rendu` && url.searchParams.get('raison') === 'photo');
  // Vraie image décodable, propre à cette mission (pas un PNG tronqué ou altéré).
  await page.waitForLoadState('networkidle'); // Les champs SSR précèdent leur gestionnaire onChange.
  const photo=Buffer.from(await page.evaluate(id=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e3edf0';ctx.fillRect(0,0,320,180);
   ctx.fillStyle='#17324f';ctx.font='16px sans-serif';ctx.fillText('ESSAI — travail réalisé',16,50);ctx.font='10px sans-serif';ctx.fillText(id,16,90);
   return canvas.toDataURL('image/png').split(',')[1];
  },mission),'base64');
  await page.locator('form').filter({has:page.locator('[name="moment"][value="apres"]')}).locator('input[type=file]').setInputFiles({name:'travail-fictif.png',mimeType:'image/png',buffer:photo});
  await expect(page.getByText('Photo envoyée.',{exact:true})).toBeVisible({timeout:20000});
  await page.getByRole('link',{name:'Continuer — le bilan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Le bilan',exact:true})).toBeVisible();
  await page.getByLabel('Ce que vous avez fait',{exact:true}).fill(bilan);
  await page.getByRole('button',{name:"Terminer l'intervention",exact:true}).click();
  await expect(page).toHaveURL(url => url.pathname === `/artisan/missions/${mission}` && url.searchParams.get('termine') === '1');
  await page.getByRole('link',{name:'Déposer ma facture',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Déposer ma facture',exact:true})).toBeVisible();
  await page.getByLabel('Numéro de la facture',{exact:true}).fill(numero);
  await page.getByLabel('Montant TTC (€)',{exact:true}).fill('100,00');
  await page.getByLabel('Votre facture',{exact:true}).setInputFiles({name:'facture-fictive.pdf',mimeType:'application/pdf',buffer:pdfFictif()});
  await page.screenshot({path:info.outputPath('facture-avant-depot.png'),fullPage:true});
  expect(await debordementHorizontal(page)).toBe(0);
  await page.getByRole('button',{name:'Déposer ma facture',exact:true}).click();
  await expect(page).toHaveURL(/\/artisan\/facturation\?facture=1/);
  const {rows:[f]}=await db.query('select id,document_id,montant_ttc_cents from intervention_factures where intervention_id=$1',[mission]);
  expect(f.montant_ttc_cents).toBe('10000');
  expect((await db.query('select travaux_realises from intervention_comptes_rendus where intervention_id=$1',[mission])).rows[0].travaux_realises).toBe(bilan);
  const {rows:[p]}=await db.query("select document_id from intervention_photos where intervention_id=$1 and moment='apres'",[mission]);expect(p.document_id).toBeTruthy();
  const gerant=await gestion.newPage();await sansSyntheseAlertes(gerant);
  await gerant.goto(`/agence/${lot.organization_id}/incidents/${incident}`);
  await expect(gerant.getByRole('heading',{name:`Facture ${numero} — 100,00 € TTC`,exact:true})).toBeVisible();
  await expect(gerant.getByText(`« ${bilan} »`,{exact:true})).toBeVisible();
  const lien=gerant.getByRole('link',{name:'Consulter la facture avant de décider',exact:true});await expect(lien).toBeVisible();
  const lecture=await gerant.request.get((await lien.getAttribute('href'))!);expect(lecture.status()).toBe(200);expect(await lecture.text()).toContain('URL.createObjectURL');
  expect(await debordementHorizontal(gerant)).toBe(0);
  await gerant.screenshot({path:info.outputPath('reception-gestionnaire.png'),fullPage:true});
  preuve.statut='réussi';preuve.demarrage=true;preuve.photoDeposee=true;preuve.compteRenduTransmis=true;preuve.factureDeposee=true;preuve.factureLueParGerant=true;
 } finally {writeFileSync(info.outputPath('preuve-fin-mission.json'),JSON.stringify(preuve,null,2)+'\n');await gestion.close();await db.end();}
 // Données uniquement dans la base CI éphémère, supprimée avec le conteneur.
});

test('devis privé : compléter son identité puis reprendre sans ressaisir ni altérer la version validée',async({page},info)=>{
 test.setTimeout(120000);
 const cible=process.env.SUPALOCAL_DB;
 test.skip(!cible||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),'Base API fictive locale requise');
 const db=new Client({connectionString:cible});await db.connect();
 try {
  await sansSyntheseAlertes(page);
  const nom=`ESSAI identité ${randomUUID().slice(0,8)}`;
  await page.goto('/artisan/clients');
  await page.getByLabel('Nom ou raison sociale',{exact:true}).fill(nom);
  await page.getByLabel('Adresse',{exact:true}).fill('1 rue des Essais, 75012 Paris');
  await page.getByRole('button',{name:'Créer le client',exact:true}).click();await page.waitForURL(/\/artisan\/clients\/[a-f\d-]+$/);
  await page.getByRole('link',{name:'Créer un chantier et son devis',exact:true}).click();
  await page.getByLabel('Titre du chantier',{exact:true}).fill(nom);
  await page.getByLabel('Demande du client',{exact:true}).fill('Joint fictif à remplacer');
  await page.getByRole('button',{name:'Créer le chantier et préparer le devis',exact:true}).click();await page.waitForURL(/\/artisan\/chantiers\/[a-f\d-]+$/);
  const href=new URL(page.url()).pathname,chantier=href.split('/').at(-1)!;
  await page.getByLabel('Libellé',{exact:true}).fill('Joint conservé dans toutes les versions');
  await page.getByLabel('Prix unitaire HT (€)',{exact:true}).fill('85');
  await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Devis — version 1 · Brouillon',exact:true})).toBeVisible();
  // Reproduit le brouillon historique incomplet sans toucher au profil partagé du seed.
  await db.query("update artisan_devis_externes set entreprise=jsonb_set(entreprise,'{adresse}','\"\"') where chantier_id=$1 and version=1 and statut='brouillon'",[chantier]);
  const {rows:[ancien]}=await db.query('select * from artisan_devis_externes where chantier_id=$1',[chantier]);
  await page.reload();await expect(page.getByText('Adresse absente de cette version',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Compléter mes coordonnées',exact:true}).click();
  const adresse=page.getByLabel('Adresse complète de l’entreprise',{exact:true});await expect(adresse).toBeVisible({timeout:60000});
  await adresse.fill('25 rue de l’Essai, 75012 Paris');
  await page.getByRole('button',{name:'Enregistrer mes informations de devis',exact:true}).click();
  await expect(page.getByText(/Informations enregistrées pour vos nouveaux devis/)).toBeVisible();
  await page.goto(href);await expect(page.getByText('Adresse absente de cette version',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reprendre avec mes coordonnées à jour',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Devis — version 2 · Brouillon',exact:true})).toBeVisible();
  await expect(page.getByText('25 rue de l’Essai, 75012 Paris',{exact:true})).toBeVisible();
  const {rows:[nouveau]}=await db.query('select * from artisan_devis_externes where chantier_id=$1 and version=2',[chantier]);
  expect(nouveau.lignes).toEqual(ancien.lignes);expect(nouveau.montant_ttc_cents).toBe(ancien.montant_ttc_cents);expect(nouveau.description).toBe(ancien.description);expect(nouveau.valide_jusqu_au).toEqual(ancien.valide_jusqu_au);
  await page.getByRole('button',{name:'Valider cette version et générer le PDF',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Devis — version 2 · Validé',exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByRole('button',{name:'Reprendre avec mes coordonnées à jour',exact:true})).toHaveCount(0);
  const {rows:[valide]}=await db.query('select entreprise,pdf_id from artisan_devis_externes where id=$1',[nouveau.id]);
  expect(valide.entreprise.adresse).toBe('25 rue de l’Essai, 75012 Paris');expect(valide.pdf_id).toBeTruthy();
  const reponse=await page.request.get((await page.getByRole('link',{name:'Télécharger le PDF validé',exact:true}).getAttribute('href'))!);expect(reponse.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Devis — version 2 · Validé',exact:true})).toBeVisible({timeout:60000});
  expect((await db.query('select entreprise,pdf_id from artisan_devis_externes where id=$1',[nouveau.id])).rows[0]).toEqual(valide);
  expect((await db.query('select entreprise from artisan_devis_externes where id=$1',[ancien.id])).rows[0].entreprise.adresse).toBe('');
  expect(await debordementHorizontal(page)).toBe(0);await page.screenshot({path:info.outputPath('devis-repris-valide.png'),fullPage:true});
 } finally {await db.end();}
});
