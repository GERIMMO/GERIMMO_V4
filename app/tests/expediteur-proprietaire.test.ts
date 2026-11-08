import {it,expect} from 'vitest';
import {expediteur} from '@/lib/documents/modeles/communs';
import {contexte,personne} from './fixtures/contexte-document';
it('reprend la SCI du bail plutôt que le parc du propriétaire',()=>{const c=contexte();c.organisation.type='proprietaire_direct';c.organisation.name='Parc de Claire';c.bailleurs=[{...personne({nom:'SCI Les Jardins',prenom:null,address_line1:'8 rue du Siège',city:'Lyon',email:'sci@example.invalid'}),quote_part:100}];const e=expediteur(c);expect(e.nom).toBe('SCI Les Jardins');expect(e.adresse).toContain('8 rue du Siège');expect(e.email).toBe('sci@example.invalid')});
it('conserve l’expéditeur de l’agence pour les biens sous mandat',()=>{const c=contexte();c.organisation.type='agence';expect(expediteur(c).nom).toBe(c.organisation.name)});
it('conserve le domicile du bailleur et distingue le contact de gestion dans l’en-tête',()=>{const c=contexte();c.organisation.type='proprietaire_direct';c.bailleurs=[{...personne({address_line1:null,email:null}),quote_part:100}];expect(expediteur(c).adresse).toBeNull();expect(expediteur(c).email).toBe(c.organisation.email_contact);expect(expediteur(c).contactGestion).toBe(true)});
