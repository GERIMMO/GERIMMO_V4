// Export logique de la base Gerimmo, chiffré (25/09, audit R1).
//
// Les sauvegardes de la plateforme Supabase dépendent du plan et ne sont pas
// dans nos mains ; ce programme donne une copie que l'on tient soi-même :
// un `pg_dump` des schémas applicatifs, chiffré AES-256-GCM dans le même
// format que les fichiers (fichiers.mjs, en-tête GERIMMO1), avec un manifeste
// qui note la date, la taille et l'empreinte. Rien n'est planifié ici : il se
// lance à la main ou depuis un planificateur externe qui détient les secrets.
//
// Ce qu'il ne fait PAS : il ne restaure rien (voir docs/sauvegarde-et-
// restauration.md, la restauration passe par pg_restore sur un projet de
// secours), il ne copie pas les fichiers du Storage (fichiers.mjs) et il ne
// remplace pas une sauvegarde automatique testée par la plateforme.
//
// Le mot de passe ne passe jamais en argument de commande (il serait lisible
// dans la liste des processus) : il est transmis à pg_dump par PGPASSWORD,
// dans l'environnement du seul processus enfant.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chiffrer, dechiffrer, lireCle } from './fichiers.mjs';

/** Les schémas qui portent les données de Gerimmo. Les schémas internes de Supabase se recréent avec le projet. */
export const SCHEMAS = ['public', 'auth', 'storage'];
const LIMITE = 4 * 1024 * 1024 * 1024;
const empreinte = b => createHash('sha256').update(b).digest('hex');

/** Décompose la chaîne de connexion en arguments pg_dump sûrs + mot de passe séparé. */
export function argumentsConnexion(chaine) {
  let url;
  try { url = new URL(chaine ?? ''); } catch { throw new Error('Chaîne de connexion invalide.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('La chaîne doit commencer par postgres://.');
  if (!url.hostname || !url.username) throw new Error('Hôte et utilisateur obligatoires.');
  const base = url.pathname.replace(/^\//, '');
  if (!base) throw new Error('Nom de base obligatoire.');
  const args = ['--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--dbname', base];
  const sslmode = url.searchParams.get('sslmode');
  const env = { PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: sslmode ?? (['localhost', '127.0.0.1'].includes(url.hostname) ? 'prefer' : 'require') };
  return { args, env };
}

/** Lance pg_dump et rend son flux complet en mémoire (format custom, sans propriétaires ni droits). */
export function lancerPgDump({ args, env }, commande = 'pg_dump', schemas = SCHEMAS) {
  return new Promise((resoudre, rejeter) => {
    const complet = ['--format=custom', '--no-owner', '--no-privileges', '--no-comments', ...schemas.flatMap(s => ['--schema', s]), ...args];
    const enfant = spawn(commande, complet, { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const morceaux = []; let taille = 0; let erreurs = '';
    enfant.stdout.on('data', m => { taille += m.length; if (taille > LIMITE) { enfant.kill(); rejeter(new Error('Export trop volumineux : traitement spécifique nécessaire.')); } morceaux.push(m); });
    enfant.stderr.on('data', m => { erreurs += m.toString().slice(0, 2000); });
    enfant.on('error', () => rejeter(new Error('pg_dump introuvable ou non exécutable.')));
    enfant.on('close', code => {
      // Le message de pg_dump peut citer l'hôte, jamais le mot de passe (il est dans l'environnement).
      if (code !== 0) return rejeter(new Error(`pg_dump a échoué (code ${code}) : ${erreurs.trim().split('\n')[0] || 'sans message'}`));
      resoudre(Buffer.concat(morceaux));
    });
  });
}

export async function exporter(dossier, cle, connexion, options = {}) {
  await fs.mkdir(dossier, { mode: 0o700 });
  let octets;
  try { octets = await lancerPgDump(argumentsConnexion(connexion), options.commande, options.schemas); }
  catch (e) { await fs.rmdir(dossier).catch(() => {}); throw e; }
  if (octets.length < 64) throw new Error('Export vide : rien n’a été écrit.');
  await fs.writeFile(path.join(dossier, 'base.dump.gcm'), chiffrer(octets, cle), { mode: 0o600, flag: 'wx' });
  const manifeste = { version: 1, nature: 'base', date: new Date().toISOString(), schemas: options.schemas ?? SCHEMAS, taille: octets.length, sha256: empreinte(octets), hote: argumentsConnexion(connexion).args[1] };
  await fs.writeFile(path.join(dossier, 'manifeste-base.gcm'), chiffrer(Buffer.from(JSON.stringify(manifeste)), cle), { mode: 0o600, flag: 'wx' });
  return { octets: octets.length, sha256: manifeste.sha256 };
}

async function lireSur(dossier, nom) {
  const chemin = path.join(dossier, nom), stat = await fs.lstat(chemin);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITE + 1024 * 1024) throw new Error('Fichier de sauvegarde invalide.');
  return fs.readFile(chemin);
}

export async function verifier(dossier, cle) {
  const m = JSON.parse(dechiffrer(await lireSur(dossier, 'manifeste-base.gcm'), cle).toString());
  if (m.version !== 1 || m.nature !== 'base' || !/^[a-f0-9]{64}$/.test(m.sha256 ?? '')) throw new Error('Manifeste invalide.');
  const octets = dechiffrer(await lireSur(dossier, 'base.dump.gcm'), cle);
  if (octets.length !== m.taille || empreinte(octets) !== m.sha256) throw new Error('Intégrité de l’export non confirmée.');
  return m;
}

export async function extraire(dossier, cle, destination) {
  const m = await verifier(dossier, cle);
  await fs.mkdir(destination, { mode: 0o700 });
  await fs.writeFile(path.join(destination, 'base.dump'), dechiffrer(await lireSur(dossier, 'base.dump.gcm'), cle), { flag: 'wx', mode: 0o600 });
  await fs.writeFile(path.join(destination, 'restauration-base.json'), JSON.stringify(m, null, 2), { flag: 'wx', mode: 0o600 });
  return { octets: m.taille, date: m.date };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [commande, dossier, destination] = process.argv.slice(2), cle = lireCle(process.env.GERIMMO_BACKUP_KEY);
    if (!dossier) throw new Error('Indiquer un dossier de sauvegarde.');
    let bilan;
    if (commande === 'exporter') bilan = await exporter(dossier, cle, process.env.GERIMMO_BACKUP_DB_URL);
    else if (commande === 'verifier') { const m = await verifier(dossier, cle); bilan = { date: m.date, octets: m.taille, integrite: 'vérifiée' }; }
    else if (commande === 'extraire' && destination) bilan = await extraire(dossier, cle, destination);
    else throw new Error('Commandes : exporter, verifier ou extraire (avec un dossier de destination neuf).');
    console.log(JSON.stringify(bilan));
  } catch (e) { console.error(e instanceof Error ? e.message : 'Opération interrompue.'); process.exitCode = 1; }
}
