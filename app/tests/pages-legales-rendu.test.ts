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
