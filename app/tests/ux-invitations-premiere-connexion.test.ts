import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  invitation: null as Record<string, unknown> | null,
  lien: { etat: "invalide" } as Record<string, unknown>,
  rpc: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`REDIRECT ${url}`); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "invite", email: "invite@example.invalid" } } }) }, rpc: banc.rpc }) }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({}) }));
vi.mock("@/lib/confirmation-mobile-caution", async (original) => ({ ...await original<typeof import("@/lib/confirmation-mobile-caution")>(), lireLienCaution: async () => banc.lien }));
vi.mock("@/app/actions/auth", () => ({ definirNouveauMotDePasse: vi.fn() }));
vi.mock("@/app/actions/invitations", () => ({ repondreInvitation: vi.fn() }));
vi.mock("@/app/actions/confirmation-caution", () => ({ confirmerMobileCaution: vi.fn() }));

import PageInvitation from "@/app/invitations/[invitationId]/page";
import PageCaution from "@/app/signature/caution/[jeton]/page";
import { FormulaireNouveauMotDePasse } from "@/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";
const ID = "76c1c4e6-bbfb-4b0e-ae7c-e4eaee085af0";
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function locataire(id = ID) { return renderToStaticMarkup(await PageInvitation({ params: Promise.resolve({ invitationId: id }) })); }
async function caution() { return renderToStaticMarkup(await PageCaution({ params: Promise.resolve({ jeton: "jeton-fictif" }) } as never)); }
beforeEach(() => {
  banc.invitation = null; banc.lien = { etat: "invalide" };
  banc.rpc.mockReset().mockImplementation(async () => ({ data: banc.invitation ? [banc.invitation] : [], error: null }));
});

describe("UX 11A — invitation locataire", () => {
  it("explique l'identité invitante, le rôle et le geste sans accorder d'accès", async () => {
    banc.invitation = { etat: "en_attente", organisation: "SCI du Tilleul", expire_le: "2030-01-20", organization_id: "org-fictive" };
    const html = await locataire();
    expect(texte(html)).toContain("Proposée par SCI du Tilleul");
    expect(texte(html)).toContain("Votre invitation locataire");
    expect(texte(html)).toContain("Accepter l’invitation");
    expect(texte(html)).not.toContain("Ouvrir mon espace locataire");
    expect(banc.rpc).toHaveBeenCalledExactlyOnceWith("mes_invitations_locataire", { p_id: ID });
  });
  it.each(["expiree", "annulee", "refusee"])("%s : nouveau lien à demander, aucune réutilisation ni acceptation", async (etat) => {
    banc.invitation = { etat, organisation: "SCI du Tilleul" };
    const html = await locataire();
    expect(texte(html)).toContain("Demander un nouveau lien");
    expect(html).toContain('href="/assistance?type=probleme#nouvelle"');
    expect(texte(html)).not.toContain("Accepter l’invitation");
  });
  it("déjà acceptée : destination de l'organisation retournée par les droits existants", async () => {
    banc.invitation = { etat: "acceptee", organisation: "SCI du Tilleul", organization_id: "org-fictive" };
    expect(await locataire()).toContain('href="/locataire/org-fictive"');
  });
  it("lien mal formé : aide publique sans interroger le dossier", async () => {
    const html = await locataire("invalide");
    expect(texte(html)).toContain("Ce lien n’est pas valable");
    expect(html).toContain('href="/assistance?type=probleme#nouvelle"');
    expect(banc.rpc).not.toHaveBeenCalled();
  });
  it("mauvais compte : aucune identité du bailleur divulguée", async () => {
    const html = await locataire();
    expect(texte(html)).toContain("Cette invitation n’est pas accessible avec ce compte");
    expect(texte(html)).not.toContain("Proposée par");
  });
});

describe("UX 11A — garant, un lien clos ne promet ni accès ni signature", () => {
  it.each(["bail", "cautionnement"])("lien valide %s : identité, qualité et prochain geste préservés", async (acte) => {
    banc.lien = { etat: "valide", acte, garant: { prenom: "Alix", nom: "Martin" }, bailleur: "SCI du Tilleul", locataires: "Camille Durand", logement: "12 rue des Tilleuls", expireLe: "2030-01-20", essai: true };
    const html = await caution();
    expect(texte(html)).toContain("SCI du Tilleul, bailleur");
    expect(texte(html)).toContain("Bonjour Alix Martin");
    expect(texte(html)).toContain("Confirmer votre numéro de mobile");
    expect(texte(html)).toContain(acte === "bail" ? "en qualité de garant" : "acte de cautionnement");
    expect(html).toContain('type="tel"');
    expect(texte(html)).not.toContain("Demander un nouveau lien");
  });
  it.each(["invalide", "expire", "annule", "utilise", "suspendu"])("%s : sortie utile sans dossier ni formulaire de mobile", async (etat) => {
    banc.lien = { etat };
    const html = await caution();
    expect(html).toContain('href="/assistance?type=probleme#nouvelle"');
    expect(texte(html)).toContain("Copier mon message");
    expect(html).not.toContain('name="mobile"');
    expect(texte(html)).not.toContain("Qui vous le demande");
    if (etat === "utilise") expect(texte(html)).toContain("Votre numéro est déjà confirmé");
  });
  // Défaut d'écran E173 (passe 1) : un lien inconnu, annulé, déjà utilisé ou expiré ne dit pas son acte (choix de la
  // page : rien du dossier), mais le panneau annonçait toujours « Un acte de cautionnement à signer en ligne. », même
  // au garant qui ne signe que le bail. Seul l'état « suspendu » vient forcément d'un cautionnement (réglage serveur).
  it.each(["invalide", "expire", "annule", "utilise"])("%s : le panneau reste neutre, sans annoncer un cautionnement", async (etat) => {
    banc.lien = { etat };
    const t = texte(await caution());
    expect(t).toContain("Un document à signer en ligne.");
    expect(t).not.toMatch(/cautionnement|en qualité de garant/);
    // « l'acte » se lisait comme l'acte de cautionnement : le message du lien déjà utilisé parle du document.
    if (etat === "utilise") expect(t).toContain("dès que le document à signer sera envoyé");
  });
  it("lecture impossible du lien : panneau neutre aussi", async () => {
    banc.lien = null as never;
    const t = texte(await caution());
    expect(t).toContain("Nous ne pouvons pas vérifier ce lien pour le moment.");
    expect(t).toContain("Un document à signer en ligne.");
    expect(t).not.toContain("cautionnement");
  });
  it("suspendu : seul un cautionnement peut l'être, le panneau le dit", async () => {
    banc.lien = { etat: "suspendu" };
    expect(texte(await caution())).toContain("Un acte de cautionnement à signer en ligne.");
  });
});

describe("UX 11A — choix initial et récupération restent distincts", () => {
  it.each([true, false])("première activation = %s : libellé adapté, mêmes champs de sécurité", (premiereActivation) => {
    const html = renderToStaticMarkup(createElement(FormulaireNouveauMotDePasse, { suite: "/espaces", premiereActivation }));
    expect(texte(html)).toContain(premiereActivation ? "Choisir mon mot de passe" : "Changer le mot de passe");
    expect(html).toContain('name="mot_de_passe"');
    expect(html).toContain('name="confirmation"');
    expect(html).toContain('minLength="12"');
  });
});
