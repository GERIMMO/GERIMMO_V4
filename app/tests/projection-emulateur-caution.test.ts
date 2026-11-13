import {describe,expect,it} from "vitest";
import {projectionColonne} from "../e2e/local/projection-colonne.mjs";
describe("lecture du garant dans les options du circuit",()=>{
 it("garde le nom demandé pour la projection finale par alias",()=>{
  expect(projectionColonne("options->>garant")).toBe(`"options" ->> 'garant' as "options->>garant"`);
  expect(projectionColonne("document_signe")).toBe('"document_signe"');
 });
 it("refuse une expression SQL libre",()=>expect(()=>projectionColonne("options;select 1")).toThrow());
});
