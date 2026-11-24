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
 * REPRISE DU 24/11/2026 (décision de pilotage, relecture D7R). Trois affirmations de ce fichier étaient celles du
 * premier commit D7 et sont réécrites, chacune avec son commentaire :
 *  · « rien ne ferme la première souscription d'un particulier sans médiateur » : par défaut elle reste FERMÉE (le
 *    recueil du dirigeant contient L. 612-1 et L. 616-1 du code de la consommation) ; lever le blocage l'ouvre ;
 *  · l'article 17 « sera désigné […] dès l'adhésion » (D7R-01 : ce test figeait une phrase fausse) : un seul texte,
 *    vrai avec et sans médiateur, sous une nouvelle version des conditions ;
 *  · E141 : le renvoi au bailleur ne vise que le locataire (D7R-09).
 * Les règles nouvelles (variantes « EI », agence, console) ont leur fichier : tests/vendeur-mediateur-reprise-d7.test.ts.
 *
 * AUCUNE DONNÉE RÉELLE : un vendeur fictif de la même forme que le vrai (nom, prénom, « EI », nom commercial entre
 * parenthèses dans la forme, SIRET de 14 chiffres). Les vraies valeurs se saisissent en console le jour de la publication.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRESTATAIRES, cleCoordonnees, estEntrepreneurIndividuel, faitsACompleter, faitsManquants, porteLaMentionEI, sirenEtSiret } from "../src/lib/editeur";
import { motifIdentiteEditeur, MOTIF_IDENTITE_EDITEUR, MOTIF_IDENTITE_EDITEUR_ESSAI, MOTIF_MEDIATEUR } from "../src/lib/garde-souscription";
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
  // Seconde reprise du 24/11/2026 (T4R-03) : le type de vendeur est choisi ; la forme n'est plus qu'un texte affiché.
  typeVendeur: "entrepreneur_individuel",
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

