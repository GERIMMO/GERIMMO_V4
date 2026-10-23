import { describe, expect, it } from "vitest";
import { ouvertureSignatures } from "@/lib/ouverture-signatures";
const env = { SIGNATURE_BAIL_PRESTATAIRE: "zoho", ZOHO_SIGN_ENV: "production", ZOHO_SIGN_CLIENT_ID: "fictif", ZOHO_SIGN_CLIENT_SECRET: "fictif", ZOHO_SIGN_REFRESH_TOKEN: "fictif", ZOHO_SIGN_WEBHOOK_SECRET: "fictif", ZOHO_SIGN_BAIL_ACTIF: "true", ZOHO_SIGN_DOCUMENTS_ACTIF: "true", ZOHO_SIGN_DEVIS_ACTIF: "true", ZOHO_SIGN_CAUTIONNEMENT_FERME: "true", ZOHO_SIGN_RELANCES_ACTIVES: "true" };
const budget = { plafond: 800, utilise: 12, devisActif: true };
describe("Ouverture effective des signatures", () => {
  it("distingue les six modèles ouverts du cautionnement suspendu", () => {
    const r=ouvertureSignatures(env,budget);
    expect(r.documents.filter(d=>d.ouvert)).toHaveLength(6);
    expect(r.documents.find(d=>d.code==='cautionnement')?.ouvert).toBe(false);
    expect(r.relances).toBe(true);
    expect(JSON.stringify(r)).not.toContain('fictif');
  });
  it.each([null,{...budget,plafond:0},{...budget,utilise:800}])("n'annonce aucune ouverture sans budget utilisable", b=>{
    expect(ouvertureSignatures(env,b).documents.some(d=>d.ouvert)).toBe(false);
  });
  it("respecte le verrou devis en base",()=>{
    const r=ouvertureSignatures(env,{...budget,devisActif:false});
    expect(r.documents.find(d=>d.code==='devis_artisan')?.ouvert).toBe(false);
    expect(r.documents.find(d=>d.code==='bail')?.ouvert).toBe(true);
  });
  it.each(['ZOHO_SIGN_BAIL_ACTIF','ZOHO_SIGN_DOCUMENTS_ACTIF','ZOHO_SIGN_DEVIS_ACTIF','ZOHO_SIGN_WEBHOOK_SECRET'])("refuse un prérequis %s manquant pour les devis",cle=>{
    expect(ouvertureSignatures({...env,[cle]:''},budget).documents.find(d=>d.code==='devis_artisan')?.ouvert).toBe(false);
  });
  it("n'assimile pas un environnement d'essai ou Youtrust à une ouverture clients",()=>{
    expect(ouvertureSignatures({...env,ZOHO_SIGN_ENV:'sandbox'},budget).documents.some(d=>d.ouvert)).toBe(false);
    expect(ouvertureSignatures({...env,SIGNATURE_BAIL_PRESTATAIRE:'youtrust'},budget).documents.some(d=>d.ouvert)).toBe(false);
  });
  it("un plafond atteint n'arrête pas les rappels des dossiers déjà envoyés",()=>{
    expect(ouvertureSignatures(env,{...budget,utilise:800}).relances).toBe(true);
  });
});
