import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

// Décision du 27/10 (audit #264, CB-08) : en relocation d'un lot, le brouillon commencé depuis la fiche du lot
// reprend du bail précédent le type (nu/meublé), le loyer, les charges et leur mode, l'échéance et la référence
// IRL ; l'étape Loyer le dit (« Repris du bail précédent (du … au …), à vérifier ») et un lien efface ces valeurs.
// Jamais le locataire, les dates ni le dépôt de garantie.
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
  test(`relocation : le nouveau brouillon reprend les conditions du bail précédent, signalées et effaçables, à ${largeur}px`, async ({ page }) => {
    const cible = process.env.SUPALOCAL_DB;
    test.skip(!cible, 'Ce scénario exige une base API locale pour isoler son lot.');
    const url = new URL(cible!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
    const db = new Client({ connectionString: cible });
    await db.connect();
    // Un lot copié, avec un bail terminé le 31/08/2026, propres à cette exécution et supprimés à la fin.
    const lotId = randomUUID();
    try {
      const sources = (await db.query('select id, bien_id from public.lots where organization_id=$1 and nom=$2', [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
      expect(sources).toHaveLength(1);
      await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
        to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'etat','disponible','meuble',false,'created_at',now(),'updated_at',now()))).*
        from public.lots l where l.id=$4 and l.organization_id=$3`, [lotId, `E2E relocation ${lotId}`, ORG, sources[0].id]);
      await db.query(`insert into public.detentions(id,lot_id,organization_id,person_id,quote_part,date_debut,date_fin)
        select gen_random_uuid(),$1,organization_id,person_id,quote_part,date_debut,date_fin from public.detentions
        where lot_id=$3 and organization_id=$2`, [lotId, ORG, sources[0].id]);
      await db.query(`insert into public.baux(organization_id,lot_id,type,etat,date_debut,date_fin,date_sortie_reelle,loyer_hc,charges,depot_garantie,jour_echeance,revision_irl,irl_trimestre,irl_valeur,charges_mode,paiement_echeance)
        values($1,$2,'nu','termine','2023-09-01','2026-08-31','2026-08-31',930,65,900,5,true,'T2',140.59,'provision','echoir')`, [ORG, lotId]);
      await page.setViewportSize({ width: largeur, height: largeur === 390 ? 844 : 900 });
      await connecter(page);

      // Depuis la fiche du lot : « Commencer un bail » ouvre le parcours du nouveau brouillon.
      await page.goto(`/espace/${ORG}/parc/${sources[0].bien_id}/lots/${lotId}`);
      await page.locator('#nouvelle-location').getByRole('button', { name: /Commencer un bail/ }).click();
      await page.waitForURL(/\/baux\/[0-9a-f-]{36}/);
      const bailId = page.url().match(/baux\/([0-9a-f-]{36})/)![1];
      const enBase = async () => (await db.query(`select type, loyer_hc::float as loyer, charges::float as charges, depot_garantie::float as depot, jour_echeance as jour, revision_irl, irl_trimestre, irl_valeur::float as irl, charges_mode, locataire_principal, date_debut
        from public.baux where id=$1`, [bailId])).rows[0];
      expect(await enBase()).toEqual({ type: 'nu', loyer: 930, charges: 65, depot: null, jour: 5, revision_irl: true, irl_trimestre: 'T2', irl: 140.59, charges_mode: 'provision', locataire_principal: null, date_debut: null });

      // FL-02 / CB-02 tiennent aussi en relocation : le brouillon pré-rempli, que personne n’a touché, est repris par
      // l’en-tête et par le geste secondaire « Préparer un autre contrat », jamais doublé.
      const brouillons = async () => (await db.query("select count(*)::int as n from public.baux where lot_id=$1 and etat='brouillon'", [lotId])).rows[0].n;
      await page.goto(`/espace/${ORG}/parc/${sources[0].bien_id}/lots/${lotId}`);
      await expect(page.locator('#nouvelle-location').getByRole('link', { name: 'Reprendre le bail', exact: true })).toHaveAttribute('href', new RegExp(`/baux/${bailId}$`));
      await page.locator('summary').filter({ hasText: 'Préparer un autre contrat' }).click();
      await page.locator('#nouveau-contrat').getByRole('button', { name: 'Commencer le bail', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/baux/${bailId}#etape-bail-1$`));
      expect(await brouillons()).toBe(1);

      // Étape « Le bail » : le type repris est signalé.
      await expect(page.locator('#parcours-type')).toHaveValue('nu');
      await expect(page.locator('#form-parcours-bail').getByText('Le type de bail est repris du bail précédent (du 01/09/2023 au 31/08/2026), à vérifier.')).toBeVisible();

      // Étape « Loyer » : les valeurs reprises, la mention et sa période ; le dépôt reste à saisir.
      await page.goto(`/espace/${ORG}/baux/${bailId}#etape-bail-4`);
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Loyer');
      const mention = page.locator('#reprise-bail-precedent');
      await expect(mention).toBeVisible();
      await expect(mention).toContainText('Repris du bail précédent (du 01/09/2023 au 31/08/2026), à vérifier : loyer hors charges, charges mensuelles, mode de charges, jour d’échéance, paiement du loyer, révision annuelle du loyer, trimestre IRL, valeur de l’IRL de référence.');
      // Les montants se relisent « 930 » (PostgREST) ou « 930.00 » (émulateur local) : même loyer.
      await expect(page.locator('#parcours-loyer_hc')).toHaveValue(/^930(\.00)?$/);
      await expect(page.locator('#parcours-charges')).toHaveValue(/^65(\.00)?$/);
      await expect(page.locator('#parcours-depot_garantie')).toHaveValue('');
      await expect(page.locator('#parcours-jour_echeance')).toHaveValue('5');
      await expect(page.locator('#parcours-charges_mode')).toHaveValue('provision');
      await expect(page.locator('#parcours-precedente_location')).toHaveValue('');
      await page.locator('details#complements-paiement summary').click();
      await expect(page.locator('#parcours-revision_irl')).toHaveValue('true');
      await expect(page.locator('#parcours-irl_trimestre')).toHaveValue('T2');
      await expect(page.locator('#parcours-irl_valeur')).toHaveValue('140.59');
      expect(await debordementHorizontal(page)).toBe(0);

      // Le lien efface les valeurs reprises ; elles restent à saisir, l'étape est marquée non enregistrée.
      await mention.getByRole('button', { name: 'Effacer ces valeurs', exact: true }).click();
      await expect(mention).toHaveCount(0);
      await expect(page.locator('#parcours-loyer_hc')).toHaveValue('');
      await expect(page.locator('#parcours-charges')).toHaveValue('');
      // Le jour d’échéance (1) et la révision IRL (oui) reviennent aux défauts de la base d’un brouillon sans bail précédent : ils restent modifiables.
      await expect(page.locator('#parcours-jour_echeance')).toHaveValue('1');
      await expect(page.locator('#parcours-irl_trimestre')).toHaveValue('');
      await expect(page.locator('#parcours-revision_irl')).toHaveValue('true');
      await expect(page.getByRole('navigation', { name: 'Étapes du bail' }).getByRole('button', { name: /Étape 04 Loyer Saisie non enregistrée/ })).toBeVisible();
      expect(await enBase()).toMatchObject({ loyer: 930, charges: 65 });
      // Les nouvelles conditions s'enregistrent comme d'habitude (révision IRL restée au défaut « oui ») ; la mention ne revient pas.
      // Les nouvelles conditions s'enregistrent comme d'habitude ; la mention ne revient pas.
      await page.locator('#parcours-loyer_hc').fill('950');
      await page.locator('#parcours-charges').fill('70');
      await page.locator('#parcours-depot_garantie').fill('950');
      await page.locator('#parcours-jour_echeance').fill('5');
      await page.locator('.assistant-pied').getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
      await expect(page).toHaveURL(/#etape-bail-5$/);
      expect(await enBase()).toMatchObject({ loyer: 950, charges: 70, depot: 950, jour: 5, revision_irl: true, locataire_principal: null, date_debut: null });
      await page.goto(`/espace/${ORG}/baux/${bailId}#etape-bail-4`);
      await expect(page.locator('#assistant-bail-titre')).toHaveText('Loyer');
      await expect(page.locator('#parcours-loyer_hc')).toHaveValue('950');
      await expect(mention).toHaveCount(0);
    } finally {
      await db.query('delete from public.bail_personnes where bail_id in (select id from public.baux where lot_id=$1 and organization_id=$2)', [lotId, ORG]);
      await db.query('delete from public.baux where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.detentions where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
      await db.end();
    }
  });
}