describe("garde : fermée sans vendeur ; sans médiateur, fermée au particulier par défaut", () => {
  const particulier = { enEssai: true, blocageIdentiteActif: true, nouvelleSouscriptionParticulier: true };

  // Reprise du 24/11/2026 : ce test affirmait « rien ne ferme ». Par défaut, sans médiateur, le particulier ne
  // souscrit pas.
  // Seconde reprise (relecture T4R-02) : la troisième ligne affirmait « ouverte si le blocage est levé ». Une levée
  // enregistrée avant le lot aurait ainsi ouvert la vente sans médiateur d'office. Seule la décision à part, datée,
  // l'ouvre ; la levée du blocage n'y change plus rien.
  it("vendeur complet, aucun médiateur : la première souscription d'un particulier est fermée par défaut, blocage levé ou non ; ouverte sur décision distincte", () => {
    expect(faitsManquants(VENDEUR)).toEqual([]);
    expect(faitsACompleter(VENDEUR)).toEqual(["le médiateur de la consommation", "l'adresse du médiateur", "le site du médiateur"]);
    expect(motifIdentiteEditeur(VENDEUR, particulier)).toBe(`${MOTIF_MEDIATEUR} Votre essai continue.`);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, enEssai: false })).toBe(MOTIF_MEDIATEUR);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: false })).toBe(`${MOTIF_MEDIATEUR} Votre essai continue.`);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, venteSansMediateurDecidee: false })).toBe(`${MOTIF_MEDIATEUR} Votre essai continue.`);
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, venteSansMediateurDecidee: true })).toBeNull();
    expect(motifIdentiteEditeur(VENDEUR, { ...particulier, blocageIdentiteActif: false, venteSansMediateurDecidee: true })).toBeNull();
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

  it("le motif du vendeur ne parle pas du médiateur ; celui du médiateur ne dit pas qu'il en existe un", () => {
    for (const m of [MOTIF_IDENTITE_EDITEUR, MOTIF_IDENTITE_EDITEUR_ESSAI]) expect(m).not.toMatch(/médiateur/i);
    // Seconde reprise (relecture T4R-08) : « les coordonnées du médiateur de la consommation de Gerimmo doivent être
    // publiées » présupposait un médiateur existant, ce que ce test dit vouloir éviter. Phrase corrigée.
    expect(MOTIF_MEDIATEUR).toBe(
      "Le paiement en ligne n'est pas encore ouvert aux particuliers. Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription."
    );
    expect(MOTIF_MEDIATEUR).not.toMatch(/médiateur de la consommation de Gerimmo|du médiateur|le médiateur/i);
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

  // Reprise du 24/11/2026 (D7R-01, D7R-02). Les deux tests d'ici figeaient l'ancien article 17 : « sera désigné aux
  // mentions légales dès l'adhésion de l'Éditeur » (un recours au présent, une adhésion que rien n'établit), puis les
  // coordonnées imprimées dans le contrat. L'article est désormais le MÊME texte dans les deux cas.
  const ARTICLE_17 =
    "Le Client consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d'un litige qui l'oppose à l'Éditeur, après une réclamation écrite restée sans solution. " +
    // Seconde reprise (relecture T4R-07) : « rappelés dans la réponse de l'Éditeur à la réclamation » promettait plus
    // que le code ne tient ; la promesse est bornée à la réponse qui clôt une réclamation faite dans l'application.
    "Dès qu'un médiateur est désigné, son nom et ses coordonnées figurent aux mentions légales ; la réponse par laquelle l'Éditeur clôt une réclamation faite depuis la page « Aide et retours » les rappelle. " +
    "Tant qu'aucun médiateur n'est désigné, les mentions légales et cette réponse l'indiquent expressément ; le Client garde alors la réclamation écrite prévue ci-dessus et les voies de droit commun.";

  it("sans médiateur : l'article 17 ne promet aucun recours existant, aucune adhésion, et renvoie aux mentions légales", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const article = section(html, "17. Droit applicable et litiges");
    expect(article).toContain(ARTICLE_17);
    expect(article).toContain("la réclamation s'adresse à contact@example.test");
    for (const faux of ["adhésion", "sera désigné", "dont relève", "Médiateur fictif", "peut recourir gratuitement au médiateur"]) expect(article).not.toContain(faux);
    expect(article).not.toMatch(/conforme/i);
    expect(html.slice(html.indexOf("17. Droit applicable et litiges"))).toContain('href="/mentions-legales"');
  });

  it("avec médiateur : le même article, mot pour mot ; les coordonnées sont aux mentions légales, pas dans le contrat", async () => {
    const sans = section(renderToStaticMarkup(await Conditions()), "17. Droit applicable et litiges");
    Object.assign(lecture.valeurs, MEDIATEUR);
    const avec = section(renderToStaticMarkup(await Conditions()), "17. Droit applicable et litiges");
    expect(avec).toBe(sans);
    expect(avec).not.toContain("Médiateur fictif");
    // Ce que l'article promet est tenu par la page à laquelle il renvoie, dans les deux cas.
    const mentions = texte(renderToStaticMarkup(await Mentions()));
    expect(mentions).toContain("Médiateur fictif 2 rue Exemple, 75000 Paris https://example.test/mediation");
    Object.assign(lecture.valeurs, { mediateurNom: null, mediateurAdresse: null, mediateurSite: null });
    expect(texte(renderToStaticMarkup(await Mentions()))).toContain("Médiateur de la consommation : aucun organisme n’est désigné à ce jour.");
  });

  // Reprise du 24/11/2026 (D7R-11) : l'ancienne preuve ne regardait que 80 caractères après le mot « Éditeur ». Elle
  // lit désormais chaque phrase qui nomme l'Éditeur, en entier, et la définition de l'article 2 mot pour mot.
  it("le vendeur n'est nulle part présenté comme une société dans les conditions, ni figé en « entrepreneur individuel »", async () => {
    const page = texte(renderToStaticMarkup(await Conditions()));
    // D7R-08 : l'article 2 ne dit plus « l'entrepreneur individuel » en dur (une société peut être saisie plus tard).
    expect(page).toContain("Éditeur : l'entreprise identifiée aux mentions légales , qui édite et exploite le Service.");
    expect(page).not.toMatch(/entrepreneur individuel/i);
    // Les conditions parlent de sociétés à propos des CLIENTS (SCI, société civile) : on cherche les phrases qui
    // nomment l'Éditeur ou le vendeur, et aucune ne doit porter un mot propre aux sociétés.
    const phrases = page.split(/(?<=[.;:!?])\s+/);
    const surLEditeur = phrases.filter((ph) => /Éditeur|MARTIN Camille/.test(ph));
    expect(surLEditeur.length).toBeGreaterThan(50);
    for (const ph of surLEditeur) expect(ph, ph).not.toMatch(/\b(?:sociétés?|SAS|SARL|capital|RCS)\b|siège/i);
    expect(page).not.toMatch(/capital social|siège social|immatriculée au RCS|adresse du siège/i);
  });

  it("une société saisie plus tard : l'article 2 reste vrai et la réserve du formulaire ne parle plus de « siège »", async () => {
    lecture.valeurs = { ...lecture.valeurs, denomination: "Exemple", forme: "SAS", capital: "1 000 €", siege: null };
    const page = texte(renderToStaticMarkup(await Conditions()));
    expect(page).toContain("Éditeur : l'entreprise identifiée aux mentions légales");
    expect(page).toMatch(/À l'attention de Exemple, adresse de l'éditeur \(à venir\) ?, contact@example\.test :/);
    expect(page).not.toContain("adresse du siège");
  });
});

