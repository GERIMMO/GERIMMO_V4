/**
 * PRUDENCES SUR QUATRE POINTS JURIDIQUES DONT LE TEXTE OFFICIEL N'A PAS PU ÊTRE RELU — audit palier 1, lot 33
 * (P0-04, P0-07, P0-08, P0-09 ; 23/11/2026).
 *
 * Règle du plan : quand le texte ne peut pas être ouvert, le point part chez le juriste et Gerimmo garde le
 * comportement le plus prudent — avertir plutôt qu'affirmer, ne pas bloquer sans base. Ce fichier tient donc des
 * RAPPELS et des libellés honnêtes, pas des règles de droit :
 *  - pièces demandées (P0-04) : le « RIB » n'est plus proposé d'un clic ; avant tout bail signé, un rappel dit que
 *    la liste des pièces est encadrée ; le libellé reste libre, rien n'est bloqué ;
 *  - notice d'information (P0-07) : le document et l'écran disent que c'est un résumé, qui ne remplace pas la notice
 *    officielle ;
 *  - congé du bailleur (P0-08) : « à faire relire » pour la vente et la reprise ; l'adresse du bénéficiaire et les
 *    raisons de la reprise ont leur place dans la lettre ; non saisies, la lettre n'est pas générée (comme pour le nom
 *    et le lien, déjà exigés) et l'écran le dit, sans renvoyer vers la fiche du locataire ;
 *  - cautionnement (P0-09) : rappel pour le bailleur en société.
 *  - facture créée depuis Gerimmo par l'artisan (P0-11) : l'écran dit que Gerimmo ne numérote pas et ne contrôle pas
 *    les mentions.
 * Aucun de ces textes ne cite un article que Gerimmo n'a pas pu relire.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
vi.mock("@/app/actions/pieces-demandees", () => ({
  demanderPieceLocataire: vi.fn(), relancerPieceDemandee: vi.fn(), annulerPieceDemandee: vi.fn(),
}));
vi.mock("@/app/actions/documents-generes", () => ({ genererDocument: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/espace/org/baux/b1", useSearchParams: () => new URLSearchParams() }));

import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
import { AVERTISSEMENT_RESUME_NOTICE, assemblerNotice } from "@/lib/documents/modeles/notice";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const source = (chemin: string) => readFileSync(chemin, "utf8");
const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** Aucun numéro d'article ni de texte nouveau dans un rappel : ce que Gerimmo n'a pas relu, il ne le cite pas. */
const SANS_REFERENCE = /\b(article|art\.|décret|arrêté|loi n°|code civil)\b/i;

beforeEach(() => { vi.mocked(chargerContexteBail).mockReset(); });

