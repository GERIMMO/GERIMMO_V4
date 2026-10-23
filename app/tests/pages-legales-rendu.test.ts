import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRESTATAIRES, cleCoordonnees } from "../src/lib/editeur";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
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
  it("sans médiateur : la phrase dit l'adhésion à venir, sans coordonnées « reprises aux mentions légales »", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const texte = article17(html);
    expect(html).not.toContain("désigné aux");
    expect(texte).not.toMatch(/désigné/);
    expect(texte).not.toContain("reprises aux");
    expect(texte).not.toContain("coordonnées suivent");
    expect(texte).toContain("L'Éditeur n'a pas encore adhéré à un dispositif de médiation");
    expect(texte).toContain("seront indiqués ici et aux mentions légales dès l'adhésion");
    // Le droit du client reste écrit, comme sur les mentions légales.
    expect(texte).toContain("peut recourir gratuitement, avant toute saisine du juge, à un médiateur de la consommation");
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
    expect(texte).toContain("dont les coordonnées figurent aussi aux mentions légales");
    expect(texte).not.toContain("pas encore adhéré");
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
    expect(conditions).toContain("n'a pas encore adhéré");
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
      expect(conditions.includes("pas encore adhéré"), nom).toBe(mentions.includes("aucun organisme n’est désigné"));
    }
  });
});
