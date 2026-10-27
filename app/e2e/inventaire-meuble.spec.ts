import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

// Décision du 27/10 (audit #264, CB-14) : dans l'assistant du bail meublé, l'inventaire
// reçoit les onze éléments du décret n° 2015-981 en un geste ; un second clic n'ajoute
// aucun doublon et le dit ; chaque ligne créée se complète sur place (quantité, état).
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
  test(`bail meublé : les 11 éléments du décret en un geste, sans doublon, puis complétés sur place à ${largeur}px`, async ({ page }) => {
    const cible = process.env.SUPALOCAL_DB;
    test.skip(!cible, 'Ce scénario exige une base API locale pour isoler son brouillon.');
    const url = new URL(cible!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
    const db = new Client({ connectionString: cible });
    await db.connect();
    // Un studio meublé copié du T2 de parcours et un brouillon de bail meublé propres à cette exécution, supprimés à la fin.
    const lotId = randomUUID();
    const lignes = async () => (await db.query('select designation, quantite, etat from public.inventaire_lignes where bail_id=$1 order by ordre, created_at', [bail])).rows as { designation: string; quantite: number; etat: string | null }[];
    let bail = '';
    try {
      const sources = (await db.query('select id from public.lots where organization_id=$1 and nom=$2', [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
      expect(sources).toHaveLength(1);
      await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
        to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'meuble',true,'etat','disponible','created_at',now(),'updated_at',now()))).*
        from public.lots l where l.id=$4 and l.organization_id=$3`, [lotId, `E2E meublé ${lotId}`, ORG, sources[0].id]);
      await db.query(`insert into public.detentions(id,lot_id,organization_id,person_id,quote_part,date_debut,date_fin)
        select gen_random_uuid(),$1,organization_id,person_id,quote_part,date_debut,date_fin from public.detentions
        where lot_id=$3 and organization_id=$2`, [lotId, ORG, sources[0].id]);
      bail = (await db.query(`insert into public.baux(organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance)
        values($1,$2,'meuble','brouillon','2026-12-01',650,40,1300,1) returning id`, [ORG, lotId])).rows[0].id;
      // Un meuble déjà saisi à la main, dans une autre casse : il ne doit pas être dupliqué.
      await db.query(`insert into public.inventaire_lignes(bail_id,organization_id,designation,quantite,etat) values($1,$2,'luminaires',3,'bon')`, [bail, ORG]);

      await page.setViewportSize({ width: largeur, height: largeur === 390 ? 844 : 900 });
      await connecter(page);
      await page.goto(`/espace/${ORG}/baux/${bail}#inventaire`);
      const inventaire = page.locator('#inventaire');
      const geste = inventaire.getByRole('button', { name: 'Ajouter les 11 éléments obligatoires', exact: true });
      await expect(geste).toBeEnabled();
      await expect(inventaire.locator('ul li')).toHaveCount(1);

      // Premier clic : dix lignes créées (Luminaires déjà présent), chacune « État à préciser ».
      await geste.click();
      await expect(inventaire.getByRole('status')).toHaveText("10 éléments ajoutés à l'inventaire : précisez l'état et la quantité de chacun. 1 élément déjà présent.");
      await expect(inventaire.locator('ul li')).toHaveCount(11);
      await expect(inventaire.locator('ul li', { hasText: /Luminaires|luminaires/ })).toHaveCount(1);
      await expect(inventaire.locator('ul li .puce', { hasText: 'État à préciser' })).toHaveCount(10);
      const enBase = await lignes();
      expect(enBase).toHaveLength(11);
      expect(enBase.filter((l) => l.etat === null).every((l) => l.quantite === 1)).toBe(true);
      expect(enBase.map((l) => l.designation)).toContain('Plaques de cuisson');
      expect(await debordementHorizontal(page)).toBe(0);

      // Second clic : rien n'est ajouté, et c'est dit.
      await geste.click();
      await expect(inventaire.getByRole('status')).toHaveText('Aucun élément ajouté : 11 éléments déjà présents.');
      await expect(inventaire.locator('ul li')).toHaveCount(11);
      expect(await lignes()).toHaveLength(11);

      // Compléter une ligne créée : quantité et état, sur place.
      const plaques = inventaire.locator('ul li', { hasText: 'Plaques de cuisson' });
      await plaques.getByRole('button', { name: 'Compléter Plaques de cuisson' }).click();
      const saisie = plaques.getByRole('form', { name: 'Compléter Plaques de cuisson' });
      await expect(saisie.locator('select[name="etat"]')).toHaveValue('');
      await saisie.locator('input[name="quantite"]').fill('2');
      await saisie.locator('select[name="etat"]').selectOption('neuf');
      await saisie.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await expect(plaques.locator('.puce')).toHaveText('Neuf');
      await expect(plaques).toContainText('2× Plaques de cuisson');
      await expect(plaques.getByRole('button', { name: 'Modifier Plaques de cuisson' })).toBeVisible();
      await expect(saisie).toHaveCount(0);
      expect((await lignes()).find((l) => l.designation === 'Plaques de cuisson')).toEqual({ designation: 'Plaques de cuisson', quantite: 2, etat: 'neuf' });
      expect(await debordementHorizontal(page)).toBe(0);
    } finally {
      await db.query('delete from public.baux where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.detentions where lot_id=$1 and organization_id=$2', [lotId, ORG]);
      await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
      await db.end();
    }
  });
}
