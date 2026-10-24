/**
 * Les courriers du contrat (plan de conformité du 23/10/2026, lot 1B) : textes mot pour mot.
 *  · R03 : confirmation de la souscription (médiateur saisi ou non : décision du dirigeant du 23/10), formulaire de
 *    rétractation, date limite, PDF joint ou adresse ;
 *  · R04 : accusé de résiliation ;
 *  · R01, R37 : les quatre variantes de l'accusé de rétractation d'un abonnement, et celles du passage à l'annuel ;
 *  · un numéro d'article seulement s'il existe avec ce sens dans la version en vigueur : 8.10 (rétractation et
 *    formulaire) ; depuis la V1 du 24/10/2026, le formulaire est celui de la V1 (« Commandé le : »).
 *
 * Relecture adverse du 24/10 (M1) : « lots sous mandat » au pluriel.
 */
import { describe, expect, it } from "vitest";
import {
  PHRASE_MEDIATEUR_EN_COURS,
  courrierAccuseResiliation,
  courrierAccuseRetractation,
  courrierConfirmationSouscription,
  courrierReceptionRetractation,
  declarationRetractation,
  formulaireRetractation,
  phraseMediateurReclamation,
  type Confirmation,
} from "@/lib/courriers-contrat";

const EDITEUR = {
  denomination: "Prénom Nom EI",
  siege: "1 rue de l'Exemple, 75000 Paris",
  email: "contact@example.com",
  telephone: "01 00 00 00 00",
  mediateurNom: null,
  mediateurAdresse: null,
  mediateurSite: null,
};
const AVEC_MEDIATEUR = { ...EDITEUR, mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, 75000 Paris", mediateurSite: "https://mediateur.example.invalid" };

/** Le texte lisible d'un courrier HTML (balises retirées, entités de base rendues, blancs réduits). */
function texte(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

const confirmation = (surcharge: Partial<Confirmation> = {}): Confirmation => ({
  nom: "Camille Exemple",
  organisation: "Espace de Camille",
  estAgence: false,
  souscritLe: new Date("2026-10-26T09:00:00Z"),
  formule: "solo",
  biens: 1,
  periodicite: "mensuel",
  montantCents: 599,
  regime: { nature: "franchise" },
  premierPrelevementLe: new Date("2026-12-26T00:00:00Z"),
  editeur: EDITEUR,
  conditions: { version: "2026-09-30", accepteeLe: new Date("2026-10-26T08:55:00Z") },
  pdfJoint: true,
  lienConditions: "https://gerimmo.example.invalid/conditions",
  ...surcharge,
});

describe("R03 — la confirmation de la souscription", () => {
  it("reprend le texte du plan : souscription, formule, prix, paiement, premier prélèvement, durée, rétractation", () => {
    const c = courrierConfirmationSouscription(confirmation());
    expect(c.sujet).toBe("Confirmation de votre abonnement Gerimmo");
    const t = texte(c.html);
    expect(t).toContain("Bonjour Camille Exemple,");
    expect(t).toContain("Nous confirmons votre abonnement Gerimmo, souscrit le 26 octobre 2026 pour l'espace Espace de Camille.");
    expect(t).toContain("Formule : Solo, jusqu'à 1 bien.");
    expect(t).toContain("Prix : 5,99 € par mois, TVA non applicable, art. 293 B du CGI.");
    expect(t).toContain("Paiement : carte bancaire.");
    expect(t).toContain("Premier prélèvement : 26 décembre 2026.");
    expect(t).toContain("Durée : abonnement à durée indéterminée, facturé chaque mois, résiliable à tout moment pour la prochaine échéance.");
    expect(t).toContain(
      "Droit de rétractation : vous pouvez renoncer à cet abonnement, sans motif, jusqu'au 9 novembre 2026 inclus, avec le bouton « Renoncer au contrat ici » de la page « Mon abonnement » ou avec le formulaire ci-dessous ; vous serez remboursé intégralement sous 14 jours, sur la carte utilisée."
    );
    expect(t).toContain("Vos conditions générales (version du 30 septembre 2026), acceptées le 26 octobre 2026, sont jointes au format PDF.");
    expect(t).not.toMatch(/8\.10|15\.4/);
  });

  it("annuel : douze mois reconduits tacitement, avis entre trois mois et un mois avant l'échéance", () => {
    const t = texte(courrierConfirmationSouscription(confirmation({ periodicite: "annuel", montantCents: 5990 })).html);
    expect(t).toContain("Prix : 59,90 € par an, TVA non applicable, art. 293 B du CGI.");
    expect(t).toContain("Durée : douze mois, reconduits tacitement ; nous vous écrirons entre trois mois et un mois avant chaque échéance.");
  });

  it("décision du 23/10 : sans médiateur saisi, la phrase exacte de l'adhésion en cours ; saisi, ses coordonnées", () => {
    expect(texte(courrierConfirmationSouscription(confirmation()).html)).toContain(PHRASE_MEDIATEUR_EN_COURS);
    expect(PHRASE_MEDIATEUR_EN_COURS).toBe(
      "Médiateur de la consommation : adhésion en cours ; ses coordonnées figureront dans les mentions légales dès qu'elle sera effective."
    );
    const avec = texte(courrierConfirmationSouscription(confirmation({ editeur: AVEC_MEDIATEUR })).html);
    expect(avec).toContain(
      "Médiation : en cas de litige non résolu après une réclamation écrite, vous pouvez saisir gratuitement le médiateur de la consommation : Médiateur fictif, 2 rue Exemple, 75000 Paris, https://mediateur.example.invalid."
    );
    expect(avec).not.toContain("adhésion en cours");
  });

  it("le formulaire de rétractation de la version en vigueur suit, mot pour mot, puis l'identité de l'éditeur", () => {
    const t = texte(courrierConfirmationSouscription(confirmation()).html);
    for (const ligne of formulaireRetractation(EDITEUR)) expect(t).toContain(texte(ligne));
    expect(t).toContain("À l'attention de Prénom Nom EI, 1 rue de l'Exemple, 75000 Paris, contact@example.com :");
    // Intégration des textes du 24/10 : le formulaire de la V1 (article 8.10), et non plus celui du 30/09.
    expect(t).toContain("Commandé le (*)/reçu le (*) :");
    expect(t).not.toContain("Souscrit le :");
    expect(t).toContain("Prénom Nom EI — 1 rue de l'Exemple, 75000 Paris — contact@example.com — 01 00 00 00 00");
  });

  it("sans PDF (version non archivée, rendu impossible), l'adresse des conditions remplace la pièce jointe", () => {
    const t = texte(courrierConfirmationSouscription(confirmation({ pdfJoint: false })).html);
    expect(t).toContain("Vos conditions générales (version du 30 septembre 2026), acceptées le 26 octobre 2026, sont consultables en ligne : https://gerimmo.example.invalid/conditions");
    expect(t).not.toContain("jointes au format PDF");
  });

  it("un fait d'éditeur manquant est signalé dans le formulaire, jamais inventé", () => {
    expect(formulaireRetractation({ ...EDITEUR, siege: null })[1]).toContain("[adresse du siège à compléter]");
  });
});

describe("R04 — l'accusé de la résiliation", () => {
  it("date et heure de Paris, fin du contrat, accès payé entier, lecture seule ensuite, annulation possible", () => {
    const c = courrierAccuseResiliation({
      organisation: "Espace de Camille",
      formule: "bailleur",
      estAgence: false,
      notifieeLe: new Date("2026-11-03T13:05:00Z"),
      periodeFin: "2026-11-26T09:00:00Z",
    });
    expect(c.sujet).toBe("Votre résiliation Gerimmo est enregistrée");
    const t = texte(c.html);
    expect(t).toContain("Nous avons bien reçu, le 3 novembre 2026 à 14 h 05 (heure de Paris), la résiliation de votre abonnement Gerimmo (formule Bailleur, espace Espace de Camille).");
    expect(t).toContain("Votre contrat prend fin le 26 novembre 2026. D'ici là, votre accès payé reste entier et aucun nouveau prélèvement n'aura lieu.");
    expect(t).toContain("Ensuite, votre compte passe en lecture seule ; rien n'est supprimé du seul fait de la résiliation.");
    expect(t).toContain("Vous pouvez annuler cette résiliation depuis « Mon abonnement » jusqu'au 26 novembre 2026.");
  });
});

describe("R01, R37 — l'accusé de la rétractation", () => {
  const declareeLe = new Date("2026-10-30T15:42:00Z");
  const declaration = declarationRetractation({
    nature: "abonnement",
    formule: "solo",
    estAgence: false,
    organisation: "Espace de Camille",
    reference: new Date("2026-10-26T09:00:00Z"),
    nom: "Camille Exemple",
  });

  it("la déclaration reprend formule, date de souscription, espace et nom", () => {
    expect(declaration).toBe("Je renonce à mon abonnement Gerimmo, formule Solo, souscrit le 26 octobre 2026 pour l'espace Espace de Camille. Nom : Camille Exemple.");
  });

  const variantes: [string, number, string | null, string[], string[]][] = [
    ["un paiement a eu lieu, essai terminé", 599, null,
      ["Nous vous remboursons 5,99 € au plus tard le 13 novembre 2026, sur la carte utilisée, sans frais.", "Votre compte passe en lecture seule ; vos données restent consultables et exportables ; rien n'est supprimé."],
      ["Aucun prélèvement", "essai gratuit continue"]],
    ["un paiement a eu lieu, essai en cours", 599, "2026-12-25",
      ["Nous vous remboursons 5,99 €", "Votre essai gratuit continue jusqu'au 25 décembre 2026 inclus."],
      ["lecture seule", "Aucun prélèvement"]],
    ["aucun paiement, essai en cours", 0, "2026-12-25",
      ["Aucun prélèvement n'a eu lieu ; rien ne vous sera prélevé.", "Votre essai gratuit continue jusqu'au 25 décembre 2026 inclus."],
      ["Nous vous remboursons", "lecture seule"]],
    ["aucun paiement, essai terminé", 0, null,
      ["Aucun prélèvement n'a eu lieu ; rien ne vous sera prélevé.", "Votre compte passe en lecture seule ; vos données restent consultables et exportables ; rien n'est supprimé."],
      ["Nous vous remboursons", "essai gratuit continue"]],
  ];
  it.each(variantes)("abonnement — %s", (_nom, montant, essaiFin, presents, absents) => {
    const c = courrierAccuseRetractation({ nature: "abonnement", organisation: "Espace de Camille", declaration, declareeLe, montantRembourseCents: montant, essaiFin });
    expect(c.sujet).toBe("Accusé de réception de votre rétractation");
    const t = texte(c.html);
    expect(t).toContain(`Nous avons bien reçu, le 30 octobre 2026 à 16 h 42 (heure de Paris), votre déclaration : « ${declaration} »`);
    expect(t).toContain("Votre abonnement a pris fin à cette date.");
    for (const p of presents) expect(t).toContain(p);
    for (const a of absents) expect(t).not.toContain(a);
  });

  it("passage à l'annuel déjà effectué : retour au mensuel et remboursement intégral de l'échéance annuelle", () => {
    const decl = declarationRetractation({ nature: "passage_annuel", formule: "solo", estAgence: false, organisation: "Espace de Camille", reference: new Date("2026-10-20T10:00:00Z"), nom: "Camille Exemple" });
    expect(decl).toBe("Je renonce au passage de mon abonnement Gerimmo à la formule annuelle, demandé le 20 octobre 2026, pour l'espace Espace de Camille. Nom : Camille Exemple.");
    const t = texte(courrierAccuseRetractation({ nature: "passage_annuel", organisation: "Espace de Camille", declaration: decl, declareeLe, montantRembourseCents: 5990, essaiFin: null, passageEffectue: true, mensualiteCents: 599 }).html);
    expect(t).toContain("Votre abonnement redevient mensuel à compter de ce jour.");
    // Relecture adverse du 24/10 (M7) : le retour au mensuel ouvre un cycle ce jour-là, la première mensualité est
    // prélevée aussitôt — l'accusé le dit, avec son montant.
    expect(t).toContain("Une première mensualité de 5,99 € est prélevée ce jour, puis chaque mois à la même date.");
    expect(t).toContain("Nous vous remboursons 59,90 € au plus tard le 13 novembre 2026, sur la carte utilisée, sans frais.");
    const sansMontant = texte(courrierAccuseRetractation({ nature: "passage_annuel", organisation: "E", declaration: decl, declareeLe, montantRembourseCents: 5990, essaiFin: null, passageEffectue: true }).html);
    expect(sansMontant).toContain("Une première mensualité, au prix mensuel de votre formule, est prélevée ce jour");
  });

  it("passage à l'annuel encore programmé : l'abonnement reste mensuel, rien à rembourser", () => {
    const t = texte(courrierAccuseRetractation({ nature: "passage_annuel", organisation: "E", declaration: "Je renonce au passage de mon abonnement.", declareeLe, montantRembourseCents: 0, essaiFin: null, passageEffectue: false }).html);
    expect(t).toContain("Votre abonnement reste mensuel : le passage à la formule annuelle n'aura pas lieu.");
    expect(t).toContain("Aucun prélèvement annuel n'a eu lieu ; rien ne vous sera prélevé à ce titre.");
    expect(t).not.toContain("Nous vous remboursons");
  });
});

describe("R05 — la phrase du médiateur à la clôture d'une réclamation", () => {
  it("coordonnées si saisies, sinon la phrase exacte de l'adhésion en cours", () => {
    expect(phraseMediateurReclamation(AVEC_MEDIATEUR)).toBe(
      "Si cette réponse ne vous satisfait pas, vous pouvez saisir gratuitement le médiateur de la consommation : Médiateur fictif, 2 rue Exemple, 75000 Paris, https://mediateur.example.invalid."
    );
    expect(phraseMediateurReclamation(EDITEUR)).toBe(PHRASE_MEDIATEUR_EN_COURS);
  });
});

describe("relecture adverse du 24/10 (M1) : le pluriel de la capacité", () => {
  const base: Confirmation = {
    nom: null, organisation: "Agence fictive", estAgence: true, souscritLe: new Date("2026-10-26T09:00:00Z"), formule: null, biens: 12,
    periodicite: "mensuel", montantCents: 4900, regime: { nature: "franchise" }, premierPrelevementLe: new Date("2026-10-26T09:00:00Z"),
    editeur: EDITEUR, conditions: null, pdfJoint: false, lienConditions: null,
  };
  it("« jusqu'à 12 lots sous mandat », « jusqu'à 1 lot sous mandat », « jusqu'à 3 biens »", () => {
    expect(texte(courrierConfirmationSouscription(base).html)).toContain("jusqu'à 12 lots sous mandat");
    expect(texte(courrierConfirmationSouscription({ ...base, biens: 1 }).html)).toContain("jusqu'à 1 lot sous mandat");
    expect(texte(courrierConfirmationSouscription({ ...base, estAgence: false, formule: "bailleur", biens: 3 }).html)).toContain("jusqu'à 3 biens");
  });
});

describe("relecture adverse du 24/10 (I4) : l'accusé de réception de la déclaration, sans délai", () => {
  it("date et heure de Paris, déclaration, remboursement à venir sous quatorze jours, second courriel annoncé", () => {
    const t = texte(courrierReceptionRetractation({ nature: "abonnement", organisation: "E", declaration: "Je renonce à mon abonnement Gerimmo.", declareeLe: new Date("2026-10-30T15:42:00Z") }).html);
    expect(t).toContain("Nous avons bien reçu, le 30 octobre 2026 à 16 h 42 (heure de Paris), votre déclaration : « Je renonce à mon abonnement Gerimmo. »");
    expect(t).toContain("ce que vous avez payé vous sera remboursé intégralement au plus tard le 13 novembre 2026, sur la carte utilisée, sans frais.");
    expect(t).toContain("Un second courriel vous confirmera l'exécution et le montant remboursé.");
    expect(t).not.toContain("a pris fin");
  });
});
