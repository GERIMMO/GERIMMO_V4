import { debordementHorizontal,expect,jugerEcran,test } from './outils';
test.use({persona:'artisan',trace:'off',screenshot:'off'});
test.describe('artisan éphémère',()=>{
  test.skip(process.env.RECETTE_AUTONOME!=='1','Uniquement le chantier autonome avec nettoyage.');
  for(const [chemin,titre] of [['/artisan','Aujourd’hui'],['/artisan/devis','devis'],['/artisan/agenda','agenda'],['/artisan/facturation','facturation']] as const) {
    test(`${chemin} : lecture au téléphone`,async({page,surveillance})=>{
      expect(await jugerEcran(page,chemin,surveillance)).toEqual([]);
      await expect(page).toHaveURL(new RegExp(`${chemin.replaceAll('/','\\/')}(?:\\?|$)`));
      await expect(page.locator('h1').first()).toContainText(new RegExp(titre.replace('’',"[’']"),'i'));
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });
  }
});
