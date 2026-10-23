/**
 * Plan de conformité du 23/10/2026, lot 3 : la V1 des conditions générales (clients) et la première version des
 * conditions de l'espace artisan, avec les décisions du dirigeant du 23/10 qui priment sur le plan :
 *  1. médiateur non bloquant, vente ouverte : l'article 17 cite le médiateur lu en base, ou dit qu'il « sera désigné
 *     aux mentions légales dès l'adhésion de l'Éditeur » — jamais que la vente est fermée ;
 *  2. l'Éditeur n'est pas commerçant : factures six ans, preuve du contrat dix ans ;
 *  3. cautionnement et état des lieux signés dans Gerimmo (article 4.7) ;
 *  4. remboursements protecteurs, signature comprise, espace artisan gratuit, violation « dans les meilleurs délais ».
 *
 * Les pages sont rendues avec une identité fictive (aucune adresse réelle) ; le texte est comparé sans balises.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONDITIONS_ARTISANS_DATE,
  CONDITIONS_ARTISANS_VERSION,
  CONDITIONS_DATE,
  CONDITIONS_VERSION,
  PRESTATAIRES,
  sousTraitantsClient,
} from "../src/lib/editeur";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }),
}));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Conditions from "../src/app/conditions/page";
import ConditionsArtisans from "../src/app/conditions/artisans/page";

const IDENTITE = {
  denomination: "Éditeur fictif EI",
  forme: "Entrepreneur individuel (EI)",
  siege: "1 rue de l'Exemple, 75000 Paris",
  rcs: "RNE 000 000 000",
  siret: "00000000000000",
  directeurPublication: "Personne fictive",
  email: "contact@example.com",
  telephone: "01 00 00 00 00",
};

beforeEach(() => {
  lecture.valeurs = { ...IDENTITE };
});

/** Le texte lu par un visiteur : fin de bloc = espace, balises en ligne retirées, entités et blancs normalisés. */
const texte = (html: string) =>
  html
    .replace(/<\/(?:p|li|h1|h2|td|th|div|section|ul|nav)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const conditions = async () => texte(renderToStaticMarkup(await Conditions()));
const artisans = async () => texte(renderToStaticMarkup(await ConditionsArtisans()));
/** Un article de la page, de son titre au titre suivant. */
const article = (page: string, titre: string, suivant: string) => {
  const debut = page.indexOf(titre);
  expect(debut, titre).toBeGreaterThanOrEqual(0);
  const fin = page.indexOf(suivant, debut + titre.length);
  return page.slice(debut, fin < 0 ? undefined : fin);
};

describe("V1 des conditions clients : articles clés", () => {
  it("version et date provisoires du 24 octobre 2026, affichées en tête et à l'article 16", async () => {
    expect(CONDITIONS_VERSION).toBe("2026-10-24");
    expect(CONDITIONS_DATE).toBe("24 octobre 2026");
    const page = await conditions();
    expect(page).toContain("Version du 24 octobre 2026, en vigueur depuis cette date.");
    expect(page).toContain("La version en vigueur est la version du 24 octobre 2026.");
  });

  it("contient la rétractation en ligne, le formulaire « Commandé le », 14 bis, 15.5 et l'annexe L. 215", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const page = texte(html);
    for (const attendu of [
      "« Renoncer au contrat ici »",
      "Commandé le :",
      "14 bis. Garanties légales (Client consommateur)",
      "15.5 — Résiliation pour manquement de l'Éditeur.",
      "Article L. 215-1-1.",
      "Article L. 241-3.",
      "4.7 — Signature électronique.",
      "4.8 — Fonctionnement et compatibilité.",
      "8.10 — Rétractation.",
      "« Résilier votre contrat »",
      "Annexe 1 — Traitement de données pour le compte du Client (article 28 du RGPD)",
      "Annexe 2 — Articles L. 215-1 à L. 215-3 et L. 241-3 du code de la consommation",
    ]) {
      expect(page, attendu).toContain(attendu);
    }
    expect(page).not.toContain("Souscrit le :");
    expect(html).toContain('id="retractation"');
  });

  it("8.10 : rétractation ouverte à toutes les formules, remboursement intégral, nouveau délai au passage à l'annuel", async () => {
    const art = article(await conditions(), "8.10 — Rétractation.", "8.11 — Parrainage.");
    expect(art).toContain("tout Client titulaire d'une formule Solo, Bailleur, Investisseur ou Patrimoine");
    expect(art).toContain("le jour de la conclusion n'est pas compté");
    expect(art).toContain("à 23 h 59, heure de Paris");
    expect(art).toContain("sans retenue pour la période déjà fournie");
    expect(art).toContain("ouvre un nouveau délai de quatorze jours à compter de la demande de passage");
    expect(art).not.toContain("n'est pas ouvert au Client professionnel");
  });

  it("15 : impayé, lecture seule à J+15 (dès l'échec pour le premier prélèvement), résiliation au plus tôt trente jours après la mise en demeure", async () => {
    const art = article(await conditions(), "15. Défaut de paiement, suspension et résiliation", "16. Modification des conditions");
    expect(art).toContain("le jour même");
    expect(art).toContain("vaut mise en demeure");
    expect(art).toContain("quinze jours après l'échec, le compte passe en lecture seule");
    expect(art).toContain("sept jours après l'échec, puis la veille");
    expect(art).toContain("la lecture seule s'applique dès l'échec");
    expect(art).toContain("au plus tôt trente jours après une mise en demeure restée sans effet");
    expect(art).toContain("Aucune donnée n'est supprimée du fait de l'impayé.");
    expect(art).toContain("la facture restée impayée est alors annulée");
  });

  it("16 : accord exprès du consommateur, et la poursuite de l'usage ne vaut plus acceptation", async () => {
    const page = await conditions();
    const art = article(page, "16. Modification des conditions", "17. Droit applicable");
    expect(art).toContain("qu'avec son accord exprès");
    expect(art).toContain("l'abonnement n'est pas reconduit au-delà");
    expect(page).not.toContain("poursuite de l'utilisation");
    expect(page).not.toContain("vaut acceptation");
  });

  it("n'appelle jamais l'Éditeur « la société » et ne décrit plus l'offre des agences", async () => {
    const page = await conditions();
    expect(page).not.toMatch(/la société/i);
    expect(page).toContain("l'entrepreneur individuel identifié aux mentions légales");
    for (const mot of ["agence de gestion", "honoraires", "mandant", "sous mandat", "hors taxes"]) {
      expect(page, mot).not.toContain(mot);
    }
  });

  it("n'oppose aucun plafond de responsabilité au consommateur ni au non-professionnel", async () => {
    const page = await conditions();
    expect(page).toContain(
      "Lorsque le Client est un consommateur ou un non-professionnel, aucune stipulation des présentes ne supprime ni ne réduit son droit à réparation"
    );
    // Toute phrase qui plafonne vise le seul Client professionnel.
    const phrases = page.split(/(?<=\.)\s/).filter((p) => /plafonn/i.test(p));
    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) expect(phrase).toContain("agit à des fins professionnelles");
    expect(page).not.toContain("Cette limitation ne s'applique pas lorsque des dispositions impératives");
    // L'Éditeur répond des erreurs propres à ses modèles.
    expect(page).toContain("L'Éditeur répond en revanche d'une erreur ou d'une omission propre à ses modèles de documents");
  });

  it("conservation : factures six ans, preuve du contrat dix ans, compte supprimé après vingt-quatre mois et deux avertissements", async () => {
    const page = await conditions();
    const art9 = article(page, "9. Réversibilité et conservation", "10. Disponibilité");
    expect(art9).toContain("les factures qu'il a émises pendant six ans à compter de leur émission");
    expect(art9).toContain("la preuve de l'acceptation des conditions et de l'abonnement pendant dix ans après la fin du dernier abonnement payé");
    expect(art9).toContain("supprimés vingt-quatre mois après la plus tardive des dates suivantes");
    expect(art9).toContain("deux mois, puis quinze jours avant cette suppression");
    expect(page).not.toMatch(/factures[^.,;]*dix ans/);
    expect(page).toContain("L'Éditeur conserve la preuve de l'acceptation et de l'abonnement pendant dix ans après la fin du dernier abonnement payé");
    // L'archive complète (export R49) n'est pas encore en production : rien ne la promet.
    expect(art9).not.toContain("archive complète");
  });
});

