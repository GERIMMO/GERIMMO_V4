import { beforeEach, describe, expect, it, vi } from 'vitest';

const banc = vi.hoisted(() => ({ insert: vi.fn(), autorise: true, signe: false, revalider: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: banc.revalider }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/ged-acces', () => ({ verifierGerant: async () => ({
  user: banc.autorise ? { id: 'agent-test' } : null,
  supabase: { from: () => {
    const lecture = { select: () => lecture, eq: () => lecture, maybeSingle: async () => ({ data: { etat: banc.signe ? 'signe' : 'brouillon' } }), insert: banc.insert };
    return lecture;
  } },
}) }));
import { ajouterCompteur, ajouterCle } from '@/app/actions/edl';

beforeEach(() => { vi.clearAllMocks(); banc.autorise = true; banc.signe = false; banc.insert.mockResolvedValue({ error: null }); });

describe('Ajouts EDL : afficher uniquement la ligne confirmée', () => {
  const cas = [
    { nom: 'compteur', action: ajouterCompteur, champs: { type: 'Eau froide', numero: 'C01', releve: '123.5' }, attendu: { type: 'Eau froide', numero: 'C01', releve: 123.5 } },
    { nom: 'cle', action: ajouterCle, champs: { libelle: 'Porte', reference: 'K01', nombre: '2' }, attendu: { libelle: 'Porte', reference: 'K01', nombre: 2 } },
  ] as const;
  for (const c of cas) {
    function form() { const f = new FormData(); for (const [k,v] of Object.entries(c.champs)) f.set(k,v); return f; }
    it(`${c.nom} : renvoie l’identifiant exact persisté et ses valeurs normalisées`, async () => {
      const retour = await c.action('org-test', 'bail-test', 'edl-test', {}, form());
      const ligne = retour[c.nom];
      expect(retour.succes).toBeTruthy();
      expect(ligne).toMatchObject(c.attendu);
      expect(ligne?.id).toMatch(/^[a-f0-9-]{36}$/);
      expect(banc.insert).toHaveBeenCalledWith({ ...ligne, edl_id: 'edl-test', organization_id: 'org-test' });
    });
    it(`${c.nom} : ne renvoie aucune ligne après un refus de la base`, async () => {
      banc.insert.mockResolvedValue({ error: { message: 'EDL signé : figé' } });
      const retour = await c.action('org-test', 'bail-test', 'edl-test', {}, form());
      expect(retour.erreur).toBeTruthy();
      expect(retour[c.nom]).toBeUndefined();
      expect(retour.succes).toBeUndefined();
      expect(banc.revalider).not.toHaveBeenCalled();
    });
    it(`${c.nom} : refuse un EDL signé avant toute insertion`, async () => {
      banc.signe = true;
      expect((await c.action('org-test', 'bail-test', 'edl-test', {}, form())).erreur).toContain('signé');
      expect(banc.insert).not.toHaveBeenCalled();
    });
  }
});
