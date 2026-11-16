import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';
import { preparerEtPlanifierFuite } from "./local/fuite-trois-acteurs";
import { pdfFictif } from './pdf-fictif';

test.use({ storageState: 'e2e/.auth/artisan.json' });
for (const mode of ['depot', 'creation', 'sci'] as const) test(`intervention acceptée : démarrage, photo, bilan, facture (${mode}) et réception gestionnaire`, async ({page,browser},info)=>{
 test.setTimeout(120000);
 const cible=process.env.SUPALOCAL_DB;
 test.skip(!cible||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),'Base API fictive locale requise');
 const db=new Client({connectionString:cible});await db.connect();
 let incident=randomUUID() as string,mission=randomUUID() as string;
 const numero=`E2E-FIN-${randomUUID().slice(0,8)}`;
 const bilan=`Joint remplacé et étanchéité vérifiée — ESSAI ${mission}`;
 const preuve:Record<string,unknown>={mission,statut:'en cours',fixture:'Mission acceptée sans devis ; tous les gestes suivants sont faits dans le navigateur'};
 const gestion=await browser.newContext({storageState:'e2e/.auth/admin.json'});
 try {
  const {rows:[a]}=await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
  const {rows:[lot]}=await db.query("select i.organization_id,i.lot_id from incidents i join organizations o on o.id=i.organization_id where o.name='Agence Alpha' and i.id in (select incident_id from incident_interventions where artisan_id=$1) order by i.id limit 1",[a.id]);
  if (mode === 'creation') {
    const dossier = await preparerEtPlanifierFuite(db, browser, page, lot.organization_id, a.id);
    incident=dossier.incidentId; mission=dossier.mission;
    Object.assign(preuve,{mission,fixture:'Déclaration avec photo et choix du créneau en navigateur ; accord sur le devis dans le portail de gestion ; qualification et préparation du devis par les fonctions métier authentifiées.'});
  } else {
  if (mode === 'sci') {
    // Dossier indépendant : ne change jamais la détention du lot utilisé par les autres scénarios.
    const {rows:[bien]} = await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Maison des Amandiers','maison','6 rue des Amandiers','75012','Paris') returning id", [lot.organization_id]);
    const {rows:[logement]} = await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Maison','brouillon') returning id", [lot.organization_id,bien.id]);
    const {rows:[sci]} = await db.query("insert into persons(organization_id,nom,qualite,siren,address_line1,postal_code,city) values($1,'SCI des Amandiers','SCI','123456789','6 rue des Amandiers','75012','Paris') returning id", [lot.organization_id]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [lot.organization_id,logement.id,sci.id]);
    lot.lot_id = logement.id;
  }
  await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation','ESSAI fin de mission fictive','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')",[incident,lot.organization_id,lot.lot_id,numero]);
  await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())",[mission,lot.organization_id,incident,a.id]);
  }
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
  if (mode === 'depot') {
    await page.getByLabel('Montant TTC (€)',{exact:true}).fill('100,00');
    await page.getByLabel('Votre facture',{exact:true}).setInputFiles({name:'facture-fictive.pdf',mimeType:'application/pdf',buffer:pdfFictif()});
  } else {
    await page.getByLabel(mode === 'sci' ? 'Créer une facture pour une SCI' : 'Créer une facture de travaux pour un particulier').check();
    await page.getByLabel('Adresse de votre entreprise').fill('2 rue du Test, 75012 Paris');
    if (mode === 'sci') {
      await page.getByLabel('SIREN de la SCI cliente').fill('123456789');
      await page.getByLabel('Conditions d’escompte pour paiement anticipé').fill('Aucun escompte.');
      await page.getByLabel('Pénalités de retard et indemnité de recouvrement applicables').fill('Conditions de règlement convenues dans le devis fictif.');
    } else {
      await page.getByLabel('Nom du propriétaire à facturer').fill('Camille Fictive');
      await page.getByLabel('Adresse de facturation du propriétaire').fill('4 rue du Test, 75012 Paris');
    }
    await page.getByLabel('Adresse des travaux').fill('1 rue du Test, 75012 Paris');
    await page.getByLabel('Date de réalisation des travaux').fill('2026-01-01');
    await page.getByLabel('Date limite de règlement').fill('2099-12-31');
    await page.getByLabel('Conditions de règlement').fill('Par virement fictif.');
    await page.getByLabel(/Mentions de votre entreprise et de TVA/).fill('Entreprise individuelle. TVA non applicable, art. 293 B du CGI.');
    await page.getByLabel('Ligne 1 : prestation').fill('Remplacement du joint et contrôle');
    await page.getByLabel('Ligne 1 : prix unitaire HT').fill('100');
    await page.getByLabel('Ligne 1 : TVA').selectOption('0');
    await page.getByLabel('Je confirme le destinataire', {exact:false}).check();
  }
  await page.screenshot({path:info.outputPath('facture-avant-depot.png'),fullPage:true});
  expect(await debordementHorizontal(page)).toBe(0);
  await page.getByRole('button',{name:mode === 'depot' ? 'Déposer ma facture' : 'Créer et transmettre ma facture',exact:true}).click();
  await expect(page).toHaveURL(/\/artisan\/facturation\?facture=[0-9a-f-]{36}/);
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
  if (mode === 'creation') {
    await gerant.getByLabel('Résultat du contrôle de la facture').fill('Intervention réalisée, facture et justificatif vérifiés.');
    await gerant.getByRole('button',{name:'Valider cette facture'}).click();
    await expect.poll(async()=>(await db.query('select validee_le is not null and reglee_le is null ok from intervention_factures where intervention_id=$1',[mission])).rows[0].ok).toBe(true);
    const cloture=gerant.locator('#cloture');
    await cloture.locator('select[name=motif]').selectOption('resolu');
    await cloture.getByLabel('Ce qui a été fait').fill('Fuite réparée et justificatifs vérifiés.');
    await cloture.getByRole('button',{name:"Clôturer l'incident"}).click();
    await expect.poll(async()=>(await db.query('select etat from incidents where id=$1',[incident])).rows[0].etat).toBe('clos');
    const locataire=await browser.newContext({storageState:'e2e/.auth/locataire.json',viewport:page.viewportSize()});
    try {
      const suivi=await locataire.newPage();
      await suivi.goto(`/locataire/${lot.organization_id}/demandes`);
      await expect(suivi.locator('#demande-'+incident).getByRole('button',{name:'Le problème persiste'})).toBeVisible();
    } finally { await locataire.close(); }
    Object.assign(preuve,{incidentClos:true,factureValideeSansReglement:true,locatairePeutSignalerUnePersistance:true});
  }
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
  const adresse=page.getByRole('textbox',{name:'Adresse complète de l’entreprise',exact:true});await expect(adresse).toBeVisible();
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
