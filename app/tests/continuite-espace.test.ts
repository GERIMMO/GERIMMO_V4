/**
 * Continuité de navigation (audit du 20/11/2026) : une page servie hors de la coquille d'un espace (conditions,
 * confidentialité, aide, compte, quittance, outils…) propose de revenir à la page d'où l'on vient. Logique pure de
 * `src/lib/continuite-espace.ts` : quels chemins appartiennent à un espace, ce qui est retenu, ce qui est refusé.
 */
import { describe, expect, it } from "vitest";
import { accueilEspaceDuChemin, cheminEntreeSession, espaceAMemoriser, espaceDuChemin, lireEspaceMemorise } from "../src/lib/continuite-espace";

const ID = "c14c3187-1258-4e58-8822-368c6007e3fa";

describe("continuité entre un espace et les pages hors coquille", () => {
  it("reconnaît les cinq espaces, et eux seuls", () => {
    expect(espaceDuChemin(`/espace/${ID}`)).toBe("mon espace propriétaire");
    expect(espaceDuChemin(`/agence/${ID}/loyers`)).toBe("mon espace de gestion");
    expect(espaceDuChemin(`/locataire/${ID}/documents`)).toBe("mon espace locataire");
    expect(espaceDuChemin("/artisan")).toBe("mon espace artisan");
    expect(espaceDuChemin("/artisan/devis")).toBe("mon espace artisan");
    expect(espaceDuChemin("/admin/brief")).toBe("la supervision");
    for (const hors of ["/", "/conditions", "/confidentialite", "/compte", "/compte/donnees", "/assistance", "/espaces", "/securite", `/quittance/${ID}`, "/outils/calcul-irl", "/journal", "/agences", "/artisans", "/administration", "/locataire/pas-un-identifiant"]) {
      expect(espaceDuChemin(hors), hors).toBeNull();
    }
  });

  it("les pages publiques rangées sous /artisan ne prouvent aucune session", () => {
    expect(espaceDuChemin("/artisan/inscription")).toBeNull();
    expect(espaceDuChemin("/artisan/panne")).toBeNull();
  });

  it("retient la page courante d'un espace, recherche comprise, et rien hors d'un espace", () => {
    expect(espaceAMemoriser(`/locataire/${ID}/loyers`, "?mois=2026-11")).toEqual({ href: `/locataire/${ID}/loyers?mois=2026-11`, libelle: "mon espace locataire" });
    expect(espaceAMemoriser("/conditions")).toBeNull();
  });

  it("les écrans d'entrée et de sortie de session effacent la mémoire", () => {
    for (const c of ["/connexion", "/inscription", "/mot-de-passe-oublie", "/nouveau-mot-de-passe", "/auth/confirm", `/invitations/${ID}`, "/signature/caution/abc"]) expect(cheminEntreeSession(c), c).toBe(true);
    for (const c of ["/conditions", "/compte", "/assistance", "/", `/quittance/${ID}`]) expect(cheminEntreeSession(c), c).toBe(false);
  });

  it("ne suit jamais une valeur du stockage qui ne désigne pas un chemin interne d'espace", () => {
    const bon = JSON.stringify({ href: `/espace/${ID}/parc?vue=liste`, libelle: "n'importe quoi" });
    expect(lireEspaceMemorise(bon)).toEqual({ href: `/espace/${ID}/parc?vue=liste`, libelle: "mon espace propriétaire" });
    for (const mauvais of [
      null,
      "",
      "pas du json",
      "null",
      JSON.stringify({ href: "https://exemple.invalid/espace/" + ID }),
      JSON.stringify({ href: `//exemple.invalid/espace/${ID}` }),
      JSON.stringify({ href: `/\\exemple.invalid/espace/${ID}` }),
      JSON.stringify({ href: "/conditions" }),
      JSON.stringify({ href: "javascript:alert(1)" }),
      JSON.stringify({ href: 42 }),
      JSON.stringify({ libelle: "mon espace locataire" }),
    ]) {
      expect(lireEspaceMemorise(mauvais), String(mauvais)).toBeNull();
    }
  });

  it("le libellé affiché vient du chemin, jamais du stockage", () => {
    const valeur = lireEspaceMemorise(JSON.stringify({ href: "/admin/sante", libelle: "<b>piège</b>" }));
    expect(valeur?.libelle).toBe("la supervision");
  });
  it("ramène à l'accueil de l'espace depuis un écran d'erreur ou une page introuvable", () => {
    expect(accueilEspaceDuChemin(`/agence/${ID}/baux/inconnu`)).toEqual({ href: `/agence/${ID}`, libelle: "mon espace de gestion" });
    expect(accueilEspaceDuChemin(`/espace/${ID}/parc`)).toEqual({ href: `/espace/${ID}`, libelle: "mon espace propriétaire" });
    expect(accueilEspaceDuChemin(`/locataire/${ID}/loyers`)).toEqual({ href: `/locataire/${ID}`, libelle: "mon espace locataire" });
    expect(accueilEspaceDuChemin("/artisan/missions/abc")).toEqual({ href: "/artisan", libelle: "mon espace artisan" });
    expect(accueilEspaceDuChemin("/admin/clients")).toEqual({ href: "/admin", libelle: "la supervision" });
    // Hors d'un espace, et sur les pages publiques rangées sous /artisan : aucun accueil à proposer.
    expect(accueilEspaceDuChemin("/compte")).toBeNull();
    expect(accueilEspaceDuChemin("/artisan/inscription")).toBeNull();
    expect(accueilEspaceDuChemin("/")).toBeNull();
  });
});
