/**
 * Plan de conformité du 23/10/2026, lot 4 : confidentialité, mentions et pages publiques, avec les décisions du
 * dirigeant du 23/10 qui priment sur le plan (log.md) :
 *  - éditeur non commerçant : les factures de Gerimmo se gardent six ans (LPF, art. L. 102 B), la preuve du contrat dix ;
 *  - cautionnement et état des lieux signés dans Gerimmo : ils restent dans toutes les listes de documents signables ;
 *  - signature comprise sans supplément, essai compris, dans la limite du volume mensuel commun ;
 *  - aucun DPO désigné (référent : le dirigeant) ; violation notifiée « dans les meilleurs délais », sans 48 heures ;
 *  - certification d'OpenAI et de GitHub au cadre UE–États-Unis non vérifiée : la page ne s'en prévaut pas, et cite
 *    pour eux les seules clauses contractuelles types (relecture du 23/10, sans aveu public de non-vérification).
 *
 * Les pages sont rendues sans base (identité fictive) ou lues telles quelles.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONDITIONS_DATE, PRESTATAIRES, cleCoordonnees } from "../src/lib/editeur";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }),
}));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Confidentialite from "../src/app/confidentialite/page";
import Mentions from "../src/app/mentions-legales/page";
import PageTarifs from "../src/app/tarifs/page";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
/** Le texte lu par le visiteur : balises retirées, entités et blancs normalisés. */
const texte = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Le code sans ses commentaires, apostrophes JSX dépliées et blancs réduits. */
const source = (p: string) =>
  lire(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/&apos;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  lecture.valeurs = {
    denomination: "Personne fictive EI", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple, Paris",
    rcs: "RNE 000 000 000", siret: "00000000000000", directeurPublication: "Personne fictive",
    email: "contact@example.test", telephone: "01 00 00 00 00", localisationBan: "France",
    ...Object.fromEntries(PRESTATAIRES.map((p) => [cleCoordonnees(p), "Coordonnées fictives"])),
  };
});

async function confidentialite() {
  return texte(renderToStaticMarkup(await Confidentialite()));
}

