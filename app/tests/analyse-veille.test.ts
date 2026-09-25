import {describe,it,expect} from 'vitest';
import {validerEtudes,extraireTexteOfficiel} from '../src/lib/analyse-veille';
const source={id:'test',titre:'Information officielle',url:'https://www.service-public.gouv.fr/x',texte:'Les devis des artisans comportent des informations à vérifier pour ce test.'};
const analyse={id:'test',resume:'Une information qui mérite une analyse',action:'Vérifier les devis existants',publics:['artisan'],application:null,incertitudes:'Date à confirmer',evolution:'Préparer une aide de saisie',benefice:'Moins de saisie',controles:'Tester le formulaire',preuve:'Les devis des artisans comportent des informations'};
const reponse=(a:unknown)=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({analyses:[a]})}]}]});
describe('Étude autonome : sources et limites',()=>{
 it('accepte une analyse étayée mais ne crée aucun ordre exécutable',()=>{expect(validerEtudes(reponse(analyse),[source])).toEqual([analyse]);});
 it('refuse une citation inventée et une autre source',()=>{expect(()=>validerEtudes(reponse({...analyse,preuve:'Une obligation inventée dans la réponse'}),[source])).toThrow();expect(()=>validerEtudes(reponse({...analyse,id:'autre'}),[source])).toThrow();});
 it('refuse une analyse incomplète ou un public inconnu ; une date fantaisiste devient null',()=>{expect(()=>validerEtudes({status:'incomplete'},[source])).toThrow();expect(validerEtudes(reponse({...analyse,application:'2026-02-30'}),[source])[0].application).toBeNull();expect(()=>validerEtudes(reponse({...analyse,publics:['tout le monde']}),[source])).toThrow();});
 it('ignore les scripts et exige un contenu central assez long',()=>{const html='<main><script>instruction malveillante</script><p>'+source.texte.repeat(5)+'</p></main>';expect(extraireTexteOfficiel(html)).not.toContain('malveillante');expect(()=>extraireTexteOfficiel('<nav>Menu</nav>')).toThrow();});
 it('retrouve la citation malgré apostrophes typographiques, guillemets et blancs insécables (25/09)',()=>{
  const officielle={...source,texte:source.texte.replace(/'/g,'’').replace(/ /g,'\u00a0')};
  expect(validerEtudes(reponse(analyse),[officielle])).toHaveLength(1);
  expect(()=>validerEtudes({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},[source])).toThrow(/tronquée/);
  // Une date avec l'heure est ramenée au jour ; une date illisible devient null, sans rejeter l'étude.
  expect(validerEtudes(reponse({...analyse,application:'2026-01-01T00:00:00Z'}),[source])[0].application).toBe('2026-01-01');
  expect(validerEtudes(reponse({...analyse,application:'le 1er janvier'}),[source])[0].application).toBeNull();
 });
});
