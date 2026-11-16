import { expect, it } from "vitest";
import { ventilerParTitulaire, type PeriodeDetention } from "@/lib/entites-patrimoine";
import type { EcritureFinances } from "@/lib/finances";

it("réconcilie chaque ligne au centime après une cession sans attribuer les montants du bâtiment mixte", () => {
  const e = (id:string,lot:string|null,date:string,montant:string,sens:string):EcritureFinances => ({
    id,lot_id:lot,bien_id:"immeuble",date_imputation:date,montant,sens,categorie:"travaux",contre_ecriture_de:null,libelle:null,
  });
  const periodes:PeriodeDetention[] = [
    {lot_id:"A",titulaire:"SCI",quote_part:100,date_debut:"2024-01-01",date_fin:"2026-05-31"},
    {lot_id:"A",titulaire:"personnel",quote_part:100,date_debut:"2026-06-01",date_fin:null},
    {lot_id:"B",titulaire:"SCI",quote_part:100,date_debut:"2024-01-01",date_fin:null},
  ];
  const lignes=[e("1","A","2026-05-31","425.55","recette"),e("2","A","2026-06-01","850.11","recette"),e("3",null,"2026-06-01","35.10","depense")];
  const v=ventilerParTitulaire(lignes,periodes,[{id:"A",bien_id:"immeuble"},{id:"B",bien_id:"immeuble"}]);
  expect(v.get("SCI")?.recettes).toBe(42555);
  expect(v.get("personnel")?.recettes).toBe(85011);
  expect(v.get(null)?.depenses).toBe(3510);
  expect([...v.values()].flatMap(g=>g.ecritures.map(e=>e.id)).sort()).toEqual(["1","2","3"]);
  expect(ventilerParTitulaire([lignes[0]],[{...periodes[0],quote_part:50}],[]).get(null)?.recettes).toBe(42555);
});
