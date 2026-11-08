import {describe,it,expect} from 'vitest';
import {methodeConseillee} from '@/lib/conseil-repartition';
describe('méthode conseillée',()=>{
 const lots=[{id:'a'},{id:'b'}];
 const compteurs=lots.map(l=>({lot_id:l.id,type:'eau_froide',date_index_initial:'2026-01-01'}));
 it('ne demande pas de divisionnaires pour une facture individuelle',()=>expect(methodeConseillee('eau',[lots[0]],compteurs,'2026-10-01')).toBe('cle'));
 it('propose le réel si chaque logement a un compteur compatible',()=>expect(methodeConseillee('eau',lots,compteurs,'2026-10-01')).toBe('consommations'));
 it('ne suppose pas un compteur manquant ou installé après la période',()=>{expect(methodeConseillee('eau',lots,[compteurs[0]],'2026-10-01')).toBe('cle');expect(methodeConseillee('eau',lots,compteurs,'2025-10-01')).toBe('cle');});
 it('respecte le choix enregistré',()=>expect(methodeConseillee('eau',lots,compteurs,'2026-10-01','cle')).toBe('cle'));
});

import {conseilFacture,CONSEILS_FACTURE} from '@/lib/conseil-repartition';
import {CATEGORIES_FOURNITURE} from '@/lib/consommations';
describe('conseils par nature de facture',()=>{
 it.each(Object.keys(CATEGORIES_FOURNITURE))('donne un conseil spécifique pour %s',categorie=>{
  expect(Object.keys(CONSEILS_FACTURE)).toContain(categorie);
  expect(conseilFacture(categorie).length).toBeGreaterThan(70);
 });
 it('invite à identifier une nature inconnue sans autoriser de remboursement',()=>{
  expect(conseilFacture('inconnue')).toBe(CONSEILS_FACTURE.autre);
  expect(conseilFacture('inconnue')).toContain('aucun remboursement automatique');
 });
});

import {recuperationConseillee} from '@/lib/conseil-repartition';
describe('présélection selon les baux',()=>{
 const lots=[{id:'a'}];
 const bail={lot_id:'a',mode_charges:'provision',date_debut:'2026-01-01',date_fin:null,etat:'actif'};
 const conseil=(categorie:string,baux=[bail])=>recuperationConseillee(categorie,lots,baux,'2026-10-01','2026-10-31');
 it.each(['eau','electricite_commune','gaz','chauffage','teom'])('présélectionne %s avec provisions',c=>expect(conseil(c).coche).toBe(true));
 it.each(['internet','assurance','electricite_privative','autre','entretien'])('ne présume pas la récupération de %s',c=>expect(conseil(c).coche).toBe(false));
 it('ne récupère pas sur un logement vacant ou un bail hors période',()=>{expect(conseil('eau',[]).coche).toBe(false);expect(conseil('eau',[{...bail,date_debut:'2026-11-01'}]).coche).toBe(false);});
 it('exclut les forfaits, les brouillons et les modes inconnus',()=>{for(const b of [{...bail,mode_charges:'forfait'},{...bail,mode_charges:''},{...bail,etat:'brouillon'}])expect(conseil('eau',[b]).coche).toBe(false);});
 it('distingue les provisions et forfaits dans un bien mixte',()=>{const r=conseil('eau',[bail,{...bail,mode_charges:'forfait'}]);expect(r.coche).toBe(true);expect(r.eligibles).toBe(1);expect(r.forfaits).toBe(1);});
 it('ne reprend pas les baux des autres logements',()=>expect(conseil('eau',[{...bail,lot_id:'ailleurs'}]).coche).toBe(false));
});
