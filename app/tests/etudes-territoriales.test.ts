import {describe,it,expect} from 'vitest';
import {appliquerEtudes,type EtudeTerritoriale} from '../src/lib/etudes-territoriales';
import type {Marche} from '../src/lib/score-territoire';
const marche={departements:{'75':{logements_loues_prive:100,agences:3,communes_zone_tendue:1,observations:{}}}} as unknown as Marche;
const e:EtudeTerritoriale={departement:'75',indicateur:'acquisition',valeur:1000,clients:2,depense_cents:2000,debut:'2026-08-01',fin:'2026-08-31',source:'Bilan vérifié',methode:'Attribution département et période identiques',created_at:'2026-09-24T10:00:00Z'};
const maintenant=new Date('2026-09-24');
describe('Études et preuves territoriales',()=>{
 it('utilise un coût vérifié sans inventer les clics et prospects',()=>{const d=appliquerEtudes(marche,[e],maintenant).departements['75'];expect(d.cout_acquisition_cents).toBe(1000);expect(d.clients_gagnes).toBe(2);expect(d.prospects).toBeNull();expect(marche.departements['75'].cout_acquisition_cents).toBeUndefined();});
 it('refuse un calcul faux et ne rajeunit pas une ancienne étude importée aujourd’hui',()=>{expect(appliquerEtudes(marche,[{...e,valeur:500}],maintenant).departements['75'].cout_acquisition_cents).toBeUndefined();expect(appliquerEtudes(marche,[{...e,fin:'2026-01-31'}],maintenant).departements['75'].cout_acquisition_cents).toBeUndefined();});
 it('ne remplace pas une observation plus récente',()=>{const m=appliquerEtudes(marche,[e],maintenant);expect(appliquerEtudes(m,[{...e,fin:'2026-08-01',valeur:2000,depense_cents:4000}],maintenant).departements['75'].cout_acquisition_cents).toBe(1000);});
});
