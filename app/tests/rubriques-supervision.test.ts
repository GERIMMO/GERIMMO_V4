import { describe, it, expect } from 'vitest';
import { RUBRIQUES, rubriqueActive, ongletActif } from '@/lib/rubriques-supervision';

describe('Destinations de supervision', () => {
  it('chaque entrée ouvre sa propre rubrique, même lorsque le chemin est partagé', () => {
    expect(RUBRIQUES).toHaveLength(17);
    for (const rubrique of RUBRIQUES) {
      const url = new URL(rubrique.href, 'https://gerimmo.test');
      expect(rubriqueActive(url.pathname, url.search)?.cle, rubrique.href).toBe(rubrique.cle);
    }
  });
  it('les filtres et les dates ne font pas perdre la vue en cours', () => {
    expect(rubriqueActive('/admin/brief', 'equipe=finance&jour=2026-10-16&vue=equipes')?.cle).toBe('comptes-rendus');
    expect(rubriqueActive('/admin/autonomie', 'page=2&vue=dossiers&equipe=incident')?.cle).toBe('dossiers');
    expect(rubriqueActive('/admin/autonomie', 'vue=ameliorations')?.cle).toBe('produit');
    expect(rubriqueActive('/admin/brief', 'vue=inconnue')?.cle).toBe('bureau');
  });
  it('les fiches conservent leur destination la plus précise', () => {
    expect(rubriqueActive('/admin/clients/artisans/exemple')?.cle).toBe('artisans');
    expect(rubriqueActive('/admin/organisations/exemple/support')?.cle).toBe('utilisateurs');
    expect(rubriqueActive('/admin/brief/finance')?.cle).toBe('comptes-rendus');
    expect(ongletActif('/admin/brief/finance')).toBeNull();
    expect(rubriqueActive('/admin/publications/nouvelle')?.cle).toBe('marketing');
  });
  it('les anciens accès, les consignes et les sous-pages restent rattachés', () => {
    expect(rubriqueActive('/admin/autonomie')?.cle).toBe('dossiers');
    expect(rubriqueActive('/admin/consignes')?.cle).toBe('automatismes');
    expect(rubriqueActive('/admin/veille')?.cle).toBe('securite');
    expect(rubriqueActive('/admin/devis')?.cle).toBe('commercial');
    expect(rubriqueActive('/admin/couverture')?.cle).toBe('artisans');
    expect(rubriqueActive('/admin/inexistant')).toBeNull();
  });
});
