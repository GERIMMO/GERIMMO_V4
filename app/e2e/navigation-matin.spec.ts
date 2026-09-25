import {test,expect} from '@playwright/test';
import {sansSyntheseAlertes,entrerDansEspace} from './aides';

test.describe('Tour du matin de la supervision',()=>{
 test.use({storageState:'e2e/.auth/superadmin.json'});
 test.beforeEach(async({page})=>{await sansSyntheseAlertes(page);});
 test('arrive sur Aujourd’hui et retrouve les destinations dans le menu mobile',async({page})=>{
  await page.goto('/espaces');await expect(page).toHaveURL(/\/admin\/brief/);
  await expect(page.getByRole('heading',{name:'Aujourd’hui',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Menu supervision',exact:true}).click();
  await page.locator('summary').filter({hasText:'Développement commercial'}).click();
  await page.getByRole('link',{name:'Demandes commerciales',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Demandes commerciales',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Menu supervision',exact:true})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:'Menu supervision',exact:true}).click();
  await expect(page.getByRole('link',{name:'Demandes commerciales',exact:true})).toHaveAttribute('aria-current','page');
 });
 test('le menu complet est accessible sur ordinateur sans ouvrir le bouton mobile',async({page})=>{
  await page.setViewportSize({width:1440,height:960});await page.goto('/admin/brief');
  await expect(page.getByRole('link',{name:'Aujourd’hui',exact:true})).toBeVisible();
  await page.locator('summary').filter({hasText:'Dossiers et décisions'}).click();
  await expect(page.getByRole('link',{name:'Artisans à valider',exact:true})).toBeVisible();
 });
 test('la santé conduit directement au résultat des traitements',async({page})=>{
  await page.goto('/admin/sante');
  const contenu=page.getByRole('main').filter({has:page.getByRole('heading',{name:'Santé du service',exact:true})});
  await expect(contenu).toBeVisible();
  await expect(contenu).not.toContainText('lib/editeur.ts');
  await page.getByRole('link',{name:'Voir l’historique →'}).or(page.getByRole('link',{name:"Voir l'historique →"})).click();
  await expect(page).toHaveURL(/\/admin\/journaux#historique-service$/);
  await expect(page.locator('#historique-service')).toBeInViewport();
  await expect(page.locator('#historique-service')).toContainText('Historique du service');
 });
});
test.describe('Actualisation marketing depuis un autre fuseau horaire',()=>{
 test.use({storageState:'e2e/.auth/superadmin.json',timezoneId:'America/New_York'});
 test('affiche l’heure serveur sans erreur et actualise réellement les informations',async({page})=>{
  await sansSyntheseAlertes(page);
  const erreurs:string[]=[];
  page.on('pageerror',erreur=>erreurs.push(erreur.message));
  await page.goto('/admin/marketing');
  const heure=page.locator('time[datetime]');
  await expect(heure).toBeVisible();
  const premiere=await heure.getAttribute('datetime');
  expect(premiere).toBeTruthy();
  await expect(heure).toHaveText(new Date(premiere!).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}));
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(heure).not.toHaveAttribute('datetime',premiere!);
  await expect(page.getByRole('button',{name:'Actualiser',exact:true})).toBeEnabled();
  expect(erreurs).toEqual([]);
 });
});
for (const profil of ['admin','agent','proprietaire','locataire'] as const) {
 test.describe(`Retour de veille — ${profil}`,()=>{
  test.use({storageState:`e2e/.auth/${profil}.json`});
  test('revient directement à son espace et garde le retour après un filtre',async({page})=>{
   await sansSyntheseAlertes(page);
   const prefixe=profil==='locataire'?'locataire':'agence';
   const org=await entrerDansEspace(page,prefixe);
   const retour=`/${prefixe}/${org}`;
   await page.goto(`/veille?public=${profil==='locataire'?'locataire':'agence'}&retour=${encodeURIComponent(retour)}`);
   await page.getByRole('link',{name:'Tout voir',exact:true}).click();
   await expect(page.getByRole('link',{name:'← Revenir à mon espace',exact:true})).toHaveAttribute('href',retour);
   await page.getByRole('link',{name:'← Revenir à mon espace',exact:true}).click();
   await expect(page).toHaveURL(new RegExp(`${retour}$`));
  });
 });
}
