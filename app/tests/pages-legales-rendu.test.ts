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
    denomination: "Personne fictive", forme: "Entrepreneur individuel (EI)",
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

// Relecture du 23/10 : l'article 17 des conditions renvoyait au médiateur « désigné aux mentions légales » alors
// qu'aucun ne l'est (les mentions disent « Adhésion à venir »). Il cite désormais le médiateur lu en base, comme un
// fait d'éditeur, sans changer la version.
// Seconde relecture du 23/10 : sans médiateur, la phrase disait ses coordonnées « reprises aux mentions légales »,
// qui n'en reprennent aucune ; et une adresse ou un site saisis sans nom s'affichaient dans les conditions, pas dans
// les mentions. Les deux pages partagent désormais le même rendu, conditionné au nom du médiateur.
// V1 (plan de conformité du 23/10, lot 3 ; décision du dirigeant du 23/10, médiateur NON BLOQUANT et vente ouverte) :
// tant que le nom manque, la phrase est celle du plan, au futur : le médiateur « sera désigné aux mentions légales
// dès l'adhésion de l'Éditeur ». Elle ne dit jamais que la vente est fermée. Nom saisi : « dont relève l'Éditeur : »
// suivi du nom, de l'adresse et du site (composant Fait).
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

describe("article 17 des conditions : le médiateur lu en base", () => {
  it("sans médiateur : la variante du plan, au futur, sans coordonnées « reprises aux mentions légales » ni vente fermée", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const texte = article17(html);
    expect(texte).toContain(
      "À défaut de solution amiable après une réclamation écrite adressée à l'Éditeur, le Client consommateur ou " +
        "non-professionnel peut recourir gratuitement au médiateur de la consommation, qui sera désigné aux mentions " +
        "légales dès l'adhésion de l'Éditeur."
    );
    expect(texte).not.toContain("reprises aux");
    expect(texte).not.toContain("coordonnées suivent");
    expect(texte).not.toContain("dont relève");
    expect(texte).not.toMatch(/vente[^.]*fermée|fermée[^.]*vente/i);
    expect(html).not.toMatch(/vente[^.<]*(fermée|n'est pas ouverte)/i);
    expect(texte).not.toContain("(à venir)");
    // Le médiateur ne bloque rien (décision du 23/10) : pas d'encadré pour lui seul.
    expect(html).not.toContain("Document en cours de finalisation");
  });

  it("médiateur saisi : nom, adresse et site s'affichent, sans réserve, et renvoient aux mentions légales", async () => {
    Object.assign(lecture.valeurs, MEDIATEUR);
    const texte = article17(renderToStaticMarkup(await Conditions()));
    expect(texte).toContain("Médiateur fictif");
    expect(texte).toContain("2 rue Exemple, Paris");
    expect(texte).toContain("https://example.test/mediation");
    expect(texte).toContain(
      "peut recourir gratuitement au médiateur de la consommation dont relève l'Éditeur : Médiateur fictif, 2 rue Exemple, Paris, https://example.test/mediation."
    );
    expect(texte).not.toContain("sera désigné");
    expect(texte).not.toContain("(à venir)");
  });

  it("une coordonnée manquante reste « à venir », les autres s'affichent", async () => {
    Object.assign(lecture.valeurs, { ...MEDIATEUR, mediateurAdresse: null });
    const texte = article17(renderToStaticMarkup(await Conditions()));
    expect(texte).toContain("Médiateur fictif");
    expect(texte).toContain("adresse du médiateur (à venir)");
    expect(texte).not.toContain("site du médiateur (à venir)");
  });

  it("adresse et site saisis sans nom : aucun organisme n'est désigné, ni dans les conditions ni dans les mentions", async () => {
    Object.assign(lecture.valeurs, { ...MEDIATEUR, mediateurNom: null });
    const conditions = article17(renderToStaticMarkup(await Conditions()));
    const mentions = mediation(renderToStaticMarkup(await Mentions()));
    expect(mentions).toContain("aucun organisme n’est désigné");
    expect(conditions).toContain("qui sera désigné aux mentions légales dès l'adhésion de l'Éditeur");
    for (const coordonnee of [MEDIATEUR.mediateurAdresse, MEDIATEUR.mediateurSite]) {
      expect(conditions).not.toContain(coordonnee);
      expect(mentions).not.toContain(coordonnee);
    }
  });

  it("les conditions et les mentions légales affichent les mêmes faits du médiateur, quel que soit l'état saisi", async () => {
    const etats: Record<string, Partial<typeof MEDIATEUR>> = {
      "rien de saisi": {},
      "nom seul": { mediateurNom: MEDIATEUR.mediateurNom },
      "tout saisi": MEDIATEUR,
      "nom et site": { mediateurNom: MEDIATEUR.mediateurNom, mediateurSite: MEDIATEUR.mediateurSite },
      "adresse et site sans nom": { mediateurAdresse: MEDIATEUR.mediateurAdresse, mediateurSite: MEDIATEUR.mediateurSite },
    };
    const faits = [...Object.values(MEDIATEUR), "adresse du médiateur (à venir)", "site du médiateur (à venir)"];
    for (const [nom, saisie] of Object.entries(etats)) {
      lecture.valeurs = { ...lecture.valeurs, mediateurNom: null, mediateurAdresse: null, mediateurSite: null, ...saisie };
      const conditions = article17(renderToStaticMarkup(await Conditions()));
      const mentions = mediation(renderToStaticMarkup(await Mentions()));
      expect(faits.filter((f) => conditions.includes(f)), nom).toEqual(faits.filter((f) => mentions.includes(f)));
      expect(conditions.includes("sera désigné aux mentions légales"), nom).toBe(mentions.includes("aucun organisme n’est désigné"));
    }
  });
});
