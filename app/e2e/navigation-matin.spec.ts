import {test,expect} from '@playwright/test';
import {sansSyntheseAlertes,entrerDansEspace} from './aides';

test.describe('Tour du matin de la supervision',()=>{
 test.use({storageState:'e2e/.auth/superadmin.json'});
 test.beforeEach(async({page})=>{await sansSyntheseAlertes(page);});
 test('arrive sur Aujourd’hui et retrouve les destinations dans le menu mobile',async({page})=>{
  await page.goto('/espaces');await expect(page).toHaveURL(/\/admin\/brief/);
  await expect(page.getByRole('heading',{name:'Aujourd’hui',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Menu supervision',exact:true}).click();
  // Plan à sept entrées (26/09) : la rubrique s'ouvre depuis le menu, ses pages
  // sont des onglets en haut de l'écran.
  const menu=page.getByRole('navigation',{name:'Navigation de la supervision'});
  await menu.getByRole('link',{name:/^Utilisateurs/}).click();
  await expect(page.getByRole('button',{name:'Menu supervision',exact:true})).toHaveAttribute('aria-expanded','false');
  const onglets=page.getByRole('navigation',{name:'Pages de la rubrique Utilisateurs'});
  await onglets.getByRole('link',{name:'Demandes commerciales',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Demandes commerciales',exact:true})).toBeVisible();
  await expect(onglets.getByRole('link',{name:'Demandes commerciales',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'Menu supervision',exact:true}).click();
  await expect(menu.getByRole('link',{name:/^Utilisateurs/})).toHaveAttribute('aria-current','page');
 });
 test('le menu complet est accessible sur ordinateur sans ouvrir le bouton mobile',async({page})=>{
  await page.setViewportSize({width:1440,height:960});await page.goto('/admin/brief');
  // Les sept entrées du plan (26/09) sont toutes visibles, rien à ouvrir.
  const menu=page.getByRole('navigation',{name:'Navigation de la supervision'});
  for(const r of ['Vue d’ensemble','Utilisateurs','Veille','Marketing','Développement','Historique et conservation','Paramètres'])
   await expect(menu.getByRole('link',{name:new RegExp('^'+r)})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Pages de la rubrique Vue d’ensemble'}).getByRole('link',{name:/^Aujourd’hui/})).toHaveAttribute('aria-current','page');
 });
 test('la santé conduit directement au résultat des traitements',async({page})=>{
  await page.goto('/admin/sante');
  const contenu=page.getByRole('main').filter({has:page.getByRole('heading',{name:'Santé et connexions',exact:true})});
  await expect(contenu).toBeVisible();
  await expect(contenu).not.toContainText('lib/editeur.ts');
  await page.getByRole('link',{name:'Voir l’historique →'}).or(page.getByRole('link',{name:"Voir l'historique →"})).click();
  await expect(page).toHaveURL(/\/admin\/journaux#historique-service$/);
  await expect(page.locator('#historique-service')).toBeInViewport();
  await expect(page.locator('#historique-service')).toContainText('Historique du service');
 });
 test('filtre l’historique avec des choix compréhensibles et conserve les dates',async({page})=>{
  await page.goto('/admin/journaux?type=tache_&p_technique=2');
  const formulaire=page.getByRole('form',{name:'Filtrer les journaux'});
  const type=formulaire.getByRole('combobox',{name:'Type d’événement'}).or(formulaire.getByRole('combobox',{name:"Type d'événement"}));
  await expect(type).toHaveValue('tache_');
  // Les noms des missions sont les mêmes que dans Santé et Équipes.
  await type.selectOption({label:'Sauvegarde hebdomadaire'});
  await formulaire.getByLabel('Depuis le',{exact:true}).fill('2026-09-01');
  await formulaire.getByRole('button',{name:'Filtrer',exact:true}).click();
  await expect(page).toHaveURL(/type=tache_sauvegarde/);
  await expect(type).toHaveValue('tache_sauvegarde');
  await expect(formulaire.getByLabel('Depuis le',{exact:true})).toHaveValue('2026-09-01');
  expect(new URL(page.url()).searchParams.has('p_technique')).toBe(false);
  await expect(page.locator('#historique-service')).toBeVisible();
  await formulaire.getByRole('link',{name:'Effacer',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/journaux$/);
  await expect(type).toHaveValue('');
  await expect(formulaire.getByLabel('Depuis le',{exact:true})).toHaveValue('');
 });
 test('préserve un ancien filtre partagé sans afficher son code interne',async({page})=>{
  await page.goto('/admin/journaux?type=evenement_ancien_test');
  const formulaire=page.getByRole('form',{name:'Filtrer les journaux'});
  const type=formulaire.locator('select[name="type"]');
  await expect(type).toHaveValue('evenement_ancien_test');
  await expect(type.locator('option:checked')).toHaveText('Recherche conservée depuis le lien');
  await expect(formulaire).not.toContainText('evenement_ancien_test');
  await formulaire.getByLabel('Depuis le',{exact:true}).fill('2026-09-01');
  await formulaire.getByRole('button',{name:'Filtrer',exact:true}).click();
  await expect(page).toHaveURL(/depuis=2026-09-01/);
  await expect(type).toHaveValue('evenement_ancien_test');
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
