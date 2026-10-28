/**
 * Audit final avant publication (28/10/2026), chantier « parc, personnes, baux » : règles pures et textes.
 * Les comportements en base sont couverts par tests/import-controle-irl-annee-base.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anneeTrimestreIrlPlausible, anneesTrimestreIrl, libelleTrimestreIrl, libelleTrimestreIrlEcran, publicationTrimestreIrl, trimestreIrlCanonique } from "@/lib/trimestre-irl";
import { valeursReprisesDuBail } from "@/lib/reprise-bail-precedent";
import { lireEtapeBail } from "@/lib/champs-etape-bail";
import { avertissementsDatesBail } from "@/lib/coherence-dates-bail";
import { estMineur } from "@/lib/validation-fiches";
import { initiales, nomComplet } from "@/lib/roles-personnes";
import { verifierDecimalesSurface } from "@/lib/saisie-montant";
import { estContratAFaireSigner, surfaceM2, titreContratAFaireSigner } from "@/lib/documents/modeles/communs";
import { titreAffiche } from "@/app/agence/[orgId]/documents/titre-document";
import { rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { Fusion } from "@/lib/documents/gabarit";
import { contexte as contexteBailComplet } from "./fixtures/contexte-document";

const form = (v: Record<string, string>) => { const f = new FormData(); Object.entries(v).forEach(([k, x]) => f.set(k, x)); return f; };
const montants = { loyer_hc: "500", charges: "40", depot_garantie: "400", jour_echeance: "1", charges_mode: "provision", revision_irl: "true", paiement_echeance: "echoir" };
const actuel = { type: "nu", loyer_hc: 500, charges: 40, depot_garantie: 400, charges_mode: "provision", jour_echeance: 1 };

describe("BAIL-02 — trimestre IRL de référence avec son année", () => {
  it("imprime « 3e trimestre 2026 » et ne prend pas « T3 » seul pour une mention complète", () => {
    expect(libelleTrimestreIrl("T3 2026")).toBe("3e trimestre 2026");
    expect(libelleTrimestreIrl("T1 2025")).toBe("1er trimestre 2025");
    expect(libelleTrimestreIrl("2e trimestre 2025")).toBe("2e trimestre 2025");
    expect(libelleTrimestreIrl("T3")).toBeNull();
    expect(trimestreIrlCanonique("2e trimestre 2025")).toBe("T2 2025");
  });
  it("année au choix depuis 1990 ; présélection sur le dernier indice PUBLIÉ à la conclusion (relecture)", () => {
    expect(anneesTrimestreIrl("2026-10-28")[0]).toBe(2026); expect(anneesTrimestreIrl("2026-10-28").at(-1)).toBe(1990);
    expect(anneeTrimestreIrlPlausible(4, "2019-02-20")).toBe(2018);
    expect(anneeTrimestreIrlPlausible(4, "2025-01-10")).toBe(2023);
    expect(anneeTrimestreIrlPlausible(3, "2026-10-15")).toBe(2026);
    expect(anneeTrimestreIrlPlausible(3, "2026-10-14")).toBe(2025);
    expect(publicationTrimestreIrl(1, 2019)).toBe("2019-04-15");
    expect(libelleTrimestreIrlEcran("T3")).toBe("3e trimestre — année à préciser");
    expect(libelleTrimestreIrlEcran("T1 2019")).toBe("1er trimestre 2019");
  });
  it("la relocation reprend le numéro du trimestre, pas son année", () => {
    const precedent = { id: "a", chambre_id: null, type: "nu", date_debut: "2023-09-01", date_fin: null, date_sortie_reelle: null, loyer_hc: 930, charges: 65, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true, irl_trimestre: "T2 2025", irl_valeur: 140.59 };
    expect(valeursReprisesDuBail(precedent, "nu").irl_trimestre).toBe("T2");
  });
  it("l’étape Loyer enregistre « T3 2026 » et refuse « T3 » sans année", () => {
    expect(lireEtapeBail("loyer", form({ ...montants, irl_trimestre: "T3 2026" }), actuel, { meuble: false, surface: 46 }).patch?.irl_trimestre).toBe("T3 2026");
    expect(lireEtapeBail("loyer", form({ ...montants, irl_trimestre: "T1 2019" }), actuel, { meuble: false, surface: 46 }).patch?.irl_trimestre).toBe("T1 2019");
    expect(lireEtapeBail("loyer", form({ ...montants, irl_trimestre: "T3" }), actuel, { meuble: false, surface: 46 }).erreur).toMatch(/trimestre et l’année/);
  });
  it("le récapitulatif et le contrat écrivent « 3e trimestre 2026 »", () => {
    const lignes = rubriquesRecapBail({ bail: { revision_irl: true, irl_trimestre: "T3 2026" }, lot: {}, bien: {}, personnes: [], liens: { lot: "#", bien: "#" } }).flatMap(r => r.lignes);
    expect(lignes.find(l => l.champ === "bail.irl_trimestre")?.valeur).toBe("3e trimestre 2026");
    const ctx = contexteBailComplet();
    ctx.bail.revision_irl = true; ctx.bail.irl_trimestre = "T3 2026";
    expect(construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }).html).toContain("3e trimestre 2026");
    // Une valeur ancienne (bail parti en signature avant la reprise) s'imprime telle quelle : son empreinte ne change pas.
    ctx.bail.irl_trimestre = "T3";
    expect(construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }).html).toMatch(/Trimestre de référence :\s*<span class="v">T3<\/span>/);
  });
});

describe("BAIL-15 — surface écrite à la française (documents annexes ; le contrat de bail garde son rendu, voir l’empreinte de signature)", () => {
  it("« 46 m² », « 45,5 m² », jamais « 46.00 m² »", () => {
    expect(surfaceM2("46.00")).toBe("46 m²");
    expect(surfaceM2("45.50")).toBe("45,5 m²");
    expect(surfaceM2(null)).toBeNull();
    expect(readFileSync("src/lib/documents/modeles/catalogue-bail.ts", "utf8")).toContain("surfaceM2(ctx.lot.surface_m2)");
  });
});

describe("BAIL-01 — dates du bail signalées, jamais refusées", () => {
  it("conclusion après l’entrée et entrée ancienne : deux avertissements ; dates cohérentes : aucun", () => {
    expect(avertissementsDatesBail({ date_debut: "2020-02-29", date_conclusion_prevue: "2027-01-15" }, "2026-10-28").map(a => a.code)).toEqual(["conclusion_apres_entree", "entree_ancienne"]);
    expect(avertissementsDatesBail({ date_debut: "2025-10-28", date_conclusion_prevue: "" }, "2026-10-28").map(a => a.code)).toEqual(["entree_ancienne"]);
    expect(avertissementsDatesBail({ date_debut: "2026-12-01", date_conclusion_prevue: "2026-11-20" }, "2026-10-28")).toEqual([]);
    expect(lireEtapeBail("bail", form({ type: "nu", date_debut: "2020-02-29", date_conclusion_prevue: "2027-01-15" }), actuel, { meuble: false, surface: 46 }).erreur).toBeUndefined();
  });
});

describe("BAIL-07 — majorité au jour de Paris", () => {
  it("17 ans : mineur ; 18 ans jour pour jour : majeur ; né un 29 février : majeur le 1er mars", () => {
    expect(estMineur("2015-01-01", "2026-10-28")).toBe(true);
    expect(estMineur("2008-10-29", "2026-10-28")).toBe(true);
    expect(estMineur("2008-10-28", "2026-10-28")).toBe(false);
    expect(estMineur("2008-02-29", "2026-02-28")).toBe(true);
    expect(estMineur("2008-02-29", "2026-03-01")).toBe(false);
    expect(estMineur(null, "2026-10-28")).toBe(false);
  });
});

describe("BAIL-17 — une seule convention de nom, initiales sur les lettres", () => {
  it("« Bernard Lucas » et l’initiale d’un nom balisé n’est jamais « < »", () => {
    expect(nomComplet({ nom: "Bernard", prenom: "Lucas" })).toBe("Bernard Lucas");
    expect(initiales("<b>Bernard</b>", "Papa")).toBe("BP");
    expect(initiales("", null)).toBe("?");
    expect(readFileSync("src/app/agence/[orgId]/baux/[bailId]/personnes-bail.tsx", "utf8")).toContain("const nom = (p: PersonneBail) => nomComplet(p);");
  });
});

describe("BAIL-08 — surface au centième", () => {
  it("refuse trois décimales et accepte deux", () => {
    expect(verifierDecimalesSurface("46,555")).toMatch(/deux décimales/);
    expect(verifierDecimalesSurface("46.555")).toMatch(/deux décimales/);
    expect(verifierDecimalesSurface("46,55")).toBeNull();
    expect(verifierDecimalesSurface("")).toBeNull();
  });
});

describe("BAIL-18 — un titre commun pour les contrats à faire signer", () => {
  const ctx = { lot: { nom: "Appartement T2" }, locataires: [{ nom: "Bernard", prenom: "Lucas" }] } as unknown as Parameters<typeof titreContratAFaireSigner>[1];
  it("même gabarit pour le nu, le meublé et la colocation ; les anciens titres restent reconnus et lisibles", () => {
    expect(titreContratAFaireSigner("nu", ctx)).toBe("Bail nu — Appartement T2 · Bernard Lucas (à faire signer)");
    expect(titreContratAFaireSigner("meublé", ctx)).toBe("Bail meublé — Appartement T2 · Bernard Lucas (à faire signer)");
    expect(titreContratAFaireSigner("commun de colocation nue", ctx)).toMatch(/^Bail commun de colocation nue — /);
    for (const t of ["Bail meublé — Bernard Lucas", "Bail nu (généré, à faire signer)", "Colocation — bail commun nu (à faire signer)", "Contrat individuel nu — Chambre 1 (à faire signer)", titreContratAFaireSigner("nu", ctx)]) expect(estContratAFaireSigner(t)).toBe(true);
    for (const t of ["Bail signé", "Avenant — Changement de loyer", "Bail meublé — Bernard Lucas — à signer en ligne", "Bail meublé — Bernard Lucas — à signer en ligne — signé", null]) expect(estContratAFaireSigner(t)).toBe(false);
    expect(titreAffiche(`${titreContratAFaireSigner("nu", ctx)} — à signer en ligne — signé`)).toBe("Bail nu — Appartement T2 · Bernard Lucas — signé");
  });
});

describe("Textes (BAIL-12, 13, 19, 27)", () => {
  it("libellé métier des diagnostics, pluriel accordé, date de l’avenant à la signature, « d’un mois »", () => {
    const signature = readFileSync("src/lib/signature-bail.ts", "utf8");
    expect(signature).not.toContain("toUpperCase()"); expect(signature).toContain("libelleDiagnostic(d.type)");
    expect(readFileSync("src/app/agence/[orgId]/baux/[bailId]/assistant-bail.tsx", "utf8")).toContain('`${restant} champ${restant > 1 ? "s" : ""} · pièces à vérifier`');
    const avenant = readFileSync("src/lib/documents/modeles/avenant.ts", "utf8");
    expect(avenant).toContain("date effective à compléter lors de la signature"); expect(avenant).not.toContain("new Date().toISOString(), \", en autant");
    expect(readFileSync("src/app/agence/[orgId]/parc/formulaire-bien.tsx", "utf8")).toContain("préavis du locataire d’un mois");
  });
});

describe("BAIL-28 — informations à renseigner avant le PDF", () => {
  it("une ligne par information, avec une majuscule et « à renseigner »", () => {
    const source = readFileSync("src/components/bouton-generer-document.tsx", "utf8");
    expect(source).toContain("à renseigner (${cible!.ecran.replaceAll(\"'\", \"’\")})");
    expect(source).toContain('m.charAt(0).toLocaleUpperCase("fr")');
  });
});