describe("V1, article 4.7 : la caution et l'état des lieux signent dans Gerimmo (décision du 23/10)", () => {
  it("la liste des documents signables comprend l'acte de cautionnement et l'état des lieux", async () => {
    const art = article(await conditions(), "4.7 — Signature électronique.", "4.8 —");
    expect(art).toContain(
      "le bail et ses avenants, l'acte de cautionnement, l'état des lieux, l'accord d'échelonnement, l'accord de travaux et l'acceptation d'un devis d'artisan"
    );
    expect(art).not.toContain("ne sont pas proposés à la signature à distance");
    expect(art).not.toContain("signé sur papier, la caution");
  });

  it("la caution saisit elle-même son mobile et sa mention ; le Service refuse une mention incomplète ou différente", async () => {
    const art = article(await conditions(), "4.7 — Signature électronique.", "4.8 —");
    expect(art).toContain("un lien qui lui est propre, par lequel elle saisit elle-même le numéro de téléphone mobile");
    expect(art).toContain("le Client ne saisit pas ce numéro");
    expect(art).toContain("appose elle-même la mention prévue par l'article 2297 du code civil");
    expect(art).toContain("refuse de valider l'acte si la mention reçue est incomplète ou différente");
  });

  it("l'état des lieux : confirmation sur place et contradictoire, droit du locataire de le faire compléter", async () => {
    const art = article(await conditions(), "4.7 — Signature électronique.", "4.8 —");
    expect(art).toContain("établi contradictoirement, sur place, à la date de la visite, en présence du locataire ou de son représentant");
    expect(art).toContain("dans les dix jours qui suivent son établissement pour un état des lieux d'entrée");
    expect(art).toContain("pendant le premier mois de la période de chauffe pour les éléments de chauffage");
  });

  it("signature simple, sans présomption de fiabilité, un certificat commun, comprise dans l'abonnement et l'essai", async () => {
    const art = article(await conditions(), "4.7 — Signature électronique.", "4.8 —");
    expect(art).toContain("signature électronique simple, par code à usage unique");
    expect(art).toContain("ne bénéficie pas de la présomption de fiabilité");
    expect(art).toContain("certificat de réalisation délivré par le prestataire, commun à tous les signataires");
    expect(art).toContain("comprise dans l'abonnement et dans l'essai gratuit");
    expect(art).not.toMatch(/au sens du règlement[^.]*simple|simple au sens/);
    expect(art).toContain("ne limite pas la responsabilité de l'Éditeur");
  });

  it("la liste publique de Zoho Sign et le champ de la mention suivent la décision", () => {
    const zoho = PRESTATAIRES.find((p) => p.cle === "zohoSign");
    expect(zoho?.role).toContain("des actes de cautionnement, des états des lieux");
    const source = readFileSync(resolve(__dirname, "../src/lib/zoho-sign.ts"), "utf8");
    expect(source).toContain('field_label:"Saisissez ou collez le texte du Message privé de votre e-mail"');
    expect(source).not.toContain('field_label:"Collez');
  });
});

