import { describe, expect, it } from 'vitest';
import { lireMentionsContrat, plafondsHonoraires, verifierHonorairesContrat } from '@/lib/mentions-contrat';
import { contexte } from './fixtures/contexte-document';
import { construireBailNu } from '@/lib/documents/modeles/bail-nu';
import { construireBailMeuble } from '@/lib/documents/modeles/bail-meuble';
import { lienPourManquant } from '@/lib/documents/ou-renseigner';
import { Fusion } from '@/lib/documents/gabarit';
import { periodeConstruction } from '@/lib/documents/modeles/mentions-location';

function formulaire(valeurs: Record<string, string>) { const f = new FormData(); for (const [k,v] of Object.entries(valeurs)) f.set(k,v); return f; }
describe('Saisie des mentions du contrat', () => {
  it('préserve les nouveaux champs quand un ancien formulaire ne les présente pas', () => {
    expect(lireMentionsContrat(new FormData())).toEqual({ mentions: {} });
  });
  it('distingue réponse manquante, non et oui', () => {
    for (const [value, expected] of [['', null], ['false', false], ['true', true]] as const)
      expect(lireMentionsContrat(formulaire({ encadrement_loyer: value })).mentions.encadrement_loyer).toBe(expected);
  });
  it.each(['-1', 'NaN', 'Infinity', '100000000', '12.345'])('refuse un montant invalide : %s', v => {
    expect(lireMentionsContrat(formulaire({ dpe_depenses_min: v })).erreur).toBeTruthy();
  });
  it.each(['2026-02-30', '01/10/2026', '0000-99-12'])('refuse une date invalide : %s', v => {
    expect(lireMentionsContrat(formulaire({ date_conclusion_prevue: v })).erreur).toBeTruthy();
  });
  it('accepte zéro, les centimes et une vraie date sans décalage', () => {
    expect(lireMentionsContrat(formulaire({ dpe_depenses_min: '0', dpe_depenses_max: '1250,42', date_conclusion_prevue: '2026-10-01' }))).toEqual({ mentions: { dpe_depenses_min: 0, dpe_depenses_max: 1250.42, date_conclusion_prevue: '2026-10-01' } });
  });
  it('refuse une fourchette inversée et une clause sans servitude confirmée', () => {
    expect(lireMentionsContrat(formulaire({ dpe_depenses_min: '2000', dpe_depenses_max: '1000' })).erreur).toContain('maximum');
    expect(lireMentionsContrat(formulaire({ clause_resolutoire_servitude: 'true', servitude_residence_principale: 'false' })).erreur).toContain('servitude');
  });
  it.each(['peut-être', 'on'])('refuse une réponse hors choix : %s', v => {
    expect(lireMentionsContrat(formulaire({ encadrement_loyer: v })).erreur).toBeTruthy();
  });
});

describe('Honoraires distincts et plafonds datés', () => {
  it.each([['tres_tendue',12.1], ['tendue',10.09], ['autre',8.07]] as const)('utilise les plafonds 2026 : %s', (zone, plafond) => {
    expect(plafondsHonoraires('2026-10-01',zone)).toEqual({ location: plafond, edl: 3.03 });
  });
  it('ne projette ni une zone inconnue ni un tarif futur', () => {
    expect(plafondsHonoraires('2027-01-01','tendue')).toEqual({ location: null, edl: null });
    expect(plafondsHonoraires('2026-01-01',null)).toEqual({ location: null, edl: 3.03 });
    expect(plafondsHonoraires(null,'tendue')).toEqual({ location: null, edl: null });
  });
  it('vérifie séparément les deux parts et accepte exactement le plafond', () => {
    const b = { date_conclusion_prevue: '2026-10-01', zone_honoraires: 'tendue', honoraires_bailleur: 1000, honoraires_locataire: 504.5, honoraires_edl_bailleur: 200, honoraires_edl_locataire: 151.5 };
    expect(verifierHonorairesContrat(b,50)).toBeNull();
    expect(verifierHonorairesContrat({ ...b, honoraires_locataire: 504.51 },50)).toContain('Visite');
    expect(verifierHonorairesContrat({ ...b, honoraires_edl_locataire: 151.51 },50)).toContain('État des lieux');
    expect(verifierHonorairesContrat({ ...b, honoraires_edl_bailleur: 100 },50)).toContain('bailleur');
  });
});

