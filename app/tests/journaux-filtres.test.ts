/**
 * Les journaux filtrés et paginés (25/09) : l'adresse porte l'état, et un
 * détail d'événement ne laisse passer que des compteurs et des codes.
 */
import { describe, expect, it } from "vitest";
import { adressePage } from "../src/app/admin/journaux/filtres";
import { codesConnusJournaux, detailsExpurges } from "../src/lib/libelles-journaux";

describe("l'adresse d'une page de journal", () => {
  const filtres = { type: "tache_", org: "", depuis: "2026-09-01", jusqu: "" };
  it("conserve les filtres et la page des autres journaux", () => {
    const a = new URL(`https://x${adressePage("technique", 3, filtres, { audit: 2, technique: 1, acces: 1 })}`);
    expect(a.pathname).toBe("/admin/journaux");
    expect(a.searchParams.get("type")).toBe("tache_");
    expect(a.searchParams.get("depuis")).toBe("2026-09-01");
    expect(a.searchParams.get("p_technique")).toBe("3");
    expect(a.searchParams.get("p_audit")).toBe("2");
    expect(a.searchParams.has("org")).toBe(false);
    expect(a.searchParams.has("p_acces")).toBe(false);
  });
  it("revient à une adresse nue quand tout est à la première page sans filtre", () => {
    expect(adressePage("audit", 1, { type: "", org: "", depuis: "", jusqu: "" }, { audit: 1, technique: 1, acces: 1 })).toBe("/admin/journaux");
  });
});

describe("le détail expurgé d'un événement", () => {
  it("garde les compteurs, les oui/non et les codes courts", () => {
    expect(detailsExpurges({ dossiers: 3, ok: true, motif: "stripe_absent", liste: [1, 2] }))
      .toBe("dossiers : 3 · ok : oui · motif : stripe_absent · liste : 2 éléments");
  });
  it("ne laisse passer ni texte libre, ni adresse, ni identifiant", () => {
    expect(detailsExpurges({ email: "a@b.fr", message: "Le locataire Dupont…", id: "3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d" })).toBeNull();
    expect(detailsExpurges("texte")).toBeNull();
    expect(detailsExpurges(null)).toBeNull();
  });
  it("propose les codes connus des deux journaux", () => {
    const codes = codesConnusJournaux();
    expect(codes.technique).toContain("tache_orchestrateur");
    expect(codes.technique).toContain("erreur_ecran");
    expect(codes.audit).toContain("developpement_decide");
  });
});