describe("V1, article 17 : le médiateur, non bloquant (décision du 23/10)", () => {
  it("sans médiateur saisi : la variante du plan ; la vente n'est jamais dite fermée", async () => {
    const art = article(await conditions(), "17. Droit applicable et litiges", "Annexe 1 —");
    expect(art).toContain("peut recourir gratuitement au médiateur de la consommation, qui sera désigné aux mentions légales dès l'adhésion de l'Éditeur.");
    expect(art).toContain("« Faire une réclamation »");
    expect(art).not.toMatch(/ferm/i);
  });

  it("médiateur saisi : ses coordonnées, lues en base", async () => {
    lecture.valeurs = { ...IDENTITE, mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, Paris", mediateurSite: "https://example.com/mediation" };
    const art = article(await conditions(), "17. Droit applicable et litiges", "Annexe 1 —");
    expect(art).toContain(
      "au médiateur de la consommation dont relève l'Éditeur : Médiateur fictif, 2 rue Exemple, Paris, https://example.com/mediation."
    );
    expect(art).not.toContain("sera désigné");
  });
});

describe("V1, annexe 1 : sous-traitants figés, violation dans les meilleurs délais", () => {
  it("l'annexe ne liste que les sous-traitants des données du Client, lus depuis le code", async () => {
    const annexe = article(await conditions(), "Annexe 1 —", "Annexe 2 —");
    const liste = sousTraitantsClient();
    expect(liste.map((p) => p.nom)).toEqual(["Supabase", "Vercel", "Resend", "Zoho Sign", "OpenAI", "Scaleway", "GitHub (Actions)"]);
    for (const p of liste) expect(annexe, p.nom).toContain(p.nom);
    for (const absent of PRESTATAIRES.filter((p) => !p.sousTraitantClient)) expect(annexe, absent.nom).not.toContain(absent.nom);
    for (const nom of ["Stripe", "Yousign", "Base Adresse Nationale", "Meta"]) expect(annexe, nom).not.toContain(nom);
    // Le rôle d'OpenAI pour le Client : les propositions de devis seulement.
    expect(annexe).toContain("Propositions de devis artisans");
    expect(annexe).not.toContain("Assistance rédactionnelle de la supervision");
  });

  it("une localisation ou des coordonnées saisies en base n'entrent pas dans l'annexe", async () => {
    lecture.valeurs = { ...IDENTITE, localisationBan: "Ailleurs fictif", coordonneesSupabase: "Coordonnées fictives de Supabase" };
    const annexe = article(await conditions(), "Annexe 1 —", "Annexe 2 —");
    expect(annexe).not.toContain("Ailleurs fictif");
    expect(annexe).not.toContain("Coordonnées fictives");
  });

  it("violation de données « dans les meilleurs délais », sans engagement de quarante-huit heures", async () => {
    const annexe = article(await conditions(), "Annexe 1 —", "Annexe 2 —");
    expect(annexe).toContain("dans les meilleurs délais");
    expect(annexe).not.toMatch(/quarante-huit heures|48 h/);
    expect(annexe).toContain("Fin du traitement.");
    expect(annexe).not.toContain("quatre-vingt-dix jours");
  });
});

describe("conditions de l'espace artisan (R10)", () => {
  it("la page s'affiche, datée de la même version provisoire, avec les articles A1 à A14 et son annexe", async () => {
    expect(CONDITIONS_ARTISANS_VERSION).toBe("2026-10-24");
    expect(CONDITIONS_ARTISANS_DATE).toBe("24 octobre 2026");
    const page = await artisans();
    expect(page).toContain("Conditions de l'espace artisan");
    expect(page).toContain("Version du 24 octobre 2026, en vigueur depuis cette date.");
    for (let n = 1; n <= 14; n++) expect(page, `A${n}`).toMatch(new RegExp(`A${n}\\. `));
    expect(page).toContain("Annexe — Traitement de données pour le compte de l'Artisan (article 28 du RGPD)");
  });

  it("espace gratuit et sans commission ; classement sans rémunération, note comptée à partir de trois évaluations", async () => {
    const page = await artisans();
    expect(page).toContain("L'espace artisan est gratuit.");
    expect(page).toContain("ne prélève aucune commission sur les devis, travaux ou règlements");
    expect(page).toContain("note moyenne décroissante, prise en compte à partir de trois évaluations");
    expect(page).toContain("viennent ensuite les artisans qui ont moins de trois évaluations");
    expect(page).toContain("Aucune rémunération ne permet d'influer sur ce classement.");
    // Les conditions clients disent la même règle à l'article 8.8.
    expect(await conditions()).toContain("prise en compte à partir de trois évaluations");
  });

  it("communes et métiers choisis par l'artisan ; motifs et préavis de fermeture", async () => {
    const page = await artisans();
    expect(page).toContain("dans une commune qu'il a choisie, pour un métier qu'il a déclaré");
    expect(page).toContain("la fermeture définitive du compte est notifiée trente jours avant de prendre effet");
  });

  it("l'annexe de l'Artisan : sortie par la fermeture du compte, mêmes sous-traitants, aucune clause de remboursement", async () => {
    const annexe = article(await artisans(), "Annexe — Traitement de données pour le compte de l'Artisan", "Versions archivées");
    expect(annexe).toContain("Si l'Éditeur maintient le changement, l'Artisan peut fermer son compte avant sa prise d'effet.");
    expect(annexe).not.toContain("remboursement");
    expect(annexe).not.toContain("Client");
    for (const p of sousTraitantsClient()) expect(annexe, p.nom).toContain(p.nom);
    expect(annexe).toContain("dans les meilleurs délais");
  });

  it("n'emprunte rien de la vente aux propriétaires et n'appelle pas l'Éditeur « la société »", async () => {
    const page = await artisans();
    expect(page).not.toMatch(/la société/i);
    for (const mot of ["Renoncer au contrat ici", "rétractation", "abonnement", "Commandé le"]) expect(page, mot).not.toContain(mot);
  });
});
