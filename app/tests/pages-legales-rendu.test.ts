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
// qu'aucun ne l'est (les mentions disent « Adhésion à venir »). Il affiche désormais les coordonnées lues en base,
// chacune « à venir » tant qu'elle manque : un fait d'éditeur, comme l'adresse de contact, sans changer la version.
describe("article 17 des conditions : le médiateur lu en base", () => {
  const article17 = (html: string) => {
    const debut = html.indexOf("17. Droit applicable et litiges");
    expect(debut).toBeGreaterThan(0);
    return html.slice(debut, html.indexOf("</section>", debut)).replace(/<[^>]+>/g, "");
  };

  it("sans médiateur : aucun organisme dit « désigné », chaque coordonnée « à venir »", async () => {
    const html = renderToStaticMarkup(await Conditions());
    const texte = article17(html);
    expect(html).not.toContain("désigné aux");
    expect(texte).not.toMatch(/désigné/);
    expect(texte).toContain("médiateur de la consommation (à venir)");
    expect(texte).toContain("adresse du médiateur (à venir)");
    expect(texte).toContain("site du médiateur (à venir)");
    // Le médiateur ne bloque rien (décision du 23/10) : pas d'encadré pour lui seul.
    expect(html).not.toContain("Document en cours de finalisation");
  });

  it("médiateur saisi : nom, adresse et site s'affichent, sans réserve", async () => {
    Object.assign(lecture.valeurs, {
      mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, Paris", mediateurSite: "https://example.test/mediation",
    });
    const texte = article17(renderToStaticMarkup(await Conditions()));
    expect(texte).toContain("Médiateur fictif");
    expect(texte).toContain("2 rue Exemple, Paris");
    expect(texte).toContain("https://example.test/mediation");
    expect(texte).not.toContain("(à venir)");
  });

  it("une coordonnée manquante reste « à venir », les autres s'affichent", async () => {
    Object.assign(lecture.valeurs, { mediateurNom: "Médiateur fictif", mediateurAdresse: null, mediateurSite: "https://example.test/mediation" });
    const texte = article17(renderToStaticMarkup(await Conditions()));
    expect(texte).toContain("Médiateur fictif");
    expect(texte).toContain("adresse du médiateur (à venir)");
    expect(texte).not.toContain("site du médiateur (à venir)");
  });
});
