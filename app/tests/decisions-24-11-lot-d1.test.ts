/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D1 (écrans) — un bloc par décision.
 *
 *  Q11 : la signature électronique est proposée EN PREMIER ; la signature sur papier reste toujours possible.
 *  Q18 : le menu reste court ; le tableau de bord mène à Statistiques et au Journal.
 *  Q20 : le client qui a noté lit le motif du retrait de sa note ; l'artisan ne le lit pas.
 *  Q13 : chaque article du Journal porte la mention « Rédigé avec l’aide de l’IA ».
 *
 * Sans base. Les règles de lecture en base de Q20 ont leur test : evaluation-contestee-base.test.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/signature-bail", () => ({}));

import { OuvrirSignatureDocument } from "@/components/ouvrir-signature-document";
import { LiensTableauDeBord } from "@/components/liens-tableau-de-bord";
import { MENTION_IA_ARTICLE, MentionIaArticle } from "@/components/mention-ia-article";
import { phraseNoteRetiree } from "@/lib/evaluation-retiree";
import { navigationEspace } from "@/lib/navigation-espace";
import { LIBELLE_SIGNATURE_ELECTRONIQUE, PAPIER_TOUJOURS_POSSIBLE } from "@/lib/textes-signature-actes";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
/** Dans ce fichier, `premier` est écrit AVANT `second` (c'est l'ordre d'affichage à l'écran). */
function attendreOrdre(chemin: string, premier: string, second: string) {
  const source = lire(chemin);
  expect(source.indexOf(premier), `${chemin} : « ${premier} » introuvable`).toBeGreaterThan(-1);
  expect(source.indexOf(second), `${chemin} : « ${second} » introuvable`).toBeGreaterThan(-1);
  expect(source.indexOf(premier), `${chemin} : « ${premier} » doit précéder « ${second} »`).toBeLessThan(source.lastIndexOf(second));
}

describe("Q11 — signature électronique proposée en premier, papier toujours possible", () => {
  const BAIL = "src/app/agence/[orgId]/baux/[bailId]";

  it("le bouton de la voie électronique porte son nom en clair et il est plein (mis en avant)", () => {
    expect(LIBELLE_SIGNATURE_ELECTRONIQUE).toBe("Signature électronique");
    const html = renderToStaticMarkup(createElement(OuvrirSignatureDocument, { orgId: "org", selection: { code: "edl", cibleId: "edl-1" } }));
    expect(html).toContain(">Signature électronique</button>");
    expect(html).not.toContain("Zoho");
    expect(html).toContain("bg-primary text-primary-foreground"); // bouton plein, plus un simple contour
  });

  it("partout où les deux voies sont offertes, l'électronique est écrite avant le papier", () => {
    // Bail : le panneau de signature électronique, puis la carte « Bail signé » (dépôt du contrat signé sur papier).
    attendreOrdre(`${BAIL}/finaliser-parcours-bail.tsx`, "<SignatureElectroniqueBail orgId={orgId} bailId={bailId}", "{!lectureSeule && signatureManuelle}");
    // État des lieux, dans le parcours du bail : le bouton électronique, puis la grille (où se dépose l'état des lieux signé).
    attendreOrdre(`${BAIL}/finaliser-parcours-bail.tsx`, 'selection={{ code: "edl", cibleId: edlId }}', "Compléter la grille");
    // État des lieux, étape Validation : le bouton commun (électronique d'abord), puis la zone « Enregistrer et signer ».
    attendreOrdre(`${BAIL}/edl/[edlId]/page.tsx`, '<BoutonGenererDocument orgId={orgId} code="edl"', '<div id="edl-validation" />');
    // Bouton commun des documents, catalogue, accord d'échelonnement : l'électronique avant le PDF à imprimer.
    attendreOrdre("src/components/bouton-generer-document.tsx", "<OuvrirSignatureDocument", "onClick={generer}");
    attendreOrdre("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx", "<OuvrirSignatureDocument", '"Générer le PDF"');
    attendreOrdre("src/components/plan-apurement-formulaires.tsx", "<OuvrirSignatureDocument", "<Protocole orgId");
    // Présentation de l'offre : même ordre.
    attendreOrdre("src/app/tarifs/page.tsx", "vous pouvez demander la signature électronique", "Vous pouvez toujours déposer votre bail signé sur papier.");
    attendreOrdre("src/app/agence/[orgId]/abonnement/abonnement-2026.tsx", "Zoho Sign assure la signature électronique", "Vous pouvez toujours déposer votre bail signé sur papier.");
  });

  it("l'écran dit que le papier reste possible, et rien n'est retiré de la voie papier", () => {
    expect(PAPIER_TOUJOURS_POSSIBLE).toBe("La signature sur papier reste toujours possible");
    const parcours = lire(`${BAIL}/finaliser-parcours-bail.tsx`);
    expect(parcours.match(/\{PAPIER_TOUJOURS_POSSIBLE\}/g)).toHaveLength(2); // bail, état des lieux
    expect(lire(`${BAIL}/edl/[edlId]/page.tsx`)).toContain("{PAPIER_TOUJOURS_POSSIBLE}");
    const page = lire(`${BAIL}/page.tsx`);
    expect(page).toContain("Signature sur papier, toujours possible. ");
    // La voie papier garde ses écrans : dépôt du bail signé, preuve de signature de l'état des lieux.
    expect(page).toContain("<FormulaireBailSigne orgId={orgId} bailId={bailId} />");
    expect(lire(`${BAIL}/formulaires-bail.tsx`)).toContain('bouton="Déposer le bail signé"');
    expect(lire(`${BAIL}/edl/[edlId]/grille-edl.tsx`)).toContain("État des lieux signé par le bailleur (ou son mandataire) et le locataire");
  });
});

