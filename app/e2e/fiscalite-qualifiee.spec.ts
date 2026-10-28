import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {debordementHorizontal,sansSyntheseAlertes} from './aides';
const ORG='3c1d1e95-3570-400b-8012-44530be145b1';
test('fiscalité : qualifier copro, terrain et 230, puis retrouver le même export',async({page},testInfo)=>{
 test.setTimeout(90_000);
 const url=process.env.SUPALOCAL_DB;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale requise');
 const db=new Client({connectionString:url});await db.connect();const bien=randomUUID(),lot=randomUUID(),copro=randomUUID(),terrain=randomUUID(),personne=randomUUID();const nom='TEST Fiscal '+lot.slice(0,8);
 try{
  await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'immeuble','1 rue TEST','75001','Paris')",[bien,ORG,nom]);
  await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')",[lot,ORG,bien,nom]);
  await db.query("insert into persons(id,organization_id,nom,qualite) values($1,$2,$3,'Personne physique')",[personne,ORG,`TEST Propriétaire ${lot.slice(0,8)}`]);
  await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2026-01-01')",[ORG,lot,personne]);
  await db.query("insert into ecritures(id,organization_id,lot_id,categorie,sens,montant,date_piece) values($1,$2,$3,'Copropriété TEST','depense',1200,'2026-10-12'),($4,$2,$3,'Achat terrain TEST','depense',1000,'2026-10-12')",[copro,ORG,lot,terrain]);
  await sansSyntheseAlertes(page);await page.goto('/connexion');await page.locator('#email').fill('proprietaire@example.com');await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE??'Gerimmo-Demo-2026');await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(/\/(espaces|espace|agence)\//);
  await page.goto(`/espace/${ORG}/comptabilite/fiscal?annee=2026&bien=${bien}`);
  await expect(page.getByRole('link',{name:'Exporter les montants (CSV)'})).toHaveCount(0);
  const profil=page.locator('details').filter({has:page.locator('summary').filter({hasText:`TEST Propriétaire ${lot.slice(0,8)}`})});
  await profil.locator('[name="location_nue"]').selectOption('reel');await profil.locator('[name="location_meublee"]').selectOption('non_concerne');await profil.locator('[name="justification"]').fill('Déclaration TEST au réel vérifiée');await profil.locator('[name="confirme"]').check();await profil.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByText('À compléter — les totaux portent uniquement sur les montants confirmés.')).toBeVisible();
  expect((await db.query('select imposition,location_nue,version from fiscal_profils_detenteurs where person_id=$1',[personne])).rows).toEqual([{imposition:'ir',location_nue:'reel',version:1}]);
  const exercice=page.locator('details').filter({has:page.locator('summary').filter({hasText:nom})});await exercice.locator('summary').click();
  await exercice.locator('[name="justification"]').fill('Acte TEST, location nue et droits 100 % pour 2026');
  await exercice.locator('[name="regularisation230"]').fill('300');await exercice.locator('[name="justification230"]').fill('Décompte TEST 2025 : 300 euros à réintégrer');await exercice.locator('[name="confirme"]').check();await exercice.getByRole('button',{name:'Conserver l’exercice'}).click();
  await expect(exercice.locator('summary')).toContainText('confirmé v1');
  const depense=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Copropriété TEST'})});await depense.locator('summary').click();await depense.locator('[name="nature"]').selectOption('deductible');await depense.locator('[name="rubrique"]').selectOption('229');await depense.locator('[name="justification"]').fill('Relevé bancaire TEST : 1200 euros de provisions effectivement versés');await depense.locator('[name="confirme"]').check();await depense.getByRole('button',{name:'Conserver cette qualification'}).click();await expect(depense.locator('summary')).toContainText('qualification v1');
  const nonDeductible=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Achat terrain TEST'})});await nonDeductible.locator('summary').click();await nonDeductible.locator('[name="nature"]').selectOption('non_deductible');await nonDeductible.locator('[name="justification"]').fill('Acte TEST : acquisition de terrain non déductible');await nonDeductible.locator('[name="confirme"]').check();await nonDeductible.getByRole('button',{name:'Conserver cette qualification'}).click();await expect(nonDeductible.locator('summary')).toContainText('qualification v1');
  await page.reload();await expect(page.locator('.kpi').nth(1)).toContainText('900,00');
  const csv=decodeURIComponent((await page.getByRole('link',{name:'Exporter les montants (CSV)'}).getAttribute('href'))!.split(',').slice(1).join(','));
  expect(csv).toContain('"2026";"229"');expect(csv).toContain('"1200,00"');expect(csv).toContain('"2026";"230"');expect(csv).toContain('"300,00"');expect(csv).toContain('"Non déductible confirmé";"1000,00"');
  const telechargement=page.waitForEvent('download');await page.getByRole('link',{name:'Exporter les montants (CSV)'}).click();const fichier=await telechargement;const chemin=await fichier.path();expect(chemin).toBeTruthy();expect(readFileSync(chemin!,'utf8')).toBe(csv);await fichier.saveAs(testInfo.outputPath(`export-fiscal-ui-${testInfo.project.name}.csv`));
  const qualification=(await db.query('select nature,rubrique,version from fiscal_qualifications_ecritures where ecriture_id=$1',[copro])).rows;expect(qualification).toEqual([{nature:'deductible',rubrique:'229',version:1}]);
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({path:testInfo.outputPath(`ui-fiscal-${testInfo.project.name}.png`),fullPage:true});
  // Autre état de notre seule fixture : 230 reste visible sans pièce de l’année.
  await db.query('delete from fiscal_qualifications_ecritures where ecriture_id=any($1::uuid[])',[[copro,terrain]]);
  await db.query('delete from ecritures where id=any($1::uuid[])',[[copro,terrain]]);
  await page.reload();
  await expect(page.locator('.kpi').nth(1)).toContainText('-300,00');
  await expect(page.getByRole('link',{name:'Exporter les montants (CSV)'})).toBeVisible();
  // Le mobile porte code+libellé dans un paragraphe, le bureau les répartit
  // dans deux cellules. Lire la seule ligne accessible, sans viser la copie masquée.
  const libelle230='Régularisation des provisions de l’année précédente à réintégrer';
  const ligne230=page.getByRole('listitem').filter({hasText:libelle230})
    .or(page.getByRole('row').filter({hasText:libelle230}));
  await expect(ligne230).toHaveCount(1);
  await expect(ligne230).toBeVisible();
  await expect(ligne230).toContainText('230');
  await expect(ligne230).toContainText('300,00');

 }finally{
  await db.query('delete from fiscal_qualifications_ecritures where ecriture_id=any($1::uuid[])',[[copro,terrain]]);await db.query('delete from fiscal_exercices_lots where lot_id=$1',[lot]);await db.query("delete from audit_log where details->>'ecriture_id'=any($1::text[]) or details->>'lot_id'=$2",[[copro,terrain],lot]);await db.query('delete from ecritures where id=any($1::uuid[])',[[copro,terrain]]);await db.query('delete from fiscal_profils_detenteurs where person_id=$1',[personne]);await db.query("delete from audit_log where details->>'person_id'=$1",[personne]);await db.query('delete from detentions where person_id=$1',[personne]);await db.query('delete from persons where id=$1',[personne]);await db.query('delete from lots where id=$1',[lot]);await db.query('delete from biens where id=$1',[bien]);await db.end();
 }
});
