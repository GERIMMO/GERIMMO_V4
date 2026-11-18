const { chromium, expect } = require('../../app/node_modules/@playwright/test');
const fs = require('node:fs'), path = require('node:path');
if (!process.argv[2]) throw new Error('Indiquer le répertoire privé des sessions fictives locales.');
const preuves = path.resolve(process.argv[2]);
(async () => {
    const b = await chromium.launch({ headless: true });
    const resultats = [];
    try {
        for (const [nom, session, base] of [['neuf', 'session-neuf.json', JSON.parse(fs.readFileSync(path.join(preuves, 'compte-neuf.json'))).base], ['patrimoine', 'session-locale.json', '/espace/3c1d1e95-3570-400b-8012-44530be145b1']]) {
            for (const width of [390, 1440]) {
                const c = await b.newContext({ baseURL: 'http://localhost:3100', storageState: path.join(preuves, session), viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
                await c.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
                const p = await c.newPage(), erreurs = [];
                p.on('pageerror', e => erreurs.push(e.message));
                await p.goto(base, { waitUntil: 'networkidle' });
                await expect(p.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
                await expect(p.getByRole('dialog')).toHaveCount(0);
                const info = p.locator('details').filter({ has: p.locator(':scope > summary', { hasText: 'À savoir sur vos envois' }) });
                await expect(info).toHaveCount(1);
                await expect(info).toHaveAttribute('open', '');
                await expect(info.getByText(/Les relances locatives et les avis d’échéance par courriel restent suspendus/)).toBeVisible();
                if (nom === 'neuf') {
                    await expect(p.getByRole('region', { name: 'Votre patrimoine en bref' })).toHaveCount(0);
                    await expect(p.getByRole('heading', { name: 'Actions rapides' })).toHaveCount(0);
                    const guide = p.getByRole('region', { name: 'Commençons votre première location' });
                    await expect(guide).toBeVisible();
                    await expect(guide.getByRole('link', { name: 'Ajouter un bien' })).toBeInViewport();
                    await guide.locator('summary').focus();
                    await p.keyboard.press('Enter');
                    await expect(guide.locator('ol > li')).toHaveCount(6);
                    await guide.locator('summary').click();
                    await guide.getByRole('link', { name: 'Ajouter un bien' }).click();
                    await expect(p).toHaveURL(base + '/parc/nouveau');
                    await expect(p.getByLabel('Nom du bien', { exact: true })).toBeVisible();
                    await p.goto(base, { waitUntil: 'networkidle' });
                }
                else {
                    const t = p.locator('#taches-proprietaire');
                    await expect(t.getByRole('heading', { name: /À faire maintenant/ })).toBeVisible();
                    expect((await t.boundingBox()).y).toBeLessThan((await p.getByRole('region', { name: 'Votre patrimoine en bref' }).boundingBox()).y);
                    expect(await t.locator(':scope > ul > li:visible').count()).toBeLessThanOrEqual(3);
                    const link = t.locator(':scope > ul > li a').first();
                    const href = await link.getAttribute('href');
                    await link.click();
                    await expect(p).toHaveURL('http://localhost:3100' + href);
                    await expect(p.locator('main')).toBeVisible();
                    await p.goto(base, { waitUntil: 'networkidle' });
                    await expect(p.getByRole('heading', { name: 'Actions rapides' })).toBeVisible();
                }
                expect(await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth))).toBe(0);
                await p.evaluate(() => document.fonts.ready);
                await p.screenshot({ path: path.join(preuves, 'apres-' + nom + '-' + width + '.png'), fullPage: true, style: 'nextjs-portal { display: none; }' });
                await info.getByRole('button', { name: 'J’ai compris' }).click();
                await expect(info).not.toHaveAttribute('open', '');
                await expect(info.locator('summary')).toBeFocused();
                await p.reload({ waitUntil: 'networkidle' });
                await expect(info).not.toHaveAttribute('open', '');
                await info.locator('summary').focus();
                await p.keyboard.press('Enter');
                await expect(info.getByText(/restent suspendus/)).toBeVisible();
                await info.getByRole('link', { name: 'Consulter les réglages d’envoi' }).click();
                await expect(p).toHaveURL(base + '/profil#envois');
                await expect(p.locator('#envois')).toBeVisible();
                await expect(p.getByText('Vos relances de loyer se préparent en PDF.', { exact: false })).toHaveCount(0);
                await p.goto(base + '/parc', { waitUntil: 'networkidle' });
                await expect(p.getByText(/Vos relances de loyer se préparent en PDF/)).toHaveCount(0);
                expect(erreurs).toEqual([]);
                resultats.push({ compte: nom, largeur: width, resultat: 'réussi', controles: ['prochaine action', 'navigation réelle', 'rendu sans débordement', '6 étapes si compte neuf', 'aucune modale automatique', 'information honnête et unique', 'acquittement persistant', 'réouverture clavier', 'réglages accessibles', 'aucune erreur JavaScript'] });
                console.log('RÉUSSI', nom, width);
                await c.close();
            }
        }
    }
    finally {
        fs.writeFileSync(path.join(preuves, 'resultats-navigateur.json'), JSON.stringify(resultats, null, 2));
        await b.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
