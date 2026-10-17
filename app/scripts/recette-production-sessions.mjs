// Hors du test runner : aucun rapport Playwright, trace, capture ou stockage
// sur disque de la connexion, du QR, du secret TOTP ou du code saisi.
import { chromium } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { appendFileSync } from 'node:fs';
const env=process.env;
const url=new URL(env.RECETTE_URL ?? '');
if(!(url.href==='https://www.gerimmo.app/' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || !env.GITHUB_ENV || env.RECETTE_AUTONOME!=='1' || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(env.RECETTE_SUFFIXE ?? '')) throw new Error('Session de recette refusée.');
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const c of secret.toUpperCase().replace(/\s|=/g,'')){const n=alphabet.indexOf(c);if(n<0)throw new Error('Secret incorrect.');bits+=n.toString(2).padStart(5,'0');}
  const octets=[];for(let i=0;i+8<=bits.length;i+=8)octets.push(parseInt(bits.slice(i,i+8),2));
  const compteur=Buffer.alloc(8);compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const h=createHmac('sha1',Buffer.from(octets)).update(compteur).digest();const i=h[19]&15;
  return String((h.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0');
}
console.log('Ouverture du navigateur de recette.');
const browser=await chromium.launch({timeout:45000,...(env.PLAYWRIGHT_CHROMIUM?{executablePath:env.PLAYWRIGHT_CHROMIUM}:{})});
let phase="ouverture du navigateur";
let pageActive;
let statutConnexion=null;
try {
  for(const persona of ['ARTISAN','SUPERADMIN']) {
    const email=env[`RECETTE_EMAIL_${persona}`];
    if(email!==`delivered+recette-${persona.toLowerCase()}-${env.RECETTE_SUFFIXE}@resend.dev`) throw new Error('Adresse de recette refusée.');
    const context=await browser.newContext({baseURL:url.origin});
    context.setDefaultTimeout(45000);context.setDefaultNavigationTimeout(45000);
    const page=await context.newPage();
    pageActive=page;statutConnexion=null;
    page.on('response',response=>{
      const adresse=new URL(response.url());
      if(adresse.pathname==='/auth/v1/token' && adresse.searchParams.get('grant_type')==='password') statutConnexion=response.status();
    });
    phase=`connexion ${persona.toLowerCase()}`;console.log(`Session : ${phase}.`);
    await page.goto('/connexion');
    // La page serveur peut précéder l’hydratation : saisir à ce moment serait
    // effacé par React. Attendre le vrai gestionnaire du formulaire.
    await page.waitForFunction(()=>Array.from(document.forms).some(form=>Object.keys(form).some(cle=>cle.startsWith('__reactProps') && typeof form[cle]?.onSubmit==='function')),undefined,{timeout:45000});
    await page.locator('#email').fill(email);await page.locator('#mot-de-passe').fill(env.RECETTE_MOT_DE_PASSE);
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    if(persona==='SUPERADMIN') {
      phase='ouverture de la sécurité';console.log(`Session : ${phase}.`);
      await page.waitForURL(/\/securite(?:\?|$)/,{timeout:45000});
      phase='configuration du second facteur';console.log(`Session : ${phase}.`);
      await page.getByRole('button',{name:'Configurer mon application',exact:true}).click();
      await page.getByText('Saisir une clé à la place du QR code',{exact:true}).click();
      let secret=(await page.locator('details p').first().innerText()).trim();
      await page.getByLabel('Code à six chiffres',{exact:true}).fill(totp(secret));
      secret='';
      phase='validation du second facteur';console.log(`Session : ${phase}.`);
      await page.getByRole('button',{name:'Activer et continuer',exact:true}).click();
    }
    phase=`accès ${persona.toLowerCase()}`;console.log(`Session : ${phase}.`);
    await page.waitForURL(/\/(espaces|artisan|admin)(\/|\?|$)/,{timeout:45000});
    phase=`stabilisation ${persona.toLowerCase()}`;console.log(`Session : ${phase}.`);
    await page.waitForLoadState('networkidle',{timeout:45000});
    const session=Buffer.from(JSON.stringify(await context.storageState())).toString('base64');
    console.log(`::add-mask::${session}`);
    appendFileSync(env.GITHUB_ENV,`RECETTE_SESSION_${persona}=${session}\n`);
    await context.close();
  }
  console.log('Sessions artisan et supervision ouvertes ; second facteur vérifié par Auth.');
} catch {
  // Catégories fermées seulement : jamais d'URL complète, d'erreur Auth,
  // de texte de page, de corps de requête ou de contenu de session.
  const chemin=pageActive?new URL(pageActive.url()).pathname:'';
  const ecran=['/connexion','/espaces','/artisan','/admin','/admin/brief','/securite'].includes(chemin)?chemin:'autre';
  console.error(`Diagnostic de recette : écran=${ecran}, réponse connexion=${statutConnexion??'absente'}.`);
  console.error(`Ouverture des sessions interrompue (${phase}) ; aucun détail sensible enregistré.`);process.exitCode=1;
} finally {await browser.close();}
