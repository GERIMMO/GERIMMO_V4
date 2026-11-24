/**
 * LOT D7 — décision du dirigeant du 24/11/2026 (Q7) : le vendeur est un ENTREPRENEUR INDIVIDUEL sous un nom commercial,
 * pas une société ; les ventes peuvent s'ouvrir sans médiateur de la consommation, pas sans vendeur.
 *
 * Ce que ce fichier prouve, sans base ni réseau :
 *  1. la garde : ouverture possible sans médiateur, impossible sans vendeur (même règle levée, pour la première
 *     souscription d'un particulier) ;
 *  2. le rendu des mentions légales, des conditions, de la confidentialité et de ce que Gerimmo écrit autour de la
 *     facture d'abonnement (pied de facture, courriel de confirmation), avec et sans médiateur ;
 *  3. aucun mot de société (« société », « SAS », « capital », « RCS ») dans l'identification de ce vendeur ;
 *  4. la saisie : la mention « EI » est exigée avec le nom d'un entrepreneur individuel, le capital refusé.
 *
 * Source de la mention « EI » : fiches officielles d'Entreprendre Service Public, lues le 24/11/2026 —
 * https://entreprendre.service-public.gouv.fr/vosdroits/F37351 (site internet, « vérifié le 13 octobre 2026 ») et
 * https://entreprendre.service-public.gouv.fr/vosdroits/F31808 (facture, « vérifié le 11 août 2026 »).
 *
 * AUCUNE DONNÉE RÉELLE : un vendeur fictif de la même forme que le vrai (nom, prénom, « EI », nom commercial entre
 * parenthèses dans la forme, SIRET de 14 chiffres). Les vraies valeurs se saisissent en console le jour de la publication.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRESTATAIRES, cleCoordonnees, estEntrepreneurIndividuel, faitsACompleter, faitsManquants, porteLaMentionEI, sirenEtSiret } from "../src/lib/editeur";
import { motifIdentiteEditeur, MOTIF_IDENTITE_EDITEUR, MOTIF_IDENTITE_EDITEUR_ESSAI } from "../src/lib/garde-souscription";
import { validerIdentite } from "../src/lib/identite-editeur";
import { courrierConfirmationSouscription, formulaireRetractation, identiteEditeurEnLigne, phraseMediateurReclamation, type Confirmation } from "../src/lib/courriers-contrat";
import { piedDeFacturePour } from "../src/lib/stripe";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/conservation-publique", () => ({ lireDureesPubliques: async () => ({ regles: [], indisponible: false }) }));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }) }));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Mentions from "../src/app/mentions-legales/page";
import Confidentialite from "../src/app/confidentialite/page";
import Conditions from "../src/app/conditions/page";

/** Le vendeur fictif : un entrepreneur individuel sous un nom commercial, sans capital ni numéro de TVA. */
const VENDEUR: Record<string, string | null> = {
  denomination: "MARTIN Camille EI",
  forme: "Entrepreneur individuel (nom commercial EXEMPLEXPERT)",
  capital: null,
  siege: "1 rue de l'Exemple, 75000 Paris",
  rcs: "RNE 000 000 000",
  siret: "00000000000018",
  tvaIntracommunautaire: null,
  directeurPublication: "MARTIN Camille",
  email: "contact@example.test",
  telephone: "01 00 00 00 00",
  mediateurNom: null,
  mediateurAdresse: null,
  mediateurSite: null,
};
const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, 75000 Paris", mediateurSite: "https://example.test/mediation" };
const PRESTATAIRES_FICTIFS = { localisationBan: "France", ...Object.fromEntries(PRESTATAIRES.map((p) => [cleCoordonnees(p), "Coordonnées fictives"])) };

const texte = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Les mots qui ne conviennent qu'à une société. « capital » et « société » en mots entiers, sigles en majuscules. */
const MOTS_DE_SOCIETE = /\bsociétés?\b|\bSAS\b|\bSARL\b|\bcapital\b|\bRCS\b|siège social/i;
const section = (html: string, titre: string) => {
  const debut = html.indexOf(titre);
  expect(debut, titre).toBeGreaterThan(-1);
  return texte(html.slice(debut, html.indexOf("</section>", debut)));
};

