/**
 * Phase 3 de la mission palier 1, lot 35 — socle commun des documents : mise en forme et mise en page.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (C09, C10, C11, C26, C27, C28, C38, C39, C43, C44, C45, C51, C53,
 * C55, C62, C63, C69, C75, C84, C85, C87, S10). Chaque cas ci-dessous échouait avant le correctif.
 * Les correctifs de la feuille (g8) ne touchent pas la relecture « archivée » d'un bail déjà préparé pour la signature :
 * son empreinte doit rester celle d'alors (voir tests/signature-empreinte-avant-24-octobre.test.ts pour un bail d'avant #331,
 * tests/signature-empreinte-avant-g8.test.ts pour un bail préparé avec la présentation d'aujourd'hui avant la version g8).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import {
  assemblerPage,
  faitA,
  Fusion,
  jourDuMois,
  ligneTotal,
  nombreFr,
  pointFinal,
  typographie,
} from "@/lib/documents/gabarit";
import { adresseLogement, chargerContexteBail, mentionEtage } from "@/lib/documents/modeles/communs";
import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
import { assemblerQuittanceDelivree } from "@/lib/quittance-conforme";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { chargesInchangees, construireRevisionIrl } from "@/lib/documents/modeles/revision-irl";
import { construireRecuDepot } from "@/lib/documents/modeles/recu-depot";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { construireProrata } from "@/lib/documents/modeles/prorata";
import { construireEdl } from "@/lib/documents/modeles/edl";

const exp = { nom: "Parc de Claire Moreau", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@x.fr", telephone: null, ville: "Lyon" };
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("étage du logement (C09, C26, C63, C84)", () => {
  it.each([
    ["2e étage, porte gauche", "2e étage, porte gauche"],
    ["1er Étage, porte 7", "1er Étage, porte 7"],
    ["ETAGE 3", "ETAGE 3"],
    ["RDC", "RDC"],
    ["rdc, porte B", "rdc, porte B"],
    ["Rez-de-chaussée sur cour", "Rez-de-chaussée sur cour"],
    ["rez de chaussee", "rez de chaussee"],
    ["2", "étage 2"],
    // Reprise du lot 35 : un ordinal reçoit « étage » après lui (« étage 3e » se lisait à l'envers, et doublait le mot quand le
    // nom du lot disait déjà « 1er étage »). Attente précédente : « étage 3e, porte droite ».
    ["3e, porte droite", "3e étage, porte droite"],
    ["1er, porte droite", "1er étage, porte droite"],
    ["1ère, porte 2", "1ère, porte 2"],
    ["4ème porte face", "4ème étage porte face"],
    ["premier", "premier étage"],
    ["3, porte gauche", "étage 3, porte gauche"],
    // Reprise du lot 35 : un niveau nommé ne reçoit pas « étage » (« étage sous-sol », « étage Rez-de-jardin »).
    ["Rez-de-jardin", "Rez-de-jardin"],
    ["RDJ", "RDJ"],
    ["sous-sol", "sous-sol"],
    ["combles", "combles"],
    ["Entresol, porte 2", "Entresol, porte 2"],
    ["R+1", "R+1"],
    // Lot 43 (T05) : deux niveaux saisis ensemble (duplex). Attente précédente (non figée) : « 1er étage et 2e ».
    ["1er et 2e", "1er et 2e étages"],
    ["2e et 3e, porte A", "2e et 3e étages, porte A"],
    ["premier et deuxième", "premier et deuxième étages"],
    ["Duplex 2e et 3e", "Duplex 2e et 3e"],
    // Reprise du lot 43 : « 5e et dernier » est UN étage (le 5e, qui est le dernier). Le lot 43 l'imprimait comme un duplex,
    // « 5e et dernier étages » ; avant lui, « 5e étage et dernier ».
    ["5e et dernier", "5e et dernier étage"],
    ["3ème et dernier, porte gauche", "3ème et dernier étage, porte gauche"],
    ["1er et dernier", "1er et dernier étage"],
    ["dernier", "dernier étage"],
  ])("« %s » s'imprime « %s »", (saisie, attendu) => {
    expect(mentionEtage(saisie)).toBe(attendu);
  });

  it("un étage vide ne s'imprime pas", () => {
    expect(mentionEtage(null)).toBeNull();
    expect(mentionEtage("  ")).toBeNull();
  });

  it("l'adresse du logement ne répète plus le mot « étage »", () => {
    const ctx = contexte();
    const lot = { ...ctx.lot, nom: "T2", etage: "2e étage, porte gauche" };
    expect(adresseLogement(lot, ctx.bien)).not.toContain("étage 2e étage");
    expect(adresseLogement(lot, ctx.bien)).toContain("T2, 2e étage, porte gauche");
    expect(adresseLogement({ ...lot, etage: "3" }, ctx.bien)).toContain("T2, étage 3");
  });

  it("la quittance délivrée au locataire suit la même règle", () => {
    const d = quittanceDocumentComplete();
    const html = assemblerQuittanceDelivree({ ...d, logement: { ...d.logement, etage: "2e étage, porte gauche" } }).html;
    expect(html).not.toContain("étage 2e étage");
    expect(html).toContain("2e étage, porte gauche");
    const nomme = assemblerQuittanceDelivree({ ...d, logement: { ...d.logement, lot_nom: "T3 — 4e étage", etage: "4e, porte face" } }).html;
    expect(texteDe(nomme)).toContain("T3 — 4e étage, porte face");
    expect(nomme).not.toContain("étage 4e");
  });

  // Reprise du lot 35 (dossiers impayés) : le nom du lot dit déjà l'étage, le champ Étage le redit sans le mot. L'adresse
  // imprimait « Studio meublé — 1er étage, étage 1er, porte droite » et « T3 — 4e étage, étage 4e, porte face ».
  it("l'étage déjà dit par le nom du lot n'est pas redit", () => {
    const ctx = contexte();
    const studio = { ...ctx.lot, nom: "Studio meublé — 1er étage", etage: "1er, porte droite" };
    expect(adresseLogement(studio, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio meublé — 1er étage, porte droite");
    expect(adresseLogement({ ...studio, nom: "T3 — 4e étage", etage: "4e, porte face" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, T3 — 4e étage, porte face");
    expect(adresseLogement({ ...studio, etage: "1er étage, porte droite" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio meublé — 1er étage, porte droite");
    expect(adresseLogement({ ...studio, etage: "1er" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio meublé — 1er étage");
    expect(adresseLogement({ ...studio, nom: "Studio — RDC", etage: "RDC, porte B" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio — RDC, porte B");
    // Un autre niveau que celui du nom reste imprimé : la saisie contradictoire se voit, elle n'est pas corrigée en silence.
    expect(adresseLogement({ ...studio, etage: "2e, porte droite" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio meublé — 1er étage, 2e étage, porte droite");
    // Un nom sans étage ne retire rien.
    expect(adresseLogement({ ...studio, nom: "Studio meublé n° 12", etage: "3, porte 12" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Studio meublé n° 12, étage 3, porte 12");
  });

  // Lot 43 (T05) : dans « Lot 5 étage 2 », le 5 est le numéro du lot ; le niveau nommé est 2. L'adresse imprimait
  // « Lot 5 étage 2, étage 2 ».
  it("un numéro de lot devant « étage » n'est pas pris pour le niveau", () => {
    const ctx = contexte();
    const lot = { ...ctx.lot, nom: "Lot 5 étage 2", etage: "2" };
    expect(mentionEtage("2", "Lot 5 étage 2")).toBeNull();
    expect(adresseLogement(lot, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Lot 5 étage 2");
    expect(adresseLogement({ ...lot, etage: "2, porte B" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Lot 5 étage 2, porte B");
    // Un autre niveau que celui du nom reste imprimé ; un nom qui ne dit l'étage que par un nombre nu reste reconnu.
    expect(adresseLogement({ ...lot, etage: "5" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Lot 5 étage 2, étage 5");
    expect(mentionEtage("4", "T3 4 étage")).toBeNull();
  });

  // Reprise du lot 43 : le nom d'un duplex qui dit déjà ses deux niveaux était suivi de la même mention (« Duplex — 1er et 2e
  // étages, 1er et 2e étages ») ; un niveau suivi de « et … » perdait sa tête (« Studio 2 étage 1, et 2 »).
  it("un duplex déjà nommé par le lot n'est pas redit, un niveau suivi de « et » reste entier", () => {
    const ctx = contexte();
    const duplex = { ...ctx.lot, nom: "Duplex — 1er et 2e étages", etage: "1er et 2e" };
    expect(adresseLogement(duplex, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex — 1er et 2e étages");
    expect(adresseLogement({ ...duplex, etage: "1er et 2e, porte A" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex — 1er et 2e étages, porte A");
    expect(adresseLogement({ ...duplex, etage: "1er et 2e étages" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex — 1er et 2e étages");
    // D'autres niveaux que ceux du nom restent imprimés : la saisie contradictoire se voit.
    expect(mentionEtage("2e et 3e", "Duplex — 1er et 2e étages")).toBe("2e et 3e étages");
    // Phase 3, lot 49 (V02) : « 2e » est l'un des deux niveaux que le nom nomme déjà ; l'attente précédente (« 2e étage »,
    // l'adresse « Duplex — 1er et 2e étages, 2e étage ») redisait l'étage. Il n'est plus redit.
    expect(mentionEtage("2e", "Duplex — 1er et 2e étages")).toBeNull();
    expect(mentionEtage("1er et 2e", "Lot 5 étage 1")).toBe("1er et 2e étages");
    // Un niveau prolongé par « et », « à » : jamais « et 2 » ni « à 3 ».
    expect(mentionEtage("1 et 2", "Studio 2 étage 1")).toBe("étage 1 et 2");
    expect(mentionEtage("1er étage et 2e", "Studio 2 étage 1")).toBe("1er étage et 2e");
    expect(mentionEtage("étage 1 à 3", "Lot étage 1")).toBe("étage 1 à 3");
    // « 5e et dernier » sous un nom qui dit le 5e : la mention garde « dernier », au singulier.
    expect(mentionEtage("5e et dernier", "T4 — 5e étage")).toBe("5e et dernier étage");
  });

  // Phase 3, lot 48 (U02) : trois saisies plausibles imprimaient encore deux fois le même niveau — « Duplex 1er et 2e étage,
  // 1er et 2e étages », « T3 5e et dernier étage, 5e et dernier étage », « Duplex 1er et 2e étages, premier et deuxième
  // étages ».
  it("le nom du lot au singulier, « 5e et dernier étage » ou des niveaux en lettres : l'étage n'est pas redit", () => {
    const ctx = contexte();
    const duplex = { ...ctx.lot, nom: "Duplex 1er et 2e étage", etage: "1er et 2e" };
    expect(adresseLogement(duplex, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e étage");
    expect(adresseLogement({ ...duplex, etage: "1er et 2e, porte A" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e étage, porte A");
    const dernier = { ...ctx.lot, nom: "T3 5e et dernier étage", etage: "5e et dernier" };
    expect(adresseLogement(dernier, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, T3 5e et dernier étage");
    expect(mentionEtage("5", "T3 5e et dernier étage")).toBeNull();
    expect(adresseLogement({ ...duplex, nom: "Duplex 1er et 2e étages", etage: "premier et deuxième" }, ctx.bien)).toBe("12 rue des Lilas, 69003 Lyon, Duplex 1er et 2e étages");
    expect(mentionEtage("premier, porte droite", "Studio — 1er étage")).toBe("porte droite");
    // Ce que le nom ne dit pas reste imprimé : « dernier » sous un nom qui ne dit que le 5e, un autre niveau, un autre duplex.
    expect(mentionEtage("5e et dernier", "T3 — 5e étage")).toBe("5e et dernier étage");
    // Phase 3, lot 49 (V02) : « 1er » est l'un des niveaux que le nom du duplex nomme déjà ; l'attente précédente (« 1er
    // étage », l'adresse « Duplex 1er et 2e étage, 1er étage ») redisait l'étage. Il n'est plus redit.
    expect(mentionEtage("1er", "Duplex 1er et 2e étage")).toBeNull();
    expect(mentionEtage("2e et 3e", "Duplex 1er et 2e étage")).toBe("2e et 3e étages");
    expect(mentionEtage("deuxième", "Studio — 1er étage")).toBe("deuxième étage");
  });

  // Reprise du lot 35 : les écrans recopiaient l'ancienne règle (« étage 2e étage, porte gauche » à l'écran, « 2e étage,
  // porte gauche » dans la quittance). Ils appliquent la même fonction que les documents.
  it("les écrans du locataire et la fenêtre du lot suivent la même règle", () => {
    for (const fichier of ["src/app/locataire/[orgId]/page.tsx", "src/app/locataire/[orgId]/logement/page.tsx", "src/components/fenetre-lot.tsx"]) {
      const source = readFileSync(join(process.cwd(), fichier), "utf8");
      expect(source, fichier).not.toMatch(/`étage \$\{/);
      expect(source, fichier).toContain("mentionEtage(");
    }
  });
});

describe("nombres au format français (C10, C27, C39, C62)", () => {
  it.each([
    [45, "45"],
    ["45.00", "45"],
    [24.5, "24,5"],
    ["24.50", "24,5"],
    [210.5, "210,5"],
    [4521.3, "4 521,3"],
    [0, "0"],
    [98.123, "98,123"],
  ])("%s s'écrit « %s »", (valeur, attendu) => {
    expect(nombreFr(valeur)).toBe(attendu);
  });

  it("une valeur illisible reste telle quelle", () => {
    expect(nombreFr("")).toBe("");
    expect(nombreFr("n.c.")).toBe("n.c.");
  });
});

describe("point final après un texte saisi (C38, C85)", () => {
  it.each([
    ["Paiement comptant à la signature de l'acte.", ""],
    ["Elle s'installe à Lyon pour son travail. ", ""],
    ["Fuite réparée !", ""],
    ["Pourquoi ?", ""],
    ["Et cætera…", ""],
    ["Retards de paiement répétés (essai fictif)", "."],
    ["", "."],
  ])("« %s » appelle « %s »", (saisie, attendu) => {
    expect(pointFinal(saisie)).toBe(attendu);
  });

  it("une saisie absente garde le point du modèle", () => {
    expect(pointFinal(null)).toBe(".");
    expect(pointFinal(undefined)).toBe(".");
  });
});

describe("jour d'échéance (S10)", () => {
  it("le 1er, puis le 2, le 15", () => {
    expect(jourDuMois(1)).toBe("1er");
    expect(jourDuMois("1")).toBe("1er");
    expect(jourDuMois(2)).toBe("2");
    expect(jourDuMois(15)).toBe("15");
    expect(jourDuMois(null)).toBeNull();
  });

  // Lot 43 (T06) : les écrans écrivaient « Le 1 de chaque mois », « Le 1 du mois ». Ils passent par la même règle que les
  // contrats (lib/jour-du-mois.ts, que le gabarit réexporte).
  it("les écrans écrivent le jour d'échéance avec la même règle", () => {
    for (const fichier of ["src/lib/presentation-recapitulatif-bail.ts", "src/components/fenetre-lot.tsx", "src/app/agence/[orgId]/baux/[bailId]/page.tsx"]) {
      const source = readFileSync(join(process.cwd(), fichier), "utf8");
      expect(source, fichier).not.toMatch(/`Le \$\{[\w.]*jour_echeance\}/);
      expect(source, fichier).toContain("jourDuMois(");
    }
  });

  // Reprise du lot 43 : le jour du rapport de gestion (mandat d'agence) s'écrivait encore « le 1 du mois » dans la fenêtre du
  // lot, deux lignes au-dessus de l'échéance corrigée, et « le 1 de chaque mois » sur la fiche du mandant. Le mandat imprimé
  // écrit déjà « le 1er » (mandat-gestion.ts).
  it("les écrans écrivent le jour du rapport de gestion avec la même règle", () => {
    for (const fichier of ["src/components/fenetre-lot.tsx", "src/app/agence/[orgId]/personnes/[personId]/page.tsx"]) {
      const source = readFileSync(join(process.cwd(), fichier), "utf8");
      expect(source, fichier).not.toMatch(/\$\{[\w.]*jour_rapport\}|\{[\w.]*date_rapport\}/);
      expect(source, fichier).toMatch(/jourDuMois\([\w.]*(?:jour|date)_rapport\)/);
    }
  });
});

describe("feuille de style g8 (C11, C28, C44, C45, C51, C53, C69, C75, C87)", () => {
  const page = (feuilleArchivee?: boolean) =>
    assemblerPage({ f: new Fusion(), titreDocument: "Essai", nomPied: "Essai", reference: "R", corps: "<p>x</p>", feuilleArchivee }).html;

  it("les correctifs de mise en page sont dans la feuille des documents remis", () => {
    const html = page();
    expect(html).toContain("p { break-inside:auto; page-break-inside:auto; }");
    expect(html).toContain(".annonce { break-after:avoid-page;");
    expect(html).toContain(".fait-a { break-before:avoid-page; page-break-before:avoid; break-after:avoid-page;");
    expect(html).toContain(".v { padding:0; }");
    expect(html).toContain("td.d { white-space:nowrap; }");
    expect(html).toContain("table.ligne-total { break-before:avoid-page;");
  });

  it("la feuille archivée reste la feuille g7, sans aucun correctif", () => {
    const html = page(true);
    expect(html).toContain(".v { border-bottom:0.75pt dotted var(--filet); padding:0 2pt; }");
    expect(html).not.toContain(".fait-a");
    expect(html).not.toContain("td.d { white-space:nowrap; }");
    expect(html).not.toContain("p { break-inside:auto");
  });

  it("« Fait à » porte la classe qui le garde avec ce qui précède et avec la signature", () => {
    expect(faitA(new Fusion(), "Lyon", "2026-11-23")).toMatch(/^<p class="fait-a">Fait à /);
  });

  it("la ligne de total porte la classe qui la garde sous son tableau", () => {
    expect(ligneTotal("Total du terme", "760,00 €")).toBe(
      '<table class="ligne-total"><tbody><tr class="total"><td><b>Total du terme</b></td><td class="d"><b>760,00 €</b></td></tr></tbody></table>'
    );
    expect(ligneTotal("<b>", "1")).toContain("&lt;b&gt;");
  });
});

describe("bail : adresse, surface, échéance et paragraphes d'annonce", () => {
  const ctxBail = () => {
    const ctx = contexte();
    ctx.lot = { ...ctx.lot, nom: "T2", etage: "2e étage, porte gauche", surface_m2: 24.5 };
    ctx.bail = { ...ctx.bail, jour_echeance: 1 };
    return ctx;
  };

  it.each([
    ["nu", (archivee: boolean) => construireBailNu(ctxBail(), { dpeClasse: "D", f: new Fusion(), presentationAncienne: archivee })],
    ["meublé", (archivee: boolean) => construireBailMeuble(ctxBail(), { dpeClasse: "D", inventaire: [], f: new Fusion(), presentationAncienne: archivee })],
  ])("bail %s remis : « 2e étage » sans doublon, « 24,5 m² », « le 1er de chaque mois », annonces gardées avec leur suite", (_nom, construire) => {
    const html = construire(false).html;
    const texte = texteDe(html);
    expect(texte).not.toContain("étage 2e étage");
    expect(texte).toContain("T2, 2e étage, porte gauche");
    expect(texte).toContain("Surface habitable : 24,5 m²");
    expect(texte).not.toContain("24.5");
    expect(texte).toMatch(/le 1er de chaque mois/);
    expect(html).toContain('<p class="annonce">Sont annexées et jointes au contrat les pièces suivantes :</p>');
    expect(html).toMatch(/<p class="annonce">Le présent contrat a pour objet la location d'un logement/);
    expect(html).toContain('<p class="fait-a">Fait à ');
  });

  it.each([
    ["nu", () => construireBailNu(ctxBail(), { dpeClasse: "D", f: new Fusion(), presentationAncienne: true })],
    ["meublé", () => construireBailMeuble(ctxBail(), { dpeClasse: "D", inventaire: [], f: new Fusion(), presentationAncienne: true })],
  ])("bail %s relu pour l'empreinte d'un circuit déjà préparé : la typographie d'alors, octet pour octet", (_nom, construire) => {
    const html = construire().html;
    const texte = texteDe(html);
    expect(texte).toContain("étage 2e étage");
    expect(texte).toContain("Surface habitable : 24.5 m²");
    expect(texte).toMatch(/le 1 de chaque mois/);
    expect(html).not.toContain('class="annonce"');
    expect(html).not.toContain('class="fait-a"');
    expect(html).toContain(".v { border-bottom:0.75pt dotted var(--filet); padding:0 2pt; }");
  });

  it("la typographie archivée n'est jamais celle d'un document remis", () => {
    expect(typographie(undefined).archivee).toBe(false);
    expect(typographie(false).archivee).toBe(false);
    expect(typographie(true).archivee).toBe(true);
  });

  it("contrat individuel : surface et volume privatifs au format français, pas de double point après la description", () => {
    const ctx = ctxBail();
    ctx.chambre = { id: "c1", nom: "Chambre 2", surface_m2: 14, volume_m3: 35.5, description: "Chambre sur cour.", espaces_partages: "Cuisine, salon", equipements: "Lit, bureau." };
    const texte = texteDe(construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }).html);
    expect(texte).toContain("Surface habitable privative : 14 m² ; volume habitable privatif : 35,5 m³.");
    expect(texte).toContain("Description et accès : Chambre sur cour.");
    expect(texte).not.toContain("Chambre sur cour..");
    expect(texte).not.toContain("Lit, bureau..");
    expect(texte).toContain("Pièces et équipements du logement partagés avec les autres occupants : Cuisine, salon.");
  });
});

describe("textes fixes (C43, C55)", () => {
  const revision = (chargesMode: string | null) =>
    construireRevisionIrl({
      reference: "REV-1", ancienLoyer: 700, nouveauLoyer: 710, dateEffet: "2026-10-15", dateEcheance: "2026-10-15", dateDemande: null,
      irlReference: 145.47, irlNouveau: 147.41, trimestre: "2e trimestre", trimestreNouveau: "T2 2026", charges: 60, chargesMode,
      bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc", logementAdresse: "1 rue", referenceBail: "BAIL-1", exp, f: new Fusion(),
    }).html;

  it("« (inchangé) » s'accorde avec le libellé des charges", () => {
    expect(chargesInchangees("provision")).toBe("inchangée");
    expect(chargesInchangees("forfait")).toBe("inchangé");
    expect(chargesInchangees(null)).toBe("montant inchangé");
    expect(revision("provision")).toContain("Provision sur charges (inchangée)");
    expect(revision("forfait")).toContain("Forfait de charges (inchangé)");
    expect(revision(null)).toContain("Provision ou forfait de charges (montant inchangé)");
  });

  it("le reçu de dépôt cite « Article 22 », au singulier", () => {
    const html = construireRecuDepot({
      reference: "DEP-1", dateVersement: "2026-11-23", montantVerse: 700, moyen: "virement", versant: "Julie Leblanc", depotConvenu: 700,
      totalEncaisse: 700, plafond: "un mois de loyer hors charges", meuble: false, bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc",
      logementAdresse: "1 rue", referenceBail: "BAIL-1", dateBail: "2026-09-01", exp, f: new Fusion(),
    }).html;
    expect(html).toContain("Article 22 de la loi n° 89-462 du 6 juillet 1989");
    expect(html).not.toContain("Articles 22");
  });
});

describe("courriers avec signature et lignes de total (C45, C51, C53)", () => {
  it("avis d'échéance : la ligne de total et « Fait à » portent leurs classes de mise en page", () => {
    const html = construireAvisEcheance({
      reference: "AVIS-1", periode: "2026-03-01", prorata: false, dateBail: "2025-10-15", dateFinBail: null, dateEcheance: "2026-03-05",
      loyerHc: 700, charges: 60, chargesMode: "provision", montantDu: 760, arriere: 0, lieuPaiement: "Virement bancaire.", iban: null,
      bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc", logementAdresse: "1 rue", referenceBail: "BAIL-1", exp, typeOrganisation: "proprietaire_direct", f: new Fusion(), jour: "2026-02-20",
    }).html;
    expect(html).toContain('<table class="ligne-total"><tbody><tr class="total"><td><b>Total du terme</b>');
    expect(html).toContain('<p class="fait-a">Fait à ');
    expect(texteDe(html)).toContain("Lieu de paiement prévu au bail : Virement bancaire.");
    expect(texteDe(html)).not.toContain("Virement bancaire..");
  });

  it("décompte de prorata : la ligne de total reste sous son tableau", () => {
    const html = construireProrata({
      reference: "PRO-1", motif: "entrée", periode: "2026-09-01", dateDebutOccupation: "2026-09-15", dateFinOccupation: null,
      loyerHcPlein: 700, chargesPleines: 60, loyerHcProrate: 373.33, chargesProratees: 32, montantDu: 405.33,
      bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc", logementAdresse: "1 rue", referenceBail: "BAIL-1", exp, f: new Fusion(),
    }).html;
    expect(html).toContain('<table class="ligne-total"><tbody><tr class="total"><td><b>Total dû pour la période</b>');
  });

  // Phase 3 (C34) : l'état des lieux de sortie n'imprime plus de « Total des retenues après vétusté » (les retenues, arrêtées après la
  // signature, sont dans le décompte de restitution) ; ce test vérifiait que ce total restait sous son tableau. Reste l'adresse.
  it("état des lieux de sortie : plus de total des retenues, et un seul point après l'adresse de restitution", () => {
    const f = new Fusion();
    const html = construireEdl({
      type: "sortie", reference: "EDL-1", dateEdl: "2026-10-07", dateEdlEntree: "2025-10-01", signeLe: null, personnesPresentes: "Les parties",
      lignes: [], compteurs: [], cles: [], comparatif: [], observations: null, detecteurFumeePresent: null, detecteurFumeeEtat: null,
      attestationAssuranceFournie: null, adresseRestitutionDepot: "5 rue des Essais, 38000 Grenoble.",
      bailleurNom: f.champ("Claire Moreau", "bailleur"), locatairesNoms: f.champ("Julie Leblanc", "locataire"), logementAdresse: "1 rue",
      referenceBail: "BAIL-1", exp, typeOrganisation: "proprietaire_direct", f,
    }).html;
    expect(html).not.toContain("Total des retenues");
    expect(html).not.toContain('class="ligne-total"');
    expect(texteDe(html)).toContain("5 rue des Essais, 38000 Grenoble.");
    expect(texteDe(html)).not.toContain("Grenoble..");
  });
});

describe("congé du bailleur : un seul point après le texte saisi (C38)", () => {
  // Phase 3, lot 48 (U01) : le congé compare le terme du bail (31/08/2029, rendu par la doublure) au jour réel ; après
  // cette date, la lettre serait refusée (« a pris fin »). L'horloge est figée au jour où le cas a été écrit.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const assembler = async (options: Record<string, string>) => {
    // Phase 3 (C31, C32) : le congé du bailleur se délivre sur un bail actif (le contexte d'essai par défaut est un brouillon).
    const ctx = contexte();
    ctx.bail.etat = "actif";
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    // Textes officiels, lot T1 : en location nue, un congé pour vendre ou pour reprise répond à la question « logement acheté déjà loué ? ».
    const doc = await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", { achete_occupe: "non", ...options });
    if (!("document" in doc)) throw new Error(`congé non assemblé : ${JSON.stringify(doc)}`);
    return texteDe(doc.document.html);
  };

  it("vente : « … de l'acte. », jamais « acte.. »", async () => {
    const texte = await assembler({ motif: "vente", prix_vente: "245000", conditions_vente: "Paiement comptant à la signature de l'acte." });
    // Lot T1 : le libellé suit le texte (« le prix et les conditions de la vente projetée »), sur sa propre ligne.
    expect(texte).toContain("Conditions de la vente projetée : Paiement comptant à la signature de l'acte.");
    expect(texte).not.toContain("acte..");
    const sansPoint = await assembler({ motif: "vente", prix_vente: "245000", conditions_vente: "Paiement comptant" });
    expect(sansPoint).toContain("Conditions de la vente projetée : Paiement comptant.");
    const sansConditions = await assembler({ motif: "vente", prix_vente: "245000" });
    expect(sansConditions).toMatch(/Prix de la vente projetée : 245 000,00 € \([^)]*\)\./);
  });

  it("reprise et motif légitime : le point du modèle ne s'ajoute pas à celui de la saisie", async () => {
    const reprise = await assembler({
      motif: "reprise", beneficiaire_nom: "Marie Dupont", beneficiaire_lien: "fille du bailleur",
      beneficiaire_adresse: "12 rue des Lilas, 69003 Lyon", raisons_reprise: "Elle s'installe à Lyon pour son travail.",
    });
    expect(reprise).toContain("Raisons de la reprise : Elle s'installe à Lyon pour son travail.");
    expect(reprise).not.toContain("travail..");
    expect(reprise).toContain("demeurant 12 rue des Lilas, 69003 Lyon.");
    const motif = await assembler({ motif: "motif_legitime", motif_detail: "Retards de paiement répétés (essai fictif)." });
    expect(motif).toContain("à savoir : Retards de paiement répétés (essai fictif).");
    expect(motif).not.toContain("fictif)..");
  });
});
