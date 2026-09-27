import {test,expect} from '@playwright/test';
import path from 'node:path';
import {sansSyntheseAlertes,debordementHorizontal} from './aides';
test.use({storageState:path.join(__dirname,'.auth','superadmin.json')});
test.beforeEach(async({page})=>{await sansSyntheseAlertes(page);});
test('supervision : pause et reprise des passages sans exécution du traitement',async({page})=>{
 await page.goto('/admin/equipes');await expect(page.getByRole('heading',{name:'Travail des équipes'})).toBeVisible();
 const mission=page.locator('section').filter({has:page.getByRole('heading',{name:'Avis d’échéance',exact:true})});
 await mission.getByRole('button',{name:'Mettre en pause',exact:true}).click();await expect(mission.getByRole('status')).toContainText('en pause');await expect(mission.getByRole('button',{name:'Lancer maintenant'})).toHaveCount(0);
 await mission.getByRole('button',{name:'Reprendre',exact:true}).click();await expect(mission.getByRole('status')).toContainText('réactivés');await expect(mission.getByRole('button',{name:'Lancer maintenant'})).toBeVisible();
 await expect(mission.getByText('aucun depuis la mise en place de ce suivi')).toBeVisible();expect(await debordementHorizontal(page)).toBe(0);
});
test('supervision : le plan d’absence peut être enregistré sans créer de nouveaux accès',async({page})=>{
 await page.goto('/admin/relais');await page.getByText('Délai d’absence et consignes',{exact:true}).click();await page.getByLabel('Absence à signaler après combien de jours ?').fill('7');await page.getByLabel('Consignes en cas d’absence').fill('Continuer les traitements autorisés et conserver les décisions sensibles.');await page.getByRole('button',{name:'Enregistrer le plan'}).click();await expect(page.getByRole('status')).toContainText('plan de continuité est enregistré');
});
test('supervision : la marque blanche donne des étapes lisibles',async({page})=>{
 await page.goto('/admin/marque-blanche');await expect(page.getByRole('heading',{name:'Personnalisation des agences'})).toBeVisible();await expect(page.getByRole('link',{name:'Fiche de l’organisation et entrée dans son espace →'}).first()).toBeVisible();expect(await debordementHorizontal(page)).toBe(0);
});
