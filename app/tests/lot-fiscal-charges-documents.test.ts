import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";
/**
 * Lot « fiscal-charges », décisions du dirigeant du 14/10/2026 sur les documents du catalogue :
 *  · D37 (CHF-01, option B) : le champ « intérêts d'emprunt » du récapitulatif annuel · location nue est prérempli avec le montant
 *    qualifié dans le livre (modifiable) ; si la valeur saisie diffère, l'écart est signalé SUR le PDF ; le texte d'aide faux est corrigé.
 *  · D39 (CHF-03, option B) : le détail des dépenses par nature et clé de répartition se saisit à la génération du décompte annuel et du
 *    courrier de régularisation, sans toucher à la régularisation émise.
 *  · D02 (FIN-11) : le refus du PDF annonce le nombre de pièces à qualifier.
 *
 * Jeu de référence : intérêts d'emprunt de 2 345,67 € qualifiés en rubrique 250 (fiche CHF-01).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { baseSimulee, filtresDe, lecturesSansFiltreOrganisation, type BaseSimulee } from "./fixtures/base-simulee";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { chargerCiblesCatalogue } from "@/lib/documents/catalogue-cibles";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import type { Assemblage } from "@/lib/documents/modeles";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({ ...(await importOriginal<object>()), chargerContexteBail: vi.fn() }));

type Row = Record<string, unknown>;
let ctx = contexte();

/**
 * Le dossier de référence (organisation « org ») ENTOURÉ de lignes qui ne doivent jamais compter, placées AVANT les bonnes : une autre agence
 * qui porte les mêmes identifiants, une autre année, un autre lot. La base est simulée avec ses filtres (fixtures/base-simulee) : un filtre
 * retiré ou mal rempli laisse passer une de ces lignes et le document change.
 */