beforeEach(() => {
  lecture.valeurs = { ...VENDEUR, ...PRESTATAIRES_FICTIFS };
});

describe("garde : ouverture possible sans médiateur, impossible sans vendeur", () => {
  const particulier = { enEssai: true, blocageIdentiteActif: true, nouvelleSouscriptionParticulier: true };

  it("vendeur complet, aucun médiateur : rien ne ferme la première souscription d'un particulier", () => {
    expect(faitsManquants(VENDEUR)).toEqual([]);
    expect(faitsACompleter(VENDEUR)).toEqual(["le médiateur de la consommation", "l'adresse du médiateur", "le site du médiateur"]);
    expect(motifIdentiteEditeur(VENDEUR, particulier)).toBeNull();
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, enEssai: false })).toBeNull();
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: false })).toBeNull();
  });

  it("vendeur complet, médiateur saisi : rien ne ferme non plus", () => {
    expect(motifIdentiteEditeur({ ...VENDEUR, ...MEDIATEUR }, particulier)).toBeNull();
  });

  it.each(["denomination", "forme", "siege", "rcs", "siret", "directeurPublication", "email", "telephone"])(
    "sans %s : la souscription est fermée, médiateur saisi ou non, règle levée ou non",
    (cle) => {
      for (const mediateur of [{}, MEDIATEUR]) {
        const editeur = { ...VENDEUR, ...mediateur, [cle]: null };
        expect(motifIdentiteEditeur(editeur, particulier)).toBe(MOTIF_IDENTITE_EDITEUR_ESSAI);
        expect(motifIdentiteEditeur(editeur, { ...particulier, enEssai: false })).toBe(MOTIF_IDENTITE_EDITEUR);
        // Règle levée par le superadmin : elle ne vaut pas pour la première souscription d'un particulier.
        expect(motifIdentiteEditeur(editeur, { ...particulier, blocageIdentiteActif: false })).toBe(MOTIF_IDENTITE_EDITEUR_ESSAI);
      }
    },
  );

  it("identité vide : fermée ; la règle levée ne rouvre que ce qui n'est pas une première souscription de particulier", () => {
    expect(motifIdentiteEditeur({}, particulier)).toBe(MOTIF_IDENTITE_EDITEUR_ESSAI);
    expect(motifIdentiteEditeur({}, { ...particulier, blocageIdentiteActif: false })).toBe(MOTIF_IDENTITE_EDITEUR_ESSAI);
    expect(motifIdentiteEditeur({}, { enEssai: false, blocageIdentiteActif: false })).toBeNull();
    expect(motifIdentiteEditeur({}, { enEssai: false, blocageIdentiteActif: true })).toBe(MOTIF_IDENTITE_EDITEUR);
  });

  it("le motif ne parle jamais du médiateur", () => {
    for (const m of [MOTIF_IDENTITE_EDITEUR, MOTIF_IDENTITE_EDITEUR_ESSAI]) expect(m).not.toMatch(/médiateur/i);
  });
});

