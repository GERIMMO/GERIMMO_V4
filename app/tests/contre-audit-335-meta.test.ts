import {afterEach,expect,it,vi} from 'vitest';
// Reprise du lot D1 (24/11/2026, M3) : un article porte désormais son origine. Ces jeux d'essai sont des articles
// d'origine « ia » (le cas de la parution automatique) : leur post se termine par la mention, APRÈS le lien complet.
import {retrouverPostFacebook,texteFacebook} from '../src/lib/facebook';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
it("ne doit pas attribuer à B la preuve du post A quand le lien a été tronqué",async()=>{
  vi.stubEnv("META_FACEBOOK_PAGE_ID","123");vi.stubEnv("META_FACEBOOK_PAGE_ACCESS_TOKEN","fictif");
  const a={titre:"A",chapo:null,slug:"article-a",facebookTexte:"a".repeat(5000),facebookImageUrl:null,origine:"ia" as const};
  const b={...a,titre:"B",slug:"article-b"};
  const fb=vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(Response.json({data:[{id:"123_1",message:texteFacebook(a)}]}));
  vi.stubGlobal("fetch",fb);
  const preuve=await retrouverPostFacebook(b,new Date().toISOString());
  expect(fb).toHaveBeenCalledTimes(2);expect(preuve).toBeNull();
});
it("deux articles au texte identique gardent leur référence complète après troncature",async()=>{
  const a={id:"a",titre:"A",slug:"a",chapo:null,facebookImageUrl:null,facebookTexte:"😀".repeat(4000),origine:"ia" as const};
  const b={...a,id:"b",slug:"b"};
  expect(texteFacebook(a).length).toBeLessThanOrEqual(5000);
  // La troncature garde le lien entier ET la mention qui le suit (avant le 24/11, le post finissait par le lien).
  expect(texteFacebook(a)).toMatch(/\/journal\/a#gerimmo-a\n\nRédigé avec l’aide de l’IA$/);
  expect(texteFacebook(b)).toMatch(/\/journal\/b#gerimmo-b\n\nRédigé avec l’aide de l’IA$/);
  vi.stubEnv("META_FACEBOOK_PAGE_ID","123");vi.stubEnv("META_FACEBOOK_PAGE_ACCESS_TOKEN","fictif");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(
    Response.json({data:[{id:"123_1",message:texteFacebook(a)}]})));
  expect(await retrouverPostFacebook(b,new Date().toISOString())).toBeNull();
});
