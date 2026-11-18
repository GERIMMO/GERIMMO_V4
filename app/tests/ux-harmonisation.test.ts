import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/recette-locale" }));
vi.mock("@/app/actions/erreurs", () => ({ signalerErreurEcran: vi.fn() }));
import Chargement from "@/app/loading";
import Proprietaire from "@/app/agence/[orgId]/loading";
import Locataire from "@/app/locataire/[orgId]/loading";
import Artisan from "@/app/artisan/loading";
import Admin from "@/app/admin/loading";
import Erreur from "@/app/error";
import ErreurGlobale from "@/app/global-error";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

const rendre = renderToStaticMarkup;
describe("UX 12B — retours communs, sans faux succès", () => {
  it.each([["racine", Chargement], ["propriétaire", Proprietaire], ["locataire", Locataire], ["artisan", Artisan], ["super-admin", Admin]] as const)("%s : le chargement est lisible et accessible", (_, Composant) => {
    const h = rendre(createElement(Composant));
    expect(h).toContain('role="status"');
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain("Chargement de la page…");
    expect(h).not.toContain("0,00");
    expect(h).not.toContain("Tout est en ordre");
  });
  it.each([["page", Erreur], ["racine", ErreurGlobale]] as const)("erreur %s : issue accessible et référence conservée sans fuite", (_, Composant) => {
    const error = Object.assign(new Error("DONNEE_PRIVEE"), { digest: "ref-12b" });
    const h = rendre(createElement(Composant, { error, reset: vi.fn() }));
    expect(h).toContain("<h1");
    expect(h).toContain("Réessayer");
    expect(h).toContain('href="/assistance"');
    expect(h).toContain("Contacter l’assistance");
    expect(h).toContain("Référence pour l’assistance");
    expect(h).toContain("ref-12b");
    expect(h).not.toContain("DONNEE_PRIVEE");
    expect(h).not.toContain("incident est noté");
  });
  it("ne fabrique pas de référence d'erreur lorsqu'elle manque", () => {
    const h = rendre(createElement(Erreur, { error: new Error("secret"), reset: vi.fn() }));
    expect(h).not.toContain("Référence pour l’assistance");
    expect(h).not.toContain("secret");
    expect(h).toContain("Réessayer");
  });
  it("annonce le traitement et bloque un second envoi, sans annoncer sa réussite", () => {
    const h = rendre(createElement(BoutonEnvoi, { envoiNatif: true, enCours: true }, "Enregistrer"));
    expect(h).toContain('aria-busy="true"');
    expect(h).toMatch(/<button[^>]*disabled=""/);
    expect(h).toContain("Traitement en cours…");
    expect(h).not.toContain("Enregistré");
  });
  it("préserve le libellé précis fourni par le formulaire", () => {
    const h = rendre(createElement(BoutonEnvoi, { envoiNatif: true, enCours: true, enCoursTexte: "Transmission du document…" }, "Transmettre"));
    expect(h).toContain("Transmission du document…");
    expect(h).not.toContain("Traitement en cours…");
  });
  it("ne montre pas une opération en cours avant l'action", () => {
    const h = rendre(createElement(BoutonEnvoi, { envoiNatif: true }, "Envoyer le message"));
    expect(h).not.toContain('aria-busy="true"');
    expect(h).not.toMatch(/<button[^>]*disabled=""/);
    expect(h).toContain("Envoyer le message");
  });
});
