import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sansSyntheseAlertes } from './aides';

for (const largeur of [390, 1440]) test(`creation bien : panne, reponse perdue et reprise a ${largeur}px`, async ({ page }, info) => {
  test.setTimeout(90_000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), 'Base API fictive locale requise');
  const db = new Client({ connectionString: url }); await db.connect();
  const suffixe = randomUUID().replaceAll('-', ''), fonction = `test_creation_${suffixe}`;
  const nom = `TEST MISSION Reprise ${suffixe}`, preuve: Record<string, unknown> = { largeur, nom, statut: 'en cours' };
  const email = `test-creation-${suffixe}@example.invalid`, motDePasse = 'Test-Creation-Fictive-2026!';
  let cle = '', org = '', compte = '', bien: string | undefined;
  try {
    // Compte et organisation jetables complets : aucun attribut du seed changé.
    compte = (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,extensions.crypt($2,extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','') returning id`, [email, motDePasse])).rows[0].id;
    org = (await db.query("insert into organizations(name,type,status,address_line1,postal_code,city,email_contact) values($1,'proprietaire_direct','active','1 rue TEST','75001','Paris','test@example.invalid') returning id", [nom])).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    await sansSyntheseAlertes(page);
    await page.route('https://api-adresse.data.gouv.fr/**', route => route.fulfill({ json: { features: [] } }));
    await page.setViewportSize({ width: largeur, height: 1000 });
    await page.goto('/connexion'); await page.locator('#email').fill(email); await page.locator('#mot-de-passe').fill(motDePasse); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.waitForURL(/\/(espaces|agence)(\/|$)/);
    await page.goto(`/agence/${org}/parc/nouveau`);
    await expect(page.getByLabel('Nom du bien', { exact: true })).toBeVisible();
    cle = await page.locator('[name="creation_id"]').inputValue(); expect(cle).toMatch(/^[0-9a-f-]{36}$/);
    await page.getByLabel('Nom du bien', { exact: true }).fill(nom);
    await page.getByLabel('Adresse', { exact: true }).fill('9 rue TEST Reprise');
    await page.getByLabel('Code postal').fill('75001'); await page.getByLabel('Ville').fill('Paris');
    await page.getByLabel(/Année de construction/).fill('1998');
    await page.getByLabel(/Parties communes/).fill('Hall TEST conservé');
    await page.getByLabel(/Accès internet, téléphone, TV/).fill('Fibre TEST conservée');
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await page.getByLabel(/Surface.*m²/).fill('42.25'); await page.getByLabel('Nombre de pièces').fill('2');
    // Défaut ciblé sur la seule demande de ce test, après l'insertion réelle.
    await db.query(`create function public.${fonction}() returns trigger language plpgsql as $$ begin if new.creation_cle='${cle}'::uuid then raise exception 'Panne TEST après insertion'; end if; return new; end $$; create trigger ${fonction} after update on public.biens for each row execute function public.${fonction}()`);
    const envoyer = page.getByRole('button', { name: 'Créer le lot et continuer', exact: true });
    await envoyer.click(); await expect(page.locator('form.saisie-bien').getByRole('alert')).toContainText('Vos saisies sont conservées');
    expect((await db.query('select id from biens where organization_id=$1 and creation_cle=$2', [org, cle])).rows).toHaveLength(0);
    for (const [champ, valeur] of Object.entries({ nom, address_line1: '9 rue TEST Reprise', postal_code: '75001', city: 'Paris', annee_construction: '1998', parties_communes: 'Hall TEST conservé', acces_tic: 'Fibre TEST conservée', creation_id: cle })) await expect(page.locator(`[name="${champ}"]`)).toHaveValue(valeur);
    await expect(page.getByLabel(/Surface.*m²/)).toHaveValue('42.25');
    await page.screenshot({ path: info.outputPath('panne-saisies-conservees.png'), fullPage: true });
    await db.query(`drop trigger ${fonction} on public.biens; drop function public.${fonction}()`);
    let perdue = false;
    await page.route(`**/agence/${org}/parc/nouveau`, async route => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action'] && !perdue) {
        perdue = true; const reponse = await route.fetch(); expect(reponse.ok()).toBe(true); await route.abort('failed');
      } else await route.continue();
    });
    await envoyer.click(); await expect(page.locator('form.saisie-bien').getByRole('alert')).toContainText('La réponse n’est pas arrivée');
    const avant = (await db.query('select id,nom from biens where organization_id=$1 and creation_cle=$2', [org, cle])).rows; expect(avant).toHaveLength(1); bien = avant[0].id;
    await page.screenshot({ path: info.outputPath('reponse-perdue.png'), fullPage: true });
    // Une modification après une réponse perdue ne remplace pas silencieusement
    // le dossier déjà enregistré, et reste visible dans le formulaire.
    await page.getByRole('button', { name: 'Précédent', exact: true }).click();
    await page.getByLabel('Nom du bien', { exact: true }).fill(nom + ' modifié');
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await envoyer.click(); await expect(page.locator('form.saisie-bien').getByRole('alert')).toContainText('Vos nouvelles saisies restent');
    await expect(page).toHaveURL(new RegExp(`/agence/${org}/parc/nouveau$`));
    await expect(page.locator('[name="nom"]')).toHaveValue(nom + ' modifié');
    await expect(page.getByRole('link', { name: 'Ouvrir le dossier déjà enregistré' })).toBeVisible();
    expect((await db.query('select id,nom from biens where organization_id=$1 and creation_cle=$2', [org, cle])).rows).toEqual(avant);
    await page.screenshot({ path: info.outputPath('saisie-modifiee-explication.png'), fullPage: true });
    // Reprise exacte : une seule fiche, puis navigation nominale vers son lot.
    await page.getByRole('button', { name: 'Précédent', exact: true }).click(); await page.getByLabel('Nom du bien', { exact: true }).fill(nom); await page.getByRole('button', { name: 'Suivant', exact: true }).click(); await envoyer.click();
    await expect(page).toHaveURL(new RegExp(`/parc/${bien}/lots/`));
    const obtenu = (await db.query('select b.nom,b.parties_communes,b.acces_tic,l.surface_m2,l.pieces,(select count(*)::int from detentions where lot_id=l.id) detentions from biens b join lots l on l.bien_id=b.id where b.id=$1', [bien])).rows;
    expect(obtenu).toEqual([{ nom, parties_communes: 'Hall TEST conservé', acces_tic: 'Fibre TEST conservée', surface_m2: '42.25', pieces: 2, detentions: 1 }]);
    preuve.statut = 'exécuté avec succès'; preuve.obtenu = obtenu; preuve.creation_id = cle; preuve.bien_id = bien; preuve.panneAnnulee = true; preuve.reponsePerdue = perdue;
    await page.screenshot({ path: info.outputPath('reprise-confirmee.png'), fullPage: true });
  } finally {
    try {
      await db.query(`drop trigger if exists ${fonction} on public.biens; drop function if exists public.${fonction}()`);
      if (cle) {
        bien ??= (await db.query('select id from biens where organization_id=$1 and creation_cle=$2', [org, cle])).rows[0]?.id;
        if (bien) {
          await db.query('begin'); await db.query('select public.tache_systeme()');
          await db.query('delete from detentions where lot_id in(select id from lots where bien_id=$1)', [bien]);
          await db.query('delete from lots where bien_id=$1', [bien]); await db.query('delete from biens where id=$1', [bien]); await db.query('commit');
        }
        preuve.cleanup = { bienAbsent: (await db.query('select id from biens where organization_id=$1 and creation_cle=$2', [org, cle])).rowCount === 0, injecteurRetire: true };
      }
      if (org) {
        await db.query('begin'); await db.query('select public.tache_systeme()');
        for (const table of ['persons', 'memberships', 'audit_log']) await db.query(`delete from public.${table} where organization_id=$1`, [org]);
        await db.query('delete from organizations where id=$1', [org]); await db.query('commit');
        preuve.organisationSupprimee = true;
      }
      if (compte) { await db.query('delete from audit_log where account_id=$1', [compte]); await db.query('delete from auth.users where id=$1', [compte]); preuve.compteSupprime = true; }
    } finally { preuve.fin = new Date().toISOString(); writeFileSync(info.outputPath('preuve.json'), JSON.stringify(preuve, null, 2) + '\n'); await db.end(); }
  }
});
