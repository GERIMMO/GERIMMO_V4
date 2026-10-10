import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { champBailManquant, champsManquantsBail } from '@/lib/reperes-bail';
import { PastilleBail, LabelBail } from '@/components/pastille-bail';
import { CompletudeBail } from '@/lib/suivi-enregistrement';

const mentions = ['individuel ou collectif, énergie', 'montant mensuel', 'application des loyers de référence à vérifier', 'dépenses annuelles minimales du DPE'];
describe('Repères des champs du bail',()=>{
  it('associe chaque champ à sa mention PDF, sans ajouter des obligations',()=>{
    expect(champsManquantsBail(mentions)).toEqual(new Set(['lot.chauffage','lot.eau_chaude','bail.loyer_hc','bail.charges','bail.encadrement_loyer','bail.dpe_depenses_min']));
    expect(champBailManquant(mentions,'bail.dpe_depenses_max')).toBe(false);
    expect(champBailManquant(mentions,'lot.surface_carrez')).toBe(false);
    expect(champBailManquant(mentions,'bail.clauses_particulieres')).toBe(false);
  });
  it('ne signale pas le chauffage déjà renseigné quand seule l’eau chaude manque',()=>{
    expect(champBailManquant(mentions,'lot.chauffage',true)).toBe(false);
    expect(champBailManquant(mentions,'lot.eau_chaude',false)).toBe(true);
  });
  it('distingue un montant nul renseigné d’un montant absent',()=>{
    expect(champBailManquant(mentions,'bail.charges',String(0).trim()!=='')).toBe(false);
    expect(champBailManquant(mentions,'bail.loyer_hc',false)).toBe(true);
  });
  it('ne confond pas les naissances des locataires avec celles des propriétaires',()=>{
    const manquants=['Date de naissance du locataire','commune de naissance','adresse électronique'];
    expect(champBailManquant(manquants,'proprietaire.date_naissance')).toBe(false);
    expect(champBailManquant(manquants,'locataire.date_naissance')).toBe(true);
    expect(champBailManquant(manquants,'locataire.email',true)).toBe(false);
    expect(champBailManquant(manquants,'garant.email')).toBe(false);
  });
  it.each(['personne physique, SCI, indivision…','personne physique, indivision, SCI familiale, SCI, personne morale'])('couvre la qualité dans les différents modèles : %s',mention=>{
    expect(champBailManquant([mention],'proprietaire.qualite')).toBe(true);
  });
  it('repère les équipements d’une chambre et le mobilier sans cibler les cases facultatives',()=>{
    expect(champBailManquant(['équipements privatifs, ou néant'],'chambre.equipements')).toBe(true);
    expect(champBailManquant(['inventaire du mobilier — au moins les 11 éléments du décret'],'inventaire')).toBe(true);
  });
});
describe('Pastilles accessibles et limitées au parcours bail',()=>{
  const render=(manquants:string[])=>renderToStaticMarkup(createElement(CompletudeBail.Provider,{value:{manquants}},createElement(LabelBail,{champ:'lot.chauffage',htmlFor:'chauffage'},'Chauffage')));
  it('ne change pas les autres pages utilisant les formulaires partagés',()=>{
    expect(renderToStaticMarkup(createElement(PastilleBail,{manquant:true}))).toBe('');
  });
  it('associe le repère au libellé et le retire après vérification du champ enregistré',()=>{
    expect(render(['individuel ou collectif, énergie'])).toContain('Information obligatoire à compléter');
    expect(render(['individuel ou collectif, énergie'])).toContain('for="chauffage"');
    expect(render([])).not.toContain('Information obligatoire à compléter');
  });
});
