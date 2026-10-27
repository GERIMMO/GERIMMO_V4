import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

// Audit #264 : une saisie du brouillon de bail n'est jamais perdue en silence.
// CB-01 : deux onglets sur la même étape ; CB-05 : changer d'étape sans
// enregistrer ; CB-11 : le bouton Retour du navigateur revient à l'étape précédente.
// Relecture : une clause sur plusieurs lignes, une fois enregistrée, n'est plus vue
// « non enregistrée » (fins de ligne CRLF du formulaire, LF du champ).
const ORG = '3c1d1e95-3570-400b-8012-44530be145b1';

async function connecter(page: Page) {
  await sansSyntheseAlertes(page);
  await page.goto('/connexion');
  await page.locator('#email').fill('proprietaire@example.com');
  await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE ?? 'Gerimmo-Demo-2026');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(/\/(espaces|espace|agence)\//);
}

for (const largeur of [390, 1440]) {
  test(`brouillon de bail : saisies protégées entre onglets et entre étapes à ${largeur}px`, async ({ page }) => {
    const cible = process.env.SUPALOCAL_DB;
    test.skip(!cible, 'Ce scénario exige une base API locale pour isoler son brouillon.');
    const url = new URL(cible!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
    const db = new Client({ connectionString: cible });
    await db.connect();
    // Un lot copié et un brouillon propres à cette exécution, supprimés à la fin.
    const lotId = randomUUID();
    const enBase = async () => (await db.query('select loyer_hc::float as loyer, charges::float as charges from public.baux where lot_id=$1', [lotId])).rows[0];
    try {
      const sources = (await db.query('select id from public.lots where organization_id=$1 and nom=$2', [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
      expect(sources).toHaveLength(1);
      await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
        to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'etat','disponible','created_at',now(),'updated_at',now()))).*
        from public.lots l where l.id=$4 and l.organization_id=$3`, [lotId, `E2E saisie ${lotId}`, ORG, sources[0].id]);
      await db.query(`insert into public.detentions(id,lot_id,organization_id,person_id,quote_part,date_debut,date_fin)
        select gen_random_uuid(),$1,organization_id,person_id,quote_part,date_debut,date_fin from public.detentions
        where lot_id=$3 and organization_id=$2`, [lotId, ORG, sources[0].id]);
      const bail = (await db.query(`insert into public.baux(organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance)
        values($1,$2,'nu','brouillon','2026-12-01',800,50,800,1) returning id`, [ORG, lotId])).rows[0].id;
      const adresse = `/espace/${ORG}/baux/${bail}`;
      await page.setViewportSize({ width: largeur, height: 900 });
      await connecter(page);
      const pied = (p: Page) => p.locator('.assistant-pied');
      const navigation = page.getByRole('navigation', { name: 'Étapes du bail' });

      // CB-01 : l'onglet resté ouvert ne réécrit pas le loyer enregistré par l'autre.
      const autre = await page.context().newPage();
      await sansSyntheseAlertes(autre);
      await autre.setViewportSize({ width: largeur, height: 900 });
      await page.goto(`${adresse}#etape-bail-4`);
      await autre.goto(`${adresse}#etape-bail-4`);
      await autre.locator('#parcours-loyer_hc').fill('900');
      await pied(autre).getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      await expect(autre).toHaveURL(/#etape-bail-5$/);
      await page.bringToFront();
      await page.locator('#parcours-charges').fill('55');
      await pied(page).getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      const alerte = page.locator('#form-parcours-bail [role="alert"]');
      await expect(alerte).toContainText('enregistrée entre-temps dans un autre onglet');
      await expect(alerte).toContainText('Loyer hors charges — valeur enregistrée : 900,00');
      await expect(page.locator('#parcours-loyer_hc')).toHaveValue(/^900/);
      await expect(page.locator('#parcours-charges')).toHaveValue('55');
      expect(await enBase()).toEqual({ loyer: 900, charges: 50 });
      await pied(page).getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      await expect(page).toHaveURL(/#etape-bail-5$/);
      expect(await enBase()).toEqual({ loyer: 900, charges: 55 });
      await autre.close();

      // CB-05 : quitter l'étape modifiée propose d'enregistrer ou d'abandonner.
      await navigation.getByRole('button', { name: /Étape 04 Loyer/ }).click();
      await page.locator('#parcours-loyer_hc').fill('1000');
      await expect(navigation.getByRole('button', { name: /Étape 04 Loyer Saisie non enregistrée/ })).toBeVisible();
      await navigation.getByRole('button', { name: /Étape 06 Clauses/ }).click();
      const fenetre = page.getByRole('dialog', { name: 'Modifications non enregistrées' });
      await expect(fenetre).toContainText('Loyer hors charges');
      await expect(fenetre.getByRole('button', { name: 'Enregistrer et continuer', exact: true })).toBeFocused();
      expect(await debordementHorizontal(page)).toBe(0);
      await fenetre.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click();
      await expect(page).toHaveURL(/#etape-bail-6$/);
      await navigation.getByRole('button', { name: /Étape 04 Loyer/ }).click();
      await expect(page.locator('#parcours-loyer_hc')).toHaveValue(/^900/);
      await page.locator('#parcours-loyer_hc').fill('1000');
      await pied(page).getByRole('button', { name: 'Précédent', exact: true }).click();
      await fenetre.getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      await expect(page).toHaveURL(/#etape-bail-3$/);
      expect(await enBase()).toEqual({ loyer: 1000, charges: 55 });

      // CB-11 : Retour revient à l'étape précédente sans quitter l'assistant.
      await pied(page).getByRole('button', { name: 'Suivant', exact: false }).click();
      await expect(page).toHaveURL(/#etape-bail-4$/);
      await page.goBack();
      await expect(page).toHaveURL(/#etape-bail-3$/);
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Le logement');
      await page.goBack();
      await expect(page).toHaveURL(/#etape-bail-4$/);
      await expect(page.locator('#parcours-loyer_hc')).toBeVisible();

      // Relecture : une clause sur deux lignes enregistrée ne reste pas signalée.
      await navigation.getByRole('button', { name: /Étape 06 Clauses/ }).click();
      await page.locator('details[data-groupe="Travaux et accords particuliers"] summary').click();
      await page.locator('#parcours-clauses_particulieres').fill('Animaux acceptés.\nJardin entretenu par le locataire.');
      await pied(page).getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Récapitulatif');
      expect((await db.query('select clauses_particulieres from public.baux where lot_id=$1', [lotId])).rows[0].clauses_particulieres).toMatch(/^Animaux acceptés\.\r?\nJardin/);
      await expect(page.getByText('Des modifications ne sont pas enregistrées')).toHaveCount(0);
      await expect(navigation.getByRole('button', { name: /Saisie non enregistrée/ })).toHaveCount(0);
      await navigation.getByRole('button', { name: /Étape 06 Clauses/ }).click();
      await navigation.getByRole('button', { name: /Étape 01 Le bail/ }).click();
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Le bail');
      await expect(fenetre).toHaveCount(0);

      // La fenêtre ouverte se referme quand le bouton Retour change l'étape.
      await page.locator('#parcours-date_debut').fill('2026-12-02');
      await navigation.getByRole('button', { name: /Étape 06 Clauses/ }).click();
      await expect(fenetre).toBeVisible();
      await page.goBack();
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Clauses');
      await expect(fenetre).toHaveCount(0);
      await expect(navigation.getByRole('button', { name: /Étape 01 Le bail Saisie non enregistrée/ })).toBeVisible();
    } finally {
      await db.query('delete from public.baux where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.detentions where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
      await db.end();
    }
  });
}