function fixture(): Record<string, Row[]> {
  const o = { organization_id: "org" };
  const loyer = (m: number) => ({ ...o, id: `loyer${m}`, lot_id: "lot", bail_id: "bail", encaissement_id: `enc${m}`, categorie: "loyer", sens: "recette", montant: 840, date_piece: `2026-0${m}-05` });
  const periodes = (annee: number, regime = "nu") => [{ debut: `${annee}-01-01`, fin: `${annee}-12-31`, quote_part: 100, regime }];
  const exercice = (organization_id: string, lot_id: string, annee: number, version: number, regime = "nu") => ({ organization_id, lot_id, annee, version, periodes: periodes(annee, regime), justification: "Lot nu détenu à 100 %", regularisation230: 0, quote_part230: 100, justification230: "Aucune provision de l’année précédente" });
  return {
    organizations: [{ id: "org", ...ctx.organisation, type: "agence" }],
    lots: [
      { organization_id: "autre-org", id: "lot", nom: "Lot d'une autre agence", bien_id: "bien", meuble: true },
      { ...o, id: "lot", nom: "Appartement Jardin", bien_id: "bien", meuble: false },
    ],
    biens: [{ ...o, id: "bien", address_line1: "12 rue du Parc", postal_code: "75012", city: "Paris" }],
    baux: [{ ...o, id: "bail", lot_id: "lot", locataire_principal: "p", loyer_hc: 780, charges: 60 }],
    persons: [{ ...o, id: "p", nom: "Leblanc", prenom: "Julie" }],
    ecritures: [
      // Une autre agence, mêmes identifiants de lot et de pièce ; une pièce de l'an dernier et une de l'an prochain sur le même lot.
      { organization_id: "autre-org", id: "interets-etranger", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 999, date_piece: "2026-03-10" },
      { ...o, id: "interets-2025", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 777, date_piece: "2025-03-10" },
      { ...o, id: "interets-2027", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 555, date_piece: "2027-03-10" },
      loyer(1), loyer(2), loyer(3),
      { ...o, id: "interets", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 2345.67, date_piece: "2026-03-10" },
    ],
    fiscal_encaissements_composantes: [1, 2, 3].map((m) => ({ ...o, ecriture_id: `loyer${m}`, loyer_hc: 780, charges: 60, non_ventile: 0 })),
    fiscal_qualifications_ecritures: [
      // Qualification plus récente de la MÊME pièce, mais d'une autre agence : elle ne doit pas prendre le pas.
      { organization_id: "autre-org", ecriture_id: "interets", lot_id: "lot", nature: "deductible", rubrique: "224", justification: "Autre agence", version: 9 },
      { ...o, ecriture_id: "interets", lot_id: "lot", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement de la banque", version: 1 },
      { ...o, ecriture_id: "interets-2025", lot_id: "lot", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement de la banque", version: 1 },
    ],
    fiscal_exercices_lots: [
      // Plus récents que le bon, mais d'une autre année, d'un autre lot, d'une autre agence : aucun ne doit lui être substitué.
      exercice("org", "lot", 2025, 4),
      exercice("org", "lot-tiers", 2026, 5, "hors_perimetre"),
      exercice("autre-org", "lot", 2026, 6, "meuble"),
      exercice("org", "lot", 2026, 1),
    ],
    regularisations_charges: [
      { organization_id: "autre-org", id: "reg", bail_id: "bail", annee: 2019, provisions: 10, charges_reelles: 20, ecart: -10, note: "Détail d'une autre agence", justificatif_document: "doc", date_emission: "2020-01-01" },
      { ...o, id: "reg", bail_id: "bail", annee: 2025, provisions: 1000, charges_reelles: 1200, ecart: -200, note: null, justificatif_document: "doc", date_emission: "2026-01-01" },
    ],
  };
}
let base: BaseSimulee;
/** La base simulée de ce test : `base` garde les lectures et les écritures pour les assertions. */
function mockDb(tables = fixture()) {
  base = baseSimulee(avecDetenteursAuReel(tables));
  return base.client;
}
const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const recap = (options: Record<string, string>, tables = fixture()) => assemblerComplementGestion("recap_fiscal_nu", mockDb(tables), "org", "lot", { annee: "2026", ...options });
const ligne250 = (html: string) => { const m = texteDe(html).match(/250 Intérêts d'emprunt (-?\d[\d ]*,\d{2}) €/); return m ? `${m[1]} €` : undefined; };

beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("D37 (CHF-01, option B) : la ligne 250 reprend le montant qualifié du livre", () => {
  it("champ vide : le PDF imprime 2 345,67 € et non 0,00 €, sans écart", async () => {
    const html = succes(await recap({ interets_emprunt: "" })).document.html;
    expect(ligne250(html)).toBe("2 345,67 €");
    expect(texteDe(html)).not.toContain("Écart sur la ligne 250");
  });

  it("champ absent (appel direct sans le champ) : même résultat", async () => {
    expect(ligne250(succes(await recap({})).document.html)).toBe("2 345,67 €");
  });

  it.each(["2345,67", "2345.67", "2345,67 ".trim()])("valeur saisie égale au montant qualifié (%s) : aucun écart signalé", async (saisie) => {
    const html = succes(await recap({ interets_emprunt: saisie })).document.html;
    expect(ligne250(html)).toBe("2 345,67 €");
    expect(texteDe(html)).not.toContain("Écart sur la ligne 250");
  });

  it("l'ancienne valeur par défaut « 0 » ne passe plus en silence : l'écart est signalé sur le PDF", async () => {
    const html = succes(await recap({ interets_emprunt: "0" })).document.html;
    const texte = texteDe(html);
    expect(ligne250(html)).toBe("0,00 €");
    expect(texte).toContain("Écart sur la ligne 250 (intérêts d'emprunt).");
    expect(texte).toContain("Le livre porte 2 345,67 € qualifiés en ligne 250");
    expect(texte).toContain("le montant saisi à la génération du document est de 0,00 €, soit un écart de 2 345,67 €");
  });

  it("un écart d'un centime est signalé, au centime près", async () => {
    const texte = texteDe(succes(await recap({ interets_emprunt: "2345,66" })).document.html);
    expect(texte).toContain("soit un écart de 0,01 €");
  });

  it("une autre valeur (saisie modifiable) est imprimée telle quelle, avec l'écart", async () => {
    const html = succes(await recap({ interets_emprunt: "3000,50" })).document.html;
    expect(ligne250(html)).toBe("3 000,50 €");
    expect(texteDe(html)).toContain("soit un écart de 654,83 €");
  });

  it("aucune dépense qualifiée en 250 : le champ reste obligatoire, comme avant", async () => {
    const t = fixture();
    t.fiscal_qualifications_ecritures = [];
    t.ecritures = t.ecritures.filter((e) => e.id !== "interets");
    expect(await recap({ interets_emprunt: "" }, t)).toEqual({ erreur: "Indiquez les intérêts d’emprunt de l’année, ou 0 si le logement n’a aucun emprunt." });
    const zero = succes(await recap({ interets_emprunt: "0" }, t)).document.html;
    expect(ligne250(zero)).toBe("0,00 €");
    expect(texteDe(zero)).not.toContain("Écart sur la ligne 250");
  });

  it("aucune dépense qualifiée en 250 mais un montant saisi : imprimé, avec la mention que le livre n'en porte pas", async () => {
    const t = fixture();
    t.fiscal_qualifications_ecritures = [];
    t.ecritures = t.ecritures.filter((e) => e.id !== "interets");
    const html = succes(await recap({ interets_emprunt: "1200" }, t)).document.html;
    expect(ligne250(html)).toBe("1 200,00 €");
    expect(texteDe(html)).toContain("Le livre ne porte aucune dépense qualifiée en ligne 250");
  });

  it.each([["1 234,50"], ["12,345"], ["-5"], ["abc"], ["1.234,50"]])("refuse un montant illisible (%s) avec le message commun", async (saisie) => {
    const r = await recap({ interets_emprunt: saisie });
    expect(r).toHaveProperty("erreur");
    expect((r as { erreur: string }).erreur).toMatch(/^Intérêts d’emprunt de l’année : /);
  });

  it("le tableau et les autres lignes ne bougent pas", async () => {
    const texte = texteDe(succes(await recap({ interets_emprunt: "2345,67" })).document.html);
    expect(texte).toContain("211 Loyers bruts encaissés hors charges 2 340,00 €");
    expect(texte).toContain("Périmètre : 4 écritures de 2026 examinées");
  });

  it("le refus pour pièces à qualifier annonce leur nombre (D02)", async () => {
    const t = fixture();
    t.fiscal_encaissements_composantes = [];
    const r = await recap({ interets_emprunt: "2345,67" }, t);
    expect(r).toHaveProperty("erreur");
    const message = (r as { erreur: string }).erreur;
    expect(message).toContain("3 pièces restent à qualifier, une par une, avant que ce récapitulatif soit complet, dont 3 loyers encaissés");
    expect(message).toContain("Préparer ma déclaration");
  });

  it("le texte d'aide du champ ne dit plus que Gerimmo ne peut pas lire le livre", () => {
    const champ = OPTIONS_CATALOGUE.recap_fiscal_nu.find((c) => c.cle === "interets_emprunt")!;
    expect(champ.aide).not.toMatch(/ne peut pas déduire/);
    expect(champ.aide).toMatch(/prérempli/i);
    expect(champ.aide).toMatch(/écart/);
    // Un montant se saisit en texte décimal (« 2345,67 »), jamais en type nombre du navigateur (VER-TS-02).
    expect(champ.type).toBe("montant");
  });
});

describe("D37 : le livre lu est celui de l'organisation, de l'année et du lot demandés (base simulée avec ses filtres)", () => {
  it("ni l'autre agence, ni l'autre année, ni l'autre lot, ni un exercice plus récent d'ailleurs ne changent la ligne 250 ni le périmètre", async () => {
    const html = succes(await recap({ interets_emprunt: "" })).document.html;
    expect(ligne250(html)).toBe("2 345,67 €");
    expect(texteDe(html)).toContain("Périmètre : 4 écritures de 2026 examinées");
    expect(texteDe(html)).not.toContain("Écart sur la ligne 250");
  });

  it("l'année demandée est celle du livre lu : 2025 reprend la pièce de 2025 et son exercice, non celle de 2026", async () => {
    const t = fixture();
    // L'exercice 2025 du lot est le plus récent des exercices : seul le filtre d'année distingue 2025 de 2026.
    const html = succes(await recap({ annee: "2025", interets_emprunt: "" }, t)).document.html;
    expect(ligne250(html)).toBe("777,00 €");
    expect(texteDe(html)).toContain("Périmètre : 1 écriture de 2025 examinée");
  });

  it("les lectures posent leurs filtres : organisation partout, année de l'exercice, bornes de date des écritures, lot du document", async () => {
    succes(await recap({ interets_emprunt: "" }));
    expect(lecturesSansFiltreOrganisation(base, "org")).toEqual([]);
    expect(filtresDe(base, "fiscal_exercices_lots")).toContainEqual({ op: "eq", col: "annee", val: 2026 });
    expect(filtresDe(base, "ecritures")).toEqual(expect.arrayContaining([
      { op: "gte", col: "date_piece", val: "2026-01-01" },
      { op: "lt", col: "date_piece", val: "2027-01-01" },
    ]));
    expect(filtresDe(base, "lots")).toContainEqual({ op: "eq", col: "id", val: "lot" });
  });

  it("un livre chargé d'autres années n'est pas lu en entier : sans les bornes de date, le dossier serait refusé comme « trop volumineux »", async () => {
    const t = fixture();
    for (let i = 0; i < 1001; i++) t.ecritures.push({ organization_id: "org", id: `ancienne${i}`, lot_id: "lot", categorie: "Divers", sens: "depense", montant: 10, date_piece: "2024-06-15" });
    expect(ligne250(succes(await recap({ interets_emprunt: "" }, t)).document.html)).toBe("2 345,67 €");
  });

  it("la lecture des dossiers du catalogue et du décompte annuel est elle aussi bornée à l'organisation", async () => {
    await chargerCiblesCatalogue(mockDb(), "org", CATALOGUE_DOCUMENTS.find((m) => m.id === "decompte_charges")!);
    expect(base.lectures.map((l) => l.table)).toEqual(expect.arrayContaining(["regularisations_charges", "baux", "lots", "persons"]));
    expect(lecturesSansFiltreOrganisation(base, "org")).toEqual([]);
    succes(await assemblerComplementGestion("decompte_charges", mockDb(), "org", "reg", { consultation: "Au bureau", detail_depenses: "Eau : 300 €" }));
    expect(lecturesSansFiltreOrganisation(base, "org")).toEqual([]);
  });

  it("le décompte annuel lit la régularisation de l'organisation (même identifiant ailleurs : ignoré)", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("decompte_charges", mockDb(), "org", "reg", { consultation: "Au bureau", detail_depenses: "Eau : 300 €" })).document.html);
    expect(texte).toContain("Charges de l'exercice 2025");
    expect(texte).not.toContain("Détail d'une autre agence");
    expect(texte).not.toContain("2019");
  });
});

describe("D39 (CHF-03, option B) : le détail des dépenses se saisit à la génération", () => {
  const generer = (code: "regularisation_charges" | "decompte_charges" | "consultation_charges", options: Record<string, string> = {}, tables = fixture()) =>
    assemblerComplementGestion(code, mockDb(tables), "org", "reg", { consultation: "Au bureau, sur rendez-vous", ...options });

  it.each(["regularisation_charges", "decompte_charges"] as const)("%s : le formulaire propose le champ", (code) => {
    const champ = OPTIONS_CATALOGUE[code].find((c) => c.cle === "detail_depenses");
    expect(champ).toMatchObject({ type: "textarea", libelle: "Détail des dépenses par nature et clé de répartition" });
  });

  it("la consultation des justificatifs ne demande pas ce détail", () => {
    expect(OPTIONS_CATALOGUE.consultation_charges.map((c) => c.cle)).toEqual(["consultation"]);
  });

  it.each(["regularisation_charges", "decompte_charges"] as const)("%s : une régularisation sans note se génère avec le détail saisi", async (code) => {
    const r = succes(await generer(code, { detail_depenses: "Eau froide : 300 € (relevés individuels)\nAscenseur : 120 € (tantièmes)" }));
    expect(r.document.manquants).toEqual([]);
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Eau froide : 300 € (relevés individuels)");
    expect(texte).toContain("Ascenseur : 120 € (tantièmes)");
  });

  it("sans détail saisi ni détail enregistré, le document reste incomplet et le dit comme avant", async () => {
    const r = succes(await generer("decompte_charges"));
    expect(r.document.manquants).toContain("détail des dépenses par nature et clé de répartition");
  });

  it("un détail déjà porté par la régularisation sert de repli ; la saisie du jour l'emporte", async () => {
    const t = fixture();
    t.regularisations_charges.find((r) => r.organization_id === "org")!.note = "Détail enregistré à l'émission";
    const repli = succes(await generer("regularisation_charges", {}, t));
    expect(repli.document.manquants).toEqual([]);
    expect(texteDe(repli.document.html)).toContain("Détail enregistré à l'émission");
    const saisie = succes(await generer("regularisation_charges", { detail_depenses: "Détail saisi aujourd'hui" }, t));
    expect(texteDe(saisie.document.html)).toContain("Détail saisi aujourd'hui");
    expect(texteDe(saisie.document.html)).not.toContain("Détail enregistré à l'émission");
  });

  it("la saisie est échappée et plafonnée", async () => {
    const r = succes(await generer("decompte_charges", { detail_depenses: "<script>attaque()</script>" }));
    expect(r.document.html).not.toContain("<script>attaque()");
    expect(r.document.html).toContain("&lt;script&gt;");
    const trop = await generer("decompte_charges", { detail_depenses: "x".repeat(6001) });
    expect(trop).toEqual({ erreur: "Le détail des dépenses est trop long : 6 000 caractères au plus." });
  });

  it("la régularisation émise n'est pas modifiée : le document ne fait que lire", async () => {
    succes(await assemblerComplementGestion("decompte_charges", mockDb(), "org", "reg", { consultation: "Au bureau", detail_depenses: "Eau : 300 €" }));
    expect(base.lectures.length).toBeGreaterThan(0);
    expect(base.ecritures).toEqual([]);
  });

  it("le détail manquant n'envoie plus vers la fiche du bail, où rien ne se saisit", () => {
    expect(lienPourManquant("détail des dépenses par nature et clé de répartition", "org", [{ entite: "bail", entiteId: "bail" }], "decompte_charges")).toBeNull();
  });

  it("la liste des dossiers dit si la régularisation porte déjà un détail (le champ n'est alors plus obligatoire)", async () => {
    const t = fixture();
    t.regularisations_charges.push({ organization_id: "org", id: "reg2", bail_id: "bail", annee: 2024, provisions: 1000, charges_reelles: 900, ecart: 100, note: "Déjà documenté", justificatif_document: "doc", date_emission: "2025-01-01" });
    const modele = CATALOGUE_DOCUMENTS.find((m) => m.id === "decompte_charges")!;
    const { choix } = await chargerCiblesCatalogue(mockDb(t), "org", modele);
    expect(choix.find((c) => c.id === "reg")!.detailEnregistre).toBe(false);
    expect(choix.find((c) => c.id === "reg2")!.detailEnregistre).toBe(true);
  });
});
