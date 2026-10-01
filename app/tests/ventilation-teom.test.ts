import { describe, expect, it } from 'vitest';
import { rubriqueDe } from '../src/lib/fiscal';
import { ventilerTeom } from '../src/lib/ventilation-teom';
describe('ventilation explicite de la taxe foncière', () => {
  it('sépare les 168 euros du kit et conserve le total', () => {
    const parts = ventilerTeom(1124,168,'Taxe foncière','depense');
    expect(parts).toEqual([{categorie:'Taxe foncière',montant:956},{categorie:'TEOM',montant:168}]);
    expect(parts.reduce((s,p)=>s+p.montant,0)).toBe(1124);
    expect(rubriqueDe(parts[0].categorie, "depense")).toBe("227");
    expect(rubriqueDe(parts[1].categorie, "depense")).toBe("hors");
  });
  it('conserve la saisie habituelle sans TEOM',()=>expect(ventilerTeom(650,0,'Travaux','depense')).toEqual([{categorie:'Travaux',montant:650}]));
  it('évite une écriture nulle quand tout est récupérable',()=>expect(ventilerTeom(168,168,'taxe_fonciere','depense')).toEqual([{categorie:'TEOM',montant:168}]));
  it.each([-1,1125,NaN,Infinity])('refuse une TEOM incohérente %s',n=>expect(()=>ventilerTeom(1124,n,'Taxe foncière','depense')).toThrow());
  it('refuse une ventilation sur des travaux ou une recette',()=>{
    expect(()=>ventilerTeom(1124,168,'Travaux','depense')).toThrow();
    expect(()=>ventilerTeom(1124,168,'Taxe foncière','recette')).toThrow();
  });
});
