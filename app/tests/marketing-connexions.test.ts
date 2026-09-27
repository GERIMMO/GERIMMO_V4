import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { campagnesFacebook, depenseFacebookDuMois, santeFacebook } from '../src/lib/marketing-meta';
import { envoyerSurFacebook } from '../src/lib/facebook';

const requete = vi.fn();
const article = { titre: 'Conseil', chapo: null, slug: 'conseil', facebookTexte: null, facebookImageUrl: null };
beforeEach(() => {
  requete.mockReset();
  vi.stubGlobal('fetch', requete);
  vi.stubEnv('META_FACEBOOK_PAGE_ID', 'page-test');
  vi.stubEnv('META_FACEBOOK_PAGE_ACCESS_TOKEN', 'jeton-page');
  vi.stubEnv('META_ADS_ACCESS_TOKEN', 'jeton-publicite');
  vi.stubEnv('META_AD_ACCOUNT_ID', 'act_test');
  vi.stubEnv('VERCEL_ENV', 'production');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const reponse = (json: unknown) => ({ ok: true, json: async () => json });

describe('connexions Facebook et publicité séparées', () => {
  it('la Page utilise son accès propre et les campagnes leur accès publicitaire', async () => {
    requete.mockResolvedValueOnce(reponse({ name: 'Gerimmo', followers_count: 2 }))
      .mockResolvedValueOnce(reponse({ data: [] }))
      .mockResolvedValueOnce(reponse({ data: [{ spend: '1.20', account_currency: 'EUR' }] }));
    expect(await santeFacebook()).toMatchObject({ configure: true, nom: 'Gerimmo' });
    expect(await campagnesFacebook()).toEqual({ configure: true, campagnes: [] });
    expect(await depenseFacebookDuMois()).toMatchObject({ cents: 120 });
    expect(requete.mock.calls.map(([, options]) => options.headers.Authorization))
      .toEqual(['Bearer jeton-page', 'Bearer jeton-publicite', 'Bearer jeton-publicite']);
    for (const [url] of requete.mock.calls) expect(new URL(url).searchParams.has('access_token')).toBe(false);
  });
  it('lit la publicité sans exiger une clé de Page', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ACCESS_TOKEN', '');
    requete.mockResolvedValue(reponse({ data: [] }));
    expect(await campagnesFacebook()).toEqual({ configure: true, campagnes: [] });
    expect(requete).toHaveBeenCalledOnce();
  });
  it('ne tente jamais la clé de Page si la connexion publicitaire manque', async () => {
    vi.stubEnv('META_ADS_ACCESS_TOKEN', '  ');
    expect(await campagnesFacebook()).toEqual({ configure: false, campagnes: [] });
    expect(await depenseFacebookDuMois()).toMatchObject({ cents: null });
    expect(requete).not.toHaveBeenCalled();
  });
  it('ne retente pas avec la clé de Page après un refus publicitaire', async () => {
    requete.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'ads_read permission required' } }) });
    expect(await campagnesFacebook()).toMatchObject({ configure: true, erreur: expect.stringContaining('Meta Ads') });
    expect(requete).toHaveBeenCalledOnce();
  });
});

describe('publication limitée au site en ligne', () => {
  it.each(['preview', 'development'])('refuse tout appel externe en %s même avec une clé configurée', async environnement => {
    vi.stubEnv('VERCEL_ENV', environnement);
    await expect(envoyerSurFacebook(article)).rejects.toThrow('réservée au site en ligne');
    expect(requete).not.toHaveBeenCalled();
  });
  it('conserve la publication réelle avec le seul accès de Page', async () => {
    requete.mockResolvedValueOnce(reponse({ data: [] })).mockResolvedValueOnce(reponse({ id: 'publication-test' }));
    expect(await envoyerSurFacebook(article)).toMatchObject({ post_id: 'publication-test' });
    const [url, options] = requete.mock.calls[1];
    expect(url).toContain('/page-test/feed');
    expect(options.body.get('access_token')).toBe('jeton-page');
    expect(options.body.toString()).not.toContain('jeton-publicite');
  });
});
