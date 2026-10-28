/**
 * Audit final du 27/10/2026 (DRT-04) — le bandeau « lecture seule » dit la vraie cause et la vraie issue.
 * Une organisation suspendue ou archivée par la supervision lisait « Abonnement inactif ou impayé… Choisir ma
 * formule → » ; payer ne lève pas une suspension décidée par Gerimmo.
 */
import { describe, expect, it } from "vitest";
import { bandeauLectureSeule, causeFermeture } from "@/lib/lecture-seule";

const BASE = "/agence/org-1";

describe("la cause de la fermeture", () => {
  it("la supervision passe avant le statut ; sinon l'essai ou l'abonnement", () => {
    expect(causeFermeture("suspendue", true)).toBe("supervision");
    expect(causeFermeture("archivee", true)).toBe("supervision");
    expect(causeFermeture("suspendue", false)).toBe("abonnement");
    expect(causeFermeture("active", false)).toBe("abonnement");
    expect(causeFermeture("essai", false)).toBe("essai");
  });
});

describe("le bandeau", () => {
  it("suspendue par la supervision : ni abonnement, ni formule, ni impayé ; l'assistance pour le responsable", () => {
    const b = bandeauLectureSeule({ cause: "supervision", status: "suspendue", estResponsable: true, base: BASE });
    expect(b.etat).toBe("Espace suspendu par Gerimmo — lecture seule");
    expect(b.lien).toEqual({ href: "/assistance", libelle: "Écrire à l’assistance →" });
    expect(`${b.etat} ${b.suite}`).not.toMatch(/abonnement|formule|impayé|payés/i);
  });
  it("archivée par la supervision ; l'agent sait que seul Gerimmo rouvre, sans lien", () => {
    const b = bandeauLectureSeule({ cause: "supervision", status: "archivee", estResponsable: false, base: BASE });
    expect(b.etat).toBe("Espace archivé par Gerimmo — lecture seule");
    expect(b.suite).toMatch(/seul Gerimmo peut rouvrir/);
    expect(b.lien).toBeUndefined();
  });
  it("essai échu et impayé gardent leurs textes et le lien vers l'abonnement", () => {
    expect(bandeauLectureSeule({ cause: "essai", estResponsable: true, base: BASE })).toEqual({
      etat: "Période d’essai terminée — lecture seule",
      suite: "activez l’abonnement pour continuer à saisir.",
      lien: { href: `${BASE}/abonnement`, libelle: "Choisir ma formule →" },
    });
    const agent = bandeauLectureSeule({ cause: "abonnement", estResponsable: false, base: BASE });
    expect(agent.etat).toBe("Abonnement inactif ou impayé — lecture seule");
    expect(agent.suite).toBe("votre administrateur doit activer l’abonnement pour que la saisie reprenne.");
    expect(agent.lien).toBeUndefined();
  });
});
