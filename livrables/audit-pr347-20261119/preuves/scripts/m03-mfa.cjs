const { ouvrir, capture, BASE, IDS, connexionAvec } = require('./lib.cjs');
const fs = require('fs');
const CLE_PUB = 'sb_publishable_caNpm8YbyUPR48wwR4JZGQ_Eb5g1gEq', API = 'https://rddlxunppddzpsaatdaz.supabase.co';
const ORG = 'de335a42-7fe1-4032-85dd-abb708584eaa';
(async () => {
  const { totp } = await import(__dirname + '/../complet/wt347/app/e2e/local/mfa-local.mjs');
  const fenetreSuivante = async () => { const r = 30000 - (Date.now() % 30000); await new Promise(x => setTimeout(x, r + 1500)); };
  const s = await ouvrir('proprio'); const p = s.page; const email = IDS.comptes.proprio.email;
  const jeton = async () => {
    const ck = (await s.ctx.cookies()).filter(c => c.name.startsWith('sb-rddlxunppddzpsaatdaz-auth-token')).sort((a, b) => a.name.localeCompare(b.name));
    let v = ck.map(c => c.value).join(''); if (v.startsWith('base64-')) v = Buffer.from(v.slice(7), 'base64').toString();
    const t = JSON.parse(v).access_token; const pl = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
    return { t, aal: pl.aal, session: (pl.session_id || '').slice(0, 8) };
  };
  const sonderApi = async (etiquette, t) => {
    const h = { apikey: CLE_PUB, Authorization: 'Bearer ' + t };
    const r1 = await p.request.get(`${API}/rest/v1/organizations?select=id`, { headers: h });
    const r2 = await p.request.post(`${API}/rest/v1/rpc/user_org_ids`, { headers: { ...h, 'Content-Type': 'application/json' }, data: {} });
    const r3 = await p.request.post(`${API}/storage/v1/object/list/documents`, { headers: { ...h, 'Content-Type': 'application/json' }, data: { prefix: ORG, limit: 5 } });
    const court = async r => `${r.status()} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 110)}`;
    console.log(`API [${etiquette}] organizations → ${await court(r1)}\n   rpc user_org_ids → ${await court(r2)}\n   storage list → ${await court(r3)}`);
  };
  try {
    // 1. Activation
    await p.goto(BASE + '/compte', { waitUntil: 'networkidle' });
    const carte = p.locator('.loc-carte', { hasText: 'Double authentification' });
    console.log('état initial:', (await carte.innerText()).replace(/\s+/g, ' ').slice(0, 80));
    await carte.getByRole('button', { name: 'Activer la double authentification' }).click();
    await carte.getByText('Saisir une clé à la place du QR code').click();
    const secret = (await carte.locator('details p').first().innerText()).trim();
    fs.writeFileSync(__dirname + '/totp.txt', secret, { mode: 0o600 });
    console.log('clé TOTP lue (format ok ?):', /^[A-Z2-7]{16,}$/.test(secret));
    await carte.getByLabel('Code à six chiffres').fill(totp(secret));
    await carte.getByRole('button', { name: 'Activer', exact: true }).click();
    await carte.getByText('active', { exact: true }).waitFor({ timeout: 20000 });
    console.log('après activation:', (await carte.getByRole('status').allInnerTexts()).join(' | '));
    await capture(p, 'proprio-05-mfa-active');
    // 2. Déconnexion puis mot de passe seul
    await p.getByRole('button', { name: 'Se déconnecter' }).click(); await p.waitForURL(/\/connexion/, { timeout: 20000 });
    await connexionAvec(p, email);
    console.log('après mot de passe seul →', p.url().replace(BASE, ''));
    await capture(p, 'proprio-06-mot-de-passe-seul');
    for (const chemin of ['/espaces', `/espace/${ORG}`, `/espace/${ORG}/loyers`, '/compte', `/agence/${ORG}/documents`]) {
      await p.goto(BASE + chemin, { waitUntil: 'domcontentloaded' }); console.log(`  accès ${chemin} →`, p.url().replace(BASE, ''));
    }
    const j1 = await jeton(); console.log('niveau de la session après mot de passe seul:', j1.aal);
    await sonderApi('aal1, mot de passe seul', j1.t);
    // 3. Code faux
    await p.goto(BASE + `/securite?suite=${encodeURIComponent('/espace/' + ORG)}`, { waitUntil: 'networkidle' });
    const faux = String((Number(totp(secret)) + 12345) % 1000000).padStart(6, '0');
    await p.getByLabel('Code à six chiffres').fill(faux); await p.getByRole('button', { name: 'Vérifier et continuer' }).click();
    await p.waitForTimeout(3000);
    console.log('code faux →', p.url().replace(BASE, ''), '|', (await p.locator('main').innerText()).replace(/\s+/g, ' ').match(/Ce code[^.]*\./)?.[0]);
    await capture(p, 'proprio-07-code-faux');
    // 4. Code juste (fenêtre suivante pour éviter la réutilisation)
    await fenetreSuivante();
    await p.getByLabel('Code à six chiffres').fill(totp(secret)); await p.getByRole('button', { name: 'Vérifier et continuer' }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/securite'), { timeout: 30000 }).catch(() => {});
    await p.waitForLoadState('networkidle').catch(() => {});
    console.log('code juste →', p.url().replace(BASE, ''));
    await capture(p, 'proprio-08-code-juste');
    const j2 = await jeton(); console.log('niveau après code juste:', j2.aal, '| même session ?', j1.session === j2.session);
    await sonderApi('aal2', j2.t);
    // 5. Déconnexion : l'ancien jeton aal2 ne vaut plus rien
    await p.goto(BASE + '/compte', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Se déconnecter' }).click(); await p.waitForURL(/\/connexion/, { timeout: 20000 });
    await sonderApi('après déconnexion, ancien jeton aal2', j2.t);
  } catch (e) { console.log('ECHEC', e.message.split('\n')[0]); await capture(p, 'proprio-ECHEC-mfa'); }
  finally { console.log('erreurs:', s.erreurs.filter(x => !/401|428/.test(x)).slice(0, 5)); await s.fermer(); }
})();
