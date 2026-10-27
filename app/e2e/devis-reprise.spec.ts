import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

test.use({ storageState: 'e2e/.auth/artisan.json', actionTimeout: 10000 });
async function etape(page: Page, n: number) {
  const select = page.getByLabel('Aller à une étape', { exact: true });
  if (await select.isVisible()) await select.selectOption(String(n-1));
  else await page.getByRole('button', { name: new RegExp(`^Étape ${String(n).padStart(2, '0')} `) }).click();
}
for (const largeur of [390, 1440]) test(`devis : reprise, sauvegarde lente et conflit à ${largeur}px`, async ({ page }, info) => {
  test.setTimeout(90000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), 'Base API fictive locale requise');
  const db = new Client({ connectionString: cible }); await db.connect();
  const incident = randomUUID(), consultation = randomUUID(), demande = randomUUID();
  const preuve: Record<string, unknown> = { largeur, demande, statut: 'en cours' };
  let liberer: (() => void) | undefined;
  try {
    const { rows: [a] } = await db.query("select a.id, a.account_id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const { rows: [lot] } = await db.query('select i.organization_id,i.lot_id from incident_sollicitations s join incidents i on i.id=s.incident_id where s.artisan_id=$1 limit 1', [a.id]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,$3,$4,'agence','plomberie_canalisation','TEST reprise devis fictif','declare')", [incident, lot.organization_id, lot.lot_id, `TEST-${demande}`]);
    await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux) values($1,$2,$3,'plomberie','entretien_courant')", [consultation, lot.organization_id, incident]);
    await db.query("insert into incident_sollicitations(id,organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,$5,'envoyee')", [demande, lot.organization_id, consultation, incident, a.id]);
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,revision) values($1,$2,$3,1)", [demande, a.id, { diagnostic:'Diagnostic initial TEST', delai:'Sous cinq jours', duree:'Une heure', contraintes:'', observations:'', valideJusquAu:'2099-01-30', lignes:[{code:'',libelle:'Remplacement TEST',quantite:1,prix_unitaire_ht_cents:5000,tva_bps:1000}] }]);
    const href = `/artisan/devis/${demande}`;
    const cle = `gerimmo:devis:v1:${a.account_id}:${demande}`;
    await sansSyntheseAlertes(page); await page.setViewportSize({width:largeur,height:1000}); await page.goto(href);
    await page.getByRole('textbox', {name:'Votre diagnostic',exact:true}).fill('Diagnostic TEST conservé après fermeture');
    await page.getByLabel('Ligne 1 : quantité', {exact:true}).fill('1,'); await expect(page.getByLabel('Ligne 1 : quantité', {exact:true})).toHaveValue('1,');
    await page.getByRole('button',{name:'Ajouter une prestation ou fourniture'}).click();
    await page.getByLabel('Ligne 2 : prestation',{exact:true}).fill('Fourniture TEST à compléter'); await expect(page.getByLabel('Ligne 1 : quantité', {exact:true})).toHaveValue('1,');
    await expect(page.getByRole('status').filter({hasText:'Saisie conservée sur cet appareil'})).toBeVisible();
    await etape(page,2); await page.getByLabel('Contraintes et accès', {exact:false}).fill('Accès TEST conservé'); await page.getByLabel('Valable jusqu’au',{exact:true}).fill('');
    expect(JSON.parse(await page.locator('[name="lignes_devis_saisie"]').inputValue())[0].quantite).toBe('1,');
    const contexte=page.context(); await page.close(); page=await contexte.newPage(); await sansSyntheseAlertes(page); await page.setViewportSize({width:largeur,height:1000}); await page.goto(href);
    await expect(page.getByRole('heading',{name:'Reprendre votre devis',exact:true})).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:info.outputPath('devis-a-reprendre.png'),fullPage:true});
    await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Votre diagnostic',exact:true})).toHaveValue('Diagnostic TEST conservé après fermeture');
    await expect(page.getByLabel('Ligne 1 : quantité',{exact:true})).toHaveValue('1,');
    await expect(page.getByLabel('Ligne 2 : prix unitaire HT',{exact:true})).toHaveValue('');
    await expect(page.getByLabel('Ligne 2 : TVA',{exact:true})).toHaveValue('');
    await expect(page.getByRole('status').filter({hasText:'Modifications non enregistrées'})).toBeVisible();
    await etape(page,2); await expect(page.getByLabel('Contraintes et accès',{exact:false})).toHaveValue('Accès TEST conservé'); await expect(page.getByLabel('Valable jusqu’au',{exact:true})).toHaveValue('');
    await etape(page,3); await expect(page.locator('[name="validation_artisan"]')).not.toBeChecked();
    await etape(page,4); await expect(page.getByRole('button',{name:'Envoyer le devis par e-mail',exact:true})).toBeDisabled();
    await etape(page,1);
    // Le vrai serveur enregistre, mais sa réponse arrive après une nouvelle saisie.
    let interceptee=false; let reponseRecue:()=>void=()=>{};
    const enregistree=new Promise<void>(r=>{reponseRecue=r;}); const attente=new Promise<void>(r=>{liberer=r;});
    await page.route(`**${href}`,async route=>{
      if(route.request().method()==='POST' && route.request().headers()['next-action'] && !interceptee) {
        interceptee=true;const reponse=await route.fetch();reponseRecue();await attente;await route.fulfill({response:reponse});
      } else await route.continue();
    });
    await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click(); await enregistree;
    await page.getByRole('textbox',{name:'Votre diagnostic',exact:true}).fill('Modification TEST pendant la sauvegarde'); liberer?.();
    await expect(page.getByRole('button',{name:'Enregistrer le brouillon',exact:true})).toBeEnabled();
    await expect(page.getByRole('status').filter({hasText:'Modifications non enregistrées'})).toBeVisible();
    expect((await db.query('select saisie from artisan_devis_preparations where sollicitation_id=$1',[demande])).rows[0].saisie.diagnostic).toBe('Diagnostic TEST conservé après fermeture');
    await page.reload(); await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Votre diagnostic',exact:true})).toHaveValue('Modification TEST pendant la sauvegarde');
    await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Brouillon enregistré sur Gerimmo'})).toBeVisible();
    expect(await page.evaluate(k=>localStorage.getItem(k),cle)).toBeNull();
    await page.reload();await expect(page.getByRole('textbox',{name:'Votre diagnostic',exact:true})).toHaveValue('Modification TEST pendant la sauvegarde');
    await expect(page.getByRole('heading',{name:'Reprendre votre devis',exact:true})).toHaveCount(0);
    // Une autre fenêtre enregistre une nouvelle version : pas d'écrasement silencieux.
    await page.getByRole('textbox',{name:'Votre diagnostic',exact:true}).fill('Copie TEST locale à comparer');
    await expect(page.getByRole('status').filter({hasText:'Saisie conservée sur cet appareil'})).toBeVisible();
    await db.query("update artisan_devis_preparations set revision=revision+1,saisie=jsonb_set(saisie,'{diagnostic}','\"Version TEST autre fenêtre\"') where sollicitation_id=$1",[demande]);
    await page.reload();await expect(page.getByRole('status')).toContainText('La version Gerimmo a changé');
    await expect(page.getByRole('button',{name:'Reprendre ma saisie',exact:true})).toHaveCount(0);
    await page.getByText('Consulter ma saisie conservée',{exact:true}).click();await expect(page.getByText('Copie TEST locale à comparer',{exact:true})).toBeVisible();
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:info.outputPath('devis-conflit.png'),fullPage:true});
    await page.getByRole('button',{name:'Effacer ma copie et garder la version Gerimmo',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Votre diagnostic',exact:true})).toHaveValue('Version TEST autre fenêtre');
    expect(await debordementHorizontal(page)).toBe(0);
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:info.outputPath('devis-repris.png'),fullPage:true});
    // Un navigateur qui refuse le stockage l'annonce, sans empêcher l'enregistrement Gerimmo.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('TEST stockage indisponible','QuotaExceededError'); }; });
    await page.getByRole('textbox',{name:'Votre diagnostic',exact:true}).fill('TEST stockage local refusé');
    await expect(page.getByRole('status').filter({hasText:'La copie sur cet appareil est indisponible'})).toBeVisible();
    await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Brouillon enregistré sur Gerimmo'})).toBeVisible();
    expect((await db.query('select saisie from artisan_devis_preparations where sollicitation_id=$1',[demande])).rows[0].saisie.diagnostic).toBe('TEST stockage local refusé');
    preuve.stockageRefuseExplique=true;
    expect((await db.query('select statut from incident_sollicitations where id=$1',[demande])).rows[0].statut).toBe('envoyee');
    expect((await db.query('select id from incident_devis where sollicitation_id=$1',[demande])).rowCount).toBe(0);
    preuve.statut='réussi';preuve.fermetureOnglet=true;preuve.lignesIncompletes=true;preuve.modificationPendantEnregistrement=true;preuve.conflitSansEcrasement=true;preuve.aucunEnvoi=true;
  } finally {
    liberer?.();
    try {
      await db.query('begin');await db.query('select public.tache_systeme()');
      await db.query('delete from artisan_devis_preparations where sollicitation_id=$1',[demande]);
      await db.query('delete from incident_sollicitations where id=$1',[demande]);
      await db.query('delete from incident_consultations where id=$1',[consultation]);
      await db.query('delete from incident_evenements where incident_id=$1',[incident]);
      await db.query('delete from incidents where id=$1',[incident]);
      await db.query('commit');preuve.fixturesSupprimees=true;
    } finally { writeFileSync(info.outputPath('preuve.json'),JSON.stringify(preuve,null,2)+'\n');await db.end(); }
  }
});
