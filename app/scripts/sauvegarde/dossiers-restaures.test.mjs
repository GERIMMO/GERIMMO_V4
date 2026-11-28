import assert from 'node:assert/strict';
import test from 'node:test';
import * as restauration from './restaurer-archive.mjs';

test('refuse une copie datée d’avant la fin des migrations', async () => {
  await assert.rejects(() => restauration.verifierDossiersRestaures(null, '2026-11-25T22:01:00Z'), /antérieure/);
});

test('refuse une pièce de dossier absente et rapporte les dossiers avec pièce', async () => {
  const ligne = { migration_presente: true, dossiers: 3, dossiers_avec_piece: 2, pieces_manquantes: 1 };
  const cible = { query: async () => ({ rows: [ligne] }) };
  const date = '2026-11-26T00:00:00Z';
  await assert.rejects(() => restauration.verifierDossiersRestaures(cible, date), /pièce/);
  ligne.pieces_manquantes = 0;
  assert.deepEqual(await restauration.verifierDossiersRestaures(cible, date), {
    migration: '20261125154000', dossiers: 3, dossiers_avec_piece: 2, pieces_manquantes: 0,
  });
  ligne.migration_presente = false;
  await assert.rejects(() => restauration.verifierDossiersRestaures(cible, date), /migration/);
});
