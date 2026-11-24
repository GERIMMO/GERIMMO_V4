import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRESTATAIRES, cleCoordonnees } from "../src/lib/editeur";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/conservation-publique", () => ({ lireDureesPubliques: async () => ({ regles: [], indisponible: false }) }));
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }),
}));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Mentions from "../src/app/mentions-legales/page";
import Confidentialite from "../src/app/confidentialite/page";
import Conditions from "../src/app/conditions/page";

beforeEach(() => {
  lecture.valeurs = {
    // Seconde reprise du 24/11/2026 (T4R-03) : le type de vendeur est choisi, il n'est plus deviné dans la forme.
    typeVendeur: "entrepreneur_individuel", denomination: "Personne fictive", forme: "Entrepreneur individuel (EI)",
    siege: "1 rue Exemple, Paris", rcs: "RNE — 000 000 000", siret: "00000000000000",
    directeurPublication: "Personne fictive", email: "contact@example.test",
    telephone: "01 00 00 00 00", localisationBan: "France",
    ...Object.fromEntries(PRESTATAIRES.map((p) => [cleCoordonnees(p), "Coordonnées fictives"])),
  };
});

describe("les pages rendent les informations enregistrées", () => {
  it("affiche l’EI, le RNE, le contact et la franchise sans demander de capital", async () => {
    const html = renderToStaticMarkup(await Mentions());
    expect(html).toContain("Personne fictive");
    expect(html).toContain("RNE — 000 000 000");
    expect(html).toContain("contact@example.test");
    expect(html).toContain("01 00 00 00 00");
    expect(html).toContain("TVA non applicable, article 293 B du CGI");
    expect(html).not.toContain("Capital social");
    expect(html).not.toContain("TVA intracommunautaire");
    expect(html).toContain("aucun organisme n’est désigné");
    // 23/10 : le médiateur manquant s'affiche à sa place, sans encadré.
    expect(html).not.toContain("Document en cours de finalisation");
    expect(html).toContain("Vercel");
    expect(html).toContain("Supabase");
    expect(html).toContain("Coordonnées fictives");
    expect(html).not.toContain("OpenAI");
    expect(html).not.toContain("GitHub");
    expect(html).not.toContain("Marque blanche");
    expect(html).toContain('href="/confidentialite"');
  });
  it("conserve la réserve de capital pour une société qui n’en a pas renseigné", async () => {
    lecture.valeurs.forme = "SAS";
    lecture.valeurs.typeVendeur = "personne_morale";
    expect(renderToStaticMarkup(await Mentions())).toContain("capital social (à venir)");
  });
  it("une confidentialité renseignée n’est pas marquée incomplète à cause du médiateur", async () => {
    const html = renderToStaticMarkup(await Confidentialite());
    expect(html).toContain("Personne fictive");
    expect(html).toContain("mailto:contact@example.test");
    expect(html).not.toContain("Document en cours de finalisation");
    lecture.valeurs.email = null;
    const sansContact = renderToStaticMarkup(await Confidentialite());
    expect(sansContact).toContain("Document en cours de finalisation");
    expect(sansContact).not.toContain("mailto:null");
  });
});

// Relectures du 23/10 : l'article 17 des conditions citait le médiateur lu en base, ou disait qu'il « sera désigné aux
// mentions légales dès l'adhésion de l'Éditeur ».
// VERSION DU 24/11/2026 (reprise du lot D7, relectures D7R-01 et D7R-02) : les cinq tests de ce bloc affirmaient cette
// règle. Elle promettait un recours au présent alors qu'aucun médiateur n'existe, annonçait une adhésion que rien
// n'établit, et faisait dépendre le contrat des champs « médiateur » (les saisir refermait les ventes). L'article 17 est
// désormais UN SEUL texte, qui renvoie aux mentions légales ; ce sont elles qui portent le médiateur ou disent qu'aucun
// n'est désigné. Les tests sont réécrits pour dire cette règle : même article dans tous les états, et promesse tenue
// par les mentions légales dans chacun.
const sansEntites = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
const article17 = (html: string) => {
  const debut = html.indexOf("17. Droit applicable et litiges");
  expect(debut).toBeGreaterThan(0);
  return sansEntites(html.slice(debut, html.indexOf("</section>", debut)));
};
const mediation = (html: string) => {
  const debut = html.indexOf("Médiation de la consommation");
  expect(debut).toBeGreaterThan(0);
  return sansEntites(html.slice(debut, html.indexOf("</section>", debut)));
};
const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, Paris", mediateurSite: "https://example.test/mediation" };

const ARTICLE_17_MEDIATION =
  "Le Client consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d'un litige qui l'oppose à l'Éditeur, après une réclamation écrite restée sans solution. " +
  // Seconde reprise du 24/11/2026 (relecture T4R-07) : « rappelés dans la réponse de l'Éditeur à la réclamation » promettait
  // plus que le code ne tient ; la promesse est bornée à la réponse qui clôt une réclamation faite dans l'application.
  "Dès qu'un médiateur est désigné, son nom et ses coordonnées figurent aux mentions légales ; la réponse par laquelle l'Éditeur clôt une réclamation faite depuis la page « Aide et retours » les rappelle. " +
  "Tant qu'aucun médiateur n'est désigné, les mentions légales et cette réponse l'indiquent expressément ; le Client garde alors la réclamation écrite prévue ci-dessus et les voies de droit commun.";

