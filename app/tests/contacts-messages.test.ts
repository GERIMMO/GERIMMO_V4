import {describe,it,expect} from 'vitest';
import {baseSimulee} from './fixtures/base-simulee';
import {lireContactsMessages} from '@/lib/contacts-messages';
const tables={baux:[{id:'b1',organization_id:'org',locataire_principal:'principal'},{id:'b2',organization_id:'autre',locataire_principal:'externe'}],bail_personnes:[{id:'l1',organization_id:'org',person_id:'coloc',role:'colocataire'},{id:'l2',organization_id:'org',person_id:'garant',role:'garant'},{id:'l3',organization_id:'org',person_id:'archive',role:'colocataire'}],persons:['principal','coloc','garant','externe','proprietaire','archive'].map(id=>({id,organization_id:id==='externe'?'autre':'org',nom:id,prenom:null,archived_at:id==='archive'?'2026-10-01':null}))};
describe('Contacts de messagerie du propriétaire',()=>{
 it('propose le locataire principal et les colocataires, sans garant, propriétaire ni personne externe',async()=>{const r=await lireContactsMessages(baseSimulee(tables).client,'org');expect(r.erreur).toBe(false);expect(r.contacts.map(p=>p.id).sort()).toEqual(['coloc','principal']);});
 it('ne présente pas une lecture manquante comme une liste complète',async()=>{const r=await lireContactsMessages(baseSimulee(tables,{lecturesEnErreur:{bail_personnes:'indisponible'}}).client,'org');expect(r).toEqual({contacts:[],erreur:true});});
});
