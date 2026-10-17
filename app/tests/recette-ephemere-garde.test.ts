import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('comptes éphémères : refus avant toute connexion ou création', () => {
  const local = { PGHOST:'127.0.0.1', PGPORT:'1', PGUSER:'postgres', PGDATABASE:'gerimmo_ci_recette', RECETTE_URL:'http://localhost:3503', RECETTE_SUFFIXE:'r202610160099-1' };
  it.each([
    { RECETTE_URL:'https://autre-site.example' },
    { RECETTE_URL:'http://127.0.0.1.example:3503' },
    { RECETTE_URL:'http://localhost:3503/chemin' },
    { RECETTE_URL:'http://localhost:3503/?parametre=1' },
    { RECETTE_URL:'http://utilisateur:secret@localhost:3503' },
    { PGDATABASE:'postgres' },
    { PGHOST:'autre-base.example' },
    { RECETTE_SUFFIXE:'passage-manuel' },
    { RECETTE_SUFFIXE:'r202610160099-1%_.*' },
    { PGHOST:'aws-0-eu-west-3.pooler.supabase.com', PGUSER:'postgres.rddlxunppddzpsaatdaz', PGDATABASE:'postgres', RECETTE_URL:'https://www.gerimmo.app', GITHUB_WORKFLOW:'Recette de production avec nettoyage', GITHUB_REF:'refs/heads/branche', PGPASSWORD:'fictif' },
    { PGHOST:'aws-0-eu-west-3.pooler.supabase.com', PGUSER:'postgres.rddlxunppddzpsaatdaz', PGDATABASE:'postgres', RECETTE_URL:'https://www.gerimmo.app', GITHUB_WORKFLOW:'Recette de production', GITHUB_REF:'refs/heads/main', PGPASSWORD:'fictif' },
  ])('refuse le contexte hors périmètre %j', valeurs => {
    const r=spawnSync(process.execPath,['scripts/recette-production-comptes.mjs','preparer'],{env:{NODE_ENV:'test',PATH:process.env.PATH,...local,...valeurs},encoding:'utf8'});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('La recette exige sa cible connue');
    expect(r.stdout).not.toContain('::add-mask::');
    expect(r.stdout).not.toContain('préparés');
  });
});
