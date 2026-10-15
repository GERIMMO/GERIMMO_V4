import {test,expect} from '@playwright/test';
import path from 'node:path';
import {sansSyntheseAlertes,debordementHorizontal} from './aides';
import {champParis} from '../src/lib/dates-supervision';

test.use({storageState:path.join(__dirname,'.auth','superadmin.json')});
test.beforeEach(async({page})=>sansSyntheseAlertes(page));

test('une consigne exige une version activée, conserve sa preuve et reste suspendable',async({page},testInfo)=>{
 const titre=`E2E supervision locale ${Date.now()}`;
 await page.goto('/admin/consignes');
 await expect(page.getByRole('heading',{name:'Consignes du dirigeant'})).toBeVisible();
 const creation=page.locator('main section').filter({has:page.getByRole('heading',{name:'Donner une consigne',exact:true})});
 await creation.getByLabel('Titre',{exact:true}).fill(titre);
 await creation.getByLabel('Consigne et contexte',{exact:true}).fill('Données fictives : observer uniquement la mission de quittances.');
 await creation.getByRole('combobox',{name:'Responsable déjà habilité',exact:true}).selectOption({index:1});
 const debut=champParis(new Date(Date.now()-3_600_000).toISOString());
 const fin=champParis(new Date(Date.now()+7_200_000).toISOString());
 await creation.getByLabel('Début — heure de Paris',{exact:true}).fill(debut);
 await creation.getByLabel('Fin — heure de Paris',{exact:true}).fill(champParis(new Date(Date.now()-7_200_000).toISOString()));
 await creation.getByLabel('Lire l’état actif ou en pause de la mission',{exact:true}).check();
 await creation.getByRole('button',{name:'Préparer la consigne',exact:true}).click();
 await expect(creation.getByRole('alert')).toContainText('Dates de validité');
 await expect(creation.getByLabel('Titre',{exact:true})).toHaveValue(titre);
 await expect(creation.getByLabel('Lire l’état actif ou en pause de la mission',{exact:true})).toBeChecked();
 await creation.getByLabel('Fin — heure de Paris',{exact:true}).fill(fin);
 await creation.getByRole('button',{name:'Préparer la consigne',exact:true}).click();
 const fiche=page.locator('main section').filter({has:page.getByRole('heading',{name:`${titre} — version 1`,exact:true})});
 await expect(fiche.getByText('Cette version attend son activation',{exact:true})).toBeVisible();
 await expect(fiche.getByRole('button',{name:'Exécuter cette lecture'})).toHaveCount(0);
 await fiche.getByRole('button',{name:'Activer la version 1',exact:true}).click();
 await expect(fiche.getByText('Version activée',{exact:true})).toBeVisible();
 await fiche.getByRole('button',{name:'Exécuter cette lecture',exact:true}).click();
 await expect(fiche.getByText('Résultat conservé — Quittances',{exact:true})).toBeVisible();
 await expect(fiche.getByText(/Au moment de la lecture, la mission était/)).toBeVisible();
 await expect(fiche.getByRole('button',{name:'Exécuter cette lecture'})).toHaveCount(0);
 await page.reload();
 await expect(fiche.getByText('Résultat conservé — Quittances',{exact:true})).toHaveCount(1);
 expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
 await page.screenshot({path:testInfo.outputPath('consigne-executee.png'),fullPage:true});
 await fiche.getByRole('button',{name:'Suspendre les nouvelles exécutions',exact:true}).click();
 await expect(fiche.getByText('Suspendue',{exact:true})).toBeVisible();
 await fiche.getByRole('button',{name:'Reprendre explicitement',exact:true}).click();
 await expect(fiche.getByText('Version activée',{exact:true})).toBeVisible();
 await fiche.getByText('Préparer une révision',{exact:true}).click();
 const revision=fiche;
 await revision.getByRole('textbox',{name:'Consigne et contexte',exact:true}).fill('Version révisée fictive : compter les passages, après un nouvel accord.');
 await revision.getByRole('checkbox',{name:'Compter les passages et ceux à reprendre pendant la période',exact:true}).check();
 await revision.getByRole('button',{name:'Préparer une nouvelle version',exact:true}).click();
 const fiche2=page.locator('main section').filter({has:page.getByRole('heading',{name:`${titre} — version 2`,exact:true})});
 await expect(fiche2.getByText('Cette version attend son activation',{exact:true})).toBeVisible();
 await expect(fiche2.getByRole('button',{name:'Exécuter cette lecture'})).toHaveCount(0);
 await fiche2.getByText('Historique des versions précédentes',{exact:true}).click();
 await expect(fiche2.getByText('Résultat conservé — Quittances',{exact:true})).toBeVisible();
 await expect(fiche2.getByText(/Version activée le/)).toBeVisible();
 await fiche2.getByRole('button',{name:'Suspendre les nouvelles exécutions',exact:true}).click();
 await expect(fiche2.getByText('Suspendue',{exact:true})).toBeVisible();
});

for(const format of [{nom:'mobile',width:390,height:844,isMobile:true},{nom:'ordinateur',width:1440,height:1000,isMobile:false}]){
 test.describe(`présentation ${format.nom}`,()=>{
  test.use({viewport:{width:format.width,height:format.height},isMobile:format.isMobile,hasTouch:format.isMobile});
  test('consignes et relais restent lisibles sans débordement',async({page},testInfo)=>{
   for(const ecran of [{chemin:'/admin/consignes',titre:'Consignes du dirigeant',nom:'consignes'},{chemin:'/admin/relais',titre:'Vacances programmées',nom:'relais'}]){
    await page.goto(ecran.chemin);
    await expect(page.getByRole('heading',{name:ecran.titre,exact:true})).toBeVisible();
    await expect(page.locator('main')).not.toContainText('ne peuvent pas être vérifi');
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath(`${ecran.nom}-${format.nom}.png`),fullPage:true,animations:'disabled'});
    await page.screenshot({path:testInfo.outputPath(`${ecran.nom}-${format.nom}-premier-ecran.png`),animations:'disabled'});
    const carte=page.locator('main section').filter({has:page.getByRole('heading',{name:ecran.nom==='consignes'?'Donner une consigne':'Vacances programmées',exact:true})});
    await carte.screenshot({path:testInfo.outputPath(`${ecran.nom}-${format.nom}-formulaire.png`),animations:'disabled'});
   }
  });
 });
}