describe("/confidentialite (lot 4)", () => {
  it("ne cite plus gerimmo_inscription ni Yousign, et nomme les trois témoins déposés (R63)", async () => {
    const page = await confidentialite();
    expect(page).not.toContain("gerimmo_inscription");
    expect(page).not.toMatch(/yousign|youtrust/i);
    for (const temoin of ["sb-…-auth-token", "gerimmo-derniere-activite", "gerimmo_confirmation"]) expect(page).toContain(temoin);
    expect(page).toContain("jusqu'à 400 jours");
    expect(page).toContain("15 minutes");
    expect(page).toContain("Aucun témoin publicitaire ni de mesure d'audience n'est déposé.");
  });

  it("dit qu'aucun DPO n'est désigné et que le dirigeant est le référent", async () => {
    const page = await confidentialite();
    expect(page).toContain("L'Éditeur n'a pas désigné de délégué à la protection des données");
    expect(page).toContain("son dirigeant est le référent");
    expect(page).toContain("contact@example.test");
  });

  it("donne les bases légales du plan : preuve du contrat (L. 213-1), suivi commercial (deux régimes), artisans", async () => {
    const page = await confidentialite();
    expect(page).toContain("Obligation légale de conserver les contrats conclus par voie électronique d'au moins 120 € (art. L. 213-1 du code de la consommation) ; intérêt légitime dans les autres cas");
    expect(page).toContain("Suivi commercial des professionnels qui nous interrogent sur nos offres, et des particuliers qui l'ont accepté");
    expect(page).toContain("Intérêt légitime (professionnels) ; consentement (particuliers)");
    expect(page).toContain("Base légale : exécution des conditions de l'espace artisan.");
    expect(page).toContain("nous n'adressons aucun courriel commercial à un particulier sans son consentement");
    // Le commentaire « à confirmer par le juriste et le DPO » de la liste d'attente des agences est retiré (plan, lot 4).
    expect(lire("app/confidentialite/page.tsx")).not.toContain("à confirmer par le juriste et le DPO");
  });

  it("factures de Gerimmo six ans au moins (L. 102 B), jamais dix ; preuve du contrat dix ans après le dernier abonnement payé", async () => {
    const page = await confidentialite();
    expect(page).toContain("Au moins 6 ans (obligation fiscale : livre des procédures fiscales, art. L. 102 B), chez notre prestataire de paiement, selon sa propre politique de conservation");
    // La copie jointe à l'archive d'un compte fermé est retirée six ans après la fin de l'exercice de la facture, à
    // défaut après la fin du dernier abonnement payé (echeance_facture_archivee, migration 20261024140000).
    expect(page).toContain("la copie jointe à la preuve du contrat d’un compte fermé est supprimée six ans après la fin de l’exercice de la facture");
    expect(page).toContain("Émission ; pour la copie jointe à la preuve du contrat, fin de l’exercice de la facture (à défaut, fin du dernier abonnement payé)");
    expect(page).toContain("avec la copie de vos factures, six ans après la fin de leur exercice");
    expect(page).toContain("où votre fiche de client est supprimée au terme de la conservation de vos factures");
    expect(page).toContain("les factures d'abonnement, au moins six ans, chez notre prestataire de paiement");
    expect(page).not.toMatch(/factures[^.;]{0,80}dix ans/i);
    expect(page).not.toContain("10 ans (obligation légale)");
    expect(page).not.toContain("conservation comptable obligatoire des factures est de dix ans");
    expect(page).toContain("dix ans après la fin de votre dernier abonnement payé");
    expect(page).toContain("supprimée avec le compte si aucun abonnement payant n’a été souscrit");
  });

  it("décrit la fermeture du compte et la suppression après vingt-quatre mois sans connexion ni abonnement", async () => {
    const page = await confidentialite();
    expect(page).toContain("Fermeture de votre compte.");
    expect(page).toContain("quatorze jours après votre confirmation, avec le remboursement de la part non utilisée");
    expect(page).toContain("en cas de restauration, la fermeture est appliquée de nouveau");
    // Relecture du 23/10 : les dossiers ne partent que si le compte est le seul membre (lot 1E) ; tout ce qui survit à
    // la fermeture dans le tableau est dans la liste « Nous conservons seulement ».
    expect(page).toContain("si vous êtes le seul membre de votre espace, nous effaçons aussi ses dossiers");
    expect(page).toContain("sinon, seule votre adhésion à cet espace est retirée");
    for (const reste of [
      "la preuve d'une éventuelle rétractation, dix ans",
      "la liste des effacements à rejouer après la restauration d'une sauvegarde, quatre mois",
      "l'empreinte de votre adresse, trois ans",
    ]) expect(page).toContain(reste);
    // L'article 9 n'est cité qu'une fois dans « Votre compte ».
    const votreCompte = page.slice(page.indexOf("Votre compte. Comme le prévoit"), page.indexOf("Fermeture de votre compte."));
    expect(votreCompte.match(/article 9/g)).toHaveLength(1);
    expect(page).toContain("rien n'est supprimé du seul fait de l'arrêt");
    expect(page).toContain("après vingt-quatre mois sans connexion ni abonnement, le compte est fermé après deux avertissements");
    expect(page).not.toContain("rien n'est supprimé automatiquement");
    // Article 9 de la V1 : la plus tardive des deux dates.
    expect(page).toContain("suppression vingt-quatre mois après la plus tardive de ces deux dates");
    expect(page).toContain("La plus tardive des deux : dernière connexion d’un utilisateur du compte, fin du dernier abonnement payé");
  });

  it("préavis : seulement ceux que le code prévoit (J-30 par bail, J-15 par personne sans bail, article 9 de la V1)", async () => {
    const page = await confidentialite();
    expect(page).toContain("trente jours avant la suppression des pièces rattachées à un bail, et quinze jours avant celle des pièces d'une personne rattachée à aucun bail");
    const autres = page.slice(page.indexOf("Autres documents non rattachés à un bail"), page.indexOf("Quittances"));
    expect(autres).not.toMatch(/prévenu/);
  });

  it("listes d'attente : aucune purge « à l'ouverture » promise ; la liste des propriétaires a sa base et sa description", async () => {
    const page = await confidentialite();
    expect(page).not.toContain("Jusqu’à ce que nous vous ayons prévenu de l’ouverture");
    expect(page).toContain("Au plus trois ans, puis suppression ; dans le mois de votre demande de retrait ; trois mois après la souscription si votre agence devient cliente");
    expect(page).toContain("Liste d'attente des propriétaires : vous prévenir de l'ouverture du service, à votre demande");
    expect(page).toContain("La liste d'attente des propriétaires.");
  });

  it("suivi commercial : la recommandation est un canal de la demande, pas une demande", async () => {
    const page = await confidentialite();
    expect(page).toContain("que vous nous interrogez sur nos offres, par le formulaire de contact, lors d'un échange direct ou après la recommandation d'un tiers");
    expect(page).not.toContain("échange direct ou recommandation)");
  });

  it("transferts hors UE : ne se prévaut d'aucune certification d'OpenAI ni de GitHub", async () => {
    const page = await confidentialite();
    expect(page).toContain("clauses contractuelles types de la Commission européenne");
    expect(page).toContain("Pour OpenAI et GitHub, le transfert repose sur les clauses contractuelles types de la Commission européenne, intégrées à leurs accords de traitement des données.");
    expect(page).not.toMatch(/OpenAI[^.]{0,60}certifi|n'avons pas vérifié/);
    expect(page).not.toContain("Data Privacy Framework UE–États-Unis, selon le prestataire");
  });

  it("violation de données : « dans les meilleurs délais », sans engagement de 48 heures", async () => {
    const page = await confidentialite();
    expect(page).toContain("dans les meilleurs délais");
    expect(page).not.toMatch(/quarante-huit heures|48 heures|48 h\b/);
  });

  it("la signature : Zoho Sign garde le cautionnement et l'état des lieux ; la caution saisit elle-même son mobile", async () => {
    const page = await confidentialite();
    expect(page).toContain("actes de cautionnement et états des lieux");
    expect(page).toContain("ce numéro est celui que la caution a saisi elle-même");
    expect(page).toContain("certificat de réalisation, commun à tous les signataires");
    // Rôle de Zoho Sign : la conservation des documents signés (la fermeture du compte en demande la suppression).
    expect(page).toContain("conservation des documents signés et de leur certificat jusqu'à leur suppression");
    // La Base Adresse Nationale : service public appelé par le navigateur (plan, lot 4).
    expect(page).toContain("Service public appelé directement par votre navigateur pour compléter l'adresse d'un bien ; il reçoit le texte tapé et l'adresse IP de votre connexion");
  });

  it("l'offre est réservée aux propriétaires : plus d'agence cliente ni de gestionnaire dans les rôles", async () => {
    const page = await confidentialite();
    expect(page).not.toMatch(/votre agence ou (?:à )?votre propriétaire/);
    expect(page).not.toContain("gestionnaire");
    expect(page).toContain("propriétaires bailleurs qui gèrent eux-mêmes leurs biens");
  });

  it("est datée comme la V1 des conditions (date provisoire jusqu'à la publication)", async () => {
    expect(await confidentialite()).toContain(`Dernière mise à jour : ${CONDITIONS_DATE}.`);
  });
});

describe("mentions légales (lot 4 : aucun changement de texte)", () => {
  it("le médiateur manquant s'y dit « Adhésion à venir », sans fermer la vente", async () => {
    const page = texte(renderToStaticMarkup(await Mentions()));
    expect(page).toContain("Adhésion à venir : aucun organisme n’est désigné à ce jour.");
    expect(page).not.toMatch(/vente (?:est )?fermée|fermée faute de médiateur/i);
  });
});

describe("pages publiques (lot 4)", () => {
  it("l'accueil réserve l'offre à vos propres biens (V1, articles 1 et 2)", () => {
    const t = source("app/page.tsx");
    expect(t).not.toMatch(/bien d'un proche|gérer pour quelqu'un d'autre/);
    expect(t).toContain("Oui, pour vos propres biens : en nom propre, en SCI ou en indivision.");
  });

  it("l'accueil et /tarifs disent la suppression après vingt-quatre mois et le renvoi à la confidentialité", () => {
    const attendu = "Le compte est supprimé après vingt-quatre mois sans connexion ni abonnement, après deux avertissements par courriel ; certaines pièces suivent leur propre durée (page";
    for (const fichier of ["app/page.tsx", "app/tarifs/page.tsx"]) {
      const t = source(fichier);
      expect(t, fichier).toContain(attendu);
      expect(t, fichier).toContain("Vous pouvez aussi demander la suppression après export. Aucun frais de sortie.");
      expect(t, fichier).not.toMatch(/rien n'est supprimé automatiquement/i);
    }
  });

  it("/tarifs : l'impayé (article 15) et la signature comprise, cautionnement et état des lieux gardés", () => {
    const html = texte(renderToStaticMarkup(createElement(PageTarifs)));
    expect(html).toContain("Si un prélèvement échoue, vous êtes prévenu le jour même.");
    expect(html).toContain("la saisie reste ouverte quinze jours, puis le compte passe en lecture seule jusqu'au paiement");
    expect(html).toContain("Rien n'est supprimé du fait de l'impayé (article 15 des conditions générales).");
    for (const doc of ["du bail et de ses avenants", "acceptation des devis", "acte de cautionnement", "état des lieux"]) expect(html).toContain(doc);
    expect(html).toContain("comprise dans l'abonnement et dans l'essai, sans supplément pour vous ni pour les signataires");
  });

  it("« Mon abonnement » : lecture seule après la résiliation, signature dans ce qui est compris (abonnement-2026.tsx)", () => {
    const t = source("app/agence/[orgId]/abonnement/abonnement-2026.tsx");
    expect(t).toContain("Ensuite, votre compte passe en lecture seule : vos données restent consultables et exportables ; rien n'est supprimé du seul fait de la résiliation (article 9 des conditions générales).");
    expect(t).not.toContain("rien n'est supprimé automatiquement");
    expect(t).toContain("<strong>La signature électronique</strong>");
    expect(t).toContain("actes de cautionnement et états des lieux");
    // Mêmes réserves que /tarifs et l'article 4.7 : essai compris, suspension possible, dans les deux affichages.
    expect(t.match(/essai compris/g)?.length).toBe(2);
    expect(t.match(/elle peut être momentanément suspendue/g)?.length).toBe(2);
    // « Services facturés à part ou non inclus » ne parle plus de la signature.
    const precisions = t.slice(t.indexOf("Services facturés à part ou non inclus"), t.indexOf("</details>"));
    expect(precisions).not.toMatch(/Zoho Sign|signature des documents/);
  });

  it("liste d'attente des agences : opposition, trois ans après l'inscription, retrait dans le mois (R44)", () => {
    const t = source("app/agences/formulaire-liste-attente-agences.tsx").replace(/’/g, "'");
    expect(t).toContain("Vos coordonnées servent uniquement à vous prévenir de l'ouverture de l'offre aux agences et à donner suite à vos réponses.");
    expect(t).toContain("Vous pouvez vous y opposer à tout moment, en répondant à l'un de nos messages ou en nous écrivant ; elles sont supprimées trois ans après votre inscription, ou dans le mois de votre demande de retrait");
  });
});
