import { expect,test, MESSAGES_D_ERREUR } from './outils';
import { lireComptes } from './cible';
import { RUBRIQUES } from '../../src/lib/rubriques-supervision';
test.use({persona:'superadmin',trace:'off',screenshot:'off'});
test.describe('supervision éphémère en lecture seule',{tag:'@supervision'},()=>{
  test.skip(process.env.RECETTE_AUTONOME!=='1','Uniquement le chantier autonome avec nettoyage.');
  for(const rubrique of RUBRIQUES) test(`rubrique ${rubrique.cle} : lecture après MFA`,async({page})=>{
    const chemin = rubrique.href;
    let erreurPage = false;
    page.on('pageerror', () => { erreurPage = true; });
    const reponse=await page.goto(chemin);
    // Les messages d'erreur restent génériques : aucun contenu de dossier client
    // ni diagnostic opérationnel n'est copié dans le rapport.
    expect((reponse?.status()??500)<400,'Réponse de supervision invalide').toBe(true);
    const courante = new URL(page.url()), cible = new URL(chemin, page.url());
    expect(courante.pathname===cible.pathname && courante.search===cible.search,'Accès supervision refusé ou mauvaise rubrique').toBe(true);
    await expect.poll(()=>page.locator('h1').first().isVisible(),{message:'Titre absent'}).toBe(true);
    const texte = await page.locator('main:visible').first().innerText();
    expect(MESSAGES_D_ERREUR.some(m => m.test(texte)), 'Une lecture de supervision a échoué').toBe(false);
    expect(erreurPage, 'Exception sur la page de supervision').toBe(false);
  });
  test('recherche la référence de son propre espace de recette',async({page})=>{
    const {suffixe,orgProprietaire}=lireComptes();
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ControlOrMeta+k');
    const champ=page.getByRole('combobox',{name:/référence/i});
    await champ.fill(`Studio recette ${suffixe}`);
    const resultat=page.locator('#recherche-supervision-liste a').filter({hasText:`Parc de Paul Recette-${suffixe}`});
    await expect(resultat).toHaveAttribute('href',`/admin/organisations/${orgProprietaire}`);
  });
});
