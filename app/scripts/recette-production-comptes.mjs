// Le mot de passe est aléatoire, masqué et transmis seulement aux étapes du
// passage ; il n'est ni un paramètre GitHub ni un fichier d'artefact.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
const suffixe = process.env.RECETTE_SUFFIXE;
if (!['preparer', 'purger'].includes(action) || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(suffixe ?? '')
  || process.env.PGHOST !== 'aws-0-eu-west-3.pooler.supabase.com'
  || process.env.PGUSER !== 'postgres.rddlxunppddzpsaatdaz'
  || process.env.PGDATABASE !== 'postgres' || !process.env.PGPASSWORD) {
  throw new Error('La recette exige sa cible connue et un suffixe propre au passage GitHub.');
}
const args = ['-X', '-q', '-A', '-t', '-F', '=', '-v', 'ON_ERROR_STOP=1', '-v', `suffixe=${suffixe}`];
let motDePasse;
if (action === 'preparer') {
  motDePasse = `Recette-${randomBytes(24).toString('hex')}!`;
  console.log(`::add-mask::${motDePasse}`);
  args.push('-v', `mot_de_passe=${motDePasse}`);
}
args.push('-f', path.join(app, 'e2e/recette-production', action === 'preparer' ? 'preparer-comptes.sql' : 'purger.sql'));
const r = spawnSync('psql', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (r.status !== 0) {
  // Ces scripts ne manipulent que les objets du suffixe. Ne publier aucune
  // réponse SQL qui pourrait toutefois citer un compte extérieur à la recette.
  console.error(action === 'preparer' ? 'Préparation des comptes interrompue.' : 'Nettoyage à reprendre pour ce passage : ' + suffixe);
  process.exitCode = 1;
} else if (action === 'preparer') {
  const noms = { email_admin: 'RECETTE_EMAIL_ADMIN', email_proprietaire: 'RECETTE_EMAIL_PROPRIETAIRE',
    email_locataire: 'RECETTE_EMAIL_LOCATAIRE', org_agence: 'RECETTE_ORG_AGENCE', org_proprietaire: 'RECETTE_ORG_PROPRIETAIRE' };
  const valeurs = new Map(r.stdout.trim().split('\n').map(l => l.split('=')));
  const lignes = Object.entries(noms).map(([cle, nom]) => {
    const valeur = valeurs.get(cle);
    if (!valeur || /[\r\n]/.test(valeur)) throw new Error('Résultat de préparation incomplet.');
    if (cle.startsWith('email_') && !valeur.endsWith(`-${suffixe}@resend.dev`)) throw new Error('Adresse de recette refusée.');
    if (cle.startsWith('org_') && !/^[a-f0-9-]{36}$/.test(valeur)) throw new Error('Organisation de recette refusée.');
    return `${nom}=${valeur}`;
  });
  if (!process.env.GITHUB_ENV) throw new Error('Environnement du passage GitHub absent.');
  fs.appendFileSync(process.env.GITHUB_ENV, [...lignes, `RECETTE_MOT_DE_PASSE=${motDePasse}`, ''].join('\n'));
  console.log('Trois comptes de recette préparés, avec deux espaces isolés.');
} else {
  console.log('Les comptes et les données du passage ont été retirés.');
}
