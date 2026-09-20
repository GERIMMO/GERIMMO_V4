import { describe, expect, it } from "vitest";
import {
  cheminEspaceClient,
  familleOrganisation,
  initiales,
  LIBELLES_STATUT_ARTISAN,
  rangArtisan,
  trierArtisans,
} from "@/lib/clients-supervision";
import { ecranSansDonnees } from "@/lib/retours";

describe("Les clients vus de la supervision", () => {
  it("sépare les deux familles d'organisations, et ne range rien d'autre en propriétaire", () => {
    expect(familleOrganisation("proprietaire_direct")).toBe("proprietaire");
    expect(familleOrganisation("agence")).toBe("agence");
    // Un type absent ou inconnu reste une agence : c'est le cas courant, et
    // ranger une agence chez les propriétaires enverrait un client dans la
    // mauvaise liste.
    expect(familleOrganisation(null)).toBe("agence");
    expect(familleOrganisation("autre_chose")).toBe("agence");
  });

  it("met ce qui attend une décision en tête, et les refus avant les validés", () => {
    expect(rangArtisan("en_attente")).toBeLessThan(rangArtisan("refuse"));
    expect(rangArtisan("refuse")).toBeLessThan(rangArtisan("valide"));

    const tries = trierArtisans([
      { statut_plateforme: "valide", raison_sociale: "Alpha" },
      { statut_plateforme: "en_attente", raison_sociale: "Zulu" },
      { statut_plateforme: "refuse", raison_sociale: "Mike" },
      { statut_plateforme: "en_attente", raison_sociale: "Bravo" },
    ]);
    expect(tries.map((a) => a.raison_sociale)).toEqual(["Bravo", "Zulu", "Mike", "Alpha"]);
  });

  it("ne donne pas de LIEN vers l'espace d'un artisan : on y entre par un geste tracé", () => {
    // Le portail artisan n'est pas adressé par une organisation : on l'ouvre
    // avec `ouvrir_session_artisan` (supervision, 30 minutes, journalisée),
    // donc un formulaire, jamais une ancre.
    expect(cheminEspaceClient({ famille: "artisan", id: "abc" })).toBeNull();
    expect(cheminEspaceClient({ famille: "agence", id: "abc" })).toBe("/agence/abc");
    expect(cheminEspaceClient({ famille: "proprietaire", id: "abc" })).toBe("/agence/abc");
  });

  it("dit les statuts en français, jamais la valeur de l'énumération", () => {
    expect(LIBELLES_STATUT_ARTISAN.en_attente).toBe("En attente de validation");
    expect(LIBELLES_STATUT_ARTISAN.valide).toBe("Validé");
    expect(LIBELLES_STATUT_ARTISAN.refuse).toBe("Refusé");
  });

  it("tire deux initiales d'un nom, et ne rend jamais une pastille vide", () => {
    expect(initiales("Agence Alpha")).toBe("AA");
    expect(initiales("  Dupont   Plomberie  Sarl ")).toBe("DP");
    expect(initiales("Martin")).toBe("M");
    expect(initiales("")).toBe("◇");
    expect(initiales(null)).toBe("◇");
  });

  it("garde /admin/clients lisible dans le journal des retours, sans le nom du client", () => {
    expect(ecranSansDonnees("/admin/clients")).toBe("/admin/clients");
    expect(ecranSansDonnees("/admin/clients/artisans/UUID")).toBe(
      "/admin/clients/artisans/[dossier]"
    );
    expect(ecranSansDonnees("/admin/organisations/UUID")).toBe("/admin/organisations/[dossier]");
  });
});
