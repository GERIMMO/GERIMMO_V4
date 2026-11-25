/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D1 (écrans) — un bloc par décision.
 *
 *  Q11 : la signature électronique est proposée EN PREMIER ; la signature sur papier reste toujours possible.
 *  Q18 : le menu reste court ; le tableau de bord mène à Statistiques et au Journal.
 *  Q20 : le client qui a noté lit le motif du retrait de sa note ; l'artisan ne le lit pas.
 *  Q13 : chaque article du Journal porte la mention « Rédigé avec l’aide de l’IA ».
 *
 * Sans base. Les règles de lecture en base de Q20 ont leur test : evaluation-contestee-base.test.ts.
 *
 * REPRISE DU 24/11 (relecture du lot) : la signature électronique n'est mise en avant que pour qui peut s'en servir
 * (propriétaire direct, service ouvert) ; la mention de l'IA suit l'origine de l'article ; seul l'auteur d'une note lit
 * le motif de son retrait. Les tests ci-dessous qui affirmaient l'état d'avant la reprise ont été mis à jour, chacun
 * avec sa raison ; les quatre combinaisons de profil et de service sont jouées dans decisions-24-11-lot-d1-reprise.test.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/signature-bail", () => ({}));

import { OuvrirSignatureDocument } from "@/components/ouvrir-signature-document";
import { FournisseurVoiesSignature } from "@/components/voies-signature";
import { VOIES_NON_PROPOSEES } from "@/lib/voie-signature";
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

  // Reprise (B1, B2) : le bouton n'est plein et nommé « Signature électronique » que si la voie est OUVERTE pour la
  // personne (propriétaire direct, service ouvert). Ce test le rendait sans rien préciser : il précise maintenant l'état.
  it("voie ouverte : le bouton de la voie électronique porte son nom en clair et il est plein (mis en avant)", () => {
    expect(LIBELLE_SIGNATURE_ELECTRONIQUE).toBe("Signature électronique");
    const html = renderToStaticMarkup(createElement(FournisseurVoiesSignature, { voies: { ...VOIES_NON_PROPOSEES, edl: "ouverte" } },
      createElement(OuvrirSignatureDocument, { orgId: "org", selection: { code: "edl", cibleId: "edl-1" } })));
    expect(html).toContain(">Signature électronique</button>");
    expect(html).not.toContain("Zoho");
    expect(html).toContain("bg-primary text-primary-foreground"); // bouton plein, plus un simple contour
  });

  // Reprise (B1, B2) : l'ordre dépend désormais de l'état de la voie. Chaque écran écrit le bouton électronique deux fois,
  // `place="avant"` le geste papier (affiché quand la voie est ouverte) et `place="apres"` (sinon). Ce test tient la moitié
  // « ouverte » dans le code ; l'ordre réellement affiché dans chaque combinaison est vérifié sur les écrans rendus
  // (decisions-24-11-lot-d1-reprise.test.ts).
  it("voie ouverte : partout où les deux voies sont offertes, l'électronique est écrite avant le papier", () => {
    // Bail : le panneau de signature électronique, puis la carte « Bail signé » (dépôt du contrat signé sur papier).
    attendreOrdre(`${BAIL}/finaliser-parcours-bail.tsx`, "<SignatureElectroniqueBail orgId={orgId} bailId={bailId}", "{!lectureSeule && !papierDabord && signatureManuelle}");
    // État des lieux, dans le parcours du bail : le bouton électronique, puis la grille (où se dépose l'état des lieux signé).
    attendreOrdre(`${BAIL}/finaliser-parcours-bail.tsx`, '<OuvrirSignatureDocument place="avant" enveloppe={styles.signatureEdl} orgId={orgId} selection={{ code: "edl", cibleId: edlId }}/>', "Compléter la grille");
    // État des lieux, étape Validation : le bouton commun, puis la zone « Enregistrer et signer ».
    attendreOrdre(`${BAIL}/edl/[edlId]/page.tsx`, '<BoutonGenererDocument orgId={orgId} code="edl"', '<div id="edl-validation" />');
    // Bouton commun des documents, catalogue, accord d'échelonnement : l'électronique avant le PDF à imprimer.
    attendreOrdre("src/components/bouton-generer-document.tsx", '<OuvrirSignatureDocument place="avant"', "onClick={generer}");
    attendreOrdre("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx", '<OuvrirSignatureDocument place="avant"', '"Générer le PDF"');
    attendreOrdre("src/components/plan-apurement-formulaires.tsx", '<OuvrirSignatureDocument place="avant"', "<Protocole orgId");
    // Présentation de l'offre : même ordre (ces textes disent déjà « si le service est ouvert »).
    attendreOrdre("src/app/tarifs/page.tsx", "vous pouvez demander la signature électronique", "Vous pouvez toujours déposer votre bail signé sur papier.");
    attendreOrdre("src/app/agence/[orgId]/abonnement/abonnement-2026.tsx", "Zoho Sign assure la signature électronique", "Vous pouvez toujours déposer votre bail signé sur papier.");
  });

  // Reprise (M1) : la phrase sur la voie papier est écrite une fois (lib/voie-signature.ts) et posée par
  // `PhraseVoiesSignature` partout où le bouton électronique est proposé — plus seulement sur le bail et l'état des lieux.
  it("l'écran dit que le papier reste possible, et rien n'est retiré de la voie papier", () => {
    expect(PAPIER_TOUJOURS_POSSIBLE).toBe("La signature sur papier reste toujours possible");
    const parcours = lire(`${BAIL}/finaliser-parcours-bail.tsx`);
    expect(parcours).toContain('phraseVoiesSignature(voieBail, "déposez le contrat signé dans la carte « Bail signé », plus bas.")'); // bail
    expect(parcours).toContain('<PhraseVoiesSignature code="edl" papier="déposez l’état des lieux signé depuis la grille."'); // état des lieux
    expect(lire(`${BAIL}/edl/[edlId]/page.tsx`)).toContain('voiePapier="enregistrez la grille, puis déposez l’état des lieux signé par les parties."');
    expect(lire("src/components/bouton-generer-document.tsx")).toContain("<PhraseVoiesSignature code={modeleSignature} papier={voiePapier}"); // avenant, cautionnement
    expect(lire("src/components/plan-apurement-formulaires.tsx")).toContain('<PhraseVoiesSignature code="protocole_apurement"');
    expect(lire("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx")).toContain("<PhraseVoiesSignature code={signature.code}");
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
    // Reprise (M6) : l'agence demande son sous-titre neutre pour le Journal.
    expect(lire("src/app/agence/[orgId]/page.tsx")).toContain("<LiensTableauDeBord base={base} agence={!estProprietaire} />");
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

  // Reprise (M5) : seul l'AUTEUR de la note lit le motif. L'écran ne lit plus la colonne : il demande à la base les
  // retraits des notes dont la personne connectée est l'auteur, et ne garde que celui de SA note (source « gerant »).
  it("le dossier de l'intervention, dans l'espace du client, lit le motif et l'affiche pour SA note", () => {
    const volet = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(volet).toContain('.select("id, intervention_id, source, note_globale, retiree_le")');
    expect(volet).toContain('(await lireRetraitsDeMesNotes(supabase, orgId)).find((r) => r.intervention_id === mission.id && r.source === "gerant")?.retrait_motif ?? null');
    expect(volet).toContain("phraseNoteRetiree({ note_globale: noteDuGerant.note_globale, retrait_motif: motifRetraitDeMaNote })");
  });

  // Reprise (M5) : le locataire auteur lit désormais le motif du retrait de SA note (page « Mes demandes ») ; ce test
  // interdisait tout écran du locataire. Il tient toujours l'essentiel : aucun écran de l'ARTISAN, et aucune lecture de
  // la supervision (`evaluations_contestation`) hors de la console.
  it("aucun écran de l'artisan ne lit le motif ; chez le locataire, seule la page de ses demandes lit celui de SA note", () => {
    const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
    });
    const lecteurs = (liste: string[], motif: RegExp) => liste.filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => motif.test(lire(f))).sort();
    const MOTIF = /retrait_motif|phraseNoteRetiree|lireRetraitsDeMesNotes|retraits_de_mes_notes|evaluations_contestation/;
    expect(lecteurs([...fichiers("src/app/artisan"), "src/components/nav-artisan.tsx"], MOTIF)).toEqual([]);
    expect(lecteurs(fichiers("src/app/locataire"), MOTIF)).toEqual([
      "src/app/locataire/[orgId]/demandes/page.tsx",
      "src/app/locataire/[orgId]/demandes/suivi-intervention.tsx",
    ]);
    expect(lecteurs(fichiers("src/app/locataire"), /evaluations_contestation|from\("artisan_evaluations"\)/)).toEqual([]);
    // Ce que l'artisan lit dans le suivi de sa contestation est écrit par la base, sans le motif.
    const migration = lire("supabase/migrations/20261122150000_evaluation_contestee.sql");
    expect(migration).toContain("'Après examen de votre contestation, une évaluation a été retirée. Elle ne compte plus dans votre moyenne, qui est recalculée.'");
  });
});

