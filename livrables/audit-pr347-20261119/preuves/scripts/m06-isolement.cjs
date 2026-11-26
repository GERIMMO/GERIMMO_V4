const { ouvrir, BASE, IDS, connexionAvec } = require('./lib.cjs');
const fs = require('fs');
const CLE_PUB = 'sb_publishable_caNpm8YbyUPR48wwR4JZGQ_Eb5g1gEq', API = 'https://rddlxunppddzpsaatdaz.supabase.co';
const SCI = 'f1518456-4646-44f8-99ae-3f8571fa7551', DOC = 'bb0c42c5-7345-414a-8769-91b810ca4ca1', P = 'de335a42-7fe1-4032-85dd-abb708584eaa';
const CHEMIN = `${SCI}/baux-papier/fb116a69-e387-4816-ae2e-848e2fceff65/4f2b8331-7bf1-45b0-a7e8-3d6eee7b252d.pdf`;
(async () => {
  const { totp } = await import(__dirname + '/../complet/wt347/app/e2e/local/mfa-local.mjs');
  const jeton = async (ctx) => { const ck = (await ctx.cookies()).filter(c => c.name.startsWith('sb-rddlxunppddzpsaatdaz-auth-token')).sort((a, b) => a.name.localeCompare(b.name)); let v = ck.map(c => c.value).join(''); if (v.startsWith('base64-')) v = Buffer.from(v.slice(7), 'base64').toString(); return JSON.parse(v).access_token; };
  const essai = async (s, etiquette) => {
    const p = s.page; const t = await jeton(s.ctx); const h = { apikey: CLE_PUB, Authorization: 'Bearer ' + t };
    for (const url of [`/agence/${SCI}/documents/${DOC}/fichier`, `/espace/${SCI}/documents/${DOC}/fichier`, `/locataire/${SCI}/documents/${DOC}/fichier`]) {
      const r = await s.ctx.request.get(BASE + url, { maxRedirects: 0 }).catch(e => null);
      const loc = r && r.headers()['location'] ? ' → ' + r.headers()['location'].replace(/token=[^&]+/, 'token=<…>').replace(/^https:\/\/[^/]+/, '').slice(0, 70) : '';
      let corps = ''; if (r && r.status() === 200) { const b = await r.body(); corps = b.slice(0, 4).toString() === '%PDF' ? ' [PDF ' + b.length + ' o]' : ' [' + (r.headers()['content-type'] || '') + ']'; }
      console.log(`[${etiquette}] GET ${url.replace(SCI, '<SCI>').replace(DOC, '<doc>')} → ${r ? r.status() : 'erreur'}${loc}${corps}`);
    }
    const r2 = await p.request.get(`${API}/rest/v1/documents?select=id,titre&id=eq.${DOC}`, { headers: h }); console.log(`[${etiquette}] REST documents → ${r2.status()} ${(await r2.text()).slice(0, 80)}`);
    const r3 = await p.request.post(`${API}/storage/v1/object/sign/documents/${CHEMIN}`, { headers: { ...h, 'Content-Type': 'application/json' }, data: { expiresIn: 60 } }); console.log(`[${etiquette}] storage sign → ${r3.status()} ${(await r3.text()).replace(/token=[^"&]+/, 'token=<…>').slice(0, 90)}`);
    const r4 = await p.request.get(`${API}/storage/v1/object/authenticated/documents/${CHEMIN}`, { headers: h }); console.log(`[${etiquette}] storage lecture directe → ${r4.status()} ${(await r4.body()).slice(0, 4).toString() === '%PDF' ? 'PDF' : (await r4.text()).slice(0, 80)}`);
  };
  // 1. SCI : propriétaire légitime
  // 2. Propriétaire d'un autre espace, second facteur validé
  const b = await ouvrir('proprio'); const p = b.page;
  await p.goto(BASE + '/espaces', { waitUntil: 'networkidle' }); if (p.url().includes('/connexion')) await connexionAvec(p, IDS.comptes.proprio.email);
  console.log('session autre propriétaire →', p.url().replace(BASE, ''));
  if (p.url().includes('/securite')) { await p.waitForTimeout(31000 - (Date.now() % 30000)); await p.getByLabel('Code à six chiffres').fill(totp(fs.readFileSync(__dirname + '/totp.txt', 'utf8').trim())); await p.getByRole('button', { name: 'Vérifier et continuer' }).click(); await p.waitForURL(u => !u.pathname.startsWith('/securite'), { timeout: 30000 }); }
  await essai(b, 'autre propriétaire (aal2)'); await b.fermer();
  // 3. Locataire de l'autre espace
  const c = await ouvrir('locataire'); await essai(c, 'locataire autre espace'); await c.fermer();
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