describe.each(['nu','meuble','colocation'] as const)('Contrat %s', type => {
  function rendre(sur = {}) {
    const c = contexte(); c.bail = { ...c.bail, type, date_conclusion_prevue: '2026-10-01', encadrement_loyer: false, servitude_residence_principale: false, dpe_depenses_min: 850, dpe_depenses_max: 1200, dpe_annees_reference: '2021, 2022 et 2023', zone_honoraires: 'tendue', honoraires_edl_bailleur: 120, honoraires_edl_locataire: 100, ...sur };
    c.organisation.type = 'agence';
    return type === 'meuble' ? construireBailMeuble(c, { f: new Fusion(), dpeClasse: 'C', inventaire: [] }) : construireBailNu(c, { f: new Fusion(), dpeClasse: 'C' });
  }
  it('affiche la classe C, les dépenses et le calendrier de décence', () => {
    const d = rendre(); expect(d.html).toContain('DPE) : <b><span class="v">C</span></b>'); expect(d.html).toContain('850,00'); expect(d.html).toContain('2021, 2022 et 2023'); expect(d.html).toContain('2034'); expect(d.html).toContain('Mayotte');
  });
  it('n’assimile pas une zone tendue à l’encadrement par arrêté', () => {
    expect(rendre().html).toContain('Loyers de référence imposés par arrêté local : non');
    expect(rendre().html).not.toContain('Loyer de référence majoré :');
    expect(rendre({ encadrement_loyer: null }).manquants).toContain('application des loyers de référence à vérifier');
    expect(rendre({ encadrement_loyer: true }).html).toContain('Loyers de référence imposés par arrêté local : oui');
  });
  it('distingue six semaines, un mois et mise en demeure du maire', () => {
    const html = rendre({ servitude_residence_principale: true, clause_resolutoire_servitude: true }).html;
    expect(html).toContain('six semaines'); expect(html).toContain('qu’un mois'); expect(html).toContain('fixé par le maire');
    const sans = rendre({ clause_resolutoire_assurance: false, clause_resolutoire_troubles: false }).html;
    expect(sans).not.toContain('défaut d’assurance'); expect(sans).not.toContain('troubles de voisinage'); expect(sans).toContain('six semaines');
  });
  it('imprime des honoraires distincts et ne prétend pas que la génération vaut signature', () => {
    const d = rendre(); expect(d.html).toContain('10,09'); expect(d.html).toContain('3,03'); expect(d.html).not.toContain('état des lieux compris');
    expect(d.html).toContain('Date prévue de conclusion'); expect(d.html).toContain('date effective à compléter lors de la signature');
  });
  it('échappe les valeurs du DPE', () => {
    expect(rendre({ dpe_annees_reference: '<script>alert(1)</script>' }).html).toContain('&lt;script&gt;');
  });
});
it('décrit les périodes de construction sans englober 1998 dans le neuf', () => {
  expect(periodeConstruction(1985)).toBe('1975-1989'); expect(periodeConstruction(1998)).toBe('1990-2005'); expect(periodeConstruction(2010)).toBe('depuis 2006'); expect(periodeConstruction(null)).toBeNull();
});

it('dirige les nouvelles mentions vers leur saisie plutôt que vers la personne', () => {
  const liens = [{ entite: 'bail' as const, entiteId: 'b' }, { entite: 'lot' as const, entiteId: 'l' }, { entite: 'personne' as const, entiteId: 'p' }];
  for (const libelle of ['libre, plafonnement, réévaluation après travaux…', 'dépenses annuelles minimales du DPE', 'date prévue de conclusion du contrat', 'existence de la servitude de résidence principale à vérifier', 'plafond de location selon la date et la zone'])
    expect(lienPourManquant(libelle, 'org', liens, 'bail_colocation')?.href).toBe('/agence/org/baux/b#complements');
  expect(lienPourManquant('classe DPE du logement', 'org', liens, 'bail_meuble')?.href).toBe('/agence/org/parc?sel=lot:l');
});
