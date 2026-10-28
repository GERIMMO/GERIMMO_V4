/**
 * Audit final du 27/10 (LOY-02) — les e-mails de quittance, de reçu partiel et d'avis d'échéance disent le bon détail.
 *
 * Avant : le reçu de 400 € sur un terme de 900 € listait « Loyer 800 € / Provision pour charges 100 € / Total 400 € » — trois
 * lignes qui ne s'additionnent pas ; et « Provision pour charges » s'imprimait même pour un forfait. Ici : la quittance donne
 * le total du terme, le reçu donne le terme, l'encaissé et le solde (comme le document conforme), et le libellé des charges
 * suit le mode du bail. Sans base.
 */
import { describe, expect, it } from "vitest";
import { corpsQuittance, lignesQuittance } from "@/lib/quittance-email";
import { corpsAvisEcheance } from "@/lib/appel-email";

const texte = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const recu = { estQuittance: false, periode: "2026-09-01", loyerHc: 800, charges: 100, montant: 400, emetteur: "Claire Moreau", prenom: "Paul", lien: "https://gerimmo.fr/quittance/x" };

describe("reçu partiel", () => {
  it("dit le terme, l'encaissé et le solde — jamais un « Total » inférieur à ses lignes", () => {
    const t = texte(corpsQuittance(recu));
    expect(t).toContain("Reçu de paiement — septembre 2026");
    expect(t).toContain("Total du terme (loyer 800,00 €, provision ou forfait de charges 100,00 €) : 900,00 €");
    expect(t).toContain("Montant encaissé : 400,00 €");
    expect(t).toContain("Solde restant dû : 500,00 €");
    expect(t).not.toMatch(/Total : 400,00/);
  });
  it("le solde ne passe jamais sous zéro, et les centimes s'additionnent juste", () => {
    const [, , solde] = lignesQuittance({ estQuittance: false, loyerHc: 412.9, charges: 51.61, montant: 464.51 });
    expect(solde).toMatch(/Solde restant dû : 0,00\s€/);
    expect(lignesQuittance({ estQuittance: false, loyerHc: 0.1, charges: 0.2, montant: 0.1 })[0]).toMatch(/: 0,30\s€$/);
  });
});

describe("quittance", () => {
  it("liste loyer, charges et le total du terme, avec le libellé des charges du bail", () => {
    const t = texte(corpsQuittance({ ...recu, estQuittance: true, loyerHc: 650, charges: 60, montant: 710, chargesMode: "forfait" }));
    expect(t).toContain("Loyer hors charges : 650,00 €");
    expect(t).toContain("Forfait de charges : 60,00 €");
    expect(t).toContain("Total du terme : 710,00 €");
    expect(t).not.toContain("Provision");
    expect(texte(corpsQuittance({ ...recu, estQuittance: true, montant: 900, chargesMode: "provision" }))).toContain("Provision sur charges : 100,00 €");
  });
});

describe("avis d'échéance", () => {
  const avis = { periode: "2026-10-01", loyerHc: 650, charges: 60, resteDu: 710, dateEcheance: "2026-11-05", prorata: false, arriere: 0, emetteur: "Claire Moreau", prenom: "Marie", lien: "x" };
  it("libelle les charges selon le mode du bail, et reste neutre sans mode", () => {
    expect(texte(corpsAvisEcheance({ ...avis, chargesMode: "forfait" }))).toContain("Forfait de charges : 60,00 €");
    expect(texte(corpsAvisEcheance({ ...avis, chargesMode: "provision" }))).toContain("Provision sur charges : 60,00 €");
    expect(texte(corpsAvisEcheance(avis))).toContain("Provision ou forfait de charges : 60,00 €");
  });
});
