import {describe,it,expect} from "vitest";
import {modeSignatureDocument,selectionSignatureValide,estimationSignature} from "@/lib/politique-signature";
const id="11111111-1111-4111-8111-111111111111";
describe("Politique de signature",()=>{
 it.each(["bail_nu","bail_meuble","avenant","cautionnement","edl","protocole_apurement","autorisation_travaux"])("%s nécessite un accord Zoho",code=>expect(modeSignatureDocument(code)).toBe("zoho"));
 it.each(["quittance","avis_echeance","attestation_loyer","relance_simple","attestation_fin_bail"])("%s appartient aux documents de l’émetteur",code=>expect(modeSignatureDocument(code)).toBe("enregistree"));
 it("ne signe pas un document inconnu ou un justificatif original",()=>{expect(modeSignatureDocument("dpe")).toBe("original");expect(modeSignatureDocument("constructor")).toBe("original");});
 it("rejette une cible ou un modèle invalide",()=>{expect(()=>selectionSignatureValide({code:"edl",cibleId:"11111111----------------------------"})).toThrow();expect(()=>selectionSignatureValide({code:"constructor" as "bail",cibleId:id})).toThrow();});
 it("ne retient que les choix attendus et ne laisse pas injecter un autre signataire",()=>{expect(selectionSignatureValide({code:"avenant",cibleId:id,options:{objet:"  Loyer  ",signataire:"intrus"}}).options).toEqual({objet:"Loyer"});});
 it("refuse les textes de contrôle et les options démesurées",()=>{expect(()=>selectionSignatureValide({code:"avenant",cibleId:id,options:{objet:"a\u0000b"}})).toThrow();expect(()=>selectionSignatureValide({code:"avenant",cibleId:id,options:{objet:"x".repeat(6001)}})).toThrow();});
 it("compte l’enveloppe et le premier SMS de chaque signataire en demi-crédits",()=>{expect(estimationSignature(2)).toEqual({demiCredits:12,credits:6});expect(estimationSignature(3).credits).toBe(6.5);expect(()=>estimationSignature(26)).toThrow();});
});
