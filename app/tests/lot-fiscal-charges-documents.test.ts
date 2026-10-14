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
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte } from "./fixtures/contexte-document";
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

function fixture(): Record<string, Row[]> {
  const loyer = (m: number) => ({ id: `loyer${m}`, lot_id: "lot", bail_id: "bail", encaissement_id: `enc${m}`, categorie: "loyer", sens: "recette", montant: 840, date_piece: `2026-0${m}-05` });
  return {
    organizations: [{ id: "org", ...ctx.organisation, type: "agence" }],
    lots: [{ id: "lot", nom: "Appartement Jardin", bien_id: "bien", meuble: false }],
    biens: [{ id: "bien", address_line1: "12 rue du Parc", postal_code: "75012", city: "Paris" }],
    baux: [{ id: "bail", lot_id: "lot", locataire_principal: "p", loyer_hc: 780, charges: 60 }],
    persons: [{ id: "p", nom: "Leblanc", prenom: "Julie" }],
    ecritures: [
      loyer(1), loyer(2), loyer(3),
      { id: "interets", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 2345.67, date_piece: "2026-03-10" },
    ],
    fiscal_encaissements_composantes: [1, 2, 3].map((m) => ({ ecriture_id: `loyer${m}`, loyer_hc: 780, charges: 60, non_ventile: 0 })),
    fiscal_qualifications_ecritures: [{ ecriture_id: "interets", lot_id: "lot", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement de la banque", version: 1 }],
    fiscal_exercices_lots: [{ lot_id: "lot", annee: 2026, version: 1, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }], justification: "Lot nu détenu à 100 %", regularisation230: 0, quote_part230: 100, justification230: "Aucune provision de l’année précédente" }],
    regularisations_charges: [{ id: "reg", bail_id: "bail", annee: 2025, provisions: 1000, charges_reelles: 1200, ecart: -200, note: null, justificatif_document: "doc", date_emission: "2026-01-01" }],
  };
}
function mockDb(tables = fixture()) {
  const query = (table: string) => {
    const q: Record<string, unknown> = { then: (resolve: (x: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve) };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt"]) q[op] = () => q;
    return q;
  };
  return { from: query, rpc: (nom: string) => query(nom) } as unknown as SupabaseClient;
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
    t.regularisations_charges[0].note = "Détail enregistré à l'émission";
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
    const ecritures: string[] = [];
    const base = mockDb();
    const db = new Proxy(base, { get: (cible, prop, recepteur) => {
      if (prop === "from") return (table: string) => {
        const q = (cible as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
        return new Proxy(q, { get: (c, p, r) => (["insert", "update", "upsert", "delete"].includes(String(p)) ? (() => { ecritures.push(`${table}.${String(p)}`); return q; }) : Reflect.get(c, p, r)) });
      };
      return Reflect.get(cible, prop, recepteur);
    } }) as unknown as SupabaseClient;
    succes(await assemblerComplementGestion("decompte_charges", db, "org", "reg", { consultation: "Au bureau", detail_depenses: "Eau : 300 €" }));
    expect(ecritures).toEqual([]);
  });

  it("le détail manquant n'envoie plus vers la fiche du bail, où rien ne se saisit", () => {
    expect(lienPourManquant("détail des dépenses par nature et clé de répartition", "org", [{ entite: "bail", entiteId: "bail" }], "decompte_charges")).toBeNull();
  });

  it("la liste des dossiers dit si la régularisation porte déjà un détail (le champ n'est alors plus obligatoire)", async () => {
    const t = fixture();
    t.regularisations_charges.push({ id: "reg2", bail_id: "bail", annee: 2024, provisions: 1000, charges_reelles: 900, ecart: 100, note: "Déjà documenté", justificatif_document: "doc", date_emission: "2025-01-01" });
    const modele = CATALOGUE_DOCUMENTS.find((m) => m.id === "decompte_charges")!;
    const { choix } = await chargerCiblesCatalogue(mockDb(t), "org", modele);
    expect(choix.find((c) => c.id === "reg")!.detailEnregistre).toBe(false);
    expect(choix.find((c) => c.id === "reg2")!.detailEnregistre).toBe(true);
  });
});
