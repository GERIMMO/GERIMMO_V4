import { describe, expect, it } from "vitest";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "../src/lib/documents/devis-artisan";
import { calculerDevis } from "../src/lib/devis-structure";
const calcul=calculerDevis(Array.from({length:42},(_,i)=>({libelle:`Prestation ${i+1} : remplacement et vérification du robinet`,quantite:1,prix_unitaire_ht_cents:2500,tva_bps:1000})));
const doc: DevisArtisanDocument={id:"11111111-1111-1111-1111-111111111111",description:"Diagnostic : joint endommagé.\nTravaux proposés : remplacement du robinet et vérification de l’étanchéité.",...calcul,diagnostic:"Joint endommagé",delai_intervention:"Sous cinq jours",duree_estimee:"Une journée",contraintes:"Prévoir une coupure d’eau",observations:null,statut:"depose",depose_le:"2026-09-22",valide_jusqu_au:"2026-10-22",artisan_nom:"Plomberie de démonstration",artisan_siret:"12345678900012",artisan_telephone:"0600000000",artisan_email:"artisan@example.test",agence_nom:"Agence de démonstration",incident_numero:"INC-2026-123",commune:"Paris",code_postal:"75001"};
describe("Document de devis",()=>{
  it("génère des totaux et un tableau sans données manquantes",()=>{const r=assemblerDevisArtisan(doc);expect(r.manquants).toEqual([]);expect(r.html).toContain("Prestation 42");expect(r.html).toContain("<thead>");expect(r.html).toContain("break-inside:avoid-page");});
  it("échappe toute saisie utilisateur",()=>{const r=assemblerDevisArtisan({...doc,diagnostic:'<img src=x onerror=alert(1)>'});expect(r.html).toContain('&lt;img');expect(r.html).not.toContain('<img src=x');});
  it("intègre seulement un logo PNG/JPEG incorporé et les informations figées",()=>{const data="data:image/png;base64,iVBORw0KGgo=";expect(assemblerDevisArtisan({...doc,artisan_logo:data,artisan_adresse:"Adresse de test",artisan_mentions:"Mentions de test"}).html).toContain(`src="${data}"`);expect(assemblerDevisArtisan({...doc,artisan_logo:"https://example.test/tracking.png"}).html).not.toContain("tracking.png");});
  it("bloque un document sans identité artisan",()=>expect(assemblerDevisArtisan({...doc,artisan_nom:""}).manquants).toContain("Nom de l’artisan"));
  it("présente les conditions du devis structuré sans doubler le détail des prix",()=>{const r=assemblerDevisArtisan({...doc,observations:"Prévoir un accès au compteur"});expect(r.html).toContain("Devis de travaux");expect(r.html).toContain("Sous cinq jours");expect(r.html).toContain("Une journée");expect(r.html).toContain("Prévoir une coupure d’eau");expect(r.html).toContain("Prévoir un accès au compteur");expect(r.html).not.toContain("Diagnostic : joint endommagé.");});
  it("conserve la description des devis anciens sans lignes structurées",()=>{const r=assemblerDevisArtisan({...doc,lignes:[],diagnostic:null,description:"Devis ancien à conserver"});expect(r.html).toContain("Devis ancien à conserver");});
  it.skipIf(!process.env.GERIMMO_TEST_PDF)("rend un vrai PDF de plusieurs pages",async()=>{const {rendrePdf}=await import("../src/lib/documents/rendu");const fs=await import("node:fs/promises");const r=assemblerDevisArtisan(doc);const pdf=await rendrePdf(r);await fs.mkdir("tmp/pdfs",{recursive:true});await fs.writeFile("tmp/pdfs/devis-structure-42-lignes.pdf",pdf);expect(Buffer.from(pdf).subarray(0,4).toString()).toBe("%PDF");
    const logo=process.env.GERIMMO_TEST_LOGO ? `data:image/png;base64,${(await fs.readFile(process.env.GERIMMO_TEST_LOGO)).toString("base64")}` : null;
    const court=calculerDevis([{libelle:"Remplacement du joint et contrôle d’étanchéité",quantite:2,prix_unitaire_ht_cents:2500,tva_bps:1000}]);
    await fs.writeFile("tmp/pdfs/devis-gerimmo-apercu.pdf",await rendrePdf(assemblerDevisArtisan({...doc,...court,artisan_logo:logo,artisan_adresse:"1 rue de Démonstration, 75012 Paris",artisan_mentions:"Entreprise de démonstration — document sans valeur commerciale.",statut:"valide"})));
    await fs.writeFile("tmp/pdfs/devis-gerimmo-envoye.pdf",await rendrePdf(assemblerDevisArtisan({...doc,...court})));
},30000);
});

describe("Audit final (DOC-21) — adresse du destinataire", () => {
  it("imprimée quand elle est connue, échappée ; absente sinon", () => {
    const avec = assemblerDevisArtisan({ ...doc, destinataire_adresse: "12 rue <b>Haute</b>, 69007 Lyon" });
    expect(avec.html).toContain("Adresse du destinataire :</strong> 12 rue &lt;b&gt;Haute&lt;/b&gt;, 69007 Lyon");
    expect(assemblerDevisArtisan({ ...doc, destinataire_adresse: "  " }).html).not.toContain("Adresse du destinataire");
  });
});