describe("mentions légales : un entrepreneur individuel", () => {
  it("nom et prénom avec « EI », forme, adresse, immatriculation, SIREN et SIRET, TVA ; ni capital ni mot de société", async () => {
    const html = renderToStaticMarkup(await Mentions());
    const editeur = section(html, "Éditeur");
    expect(editeur).toContain("MARTIN Camille EI — Entrepreneur individuel (nom commercial EXEMPLEXPERT)");
    expect(editeur).toContain("Adresse 1 rue de l'Exemple, 75000 Paris");
    expect(editeur).toContain("Immatriculation RNE 000 000 000");
    expect(editeur).toContain("SIREN 000 000 000");
    expect(editeur).toContain("SIRET 000 000 000 00018");
    // La mention et la référence d'article sont celles déjà présentes dans le code : ni ajoutées, ni changées par ce lot.
    expect(editeur).toContain("TVA non applicable, article 293 B du CGI");
    expect(editeur).not.toContain("TVA intracommunautaire");
    expect(editeur).toContain("Directeur : MARTIN Camille");
    expect(editeur).not.toMatch(MOTS_DE_SOCIETE);
    expect(editeur).not.toContain("(à venir)");
    // Toute la page, hébergeurs fictifs compris : aucun mot de société pour ce vendeur.
    expect(texte(html)).not.toMatch(MOTS_DE_SOCIETE);
    expect(html).not.toContain("Document en cours de finalisation");
  });

  it("sans médiateur : la page dit qu'aucun n'est désigné, où réclamer, et ne promet aucun recours", async () => {
    const mediation = section(renderToStaticMarkup(await Mentions()), "Médiation de la consommation");
    expect(mediation).toContain("Médiateur de la consommation : aucun organisme n’est désigné à ce jour. Ses coordonnées seront publiées sur cette page dès sa désignation.");
    expect(mediation).toContain("En attendant, toute réclamation s’adresse par écrit à l’éditeur");
    expect(mediation).not.toContain("peut recourir gratuitement");
    expect(mediation).not.toMatch(/conforme|adhésion/i);
    expect(mediation).not.toContain("Médiateur fictif");
  });

  it("avec médiateur : ses coordonnées, et le recours gratuit", async () => {
    Object.assign(lecture.valeurs, MEDIATEUR);
    const mediation = section(renderToStaticMarkup(await Mentions()), "Médiation de la consommation");
    expect(mediation).toContain("Médiateur fictif");
    expect(mediation).toContain("2 rue Exemple, 75000 Paris");
    expect(mediation).toContain("https://example.test/mediation");
    expect(mediation).toContain("Après une réclamation écrite, le consommateur peut recourir gratuitement à un médiateur compétent.");
    expect(mediation).not.toContain("aucun organisme n’est désigné");
  });

  it("un SIRET qui n'a pas 14 chiffres s'affiche tel quel, sans SIREN deviné", async () => {
    lecture.valeurs.siret = "en cours";
    const editeur = section(renderToStaticMarkup(await Mentions()), "Éditeur");
    expect(editeur).toContain("SIRET en cours");
    expect(editeur).not.toContain("SIREN");
    expect(sirenEtSiret("000 000 000 00018")).toEqual({ siren: "000 000 000", siret: "000 000 000 00018" });
    expect(sirenEtSiret(null)).toBeNull();
  });
});

describe("conditions de vente : le vendeur et le médiateur", () => {
  it("le formulaire de rétractation s'adresse au vendeur, avec « EI », sans mot de société ni réserve", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const formulaire = texte(html.slice(html.indexOf("Formulaire de rétractation"), html.indexOf("Rayez la mention inutile")));
    expect(formulaire).toContain("À l'attention de MARTIN Camille EI, 1 rue de l'Exemple, 75000 Paris, contact@example.test :");
    expect(formulaire).not.toContain("(à venir)");
    expect(formulaire.replace("prestation de services", "")).not.toMatch(MOTS_DE_SOCIETE);
    expect(html).not.toContain("Document en cours de finalisation");
    // La mention de TVA des conditions est celle déjà présente dans le code.
    expect(texte(html)).toContain("TVA non applicable, article 293 B du code général des impôts : les prix affichés sont les montants payés.");
  });

  it("sans médiateur : l'article 17 dit qu'il sera désigné, sans coordonnées ni conformité affirmée", async () => {
    const article = section(renderToStaticMarkup(await Conditions()), "17. Droit applicable et litiges");
    expect(article).toContain("qui sera désigné aux mentions légales dès l'adhésion de l'Éditeur.");
    expect(article).toContain("la réclamation s'adresse à contact@example.test");
    expect(article).not.toContain("dont relève");
    expect(article).not.toContain("Médiateur fictif");
    expect(article).not.toMatch(/conforme/i);
  });

  it("avec médiateur : l'article 17 donne son nom, son adresse et son site", async () => {
    Object.assign(lecture.valeurs, MEDIATEUR);
    const article = section(renderToStaticMarkup(await Conditions()), "17. Droit applicable et litiges");
    expect(article).toContain("dont relève l'Éditeur : Médiateur fictif, 2 rue Exemple, 75000 Paris, https://example.test/mediation");
    expect(article).not.toContain("sera désigné");
  });

  it("le vendeur n'est nulle part présenté comme une société dans les conditions", async () => {
    const page = texte(renderToStaticMarkup(await Conditions()));
    // Les conditions parlent de sociétés à propos des CLIENTS (SCI, société civile) : on cherche donc les tournures qui
    // qualifieraient l'Éditeur lui-même.
    expect(page).not.toMatch(/Éditeur[^.]{0,80}\b(?:société|SAS|SARL|capital|RCS)\b/i);
    expect(page).not.toMatch(/\b(?:société|SAS|SARL)\b[^.]{0,40}MARTIN Camille/i);
    expect(page).not.toMatch(/capital social|siège social de l'Éditeur|immatriculée au RCS/i);
  });
});

