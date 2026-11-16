import { describe, expect, it, vi } from "vitest";
import { factureIntervention } from "@/lib/documents/facture-intervention";

vi.mock("@/lib/ged", () => ({aujourdhuiParis: () => "2026-11-16"}));
const artisan = {raison_sociale: "Atelier fictif EI", siret: "01234567890123"};
function saisie() {
  const f = new FormData();
  for (const [k,v] of Object.entries({numero:"T-2026-012",client_facture:"Camille Exemple",adresse_client:"1 rue Exemple",adresse_entreprise:"2 rue Test",lieu_travaux:"3 rue Fictive",mentions_facture:"TVA FR00123456789",conditions_facture:"Virement à trente jours",date_travaux:"2026-11-15",date_echeance:"2026-12-16",confirmation_facture:"oui"})) f.set(k,v);
  f.set("lignes_devis",JSON.stringify([{libelle:"Joint <essai>",quantite:2,prix_unitaire_ht_cents:101,tva_bps:1000},{libelle:"Main d’œuvre",quantite:1,prix_unitaire_ht_cents:1500,tva_bps:2000}]));
  return f;
}
describe("facture de travaux émise pour un particulier", () => {
  it("recalcule chaque ligne et les deux taux de TVA, sans déclarer d’encaissement", () => {
    const {document,montant}=factureIntervention(saisie(),artisan,"INC-TEST");
    expect(montant).toBe(2022);
    expect(document.manquants).toEqual([]);
    for(const valeur of ["20,22 €", "1 rue Exemple", "Atelier fictif EI", "Joint &lt;essai&gt;", "TVA 10 %", "TVA 20 %", "T-2026-012"]) expect(document.html).toContain(valeur);
    expect(document.html).not.toContain("acquittée");
  });
  it("facture la raison sociale et le siège vérifiés de la SCI, avec ses conditions propres", () => {
    const f = saisie(); f.delete("adresse_client"); f.set("escompte","Néant"); f.set("retard","Conditions convenues au devis de la SCI");
    const {document,montant} = factureIntervention(f,artisan,"INC-SCI", {nom:"SCI des Tilleuls",siren:"123456789",siege:"12 rue des Tilleuls, Lyon"});
    for (const attendu of ["SCI des Tilleuls", "123456789", "12 rue des Tilleuls", "INC-SCI", "Conditions convenues au devis"]) expect(document.html).toContain(attendu);
    expect(document.html).not.toContain("Camille Exemple");
    expect(montant).toBe(2022);
  });
  it.each([["confirmation_facture",""],["date_travaux","2026-11-17"],["date_travaux","2026-02-30"],["date_echeance","2026-11-14"],["numero",""],["client_facture",""],["mentions_facture",""],["lignes_devis","[]"]])("refuse %s invalide avant émission", (cle,valeur)=>{
    const f=saisie(); f.set(cle,valeur);
    expect(()=>factureIntervention(f,artisan,"INC-TEST")).toThrow();
  });
});
