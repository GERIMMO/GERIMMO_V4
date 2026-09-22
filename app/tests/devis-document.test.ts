import { describe, expect, it } from "vitest";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "../src/lib/documents/devis-artisan";
import { calculerDevis } from "../src/lib/devis-structure";
const calcul=calculerDevis(Array.from({length:42},(_,i)=>({libelle:`Prestation ${i+1} : remplacement et vérification du robinet`,quantite:1,prix_unitaire_ht_cents:2500,tva_bps:1000})));
const doc: DevisArtisanDocument={id:"11111111-1111-1111-1111-111111111111",description:"Diagnostic : joint endommagé.\nTravaux proposés : remplacement du robinet et vérification de l’étanchéité.",...calcul,diagnostic:"Joint endommagé",delai_intervention:"Sous cinq jours",duree_estimee:"Une journée",contraintes:"Prévoir une coupure d’eau",observations:null,statut:"depose",depose_le:"2026-09-22",valide_jusqu_au:"2026-10-22",artisan_nom:"Plomberie de démonstration",artisan_siret:"12345678900012",artisan_telephone:"0600000000",artisan_email:"artisan@example.test",agence_nom:"Agence de démonstration",incident_numero:"INC-2026-123",commune:"Paris",code_postal:"75001"};
describe("Document de devis",()=>{
  it("génère des totaux et un tableau sans données manquantes",()=>{const r=assemblerDevisArtisan(doc);expect(r.manquants).toEqual([]);expect(r.html).toContain("Prestation 42");expect(r.html).toContain("<thead>");expect(r.html).toContain("break-inside:avoid-page");});
  it("échappe toute saisie utilisateur",()=>{const r=assemblerDevisArtisan({...doc,description:'<img src=x onerror=alert(1)>'});expect(r.html).toContain('&lt;img');expect(r.html).not.toContain('<img src=x');});
  it("bloque un document sans identité artisan",()=>expect(assemblerDevisArtisan({...doc,artisan_nom:""}).manquants).toContain("Nom de l’artisan"));
  it.skipIf(!process.env.GERIMMO_TEST_PDF)("rend un vrai PDF de plusieurs pages",async()=>{const {rendrePdf}=await import("../src/lib/documents/rendu");const fs=await import("node:fs/promises");const r=assemblerDevisArtisan(doc);const pdf=await rendrePdf(r);await fs.mkdir("tmp/pdfs",{recursive:true});await fs.writeFile("tmp/pdfs/devis-structure-42-lignes.pdf",pdf);expect(Buffer.from(pdf).subarray(0,4).toString()).toBe("%PDF");},30000);
});