describe("confidentialité : le responsable est un entrepreneur individuel", () => {
  it("nomme le vendeur avec « EI », sa forme et son adresse, sans mot de société", async () => {
    const page = texte(renderToStaticMarkup(await Confidentialite()));
    const phrase = page.slice(page.indexOf("Gerimmo est un service édité par"), page.indexOf("(« l'Éditeur »)"));
    expect(phrase).toContain("édité par MARTIN Camille EI, Entrepreneur individuel (nom commercial EXEMPLEXPERT), établi au 1 rue de l'Exemple, 75000 Paris");
    expect(phrase).not.toMatch(MOTS_DE_SOCIETE);
  });

  it("E141 : la fermeture du compte ne promet plus à tous un téléchargement que seul le titulaire d'un espace trouve", async () => {
    const page = texte(renderToStaticMarkup(await Confidentialite()));
    expect(page).not.toContain("après avoir téléchargé vos données si vous le souhaitez");
    expect(page).toContain(
      "après avoir récupéré vos données si vous le souhaitez : le titulaire d'un espace y télécharge son archive complète ; les autres comptes y demandent une copie des données de leur compte (« Recevoir une copie de mes données ») et s'adressent à leur bailleur pour les données d'une location."
    );
  });
});

describe("facture d'abonnement : ce que Gerimmo écrit (le reste de la facture vient du compte Stripe)", () => {
  const confirmation = (editeur: Record<string, string | null>): Confirmation => ({
    nom: "Dominique Exemple",
    organisation: "Espace de Dominique",
    estAgence: false,
    souscritLe: new Date("2026-12-01T09:00:00Z"),
    formule: "solo",
    biens: 1,
    periodicite: "mensuel",
    montantCents: 599,
    regime: { nature: "franchise" },
    premierPrelevementLe: new Date("2027-02-01T00:00:00Z"),
    editeur,
    conditions: { version: "2026-11-15", accepteeLe: new Date("2026-12-01T08:59:00Z") },
    pdfJoint: false,
    lienConditions: "https://www.gerimmo.test/conditions",
  });

  it("le pied de facture garde la mention et la référence déjà présentes dans le code", () => {
    expect(piedDeFacturePour({ nature: "franchise" })).toBe("TVA non applicable, art. 293 B du CGI.");
    expect(piedDeFacturePour({ nature: "assujetti", tauxPourcent: 20 })).toBeUndefined();
  });

  it("l'identité en ligne et le formulaire de rétractation des courriels portent « EI », sans mot de société", () => {
    expect(identiteEditeurEnLigne(VENDEUR)).toBe("MARTIN Camille EI — 1 rue de l'Exemple, 75000 Paris — contact@example.test — 01 00 00 00 00");
    expect(formulaireRetractation(VENDEUR)[1]).toBe("À l'attention de MARTIN Camille EI, 1 rue de l'Exemple, 75000 Paris, contact@example.test :");
    expect(identiteEditeurEnLigne(VENDEUR)).not.toMatch(MOTS_DE_SOCIETE);
  });

  it("courriel de confirmation sans médiateur : le vendeur, la TVA, et « aucun n'est désigné »", () => {
    const t = texte(courrierConfirmationSouscription(confirmation(VENDEUR)).html);
    expect(t).toContain("MARTIN Camille EI");
    expect(t).toContain("TVA non applicable, art. 293 B du CGI");
    expect(t).toContain("Médiateur de la consommation : aucun n'est désigné à ce jour ; ses coordonnées figureront dans les mentions légales dès sa désignation.");
    expect(t).not.toContain("adhésion en cours");
    expect(t).not.toMatch(/\bSAS\b|\bSARL\b|\bRCS\b|capital social|siège social/);
    expect(phraseMediateurReclamation(VENDEUR)).toBe("Médiateur de la consommation : aucun n'est désigné à ce jour ; ses coordonnées figureront dans les mentions légales dès sa désignation.");
  });

  it("courriel de confirmation avec médiateur : ses coordonnées, sans la phrase d'attente", () => {
    const t = texte(courrierConfirmationSouscription(confirmation({ ...VENDEUR, ...MEDIATEUR })).html);
    expect(t).toContain("vous pouvez saisir gratuitement le médiateur de la consommation : Médiateur fictif, 2 rue Exemple, 75000 Paris, https://example.test/mediation.");
    expect(t).not.toContain("aucun n'est désigné");
  });
});