describe("Q18 — menu court, liens vers Statistiques et Journal sur le tableau de bord", () => {
  it("le bloc mène aux deux écrans de l'espace", () => {
    const html = renderToStaticMarkup(createElement(LiensTableauDeBord, { base: "/espace/org-1" }));
    expect(html).toContain('href="/espace/org-1/statistiques"');
    expect(html).toContain('href="/espace/org-1/journal"');
    expect(html).toContain(">Statistiques</b>");
    expect(html).toContain(">Journal</b>");
  });

  it("les deux tableaux de bord (propriétaire, agence) l'affichent", () => {
    expect(lire("src/app/agence/[orgId]/accueil-proprietaire.tsx")).toContain("<LiensTableauDeBord base={base} />");
    expect(lire("src/app/agence/[orgId]/page.tsx")).toContain("<LiensTableauDeBord base={base} />");
  });

  it("le menu du propriétaire reste court : ni Statistiques ni Journal n'y entrent", () => {
    const menu = navigationEspace({ orgId: "org-1", role: "proprietaire_direct", badges: {} });
    const chemins = [...menu.principales, ...menu.secondaires, ...menu.barreBasse].map((e) => e.href);
    expect(chemins.filter((c) => /\/(statistiques|journal)$/.test(c))).toEqual([]);
    expect(menu.principales).toHaveLength(6);
    expect(menu.secondaires).toHaveLength(4);
  });

  it("aucun droit n'est ouvert : les deux pages gardent le contrôle d'accès de l'espace", () => {
    for (const page of ["statistiques/page.tsx", "journal/page.tsx", "journal/[slug]/page.tsx"]) {
      expect(lire(`src/app/agence/[orgId]/${page}`), page).toContain("await verifierAccesEspace(orgId)");
    }
  });
});

describe("Q20 — le client qui a noté lit le motif du retrait, l'artisan non", () => {
  it("la phrase du client porte le motif", () => {
    expect(phraseNoteRetiree({ note_globale: 2, retrait_motif: "  Note déposée sur le mauvais dossier.  " })).toBe(
      "Votre note (2/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l'artisan. Motif du retrait : « Note déposée sur le mauvais dossier. »");
    // Sans motif lisible, l'annonce reste entière et n'affiche pas de guillemets vides.
    expect(phraseNoteRetiree({ note_globale: 2, retrait_motif: null })).toBe(
      "Votre note (2/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l'artisan.");
  });

  it("le dossier de l'intervention, dans l'espace du client, lit le motif et l'affiche pour SA note", () => {
    const volet = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(volet).toContain('.select("id, intervention_id, source, note_globale, retiree_le, retrait_motif")');
    expect(volet).toContain("phraseNoteRetiree(noteDuGerant)");
  });

  it("aucun écran de l'artisan ni du locataire ne lit le motif", () => {
    const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
    });
    const suspects = [...fichiers("src/app/artisan"), ...fichiers("src/app/locataire"), "src/components/nav-artisan.tsx"]
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /retrait_motif|phraseNoteRetiree|evaluations_contestation/.test(lire(f)));
    expect(suspects).toEqual([]);
    // Ce que l'artisan lit dans le suivi de sa contestation est écrit par la base, sans le motif.
    const migration = lire("supabase/migrations/20261122150000_evaluation_contestee.sql");
    expect(migration).toContain("'Après examen de votre contestation, une évaluation a été retirée. Elle ne compte plus dans votre moyenne, qui est recalculée.'");
  });
});

describe("Q13 — mention « Rédigé avec l’aide de l’IA » sur chaque article", () => {
  it("la mention est visible, avec le texte décidé", () => {
    expect(MENTION_IA_ARTICLE).toBe("Rédigé avec l’aide de l’IA");
    const html = renderToStaticMarkup(createElement(MentionIaArticle, {}));
    expect(html).toBe("<p data-mention-ia=\"true\">Rédigé avec l’aide de l’IA</p>");
    expect(html).not.toMatch(/hidden|sr-only/);
  });

  it("les deux pages d'article (site public, espace) l'affichent, hors de toute condition", () => {
    for (const page of ["src/app/journal/[slug]/page.tsx", "src/app/agence/[orgId]/journal/[slug]/page.tsx"]) {
      const source = lire(page);
      expect(source.match(/<MentionIaArticle /g), page).toHaveLength(1);
      // Sur sa propre ligne, sans « && » devant : elle ne dépend ni de la date ni du chapô.
      expect(source, page).toMatch(/\n\s*<MentionIaArticle className=\{?[^\n&]*\/>/);
    }
  });

  it("la parution automatique n'est pas touchée par ce lot", () => {
    // Le réglage et la mission de parution ne citent pas la mention : elle n'est qu'un affichage.
    expect(lire("src/lib/missions-planifiees/marketing.ts")).not.toContain("mention-ia-article");
  });
});
