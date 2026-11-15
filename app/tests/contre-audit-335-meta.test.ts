import {afterEach,expect,it,vi} from 'vitest';
import {retrouverPostFacebook,texteFacebook} from '../src/lib/facebook';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
it("ne doit pas attribuer à B la preuve du post A quand le lien a été tronqué",async()=>{
  vi.stubEnv("META_FACEBOOK_PAGE_ID","123");vi.stubEnv("META_FACEBOOK_PAGE_ACCESS_TOKEN","fictif");
  const a={titre:"A",chapo:null,slug:"article-a",facebookTexte:"a".repeat(5000),facebookImageUrl:null};
  const b={...a,titre:"B",slug:"article-b"};
  const fb=vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(Response.json({data:[{id:"123_1",message:texteFacebook(a)}]}));
  vi.stubGlobal("fetch",fb);
  const preuve=await retrouverPostFacebook(b,new Date().toISOString());
  expect(fb).toHaveBeenCalledTimes(2);expect(preuve).toBeNull();
});
it("deux articles au texte identique gardent leur référence complète après troncature",async()=>{
  const a={id:"a",titre:"A",slug:"a",chapo:null,facebookImageUrl:null,facebookTexte:"😀".repeat(4000)};
  const b={...a,id:"b",slug:"b"};
  expect(texteFacebook(a).length).toBeLessThanOrEqual(5000);
  expect(texteFacebook(a)).toMatch(/\/journal\/a#gerimmo-a$/);
  expect(texteFacebook(b)).toMatch(/\/journal\/b#gerimmo-b$/);
  vi.stubEnv("META_FACEBOOK_PAGE_ID","123");vi.stubEnv("META_FACEBOOK_PAGE_ACCESS_TOKEN","fictif");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(
    Response.json({data:[{id:"123_1",message:texteFacebook(a)}]})));
  expect(await retrouverPostFacebook(b,new Date().toISOString())).toBeNull();
});