describe("saisie en console : cohérente avec un entrepreneur individuel", () => {
  const form = (valeurs: Record<string, string | null>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(valeurs)) if (v) f.set(k, v);
    return f;
  };

  it("accepte le vendeur tel qu'il se saisit : sans capital, sans numéro de TVA, sans médiateur", () => {
    const r = validerIdentite(form(VENDEUR));
    expect(r.erreur).toBeUndefined();
    expect(r.valeurs).toMatchObject({ denomination: "MARTIN Camille EI", capital: null, tvaIntracommunautaire: null, mediateurNom: null });
    expect(estEntrepreneurIndividuel(r.valeurs!)).toBe(true);
    expect(faitsManquants(r.valeurs!)).toEqual([]);
  });

  it("exige la mention « EI » ou « entrepreneur individuel » avec le nom", () => {
    expect(validerIdentite(form({ ...VENDEUR, denomination: "MARTIN Camille" })).erreur).toContain("« EI »");
    expect(validerIdentite(form({ ...VENDEUR, denomination: "MARTIN Camille, entrepreneur individuel" })).erreur).toBeUndefined();
    expect(validerIdentite(form({ ...VENDEUR, denomination: "EI MARTIN Camille" })).erreur).toBeUndefined();
    // « EI » en mot entier et en majuscules : ni « Reine », ni « ei ».
    for (const nom of ["MARTIN Reine", "LEIRIS Camille", "martin camille ei", "MEIER Camille"]) expect(porteLaMentionEI(nom), nom).toBe(false);
    for (const nom of ["MARTIN Camille EI", "MARTIN Camille (EI)", "EI MARTIN Camille", "MARTIN Camille Entrepreneur individuel"]) expect(porteLaMentionEI(nom), nom).toBe(true);
  });

  it("refuse un capital social pour un entrepreneur individuel ; une société garde ses champs", () => {
    expect(validerIdentite(form({ ...VENDEUR, capital: "1 000 €" })).erreur).toContain("pas de capital social");
    const societe = validerIdentite(form({ ...VENDEUR, denomination: "Exemple", forme: "SAS", capital: "1 000 €" }));
    expect(societe.erreur).toBeUndefined();
    expect(societe.valeurs?.capital).toBe("1 000 €");
  });

  it("le médiateur se saisit en entier ou pas du tout (règle inchangée)", () => {
    expect(validerIdentite(form({ ...VENDEUR, mediateurNom: "Médiateur fictif" })).erreur).toMatch(/ensemble/);
    expect(validerIdentite(form({ ...VENDEUR, ...MEDIATEUR })).erreur).toBeUndefined();
  });
});
