import {afterEach,describe,it,expect,vi} from 'vitest';
import {consigneVisuel,creerVisuelMarketing} from '@/lib/visuel-marketing';
import {sujetDeVeille} from '@/lib/sujet-veille-marketing';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('visuels originaux et veille relayée',()=>{
 it('change la consigne par édition et garde une scène fictive sans faux document',()=>{expect(consigneVisuel('a','Un devis')).not.toEqual(consigneVisuel('b','Un devis'));expect(consigneVisuel('a','Un devis')).toContain('Aucun texte');expect(consigneVisuel('a','Un devis')).toContain('Scène fictive');});
 it('ne remplace pas une image absente par une image réutilisée',async()=>{vi.stubEnv('OPENAI_API_KEY','recette');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{b64_json:'pas une image'}]})));await expect(creerVisuelMarketing('a','Un devis')).rejects.toThrow('format');});
 it('refuse une source non officielle et distingue relais documentaire et conseil',()=>{const s={id:'a',titre:'Information logement',source_url:'https://exemple.test/article',source_nom:'Service Public',publie_source_le:null};expect(()=>sujetDeVeille(s)).toThrow();const v=sujetDeVeille({...s,source_url:'https://www.service-public.gouv.fr/actualites/A1'});expect(v.corps).toContain('ne signifie pas');expect(v.facebook).toContain('Source officielle');});
});
