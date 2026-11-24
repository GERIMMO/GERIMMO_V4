/**
 * DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D1 — REPRISE après relecture (constats B1, B2, M1, M6, puis M3, M4, M5).
 *
 *  B1 : en agence, la signature électronique n'est pas mise en avant (elle y mène à un refus) : écran d'avant la décision.
 *  B2 : chez le propriétaire direct, elle n'est proposée en premier que si le service est ouvert pour CE document ;
 *       service fermé, le papier est présenté comme la voie qui fonctionne.
 *  M1 : la phrase sur la voie papier est là partout où le bouton électronique est proposé.
 *  M6 : le lien « Journal » du tableau de bord a un sous-titre neutre en agence.
 *  M4 : la mention « Rédigé avec l’aide de l’IA » ne s'affiche que pour un article d'origine « ia ».
 *  M5 : le locataire lit le motif du retrait de SA note, là où il voit son avis.
 *  (M3, le post Facebook : tests/facebook-publication.test.ts. Bases de M4 et M5 : publications-origine-base et
 *   motif-retrait-auteur-base.)
 *
 * Les quatre combinaisons (propriétaire direct / agence × service ouvert / fermé) sont jouées sur chaque écran rendu.
 * Sans base, sans réseau.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";

vi.mock("@/app/actions/signature-bail", () => ({}));
vi.mock("@/app/actions/documents-generes", () => ({ genererDocument: vi.fn() }));
vi.mock("@/app/actions/plan-apurement", () => ({ activerPlanApurement: vi.fn(), annulerPlanApurement: vi.fn(), genererProtocolePlan: vi.fn(), proposerPlanApurement: vi.fn() }));
vi.mock("@/app/actions/incidents-locataire", () => ({ choisirMonCreneau: vi.fn(), noterMonIntervention: vi.fn(), proposerMesCreneaux: vi.fn() }));
vi.mock("@/components/signature-electronique-bail", () => ({ SignatureElectroniqueBail: () => createElement("div", { "data-panneau-electronique": true }, "PANNEAU ÉLECTRONIQUE") }));
vi.mock("@/components/racine-espace-contexte", () => ({ useBaseEspace: () => "/espace/org", useRacineEspace: () => "/espace" }));

import { FinaliserParcoursBail } from "../src/app/agence/[orgId]/baux/[bailId]/finaliser-parcours-bail";
import { SuiviInterventionLocataire, type SuiviIntervention } from "../src/app/locataire/[orgId]/demandes/suivi-intervention";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { LiensTableauDeBord } from "@/components/liens-tableau-de-bord";
import { MentionIaArticle } from "@/components/mention-ia-article";
import { OuvrirSignatureDocument } from "@/components/ouvrir-signature-document";
import { PlanApurementFormulaires, type PlanApurementLu } from "@/components/plan-apurement-formulaires";
import { FournisseurVoiesSignature } from "@/components/voies-signature";
import { modeSelonReglages, voieElectronique, voiesSignature } from "@/lib/signature-ouverture";
import { phraseVoiesSignature } from "@/lib/voie-signature";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

// ── Les deux états du service, tels que le serveur les lit ───────────────────────────────────────────────────────
/** Réglage livré (.env.example) : rien n'est ouvert. */
const FERME = { ZOHO_SIGN_BAIL_ACTIF: "false", ZOHO_SIGN_DOCUMENTS_ACTIF: "false" };
/** Service ouvert pour le bail et les autres documents (compte d'essai du prestataire, sur un poste local). */
const OUVERT = {
  ZOHO_SIGN_BAIL_ACTIF: "true", ZOHO_SIGN_DOCUMENTS_ACTIF: "true", ZOHO_SIGN_ENV: "sandbox",
  ZOHO_SIGN_CLIENT_ID: "fictif", ZOHO_SIGN_CLIENT_SECRET: "fictif", ZOHO_SIGN_REFRESH_TOKEN: "fictif", ZOHO_SIGN_WEBHOOK_SECRET: "fictif",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const voies = (role: "proprietaire_direct" | "admin_agence" | "agent", env: Record<string, string>, lectureSeule = false) => voiesSignature({ org: ORG, role, lectureSeule }, env);
const COMBINAISONS = {
  "propriétaire direct, service ouvert": voies("proprietaire_direct", OUVERT),
  "propriétaire direct, service fermé": voies("proprietaire_direct", FERME),
  "agence, service ouvert": voies("admin_agence", OUVERT),
  "agence, service fermé": voies("admin_agence", FERME),
};
type Combinaison = keyof typeof COMBINAISONS;
const TOUTES = Object.keys(COMBINAISONS) as Combinaison[];
const rendre = (combinaison: Combinaison, element: ReactElement) =>
  renderToStaticMarkup(createElement(FournisseurVoiesSignature, { voies: COMBINAISONS[combinaison] }, element));
/** Le premier texte est écrit avant le second dans la page rendue (c'est l'ordre de l'écran). */
function attendreOrdre(html: string, premier: string, second: string) {
  expect(html.indexOf(premier), `« ${premier} » introuvable`).toBeGreaterThan(-1);
  expect(html.indexOf(second), `« ${second} » introuvable`).toBeGreaterThan(-1);
  expect(html.indexOf(premier), `« ${premier} » doit précéder « ${second} »`).toBeLessThan(html.indexOf(second));
}
const BOUTON_PLEIN = "bg-primary text-primary-foreground";
const bouton = (html: string, libelle: string) => (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find((b) => b.includes(`>${libelle}</button>`));

describe("B1, B2 — l'état de la voie électronique, calculé côté serveur pour ce document et ce profil", () => {
  it("les quatre combinaisons : ouverte ou en préparation pour le propriétaire direct, jamais proposée en agence", () => {
    const partout = (etat: string) => Object.fromEntries(["bail", "devis_artisan", "avenant", "cautionnement", "edl", "protocole_apurement", "autorisation_travaux"].map((c) => [c, etat]));
    // Service ouvert : tous les documents, sauf l'acceptation de devis qui a son propre réglage.
    expect(COMBINAISONS["propriétaire direct, service ouvert"]).toEqual({ ...partout("ouverte"), devis_artisan: "en_preparation" });
    expect(COMBINAISONS["propriétaire direct, service fermé"]).toEqual(partout("en_preparation"));
    expect(COMBINAISONS["agence, service ouvert"]).toEqual(partout("non_proposee"));
    expect(COMBINAISONS["agence, service fermé"]).toEqual(partout("non_proposee"));
    expect(voies("agent", OUVERT)).toEqual(partout("non_proposee"));
    // La supervision qui traverse l'espace d'un propriétaire en lecture seule ne peut rien demander.
    expect(voies("proprietaire_direct", OUVERT, true)).toEqual(partout("non_proposee"));
  });

  it("le réglage est lu document par document : bail seul ouvert, cautionnement suspendu, devis ouvert à part", () => {
    const bailSeul = { ...OUVERT, ZOHO_SIGN_DOCUMENTS_ACTIF: "false" };
    expect(voieElectronique("bail", ORG, true, bailSeul)).toBe("ouverte");
    expect(voieElectronique("edl", ORG, true, bailSeul)).toBe("en_preparation");
    expect(voieElectronique("avenant", ORG, true, bailSeul)).toBe("en_preparation");
    // La fermeture ciblée de l'acte de cautionnement (ZOHO_SIGN_CAUTIONNEMENT_FERME) l'emporte, que le service soit ouvert ou non.
    for (const env of [OUVERT, FERME]) {
      expect(voieElectronique("cautionnement", ORG, true, { ...env, ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBe("suspendue");
      expect(voieElectronique("cautionnement", ORG, false, { ...env, ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBe("non_proposee");
    }
    expect(voieElectronique("avenant", ORG, true, { ...OUVERT, ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBe("ouverte");
    expect(voieElectronique("devis_artisan", ORG, true, { ...OUVERT, ZOHO_SIGN_DEVIS_ACTIF: "true" })).toBe("ouverte");
    // Des identifiants du prestataire incomplets ferment tout, même avec les deux réglages à « true ».
    expect(voieElectronique("bail", ORG, true, { ...OUVERT, ZOHO_SIGN_WEBHOOK_SECRET: "" })).toBe("en_preparation");
    // Un environnement déployé ne s'ouvre jamais sur le compte d'essai du prestataire.
    expect(voieElectronique("bail", ORG, true, { ...OUVERT, VERCEL: "1" })).toBe("en_preparation");
    expect(voieElectronique("bail", ORG, true, { ...OUVERT, VERCEL: "1", ZOHO_SIGN_ENV: "production" })).toBe("ouverte");
  });

  it("une seule règle : le panneau de signature lit le même calcul que les boutons", () => {
    expect(modeSelonReglages("bail", ORG, "zoho", OUVERT)).toBe("sandbox");
    expect(modeSelonReglages("bail", ORG, "zoho", FERME)).toBe("indisponible");
    expect(modeSelonReglages("edl", ORG, "zoho", { ...OUVERT, ZOHO_SIGN_DOCUMENTS_ACTIF: "false" })).toBe("indisponible");
    expect(modeSelonReglages("bail", ORG, "youtrust", OUVERT)).toBe("indisponible");
    const action = lire("src/app/actions/signature-bail.ts");
    expect(action).toContain('const mode = fermeture ? "indisponible" : modeSelonReglages(selection.code, org, fournisseur);');
    // La mise en page de l'espace calcule l'état avec le rôle réel et le donne aux écrans.
    const miseEnPage = lire("src/app/agence/[orgId]/layout.tsx");
    expect(miseEnPage).toContain("voiesSignature({ org: orgId, role, lectureSeule: traverseeLectureSeule })");
    expect(miseEnPage).toContain("<FournisseurVoiesSignature voies={voiesDeSignature}>{children}</FournisseurVoiesSignature>");
  });

  it("les réglages ne sont lus que côté serveur : aucun composant client n'importe le calcul", () => {
    const importateurs = execSync("grep -rl 'signature-ouverture' src --include=*.ts --include=*.tsx", { encoding: "utf8" }).trim().split("\n").sort();
    expect(importateurs).toEqual([
      "src/app/actions/signature-bail.ts",
      "src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/page.tsx",
      "src/app/agence/[orgId]/layout.tsx",
      "src/components/voies-signature.tsx", // un commentaire qui le cite, sans import (vérifié juste dessous)
      "src/lib/voie-signature.ts", // idem
    ]);
    for (const fichier of importateurs) {
      const source = lire(fichier);
      if (/from ["'][^"']*signature-ouverture["']/.test(source)) expect(source.startsWith('"use client"'), fichier).toBe(false);
    }
    expect(lire("src/lib/voie-signature.ts")).not.toContain("process.env");
  });
});

describe("B1, B2 — le bouton et sa phrase, dans les quatre combinaisons", () => {
  const selection = { code: "edl" as const, cibleId: "edl-1" };

  it("le bouton : plein et « Signature électronique » seulement quand la voie est ouverte", () => {
    const html = (c: Combinaison) => rendre(c, createElement(OuvrirSignatureDocument, { orgId: "org", selection }));
    const ouvert = html("propriétaire direct, service ouvert");
    expect(ouvert).toContain(">Signature électronique</button>");
    expect(ouvert).toContain(BOUTON_PLEIN);
    expect(ouvert).toContain('data-signature-electronique="ouverte"');

    const ferme = html("propriétaire direct, service fermé");
    expect(ferme).toContain(">Signature électronique (en préparation)</button>");
    expect(ferme).not.toContain(BOUTON_PLEIN); // en contour : ce n'est pas la voie mise en avant

    // Agence : le bouton d'avant la décision, tel quel, que le service soit ouvert ou non.
    for (const c of ["agence, service ouvert", "agence, service fermé"] as const) {
      expect(html(c), c).toContain(">Signature Zoho · SMS</button>");
      expect(html(c), c).not.toContain(BOUTON_PLEIN);
      expect(html(c), c).not.toContain("Signature électronique");
    }
    // Sans information du serveur (composant rendu seul) : l'écran d'avant, qui ne promet rien.
    expect(renderToStaticMarkup(createElement(OuvrirSignatureDocument, { orgId: "org", selection }))).toContain(">Signature Zoho · SMS</button>");
    // Cautionnement suspendu : dit « suspendue », en contour.
    const suspendu = renderToStaticMarkup(createElement(FournisseurVoiesSignature, { voies: voies("proprietaire_direct", { ...OUVERT, ZOHO_SIGN_CAUTIONNEMENT_FERME: "true" }) },
      createElement(OuvrirSignatureDocument, { orgId: "org", selection: { code: "cautionnement", cibleId: "bail-1" } })));
    expect(suspendu).toContain(">Signature électronique (suspendue)</button>");
    expect(suspendu).not.toContain(BOUTON_PLEIN);
  });

  it("la phrase : l'électronique en premier si elle est ouverte ; sinon le papier est la voie qui fonctionne ; rien en agence", () => {
    expect(phraseVoiesSignature("ouverte", "déposez le document signé."))
      .toBe("La signature électronique vous est proposée en premier. La signature sur papier reste toujours possible : déposez le document signé.");
    expect(phraseVoiesSignature("en_preparation", "déposez le document signé."))
      .toBe("La signature électronique est en préparation. Aujourd’hui, la signature se fait sur papier : déposez le document signé.");
    expect(phraseVoiesSignature("suspendue", "déposez le document signé."))
      .toBe("La signature électronique de ce document est suspendue pour le moment. La signature se fait sur papier : déposez le document signé.");
    expect(phraseVoiesSignature("non_proposee", "déposez le document signé.")).toBeNull();
    // Service fermé : aucune phrase ne dit que l'électronique est « proposée en premier ».
    expect(phraseVoiesSignature("en_preparation", "x")).not.toMatch(/proposée en premier/);
  });
});

describe("B1, B2, M1 — chaque écran qui propose la signature, dans les quatre combinaisons", () => {
  /** Ce que chaque écran doit montrer, selon la combinaison. `pdf` : le libellé du geste papier de cet écran. */
  function verifier(html: string, c: Combinaison, pdf: string) {
    if (c === "propriétaire direct, service ouvert") {
      attendreOrdre(html, ">Signature électronique</button>", pdf); // l'électronique en premier
      expect(bouton(html, "Signature électronique")).toContain(BOUTON_PLEIN);
      expect(html).toContain("La signature électronique vous est proposée en premier. La signature sur papier reste toujours possible : ");
    } else if (c === "propriétaire direct, service fermé") {
      attendreOrdre(html, pdf, ">Signature électronique (en préparation)</button>"); // le papier d'abord
      expect(bouton(html, "Signature électronique (en préparation)")).not.toContain(BOUTON_PLEIN);
      expect(html).toContain("La signature électronique est en préparation. Aujourd’hui, la signature se fait sur papier : ");
      expect(html).not.toContain("proposée en premier");
    } else {
      // Agence : l'état d'avant la décision. Le bouton d'avant, après le PDF ; aucune phrase sur la signature électronique.
      attendreOrdre(html, pdf, ">Signature Zoho · SMS</button>");
      expect(bouton(html, "Signature Zoho · SMS")).not.toContain(BOUTON_PLEIN);
      expect(html).not.toContain("Signature électronique");
      expect(html).not.toContain("signature électronique");
      expect(html).not.toContain("data-voies-signature");
    }
  }

  it.each(TOUTES)("avenant et acte de cautionnement (bouton commun des documents) — %s", (c) => {
    for (const code of ["avenant", "cautionnement"] as const) {
      const html = rendre(c, createElement(BoutonGenererDocument, { orgId: "org", code, cibleId: "bail-1", cheminRetour: "/espace/org/baux/bail-1", libelle: "Générer le PDF du document" }));
      verifier(html, c, "Générer le PDF du document");
    }
  });

  it.each(TOUTES)("état des lieux, étape Validation (même bouton, avec sa propre consigne papier) — %s", (c) => {
    const html = rendre(c, createElement(BoutonGenererDocument, { orgId: "org", code: "edl", cibleId: "edl-1", cheminRetour: "/espace/org", libelle: "Générer le PDF",
      voiePapier: "enregistrez la grille, puis déposez l’état des lieux signé par les parties." }));
    verifier(html, c, ">Générer le PDF</button>");
    if (c.startsWith("propriétaire")) expect(html).toContain("enregistrez la grille, puis déposez l’état des lieux signé par les parties.");
    // La page passe bien cette consigne, et ne cite la signature électronique dans l'étape que si elle est ouverte.
    const page = lire("src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/page.tsx");
    expect(page).toContain('voiePapier="enregistrez la grille, puis déposez l’état des lieux signé par les parties."');
    expect(page).toContain('voieElectronique("edl", orgId, role === "proprietaire_direct" && !traverseeLectureSeule) === "ouverte"');
    expect(page).toMatch(/signatureElectroniqueOuverte\s*\? "Vérifiez le dossier, puis faites-le signer : signature électronique, ou sur papier avec dépôt de la preuve de signature\."\s*: "Vérifiez le dossier, préparez le PDF puis déposez la preuve de signature\."/);
  });

  it.each(TOUTES)("un document sans signature électronique (quittance) ne montre ni bouton ni phrase — %s", (c) => {
    const html = rendre(c, createElement(BoutonGenererDocument, { orgId: "org", code: "quittance", cibleId: "appel-1", cheminRetour: "/espace/org", libelle: "Générer la quittance" }));
    expect(html).not.toMatch(/Signature électronique|Signature Zoho|data-voies-signature/);
  });

  it.each(TOUTES)("accord d'échelonnement — %s", (c) => {
    const plan: PlanApurementLu = { plan_id: "plan-1", etat: "propose", date_arrete: "2026-11-01", dette_initiale: 900, acompte: 0, mensualite: 300, nombre_tranches: 3,
      premiere_echeance: "2026-12-05", tolerance_jours: 5, seuil_caducite: 2, conditions: null, document_id: null, document_signe_id: null, date_acceptation: null,
      clos_le: null, motif_cloture: null, dette_restante: 900, tranches: [] };
    const html = rendre(c, createElement(PlanApurementFormulaires, { orgId: "org", bailId: "bail-1", base: "/espace/org", plan, detteEchue: 900, aujourdhui: "2026-11-24" }));
    verifier(html, c, "Générer le protocole");
    // Un plan clos ne propose plus aucune signature, donc aucune phrase.
    const clos = rendre(c, createElement(PlanApurementFormulaires, { orgId: "org", bailId: "bail-1", base: "/espace/org", plan: { ...plan, etat: "solde" }, detteEchue: 0, aujourdhui: "2026-11-24" }));
    expect(clos).not.toMatch(/Signature électronique|Signature Zoho|data-voies-signature/);
  });

  const parcours = (c: Combinaison) => {
    const proprietaireDirect = c.startsWith("propriétaire");
    return rendre(c, createElement(CompletudeBail.Provider, { value: { manquants: [] } },
      createElement(EtapeComplementsBail.Provider, { value: { etape: "recapitulatif", revision: 1, ouvrir: vi.fn() } },
        createElement(FinaliserParcoursBail, { orgId: "org", bailId: "bail-1", code: "bail_nu", signataires: [], edlId: "edl-1", preparationEdl: null, proprietaireDirect,
          signatureManuelle: createElement("div", { id: "bail-signe" }, "CARTE BAIL SIGNÉ (dépôt papier)") }))));
  };

  it.each(TOUTES)("parcours du bail : état des lieux d'entrée — %s", (c) => {
    const html = parcours(c);
    verifier(html, c, "Compléter la grille");
    // Un seul bouton de signature de l'état des lieux à l'écran, et aucun bloc vide à la place de l'autre.
    expect(html.match(/data-signature-electronique=/g)).toHaveLength(1);
    expect(html).not.toMatch(/<div class="[^"]*"><\/div>/);
  });

  it("parcours du bail, propriétaire direct, service OUVERT : l'électronique d'abord, la carte papier ensuite", () => {
    const html = parcours("propriétaire direct, service ouvert");
    expect(html).toContain('data-ordre-signatures="ouverte"> La signature électronique vous est proposée en premier. La signature sur papier reste toujours possible : déposez le contrat signé dans la carte « Bail signé », plus bas.');
    attendreOrdre(html, "PANNEAU ÉLECTRONIQUE", "CARTE BAIL SIGNÉ");
  });

  it("parcours du bail, propriétaire direct, service FERMÉ : plus de « proposée en premier » ; la carte papier passe devant le panneau", () => {
    const html = parcours("propriétaire direct, service fermé");
    expect(html).toContain('data-ordre-signatures="en_preparation"> La signature électronique est en préparation. Aujourd’hui, la signature se fait sur papier : déposez le contrat signé dans la carte « Bail signé », plus bas.');
    expect(html).not.toContain("proposée en premier");
    attendreOrdre(html, "CARTE BAIL SIGNÉ", "PANNEAU ÉLECTRONIQUE");
  });

  it.each(["agence, service ouvert", "agence, service fermé"] as const)("parcours du bail, %s : ni annonce, ni panneau électronique ; la carte papier reste", (c) => {
    const html = parcours(c);
    expect(html).not.toContain("data-ordre-signatures");
    expect(html).not.toContain("PANNEAU ÉLECTRONIQUE");
    expect(html).toContain("CARTE BAIL SIGNÉ");
  });

  it("catalogue des documents : même règle (le bouton n'apparaît qu'après le choix du dossier, l'ordre se lit dans le code)", () => {
    const source = lire("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx");
    const [avant, pdf, apres, phrase] = [
      '{signature&&<OuvrirSignatureDocument place="avant" enveloppe="" orgId={orgId} selection={signature}/>}',
      '"Générer le PDF"',
      '{signature&&<OuvrirSignatureDocument place="apres" orgId={orgId} selection={signature}/>}',
      '{signature&&<PhraseVoiesSignature code={signature.code} papier="générez le PDF, imprimez-le et faites-le signer par les parties." />}',
    ];
    attendreOrdre(source, avant, pdf);
    attendreOrdre(source, pdf, apres);
    attendreOrdre(source, apres, phrase);
  });

  it("rien n'est retiré de la voie papier : dépôt du bail signé, preuve de signature de l'état des lieux, devis en agence", () => {
    const BAIL = "src/app/agence/[orgId]/baux/[bailId]";
    expect(lire(`${BAIL}/page.tsx`)).toContain("<FormulaireBailSigne orgId={orgId} bailId={bailId} />");
    expect(lire(`${BAIL}/formulaires-bail.tsx`)).toContain('bouton="Déposer le bail signé"');
    expect(lire(`${BAIL}/edl/[edlId]/grille-edl.tsx`)).toContain("État des lieux signé par le bailleur (ou son mandataire) et le locataire");
    // Le modèle suivi (devis d'artisan) : la signature électronique n'est offerte qu'au propriétaire, service ouvert.
    expect(lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx")).toContain('{estProprietaire && (process.env.ZOHO_SIGN_DEVIS_ACTIF === "true" || signatureEnEssai(orgId)) ? <SignatureDevisClient');
  });
});

describe("M6 — le lien « Journal » du tableau de bord", () => {
  it("« votre location » pour le propriétaire, un sous-titre neutre pour l'agence", () => {
    const proprietaire = renderToStaticMarkup(createElement(LiensTableauDeBord, { base: "/espace/org-1" }));
    const agence = renderToStaticMarkup(createElement(LiensTableauDeBord, { base: "/agence/org-1", agence: true }));
    expect(proprietaire).toContain("Actualités et conseils pour votre location");
    expect(agence).toContain("Actualités et conseils de gestion locative");
    expect(agence).not.toContain("votre location");
    expect(agence).toContain('href="/agence/org-1/journal"');
    // Le tableau de bord de l'agence le demande ; celui du propriétaire garde son libellé.
    expect(lire("src/app/agence/[orgId]/page.tsx")).toContain("<LiensTableauDeBord base={base} agence={!estProprietaire} />");
    expect(lire("src/app/agence/[orgId]/accueil-proprietaire.tsx")).toContain("<LiensTableauDeBord base={base} />");
  });
});

describe("M4 — la mention « Rédigé avec l’aide de l’IA » suit l'origine de l'article", () => {
  it("affichée pour un article d'origine « ia », absente pour un article écrit à la main", () => {
    expect(renderToStaticMarkup(createElement(MentionIaArticle, { origine: "ia" }))).toBe('<p data-mention-ia="true">Rédigé avec l’aide de l’IA</p>');
    expect(renderToStaticMarkup(createElement(MentionIaArticle, { origine: "manuel" }))).toBe("");
  });

  it("les deux pages d'article lisent l'origine et la donnent à la mention ; les listes n'en portent pas (M2)", () => {
    for (const page of ["src/app/journal/[slug]/page.tsx", "src/app/agence/[orgId]/journal/[slug]/page.tsx"]) {
      const source = lire(page);
      expect(source, page).toMatch(/\.select\("[^"]*\borigine"\)/);
      expect(source.match(/<MentionIaArticle origine=\{a\.origine\} /g), page).toHaveLength(1);
    }
    for (const liste of ["src/app/journal/page.tsx", "src/app/agence/[orgId]/journal/page.tsx", "src/app/agence/[orgId]/articles-accueil.tsx"]) {
      expect(lire(liste), liste).not.toMatch(/MentionIaArticle|MENTION_IA_ARTICLE/);
    }
    // Données structurées : inchangées (aucune propriété inventée).
    expect(lire("src/lib/donnees-structurees.ts")).not.toMatch(/origine|IA\b/);
  });
});

describe("M5 — le locataire lit le motif du retrait de SA note, là où il voit son avis", () => {
  const suivi: SuiviIntervention = { incident_id: "i-1", etape: "terminee", intervention_id: "m-1", artisan: "Artisan fictif", nb_artisans_consultes: 1, nb_devis_recus: 0,
    rdv_debut: null, rdv_fin: null, terminee_le: "2026-11-20T10:00:00Z", creneaux_a_choisir: 0, mes_creneaux_en_attente: 0, creneaux_refuses: 0, arbitrage: false,
    travaux_realises: "Joint remplacé.", nouvelle_intervention_necessaire: false, photos_apres: [], deja_notee: true };
  const ecran = (s: SuiviIntervention) => renderToStaticMarkup(createElement(SuiviInterventionLocataire, { orgId: "org", suivi: s, creneaux: [], peutAgir: true, interlocuteur: "gestionnaire" }));

  it("note retirée : l'annonce et le motif ; note en place : le remerciement d'avant, inchangé", () => {
    const retiree = ecran({ ...suivi, retrait_de_ma_note: { note_globale: 1, retrait_motif: "Note déposée sur le mauvais dossier." } });
    expect(retiree).toContain("Votre note (1/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l&#x27;artisan. Motif du retrait : « Note déposée sur le mauvais dossier. »");
    expect(retiree).not.toContain("Merci, votre avis");
    for (const sansRetrait of [suivi, { ...suivi, retrait_de_ma_note: null }]) {
      expect(ecran(sansRetrait)).toContain("Merci, votre avis sur cette intervention est enregistré.");
      expect(ecran(sansRetrait)).not.toContain("retirée");
    }
  });

  it("la page ne rattache à un suivi que le retrait de la note du locataire connecté, lu par la fonction réservée à l'auteur", () => {
    const page = lire("src/app/locataire/[orgId]/demandes/page.tsx");
    expect(page).toContain("lireRetraitsDeMesNotes(supabase, orgId),");
    expect(page).toContain('retraitsDeMesNotes.find((r) => r.source === "locataire" && r.intervention_id === s.intervention_id) ?? null');
    // L'espace de l'organisation, lui, ne garde que le retrait de SA note (source « gerant »).
    expect(lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx")).toContain('.find((r) => r.intervention_id === mission.id && r.source === "gerant")?.retrait_motif ?? null');
  });

  it("aucun écran de l'artisan ne lit le motif, et aucun écran ne lit la colonne directement", () => {
    const suspects = execSync("grep -rlE 'retraits_de_mes_notes|lireRetraitsDeMesNotes|phraseNoteRetiree' src --include=*.ts --include=*.tsx", { encoding: "utf8" }).trim().split("\n").sort();
    expect(suspects).toEqual([
      "src/app/agence/[orgId]/incidents/volet-artisan.tsx",
      "src/app/locataire/[orgId]/demandes/page.tsx",
      "src/app/locataire/[orgId]/demandes/suivi-intervention.tsx",
      "src/lib/evaluation-retiree.ts",
    ]);
  });
});