describe("Q13 — mention « Rédigé avec l’aide de l’IA » sur chaque article", () => {
  // Reprise (M4) : une mention fausse est pire que pas de mention. Elle s'affiche pour un article d'origine « ia »
  // (la parution automatique, valeur par défaut) et non plus « hors de toute condition » : un article écrit à la main
  // par la supervision n'en porte pas.
  it("la mention est visible, avec le texte décidé, sur un article rédigé avec l'aide de l'IA", () => {
    expect(MENTION_IA_ARTICLE).toBe("Rédigé avec l’aide de l’IA");
    const html = renderToStaticMarkup(createElement(MentionIaArticle, { origine: "ia" }));
    expect(html).toBe("<p data-mention-ia=\"true\">Rédigé avec l’aide de l’IA</p>");
    expect(html).not.toMatch(/hidden|sr-only/);
    expect(renderToStaticMarkup(createElement(MentionIaArticle, { origine: "manuel" }))).toBe("");
  });

  it("les deux pages d'article (site public, espace) l'affichent, sans autre condition que l'origine de l'article", () => {
    for (const page of ["src/app/journal/[slug]/page.tsx", "src/app/agence/[orgId]/journal/[slug]/page.tsx"]) {
      const source = lire(page);
      expect(source.match(/<MentionIaArticle /g), page).toHaveLength(1);
      // Sur sa propre ligne, sans « && » devant : elle ne dépend ni de la date ni du chapô, seulement de l'origine lue en base.
      expect(source, page).toMatch(/\n\s*<MentionIaArticle origine=\{a\.origine\} className=\{?[^\n&]*\/>/);
    }
  });

  it("la parution automatique n'est pas touchée par ce lot", () => {
    // Le réglage et la mission de parution ne citent pas la mention : elle n'est qu'un affichage.
    expect(lire("src/lib/missions-planifiees/marketing.ts")).not.toContain("mention-ia-article");
  });
});
