import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { depenseFacebookDuMois } from '../src/lib/marketing-meta';
const requete = vi.fn();
beforeEach(()=>{vi.stubGlobal('fetch',requete);vi.stubEnv('META_AD_ACCOUNT_ID','act_test');vi.stubEnv('META_FACEBOOK_PAGE_ACCESS_TOKEN','jeton-test');requete.mockReset();});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const repondre=(json:unknown)=>requete.mockResolvedValue({ok:true,json:async()=>json});
describe('le budget lit un total mensuel confirmé',()=>{
  it('lit le compte pour le mois, sans additionner les relevés de campagnes',async()=>{
    repondre({data:[{spend:'9.10',account_currency:'EUR',date_start:'2026-09-01',date_stop:'2026-09-22'}]});
    expect(await depenseFacebookDuMois()).toEqual({cents:910,debut:'2026-09-01',fin:'2026-09-22'});
    const url=new URL(requete.mock.calls[0][0]); expect(url.pathname).toContain('/act_test/insights'); expect(url.searchParams.get('date_preset')).toBe('this_month'); expect(url.searchParams.get('level')).toBe('account');
  });
  it.each([{data:[]},{data:[{spend:'10.00',account_currency:'USD'}]},{data:[{spend:'-1',account_currency:'EUR'}]},{data:[{spend:'4.00',account_currency:'EUR'}],paging:{next:'suite'}},{}])('ne prend pas un relevé manquant, ambigu ou dans une autre monnaie pour zéro',async json=>{
    repondre(json); const r=await depenseFacebookDuMois(); expect(r.cents).toBeNull(); expect(r.erreur).toBeTruthy();
  });
  it('accepte un zéro explicitement fourni par Meta',async()=>{
    repondre({data:[{spend:'0.00',account_currency:'EUR'}]}); expect((await depenseFacebookDuMois()).cents).toBe(0);
  });
  it('une connexion absente n’est pas présentée comme un budget disponible',async()=>{
    vi.stubEnv('META_AD_ACCOUNT_ID',''); expect((await depenseFacebookDuMois()).cents).toBeNull();expect(requete).not.toHaveBeenCalled();
  });
});
