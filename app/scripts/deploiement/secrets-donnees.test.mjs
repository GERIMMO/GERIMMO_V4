import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

const workflows = new URL('../../../.github/workflows/', import.meta.url);
const mainUniquement = "github.ref == 'refs/heads/main'";
const autorisations = {
  'migrations.yml': { appliquer: 'gerimmo-production' },
  'recette-production-autonome.yml': { recette: 'gerimmo-donnees' },
  'sauvegarde.yml': { sauvegarder: 'gerimmo-donnees' },
};
const secretProtege = /\b(SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|GERIMMO_BACKUP_SERVICE_KEY)\b/i;

function litDesSecretsProteges(valeur) {
  if (typeof valeur === 'object' && valeur !== null) {
    return Object.values(valeur).some(litDesSecretsProteges);
  }
  if (typeof valeur !== 'string') return false;

  return [...valeur.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].some(([, expression]) =>
    /\bsecrets\b/i.test(expression) && (
      secretProtege.test(expression)
      // Les index calculés et la transmission du contexte entier peuvent lire les mêmes secrets.
      || /\bsecrets\b(?!\s*(?:\.\s*\w+|\[\s*'[^']+'\s*\]))/i.test(expression)
    )
  );
}

function verifierWorkflow(fichier, document) {
  const { jobs = {}, ...global } = document;
  assert.ok(!litDesSecretsProteges(global), `${fichier} lit un secret de données hors d’un job`);

  for (const [nom, job] of Object.entries(jobs)) {
    const contexte = `${fichier} / ${nom}`;
    assert.notEqual(job.secrets, 'inherit', `${contexte} hérite de secrets sans les déclarer`);
    if (!litDesSecretsProteges(job)) continue;

    const attendu = autorisations[fichier]?.[nom];
    assert.ok(attendu, `${contexte} lit un secret de données sans autorisation`);
    assert.equal(job.environment?.name ?? job.environment, attendu, `${contexte} doit utiliser ${attendu}`);
    assert.ok(
      [mainUniquement, `${mainUniquement} && vars.SCW_BUCKET != ''`].includes(job.if),
      `${contexte} doit être limité à main`,
    );
  }
}

for (const fichier of readdirSync(workflows).filter(nom => /\.ya?ml$/.test(nom))) {
  test(`Secrets de données isolés dans ${fichier}`, () => {
    verifierWorkflow(fichier, yaml.load(readFileSync(new URL(fichier, workflows), 'utf8')));
  });
}

test('Refuse une lecture globale, un job étranger et un accès indirect', () => {
  const lecture = { env: { CLE: "${{ secrets['supabase_db_password'] }}" } };
  assert.throws(() => verifierWorkflow('sauvegarde.yml', lecture), /hors d’un job/);
  assert.throws(() => verifierWorkflow('autre.yaml', {
    jobs: { copie: { environment: 'gerimmo-donnees', steps: [lecture] } },
  }), /sans autorisation/);
  assert.throws(() => verifierWorkflow('autre.yaml', {
    jobs: { copie: { env: { CLE: '${{ secrets[inputs.nom] }}' } } },
  }), /sans autorisation/);
  assert.throws(() => verifierWorkflow('autre.yaml', {
    jobs: { copie: { secrets: 'inherit' } },
  }), /hérite/);
});