describe("P0-04 — pièces demandées", () => {
  const CARTE = "src/app/agence/[orgId]/personnes/[personId]/carte-pieces-demandees.tsx";
  const rendre = async (props: Record<string, unknown>) => {
    const { CartePiecesDemandees } = await import("@/app/agence/[orgId]/personnes/[personId]/carte-pieces-demandees");
    return renderToStaticMarkup(createElement(CartePiecesDemandees, { orgId: "org", personId: "p1", demandes: [], ...props } as never));
  };

  it("le « RIB » n'est plus proposé d'un clic ni donné en exemple ; les trois autres demandes fréquentes restent", async () => {
    const html = await rendre({ avantBail: true });
    const boutons = [...html.matchAll(/<button[^>]*type="button"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => texteDe(m[1]).trim());
    expect(boutons).toEqual(["+ Avis d'imposition", "+ Justificatif de domicile", "+ Pièce d'identité"]);
    expect(html).not.toMatch(/\bRIB\b/);
    expect(html).toContain('placeholder="Pièce à demander (ex. : avis d’imposition)"');
    expect(sansCommentaires(source(CARTE))).not.toMatch(/\bRIB\b/);
    expect(sansCommentaires(source("src/app/actions/pieces-demandees.ts"))).not.toMatch(/\bRIB\b/);
  });

  it("avant tout bail signé, la carte rappelle que la liste des pièces est encadrée — sans citer de texte", async () => {
    const html = await rendre({ avantBail: true });
    const rappel = /<p[^>]*data-rappel-pieces-avant-bail[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(texteDe(rappel)).toContain("Avant la signature du bail, les pièces qu'un bailleur peut demander à un candidat locataire ou à sa caution sont encadrées par la réglementation.");
    expect(texteDe(rappel)).toContain("Gerimmo ne contrôle pas ce que vous demandez");
    expect(texteDe(rappel)).not.toMatch(SANS_REFERENCE);
  });

  it("une fois le bail signé, le rappel n'est plus affiché ; le libellé reste libre dans les deux cas", async () => {
    const apres = await rendre({ avantBail: false });
    expect(apres).not.toContain("data-rappel-pieces-avant-bail");
    expect(await rendre({})).not.toContain("data-rappel-pieces-avant-bail");
    for (const html of [apres, await rendre({ avantBail: true })]) {
      const champ = (html.match(/<input[^>]*>/g) ?? []).find((b) => b.includes('name="libelle"')) ?? "";
      expect(champ).toContain('maxLength="120"');
      expect(champ).not.toMatch(/disabled|readonly|pattern=/i);
    }
  });

  it("la fiche de la personne passe « avant bail » tant que la personne n'a aucun bail signé", () => {
    expect(source("src/app/agence/[orgId]/personnes/[personId]/page.tsx")).toContain("avantBail={!estLocataire}");
  });
});

describe("P0-07 — notice d'information", () => {
  it("le document dit, en tête, qu'il est un résumé et ne remplace pas la notice officielle", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const doc = await assemblerNotice({} as unknown as SupabaseClient, "org", "b1");
    if (!("document" in doc)) throw new Error("notice non assemblée");
    const texte = texteDe(doc.document.html);
    expect(texte).toContain("Résumé établi par Gerimmo — annexe au contrat de location");
    expect(texte).toContain(AVERTISSEMENT_RESUME_NOTICE);
    // L'avertissement précède les rubriques : on ne le découvre pas en bas de page.
    expect(texte.indexOf(AVERTISSEMENT_RESUME_NOTICE)).toBeLessThan(texte.indexOf("1 — Le contrat de location"));
    // Le titre sous lequel la signature électronique retrouve la pièce est inchangé.
    expect(doc.titreGed).toBe("Notice d'information (annexe au bail)");
  });

  it("l'avertissement ne promet rien et ne cite aucun texte que Gerimmo n'a pas relu", () => {
    expect(AVERTISSEMENT_RESUME_NOTICE).toBe("Ce document est un résumé établi par Gerimmo. Il ne remplace pas la notice d'information officielle, dont le texte complet est fixé par arrêté : le bailleur la remet au locataire avec le bail.");
    expect(AVERTISSEMENT_RESUME_NOTICE).not.toMatch(/conforme|officiel(le)? de Gerimmo|\b\d{4}\b/);
  });

  it("les deux écrans du bail disent « résumé », demandent de remettre le texte officiel, et ne disent plus que Gerimmo prépare le document", () => {
    const parcours = source("src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx");
    const page = source("src/app/agence/[orgId]/baux/[bailId]/page.tsx");
    for (const s of [parcours, page]) {
      expect(s).toContain("data-notice-resume");
      expect(s).not.toMatch(/Gerimmo prépare le document|Générer la notice|Actualiser la notice/);
    }
    expect(parcours).toContain("Gerimmo en prépare un résumé, pas le texte officiel.");
    expect(parcours).toContain("Gerimmo ne le joint pas à votre place.");
    expect(parcours).toContain('"Actualiser le résumé" : "Générer le résumé"');
    expect(page).toContain("Générer le résumé de la notice (PDF)");
    expect(CATALOGUE_DOCUMENTS.find((d) => d.code === "notice")?.description).toBe("Résumé des droits et obligations. La notice officielle complète reste à remettre avec le bail.");
  });
});

describe("P0-08 — congé du bailleur pour vente ou pour reprise", () => {
  // Phase 3 (C31, C32) : le congé du bailleur se délivre sur un bail actif (le contexte d'essai par défaut est un brouillon).
  const bailActif = () => {
    const ctx = contexte();
    ctx.bail.etat = "actif";
    return ctx;
  };
  const assembler = async (options: Record<string, string>) => {
    vi.mocked(chargerContexteBail).mockResolvedValue(bailActif());
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    const doc = await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", options);
    if (!("document" in doc)) throw new Error(`congé non assemblé : ${JSON.stringify(doc)}`);
    return { texte: texteDe(doc.document.html), manquants: doc.document.manquants };
  };

  it("reprise : l'adresse du bénéficiaire et les raisons saisies sont imprimées dans la lettre", async () => {
    const { texte, manquants } = await assembler({
      motif: "reprise", beneficiaire_nom: "Marie Dupont", beneficiaire_lien: "fille du bailleur",
      beneficiaire_adresse: "12 rue des Lilas, 69003 Lyon", raisons_reprise: "Elle s'installe à Lyon pour son travail",
    });
    expect(texte).toContain("au bénéfice de Marie Dupont , fille du bailleur , demeurant 12 rue des Lilas, 69003 Lyon .");
    expect(texte).toContain("Raisons de la reprise : Elle s'installe à Lyon pour son travail .");
    expect(manquants).not.toContain("adresse du bénéficiaire de la reprise");
    expect(manquants).not.toContain("raisons de la reprise");
  });

  it("reprise : non saisies, elles sont comptées manquantes et la lettre n'est PAS générée — pas de lettre avec des blancs", async () => {
    const { texte, manquants } = await assembler({ motif: "reprise", beneficiaire_nom: "Marie Dupont", beneficiaire_lien: "fille du bailleur" });
    expect(texte).toContain("demeurant adresse du bénéficiaire de la reprise .");
    expect(texte).toContain("Raisons de la reprise : raisons de la reprise .");
    expect(manquants).toEqual(expect.arrayContaining(["adresse du bénéficiaire de la reprise", "raisons de la reprise"]));
    // Ce que fait l'action de génération de cette liste : elle refuse le PDF et nomme ce qui manque.
    const refus = refusDocumentIncomplet({ manquants });
    expect(refus?.erreur).toMatch(/^PDF non généré : 2 informations sont encore obligatoires\./);
    expect(refus?.manquants).toEqual(["adresse du bénéficiaire de la reprise", "raisons de la reprise"]);
  });

  it("reprise complète : plus rien ne manque, la lettre peut être générée", async () => {
    const { manquants } = await assembler({
      motif: "reprise", beneficiaire_nom: "Marie Dupont", beneficiaire_lien: "fille du bailleur",
      beneficiaire_adresse: "12 rue des Lilas, 69003 Lyon", raisons_reprise: "Elle s'installe à Lyon pour son travail",
    });
    expect(refusDocumentIncomplet({ manquants })).toBeNull();
  });

  it("ce qui manque au congé se saisit dans le formulaire du congé : aucun renvoi vers la fiche du locataire", () => {
    const liens = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "personne" as const, entiteId: "locataire-1" }];
    for (const manquant of ["nom du bénéficiaire de la reprise", "lien avec le bailleur", "adresse du bénéficiaire de la reprise", "raisons de la reprise", "motif invoqué"]) {
      expect(lienPourManquant(manquant, "org", liens, "conge_bailleur"), manquant).toBeNull();
      expect(lienPourManquant(manquant, "org", liens, "conge_bailleur", "/espace"), manquant).toBeNull();
    }
    // Les autres manquants du congé gardent leur renvoi, et les autres modèles ne changent pas.
    expect(lienPourManquant("adresse complète, étage, porte", "org", [{ entite: "bail", entiteId: "b1" }, { entite: "lot", entiteId: "l1" }], "conge_bailleur")?.ecran).toBe("fiche du bien");
    expect(lienPourManquant("lien avec le bailleur", "org", liens, "cautionnement")?.ecran).toBe("fiche de la personne");
  });

  it("ce qui est saisi est échappé : une adresse ne peut pas injecter de balise dans la lettre", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(bailActif());
    const rpc = vi.fn(async () => ({ data: "2029-08-31", error: null }));
    const doc = await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", { motif: "reprise", beneficiaire_adresse: "<img src=x onerror=alert(1)>", raisons_reprise: "<script>x</script>" });
    if (!("document" in doc)) throw new Error("congé non assemblé");
    expect(doc.document.html).not.toMatch(/<img src=x|<script>x/);
    expect(doc.document.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("vente et motif légitime : la lettre n'a ni adresse de bénéficiaire ni raisons de reprise", async () => {
    const cas: Record<string, string>[] = [{ motif: "vente", prix_vente: "245000" }, { motif: "motif_legitime", motif_detail: "impayés répétés" }];
    for (const options of cas) {
      const { texte, manquants } = await assembler(options);
      expect(texte).not.toContain("Raisons de la reprise");
      expect(manquants).not.toContain("adresse du bénéficiaire de la reprise");
    }
  });

  it("le catalogue des documents propose aussi les deux précisions", () => {
    const cles = OPTIONS_CATALOGUE.conge_bailleur.map((o) => o.cle);
    expect(cles).toEqual(expect.arrayContaining(["beneficiaire_nom", "beneficiaire_lien", "beneficiaire_adresse", "raisons_reprise"]));
  });

  it("l'écran dit « à faire relire » pour la vente (ouverture par défaut) et le prévoit pour la reprise, pas pour le motif légitime", async () => {
    const { GenererCongeBailleur } = await import("@/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur");
    const html = renderToStaticMarkup(createElement(GenererCongeBailleur, { orgId: "org", bailId: "b1", cheminRetour: "/espace/org/baux/b1", meuble: false, terme: "2029-08-31" }));
    const rappel = /<p[^>]*data-conge-a-faire-relire="vente"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(texteDe(rappel)).toContain("À faire relire avant de notifier. Un congé pour vente doit comporter des mentions précises et reproduire certains textes ; un congé incomplet peut être annulé.");
    expect(texteDe(rappel)).toContain("Gerimmo n'a pas pu comparer ce modèle au texte officiel : il ne garantit pas qu'il soit complet.");
    expect(texteDe(rappel)).not.toMatch(SANS_REFERENCE);
    const ecran = source("src/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur.tsx");
    expect(ecran).toContain('{motif !== "motif_legitime" && (');
    expect(ecran).toContain('id="conge-b-adresse"');
    expect(ecran).toContain('id="conge-b-raisons"');
    expect(ecran).toContain("beneficiaire_adresse: beneficiaireAdresse.trim()");
    expect(ecran).toContain("raisons_reprise: raisonsReprise.trim()");
    // L'écran dit ce qui se passe vraiment (la première rédaction annonçait des blancs « à compléter à la main » : faux).
    expect(ecran).toContain("Gerimmo ne génère pas la lettre tant que le nom du bénéficiaire, son lien avec vous, son adresse et les raisons de la reprise ne sont pas renseignés.");
    expect(ecran).not.toContain("en blanc");
  });
});

describe("P0-11 — facture établie depuis Gerimmo par l'artisan", () => {
  it("le formulaire dit que Gerimmo ne numérote pas et ne contrôle pas les mentions — seulement quand la facture est créée ici", () => {
    const ecran = source("src/app/artisan/missions/[interventionId]/facture/formulaire-facture.tsx");
    const aide = /\{creation && \(\s*<p className=\{CLASSE_AIDE\} data-aide-numero-facture>([\s\S]*?)<\/p>/.exec(ecran)?.[1] ?? "";
    expect(texteDe(aide)).toContain("Gerimmo ne numérote pas à votre place : il vérifie seulement que ce numéro n'est pas déjà utilisé ici.");
    expect(texteDe(aide)).toContain("vous en restez responsable");
    expect(texteDe(aide)).not.toMatch(SANS_REFERENCE);
  });
});

describe("P0-09 — cautionnement demandé par un bailleur en société", () => {
  it("la carte rappelle de vérifier, sans bloquer l'acte et sans citer de texte", async () => {
    const { CarteCautionnement } = await import("@/app/agence/[orgId]/baux/[bailId]/carte-cautionnement");
    const html = renderToStaticMarkup(createElement(CarteCautionnement, { orgId: "org", bailId: "b1", garants: [{ id: "g1", nom: "Paul Garant" }] }));
    const rappel = /<p[^>]*data-rappel-caution-societe[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(texteDe(rappel)).toContain("Bailleur en société (SCI, autre personne morale) : demander une caution n'est pas permis dans tous les cas.");
    expect(texteDe(rappel)).toContain("Gerimmo ne contrôle pas ce point");
    expect(texteDe(rappel)).not.toMatch(SANS_REFERENCE);
    // L'acte reste proposé pour chaque garant.
    expect(texteDe(html)).toContain("Paul Garant");
  });
});
