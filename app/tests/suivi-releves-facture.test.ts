import { describe, expect, it } from "vitest";
import { palierRappelReleve } from "../src/lib/rappels-releves";
import { relevesFactureComplets } from "../src/lib/suivi-releves-facture";
import type { CompteurConsommation, ReleveConsommation } from "../src/lib/consommations";
const m={id:"a",lot_id:"lot",type:"eau_froide",unite:"m3",date_index_initial:"2026-10-01",index_initial:100} as CompteurConsommation;
const f={periode_debut:"2026-10-01",periode_fin:"2026-10-31",unite_consommation:"m3" as const};
const r={compteur_id:"a",date_releve:"2026-10-31",index_releve:125} as ReleveConsommation;
describe("collecte des index de facture",()=>{
 it("ne considère pas une réception tardive comme l’index de fin de facture",()=>{
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[m],[r])).toBe(true);
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[m],[{...r,date_releve:"2026-11-01"}])).toBe(false);
 });
 it("attend tous les logements et contrôle les incohérences",()=>{
  expect(relevesFactureComplets(f,"eau",[{id:"lot"},{id:"absent"}],[m],[r])).toBe(false);
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[m],[{...r,index_releve:90}])).toBe(false);
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[{...m,unite:"kwh"}],[r])).toBe(false);
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[{...m,compteur_principal_id:"manquant"}],[r])).toBe(false);
 });
 it("attend aussi l’index d’un changement d’occupant",()=>{
  expect(relevesFactureComplets(f,"eau",[{id:"lot"}],[m],[r],[{lot_id:"lot",date_debut:"2026-10-15",date_fin:null}])).toBe(false);
 });
 it("rappelle à J3, J7 et J14 depuis la demande, sans nouveau palier quotidien",()=>{
  const date="2026-11-01T10:00:00Z";
  expect(palierRappelReleve(date,new Date("2026-11-03T10:00:00Z"))).toBeNull();
  expect(palierRappelReleve(date,new Date("2026-11-04T10:00:00Z"))).toBe(3);
  expect(palierRappelReleve(date,new Date("2026-11-07T10:00:00Z"))).toBe(3);
  expect(palierRappelReleve(date,new Date("2026-11-08T10:00:00Z"))).toBe(7);
  expect(palierRappelReleve(date,new Date("2026-11-15T10:00:00Z"))).toBe(14);
 });
});
