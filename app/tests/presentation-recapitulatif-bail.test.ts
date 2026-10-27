import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { correctionsRecapBail, montantRecapBail, rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { BilanBail } from "@/app/agence/[orgId]/baux/[bailId]/bilan-bail";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { FournisseurRacineEspace } from "@/components/racine-espace-contexte";

const construire = (bail = {}) => rubriquesRecapBail({ bail, lot: { meuble: false, surface_carrez: 0 }, bien: { copropriete: false }, personnes: [], liens: { lot: "/espace/org/lot?retourEtape=7", bien: "/espace/org/bien?retourEtape=7" } });
const rendu = (manquants: string[], erreur?: string, lectureSeule = false) => renderToStaticMarkup(createElement(FournisseurRacineEspace, { racine: "/espace" }, createElement(CompletudeBail.Provider, { value: { manquants, erreur } }, createElement(BilanBail, { orgId: "org", rubriques: construire(), pieces: { pieces: [{ id: "dpe", titre: "DPE", detail: "Rapport manquant", statut: "a_completer", moment: "signature", href: "#completer-dpe" }] }, lectureSeule }))));

describe("récapitulatif du contrat", () => {
  it("préserve les montants nuls et ne transforme pas une absence en zéro", () => {
    expect(montantRecapBail(0)).toContain("0");
    for (const v of [null, undefined, "", " ", "erreur", Infinity]) expect(montantRecapBail(v)).toBeNull();
    const loyer = construire({ loyer_hc: 600, charges: 0, depot_garantie: 0 }).find(r => r.id === "loyer")!;
    expect(loyer.lignes.find(l => l.libelle === "Total mensuel")?.valeur).toContain("600");
  });
  it("distingue les réponses Non des décisions encore inconnues", () => {
    const connu = construire({ revision_irl: false }).flatMap(r => r.lignes);
    expect(connu.find(l => l.champ === "bail.revision_irl")?.valeur).toBe("Non");
    expect(connu.find(l => l.champ === "bien.copropriete")?.valeur).toBe("Non");
    expect(connu.find(l => l.champ === "bail.charges_mode")?.valeur).toBeNull();
    expect(connu.find(l => l.champ === "bail.paiement_echeance")?.valeur).toBeNull();
  });
  it("n’affiche que les compléments conditionnels utiles", () => {
    const champs = construire({ revision_irl: false, encadrement_loyer: false, precedente_location: "premiere" }).flatMap(r => r.lignes.map(l => l.champ));
    expect(champs).not.toContain("bail.irl_valeur");
    expect(champs).not.toContain("bail.dernier_loyer");
    expect(champs).not.toContain("bail.loyer_reference");
  });
  it("conserve une correction précise et le retour au récapitulatif", () => {
    const c = correctionsRecapBail(["avant 1949, de 1949 à 1974", "Date d’entrée", "montant mensuel"], construire(), "org", "/espace");
    expect(c[0]).toMatchObject({ libelle: "Année de construction", href: "/espace/org/bien?retourEtape=7" });
    expect(c[1].href).toBe("#parcours-date_debut");
    expect(c[2].libelle).toContain("Charges");
  });
  it("conserve les manquants non reconnus et dirige vers une rubrique", () => {
    expect(correctionsRecapBail(["Mention nouvelle", "Mention nouvelle"], construire(), "org", "/espace")).toHaveLength(1);
    expect(correctionsRecapBail(["Mention nouvelle"], construire(), "org", "/espace")[0].href).toBeTruthy();
  });
  it("une valeur invalide reste visible et signalée", () => {
    const rubriques = rubriquesRecapBail({ bail: {}, lot: { surface_m2: 0 }, bien: { annee_construction: 9 }, personnes: [], liens: { lot: "#lot", bien: "#bien" } });
    expect(rubriques.flatMap(r => r.lignes).find(l => l.champ === "lot.surface_m2")).toMatchObject({ valeur: "0 m²", aCorriger: true });
    expect(rubriques.flatMap(r => r.lignes).find(l => l.champ === "bien.annee_construction")).toMatchObject({ valeur: "9", aCorriger: true });
  });
  it("une date générique ne masque pas la naissance derrière la date d’entrée", () => {
    expect(correctionsRecapBail(["jj/mm/aaaa"], construire(), "org", "/espace")[0]).toMatchObject({ libelle: "Date de naissance du locataire", href: "#titre-locataires-bail" });
  });
  it("une absence de pièces ne devient pas un bail prêt à signer", () => {
    const html = rendu([]);
    expect(html).toContain("Informations renseignées");
    expect(html).toContain("0 / 1 pièces disponibles");
    expect(html).not.toMatch(/prêt à signer/i);
  });
  it("une erreur remplace le statut vert des informations", () => {
    const html = rendu([], "Lecture interrompue");
    expect(html).toContain("Contrôle indisponible");
    expect(html).toContain("Lecture interrompue");
    expect(html).not.toContain("Informations renseignées");
  });
  it("la consultation seule ne propose aucune correction ni signature", () => {
    const html = rendu(["Date d’entrée"], undefined, true);
    expect(html).not.toContain("Compléter");
    expect(html).not.toContain("Modifier");
    expect(html).not.toContain("Avant la signature");
    expect(html).toContain("Informations enregistrées");
  });
});
