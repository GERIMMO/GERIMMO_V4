/**
 * La page du lien d'invitation, vue par un artisan connecté avec une AUTRE adresse que celle de l'invitation (seconde
 * relecture du 15/10/2026 du lot « invitation-artisan »).
 *
 * Avant : « Déconnectez-vous, puis ouvrez de nouveau le lien reçu par e-mail. » Pour un artisan dont l'entreprise est
 * déjà inscrite sous une autre adresse, c'était un chemin impossible : en créant un second compte avec l'adresse invitée,
 * il ne pouvait pas inscrire une seconde fois son SIRET. La page lui dit désormais de demander au propriétaire de le
 * réinviter à l'adresse de son compte ; elle ne révèle toujours rien de l'invitation (ni qui invite, ni quelle adresse).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  user: { id: "u1", email: "pro@entreprise.test" } as { id: string; email: string } | null,
  fiche: null as Record<string, unknown> | null,
  invitations: [] as Record<string, unknown>[],
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ seDeconnecter: vi.fn(), creerCompteArtisan: vi.fn() }));
vi.mock("@/app/actions/invitations-artisan", () => ({ repondreInvitationArtisan: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({
  chargerFicheArtisan: async () => ({
    supabase: { rpc: async () => ({ data: banc.invitations, error: null }) },
    user: banc.user,
    fiche: banc.fiche,
    erreur: false,
  }),
}));

import PageInvitationArtisan from "../src/app/artisan/invitation/[invitationId]/page";

const ID = "6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";
const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function rendre() {
  const element = await PageInvitationArtisan({ params: Promise.resolve({ invitationId: ID }) } as never);
  return texteDe(renderToStaticMarkup(element));
}

beforeEach(() => {
  banc.user = { id: "u1", email: "pro@entreprise.test" };
  banc.fiche = null;
  banc.invitations = [];
});

describe("connecté avec une autre adresse que celle de l'invitation", () => {
  it("entreprise déjà inscrite sous cette autre adresse : demander au propriétaire de réinviter la bonne adresse", async () => {
    banc.fiche = { artisan_id: "a1", raison_sociale: "Plomberie Martin", statut_plateforme: "valide" };
    const texte = await rendre();
    expect(texte).toContain("Vous êtes connecté avec pro@entreprise.test");
    expect(texte).toContain("Votre entreprise est déjà inscrite sur Gerimmo avec cette adresse");
    expect(texte).toContain("demandez à la personne qui vous a invité de vous réinviter à l’adresse pro@entreprise.test");
    // Plus de chemin impossible : on ne l'envoie pas créer un second compte.
    expect(texte).not.toContain("puis ouvrez de nouveau le lien reçu par e-mail");
  });

  it("sans entreprise inscrite : les deux issues, se reconnecter avec l'adresse invitée ou demander une invitation à cette adresse", async () => {
    const texte = await rendre();
    expect(texte).toContain("Une invitation ne s’ouvre qu’avec l’adresse e-mail qui l’a reçue");
    expect(texte).toContain("Demandez à la personne qui vous a invité de vous réinviter à l’adresse pro@entreprise.test");
  });

  it("ne dit rien de l'invitation : ni qui invite, ni quelle adresse", async () => {
    banc.fiche = { artisan_id: "a1", raison_sociale: "Plomberie Martin", statut_plateforme: "valide" };
    const texte = await rendre();
    expect(texte).not.toContain("Proposée par");
    expect(texte).not.toMatch(/@(?!entreprise\.test)/);
  });
});
