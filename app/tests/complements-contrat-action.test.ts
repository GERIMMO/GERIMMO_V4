import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ acces: vi.fn(), revalider: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/ged-acces', () => ({ verifierGerant: mocks.acces }));
vi.mock('@/lib/ged-depot', () => ({ deposerFichierGed: vi.fn() }));
vi.mock('@/lib/email', () => ({ envoyerEmail: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalider }));
import { modifierComplementsBail } from '@/app/actions/baux';
beforeEach(() => vi.clearAllMocks());
function client(lignes: unknown[] = [{ id: 'bail' }], loyerHc = 1500) {
  const filtres: unknown[] = []; let ecriture = false;
  const q = { update: (v: unknown) => { ecriture = true; mocks.update(v); return q; }, eq: (k: string,v: unknown) => { filtres.push([k,v]); return q; }, select: () => ecriture ? Promise.resolve({ data: lignes, error: null }) : q,
    maybeSingle: async () => ({ data: { loyer_hc: loyerHc, lot_id: "lot", lot: { surface_m2: 50, bien_id: "bien" } }, error: null }) };
  mocks.acces.mockResolvedValue({ user: { id:'gerant' }, supabase: { from: () => q } }); return filtres;
}
it('refuse une session non autorisée', async () => {
  mocks.acces.mockResolvedValue({ user: null });
  expect(await modifierComplementsBail('org','bail',{},new FormData())).toHaveProperty('erreur'); expect(mocks.update).not.toHaveBeenCalled();
});
it('contrôle les honoraires avant écriture et conserve la saisie en erreur', async () => {
  client(); const f = new FormData(); f.set('date_conclusion_prevue','2026-10-01'); f.set('zone_honoraires','tendue'); f.set('honoraires_locataire','600'); f.set('honoraires_bailleur','1000');
  const r = await modifierComplementsBail('org','bail',{},f); expect(r.erreur).toContain('plafond'); expect(r.valeurs?.honoraires_locataire).toBe('600'); expect(mocks.update).not.toHaveBeenCalled();
});
it('répète le contrôle de brouillon au moment de l’écriture, même si le bail avance entre les deux requêtes', async () => {
  const filtres = client([]); const f = new FormData(); f.set('encadrement_loyer','false');
  const r = await modifierComplementsBail('org','bail',{},f); expect(r.erreur).toContain('déjà avancé'); expect(mocks.revalider).not.toHaveBeenCalled();
  expect(filtres).toEqual([['id','bail'],['organization_id','org'],['etat','brouillon'],['id','bail'],['organization_id','org'],['etat','brouillon']]);
});
it('enregistre les nouveaux choix explicites et recharge le dossier', async () => {
  client(); const f = new FormData(); f.set('encadrement_loyer','false'); f.set('servitude_residence_principale','true'); f.set('clause_resolutoire_servitude','true');
  expect(await modifierComplementsBail('org','bail',{},f)).toHaveProperty('succes');
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ encadrement_loyer: false, servitude_residence_principale: true, clause_resolutoire_servitude: true }));
  expect(mocks.revalider).toHaveBeenCalledWith('/agence/org/baux/bail');
});

it('X08 : enregistre les montants inchangés et renvoie un avertissement après succès', async () => {
  client(); const f = new FormData();
  for (const [k,v] of Object.entries({encadrement_loyer:'true',loyer_reference:'20',loyer_reference_majore:'24',complement_loyer:'100',complement_justification:'Terrasse'})) f.set(k,v);
  const r = await modifierComplementsBail('org','bail',{},f);
  expect(r.succes).toBeTruthy(); expect(r.erreur).toBeUndefined();
  expect(r.avertissements?.map(a=>a.code)).toContain('base_superieure');
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({loyer_reference:20,loyer_reference_majore:24,complement_loyer:100}));
  expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('loyer_hc');
  expect(mocks.revalider).toHaveBeenCalledWith('/agence/org/parc/bien/lots/lot');
});
