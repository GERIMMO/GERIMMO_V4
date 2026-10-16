import { expect,test } from './outils';
import { lireComptes } from './cible';
test.use({persona:'superadmin',trace:'off',screenshot:'off'});
test.describe('supervision éphémère en lecture seule',{tag:'@supervision'},()=>{
  test.skip(process.env.RECETTE_AUTONOME!=='1','Uniquement le chantier autonome avec nettoyage.');
  for(const chemin of ['/admin/relais','/admin/sante']) test(`${chemin} s’ouvre après MFA`,async({page})=>{
    const reponse=await page.goto(chemin);
    // Les messages d'erreur restent génériques : aucun contenu de dossier client
    // ni diagnostic opérationnel n'est copié dans le rapport.
    expect((reponse?.status()??500)<400,'Réponse de supervision invalide').toBe(true);
    expect(new URL(page.url()).pathname===chemin,'Accès supervision refusé').toBe(true);
    await expect.poll(()=>page.locator('h1').first().isVisible(),{message:'Titre absent'}).toBe(true);
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