describe("article 17 des conditions : un seul texte, les mentions légales portent le médiateur", () => {
  it("sans médiateur : ni recours promis au présent, ni adhésion, ni coordonnées, ni vente fermée", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const texte = article17(html);
    expect(texte).toContain(ARTICLE_17_MEDIATION);
    for (const faux of ["adhésion", "sera désigné", "reprises aux", "coordonnées suivent", "dont relève", "peut recourir gratuitement au médiateur"]) {
      expect(texte, faux).not.toContain(faux);
    }
    expect(texte).not.toMatch(/vente[^.]*fermée|fermée[^.]*vente/i);
    expect(html).not.toMatch(/vente[^.<]*(fermée|n'est pas ouverte)/i);
    expect(texte).not.toContain("(à venir)");
    // Le médiateur manquant ne met pas le contrat « en cours de finalisation ».
    expect(html).not.toContain("Document en cours de finalisation");
  });

  it("médiateur saisi : le même article ; nom, adresse et site sont aux mentions légales, auxquelles il renvoie", async () => {
    const sans = article17(renderToStaticMarkup(await Conditions()));
    Object.assign(lecture.valeurs, MEDIATEUR);
    const html = renderToStaticMarkup(await Conditions());
    expect(article17(html)).toBe(sans);
    for (const fait of Object.values(MEDIATEUR)) expect(html).not.toContain(fait);
    expect(html.slice(html.indexOf("17. Droit applicable et litiges"), html.indexOf("Annexe 1 —"))).toContain('href="/mentions-legales"');
    const mentions = mediation(renderToStaticMarkup(await Mentions()));
    for (const fait of Object.values(MEDIATEUR)) expect(mentions).toContain(fait);
    expect(mentions).toContain("Après une réclamation écrite, le consommateur peut recourir gratuitement à un médiateur compétent.");
    expect(mentions).not.toContain("aucun organisme n’est désigné");
  });

  it("une coordonnée manquante reste « à venir » aux mentions légales, jamais dans le contrat", async () => {
    Object.assign(lecture.valeurs, { ...MEDIATEUR, mediateurAdresse: null });
    expect(article17(renderToStaticMarkup(await Conditions()))).not.toContain("(à venir)");
    const mentions = mediation(renderToStaticMarkup(await Mentions()));
    expect(mentions).toContain("Médiateur fictif");
    expect(mentions).toContain("adresse du médiateur (à venir)");
    expect(mentions).not.toContain("site du médiateur (à venir)");
  });

  it("adresse et site saisis sans nom : aucun organisme n'est désigné, ni dans les conditions ni dans les mentions", async () => {
    Object.assign(lecture.valeurs, { ...MEDIATEUR, mediateurNom: null });
    const conditions = article17(renderToStaticMarkup(await Conditions()));
    const mentions = mediation(renderToStaticMarkup(await Mentions()));
    expect(mentions).toContain("aucun organisme n’est désigné");
    expect(mentions).not.toContain("peut recourir gratuitement");
    expect(conditions).toContain(ARTICLE_17_MEDIATION);
    for (const coordonnee of [MEDIATEUR.mediateurAdresse, MEDIATEUR.mediateurSite]) {
      expect(conditions).not.toContain(coordonnee);
      expect(mentions).not.toContain(coordonnee);
    }
  });

  it("quel que soit l'état saisi : l'article 17 ne change pas, et les mentions légales tiennent ce qu'il annonce", async () => {
    const etats: Record<string, Partial<typeof MEDIATEUR>> = {
      "rien de saisi": {},
      "nom seul": { mediateurNom: MEDIATEUR.mediateurNom },
      "tout saisi": MEDIATEUR,
      "nom et site": { mediateurNom: MEDIATEUR.mediateurNom, mediateurSite: MEDIATEUR.mediateurSite },
      "adresse et site sans nom": { mediateurAdresse: MEDIATEUR.mediateurAdresse, mediateurSite: MEDIATEUR.mediateurSite },
    };
    const reference = article17(renderToStaticMarkup(await Conditions()));
    for (const [nom, saisie] of Object.entries(etats)) {
      lecture.valeurs = { ...lecture.valeurs, mediateurNom: null, mediateurAdresse: null, mediateurSite: null, ...saisie };
      expect(article17(renderToStaticMarkup(await Conditions())), nom).toBe(reference);
      const mentions = mediation(renderToStaticMarkup(await Mentions()));
      // « Dès qu'un médiateur est désigné, son nom […] figurent aux mentions légales » ; « tant qu'aucun médiateur
      // n'est désigné, les mentions légales […] l'indiquent expressément » : l'un ou l'autre, jamais les deux, jamais aucun.
      const nomme = mentions.includes(MEDIATEUR.mediateurNom);
      expect(nomme, nom).toBe(Boolean(saisie.mediateurNom));
      expect(mentions.includes("aucun organisme n’est désigné à ce jour"), nom).toBe(!nomme);
    }
  });
});
