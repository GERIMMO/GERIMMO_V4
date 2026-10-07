import {describe,it,expect} from 'vitest';
import {lireFluxVeille,nomDeSource,sourceVeille} from '../src/lib/veille-reglementaire';
import {estSujetLogement,sujetDeVeille,titreSansDoublon} from '../src/lib/sujet-veille-marketing';
import {couperAuMot} from '../src/lib/utils';
import {descriptionArticle} from '../src/lib/metadonnees-publiques';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const flux=(titre='Nouveau DPE pour les logements',url='https://www.service-public.gouv.fr/particuliers/actualites/A123?xtor=RSS',date='2026-09-24T00:00:00+02:00')=>`<rss><channel><item><title>${titre}</title><link>${url}</link><dc:date xmlns:dc="url">${date}</dc:date></item></channel></rss>`;
describe('Veille : collecte limitée aux sources officielles',()=>{
 it('collecte un titre pertinent avec date et lien canonique sans le publier',()=>{expect(lireFluxVeille(flux(),'Service Public')).toEqual([{titre:'Nouveau DPE pour les logements',source_url:'https://www.service-public.gouv.fr/particuliers/actualites/A123',source_nom:'Service Public',publie_source_le:'2026-09-23T22:00:00.000Z'}]);});
 it('écarte une actualité sans rapport, un lien tiers et les entités externes',()=>{expect(lireFluxVeille(flux('Concours de chant'),'SP')).toEqual([]);expect(lireFluxVeille(flux('Location','https://evil.example/x'),'SP')).toEqual([]);expect(()=>lireFluxVeille('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+flux(),'SP')).toThrow();});
 it('refuse un flux incomplet et élimine les balises de présentation',()=>{expect(()=>lireFluxVeille('<rss>','SP')).toThrow();expect(lireFluxVeille(flux('<![CDATA[<b>Artisans</b> &amp; factures]]>'),'SP')[0].titre).toBe('Artisans & factures');});
 it.each(['http://www.anil.org/x','https://www.anil.org.evil.com/x','https://user:pass@www.anil.org/x','https://www.anil.org:8443/x','javascript:alert(1)'])('refuse %s',u=>expect(sourceVeille(u)).toBeNull());
});

// Relevé du 29/09 sur le journal public : une actualité sur la décarbonation
// des entreprises relayée, étiquetée « Service Public — Particuliers » alors
// qu'elle venait d'entreprendre.service-public.gouv.fr, un préfixe répété dans
// le titre, une description coupée au milieu d'un mot, et l'encadré « Ces
// règles… » sous des articles qui n'en exposaient aucune.
describe('Journal : ce que la veille y relaie',()=>{
 it.each(['Décarbonation des entreprises : un nouveau dispositif','Micro-entrepreneurs : cotisations 2027','Facture électronique : le calendrier'])('écarte « %s »',t=>expect(estSujetLogement(t)).toBe(false));
 it.each(['Location meublée : ce qui change','Hausse des loyers plafonnée','DPE : nouveau calcul pour les petits logements','Copropriété : assemblée générale à distance','Trêve hivernale 2026','Bail mobilité : les règles','APL : revalorisation au 1er octobre','Propriétaires bailleurs : nouvelle obligation'])('retient « %s »',t=>expect(estSujetLogement(t)).toBe(true));
 it('nomme la source d\'après l\'adresse de la page, pas d\'après le flux',()=>{
  expect(nomDeSource('https://entreprendre.service-public.gouv.fr/actualites/A1','Service Public — Particuliers')).toBe('Service Public — Entreprendre');
  expect(nomDeSource('https://www.service-public.gouv.fr/particuliers/actualites/A2','Service Public — Particuliers')).toBe('Service Public');
  expect(lireFluxVeille(flux('Logement : nouvelle aide','https://entreprendre.service-public.gouv.fr/actualites/A9'),'Service Public — Particuliers')[0].source_nom).toBe('Service Public — Entreprendre');
  const v=sujetDeVeille({id:'x',titre:'Logement : aide',source_url:'https://entreprendre.service-public.gouv.fr/actualites/A9',source_nom:'Service Public — Particuliers',publie_source_le:null});
  expect(v.chapo.startsWith('Service Public — Entreprendre')).toBe(true);
  expect(v.corps).not.toContain('Particuliers');
 });
 it('ne répète jamais le préfixe « À lire dans la veille »',()=>{
  const v=sujetDeVeille({id:'x',titre:'À lire dans la veille : Loyers : ce qui change',source_url:'https://www.service-public.gouv.fr/particuliers/actualites/A1',source_nom:'Service Public',publie_source_le:null});
  expect(v.titre).toBe('À lire dans la veille : Loyers : ce qui change');
  expect(titreSansDoublon('À lire dans la veille : À lire dans la veille : Loyers')).toBe('À lire dans la veille : Loyers');
  expect(titreSansDoublon('Révision des loyers')).toBe('Révision des loyers');
 });
 it('coupe une description à un mot entier',()=>{
  const long='Service Public propose une information sur ce sujet. Consultez le texte officiel pour connaître les situations concernées et les conditions applicables.';
  const d=couperAuMot(long,120);
  expect(d.length).toBeLessThanOrEqual(120);
  expect(d.endsWith('…')).toBe(true);
  expect(long.startsWith(d.slice(0,-1))).toBe(true);
  expect(long[d.length-1]).toBe(' ');
  expect(couperAuMot('Court.',160)).toBe('Court.');
  // Une description déjà tronquée en base est recalculée depuis le chapô.
  expect(descriptionArticle({seo_description:long.slice(0,100),chapo:long})).toBe(couperAuMot(long,160));
 });
 it('le relais automatique ne choisit qu\'un sujet pertinent (filtre réglable, 06/10)',()=>{
  const route=readFileSync(path.resolve(__dirname,'../src/app/api/cron/marketing/route.ts'),'utf8');
  expect(route).toContain('evaluerPertinence(');
  expect(route).toContain('seo_description:couperAuMot(');
 });
 it('l\'encadré « Ces règles… » ne suit qu\'un article de règle (veine éditoriale)',()=>{
  const page=readFileSync(path.resolve(__dirname,'../src/app/journal/[slug]/page.tsx'),'utf8');
  expect(page).toMatch(/\{a\.veine \? \(\s*<>\s*Ces règles ne sont pas qu&apos;un article/);
 });
 it('la description du journal ne promet pas de sujets précis',()=>{
  const page=readFileSync(path.resolve(__dirname,'../src/app/journal/page.tsx'),'utf8');
  const meta=page.slice(page.indexOf('export const metadata'),page.indexOf('});'));
  expect(meta).not.toMatch(/révision des loyers|impayés/);
 });
});
