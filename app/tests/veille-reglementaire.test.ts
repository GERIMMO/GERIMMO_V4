import {describe,it,expect} from 'vitest';
import {lireFluxVeille,sourceVeille} from '../src/lib/veille-reglementaire';
const flux=(titre='Nouveau DPE pour les logements',url='https://www.service-public.gouv.fr/particuliers/actualites/A123?xtor=RSS',date='2026-09-24T00:00:00+02:00')=>`<rss><channel><item><title>${titre}</title><link>${url}</link><dc:date xmlns:dc="url">${date}</dc:date></item></channel></rss>`;
describe('Veille : collecte limitée aux sources officielles',()=>{
 it('collecte un titre pertinent avec date et lien canonique sans le publier',()=>{expect(lireFluxVeille(flux(),'Service Public')).toEqual([{titre:'Nouveau DPE pour les logements',source_url:'https://www.service-public.gouv.fr/particuliers/actualites/A123',source_nom:'Service Public',publie_source_le:'2026-09-23T22:00:00.000Z'}]);});
 it('écarte une actualité sans rapport, un lien tiers et les entités externes',()=>{expect(lireFluxVeille(flux('Concours de chant'),'SP')).toEqual([]);expect(lireFluxVeille(flux('Location','https://evil.example/x'),'SP')).toEqual([]);expect(()=>lireFluxVeille('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+flux(),'SP')).toThrow();});
 it('refuse un flux incomplet et élimine les balises de présentation',()=>{expect(()=>lireFluxVeille('<rss>','SP')).toThrow();expect(lireFluxVeille(flux('<![CDATA[<b>Artisans</b> &amp; factures]]>'),'SP')[0].titre).toBe('Artisans & factures');});
 it.each(['http://www.anil.org/x','https://www.anil.org.evil.com/x','https://user:pass@www.anil.org/x','https://www.anil.org:8443/x','javascript:alert(1)'])('refuse %s',u=>expect(sourceVeille(u)).toBeNull());
});