describe("confidentialité : le responsable est un entrepreneur individuel", () => {
  it("nomme le vendeur avec « EI », sa forme et son adresse, sans mot de société", async () => {
    const page = texte(renderToStaticMarkup(await Confidentialite()));
    const phrase = page.slice(page.indexOf("Gerimmo est un service édité par"), page.indexOf("(« l'Éditeur »)"));
    expect(phrase).toContain("édité par MARTIN Camille EI, Entrepreneur individuel (nom commercial EXEMPLEXPERT), établi au 1 rue de l'Exemple, 75000 Paris");
    expect(phrase).not.toMatch(MOTS_DE_SOCIETE);
  });

  // Reprise du 24/11/2026 (D7R-09) : la phrase attendue disait « les autres comptes […] s'adressent à leur bailleur »,
  // ce qui englobait l'artisan ; le renvoi au bailleur ne vise que le locataire.
  it("E141 : la fermeture du compte ne promet plus à tous un téléchargement que seul le titulaire d'un espace trouve", async () => {
    const page = texte(renderToStaticMarkup(await Confidentialite()));
    expect(page).not.toContain("après avoir téléchargé vos données si vous le souhaitez");
    expect(page).toContain(
      "après avoir récupéré vos données si vous le souhaitez : le titulaire d'un espace y télécharge son archive complète ; les autres comptes y demandent une copie des données de leur compte (« Recevoir une copie de mes données ») ; un locataire s'adresse en outre à son bailleur pour les données de sa location."
    );
    expect(page).not.toContain("s'adressent à leur bailleur");
    // La phrase voisine (« Votre compte ») ne promet plus un export à tous.
    expect(page).not.toContain("après avoir exporté ce que vous souhaitez garder");
    expect(page).toContain("après avoir récupéré ce que vous souhaitez garder (depuis la page « Mes données personnelles », le titulaire d'un espace obtient son archive complète ; les autres comptes y demandent une copie des données de leur compte).");
    // La finalité ne promet plus un « renvoi au médiateur » quand aucun n'est désigné.
    expect(page).not.toContain("renvoi au médiateur de la consommation");
    expect(page).toContain("information sur le médiateur de la consommation (ses coordonnées s’il est désigné, sinon l’indication qu’aucun ne l’est)");
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
    expect(piedDeFacturePour({ nature: "franchise" })).toBe("TVA non applicable, article 293 B du CGI.");
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
    expect(t).toContain("TVA non applicable, article 293 B du CGI");
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
    // Le message dit la règle de l'article R. 526-27 du code de commerce : « immédiatement précédés ou suivis ».
    expect(validerIdentite(form({ ...VENDEUR, denomination: "MARTIN Camille" })).erreur).toContain("immédiatement précédés ou suivis de « EI »");
  });

  it("refuse un capital social pour un entrepreneur individuel ; une société garde ses champs", () => {
    expect(validerIdentite(form({ ...VENDEUR, capital: "1 000 €" })).erreur).toContain("pas de capital social");
    // Seconde reprise (T4R-03) : une société se déclare par le type de vendeur choisi, plus par le texte de la forme.
    const societe = validerIdentite(form({ ...VENDEUR, typeVendeur: "personne_morale", denomination: "Exemple", forme: "SAS", capital: "1 000 €" }));
    expect(societe.erreur).toBeUndefined();
    expect(societe.valeurs?.capital).toBe("1 000 €");
    // Le texte de la forme ne décide de rien : type « entrepreneur individuel » et forme « SAS », la mention reste exigée.
    expect(validerIdentite(form({ ...VENDEUR, denomination: "Exemple", forme: "SAS" })).erreur).toContain("« EI »");
  });

  it("le médiateur se saisit en entier ou pas du tout (règle inchangée)", () => {
    expect(validerIdentite(form({ ...VENDEUR, mediateurNom: "Médiateur fictif" })).erreur).toMatch(/ensemble/);
    expect(validerIdentite(form({ ...VENDEUR, ...MEDIATEUR })).erreur).toBeUndefined();
  });
});
