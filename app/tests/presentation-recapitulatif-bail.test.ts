import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { correctionsRecapBail, dureeContratRecapBail, montantRecapBail, rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
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

describe("récapitulatif du contrat — audit #264", () => {
  const personnes = (bail: Record<string, string | null>, liste: { nom: string; role: string }[]) =>
    rubriquesRecapBail({ bail, lot: {}, bien: {}, personnes: liste, liens: { lot: "#lot", bien: "#bien" } }).find(r => r.id === "personnes")!;
  it("CB-13 : sans locataire choisi, la rubrique des personnes le signale", () => {
    const sans = personnes({ locataire_principal: null }, [{ nom: "Moreau Claire · 100 %", role: "Propriétaire" }]);
    expect(sans.lignes.map(l => [l.libelle, l.valeur, l.facultatif ?? false])).toEqual([["Propriétaire", "Moreau Claire · 100 %", false], ["Locataire principal", null, false]]);
    expect(sans.lignes[1].href).toBe("#titre-locataires-bail");
    const avec = personnes({ locataire_principal: "p1" }, [{ nom: "Moreau Claire · 100 %", role: "Propriétaire" }, { nom: "Durand Léa", role: "Locataire principal" }]);
    expect(avec.lignes.filter(l => l.valeur === null)).toEqual([]);
  });
  it("CB-07 : un complément de loyer vide est « néant », comme au contrat, sans rien à vérifier", () => {
    const clauses = construire({ encadrement_loyer: true, loyer_reference: 15.2, loyer_reference_majore: 18.24, complement_loyer: null }).find(r => r.id === "clauses")!;
    expect(clauses.lignes.find(l => l.champ === "bail.complement_loyer")).toMatchObject({ valeur: "Néant", facultatif: true });
    const avec = construire({ encadrement_loyer: true, complement_loyer: 40 }).find(r => r.id === "clauses")!;
    expect(avec.lignes.find(l => l.champ === "bail.complement_loyer")?.valeur).toMatch(/^40,00/);
  });
  it("CB-09 : un locataire absent donne une seule correction, et les mentions brutes ont un libellé lisible", () => {
    const rubriques = rubriquesRecapBail({ bail: { locataire_principal: null }, lot: {}, bien: {}, personnes: [], liens: { lot: "#lot", bien: "#bien" } });
    const mentions = ["nom et prénom(s)", "commune de naissance", "adresse actuelle", "nom et prénom(s) du ou des locataires", "jj/mm/aaaa", "inventaire du mobilier — au moins les 11 éléments du décret", "classe DPE du logement", "commune", "personne physique, SCI, indivision…"];
    const c = correctionsRecapBail(mentions, rubriques, "org", "/espace");
    expect(c.filter(x => x.href === "#titre-locataires-bail").map(x => x.libelle)).toEqual(["Choisir le locataire principal"]);
    expect(c.filter(x => x.libelle === x.mention)).toEqual([]);
  });
  it("CB-04 : un profil sans adresse ni e-mail renvoie au profil, pas aux parties", () => {
    const c = correctionsRecapBail(["adresse de l’organisation (profil)", "adresse électronique de l’organisation (profil)"], construire(), "org", "/espace");
    expect(c.map(x => [x.libelle, x.href])).toEqual([
      ["Adresse de votre profil (en-tête du contrat)", "/espace/org/profil"],
      ["E-mail de votre profil (en-tête du contrat)", "/espace/org/profil"],
    ]);
  });
  it("CB-10 : la rubrique du contrat donne la durée du contrat et la fin de sa première période", () => {
    expect(dureeContratRecapBail({ type: "nu" }, false, ["SCI"])).toBe("6 ans, avec reconduction tacite");
    expect(dureeContratRecapBail({ type: "nu" }, false, ["Personne physique"])).toBe("3 ans, avec reconduction tacite");
    expect(dureeContratRecapBail({ type: "meuble" }, true, [])).toBe("1 an, avec reconduction tacite");
    expect(dureeContratRecapBail({ type: "colocation" }, true, [])).toBe("1 an, avec reconduction tacite");
    expect(dureeContratRecapBail({ type: "meuble", meuble_etudiant: true }, true, [])).toBe("9 mois, sans reconduction tacite");
    const contrat = rubriquesRecapBail({ bail: { type: "nu", date_debut: "2026-12-01" }, lot: {}, bien: {}, personnes: [], liens: { lot: "#lot", bien: "#bien" }, duree: { texte: "6 ans, avec reconduction tacite", finPremierePeriode: "2032-11-30" } }).find(r => r.id === "bail")!;
    expect(contrat.lignes.map(l => [l.libelle, l.valeur])).toEqual(expect.arrayContaining([["Durée du contrat", "6 ans, avec reconduction tacite"], ["Fin de la première période", "30/11/2032"]]));
    // Bail étudiant : la durée n’est dite qu’une fois.
    const etudiant = (duree?: { texte: string | null; finPremierePeriode: string | null }) => rubriquesRecapBail({ bail: { type: "meuble", meuble_etudiant: true, date_debut: "2026-12-01" }, lot: {}, bien: {}, personnes: [], liens: { lot: "#lot", bien: "#bien" }, duree }).find(r => r.id === "bail")!.lignes.filter(l => /étudiant|Durée/.test(l.libelle)).map(l => [l.libelle, l.valeur]);
    expect(etudiant({ texte: "9 mois, sans reconduction tacite", finPremierePeriode: "2027-08-31" })).toEqual([["Bail étudiant", "Oui"], ["Durée du contrat", "9 mois, sans reconduction tacite"]]);
    expect(etudiant()).toEqual([["Bail étudiant", "9 mois"]]);
  });
});
