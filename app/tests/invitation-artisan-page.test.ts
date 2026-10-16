/**
 * La page du lien d'invitation, vue par un artisan connecté avec une AUTRE adresse que celle de l'invitation (seconde
 * relecture du 15/10/2026 du lot « invitation-artisan »).
 *
 * Avant : « Déconnectez-vous, puis ouvrez de nouveau le lien reçu par e-mail. » Pour un artisan dont l'entreprise est
 * déjà inscrite sous une autre adresse, c'était un chemin impossible : en créant un second compte avec l'adresse invitée,
 * il ne pouvait pas inscrire une seconde fois son SIRET. La page lui dit désormais de demander au propriétaire de le
 * réinviter à l'adresse de son compte ; elle ne révèle toujours rien de l'invitation (ni qui invite, ni quelle adresse).
 *
 * Troisième relecture du 15/10 (mutants T25d et T26) : le nom de l'organisation qui invite est un texte libre de
 * l'invitant. La page de l'artisan et la console de validation (/admin/artisans) sont RENDUES ici avec un nom piégé ; ni
 * l'une ni l'autre ne doit l'afficher brut (lien, numéro, nom de Gerimmo), quel que soit l'état de l'invitation.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  user: { id: "u1", email: "pro@entreprise.test" } as { id: string; email: string } | null,
  fiche: null as Record<string, unknown> | null,
  invitations: [] as Record<string, unknown>[],
  invitationsAValider: [] as Record<string, unknown>[],
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

// La console de validation (/admin/artisans) : le client Supabase de la supervision, simulé.
const resultat = (r: unknown) => {
  const chaine: Record<string, unknown> = {};
  for (const m of ["select", "in", "is"]) chaine[m] = () => chaine;
  chaine.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
  return chaine;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nom: string) =>
      ({
        is_super_admin: { data: true, error: null },
        artisans_a_valider: {
          data: [{
            artisan_id: "a-valider", raison_sociale: "Plomberie à valider", siret: "12345678900011", siret_etat: "verifie",
            telephone: null, email: null, metiers: ["plomberie"], nb_pieces: 0, decennale_valide: false, rc_pro_deposee: false,
            inscrit_le: "2026-10-15T08:00:00Z", purge_prevue_le: null,
          }],
          error: null,
        },
        invitations_des_artisans_a_valider: { data: banc.invitationsAValider, error: null },
        decisions_artisans_supervision: { data: [], error: null },
      })[nom] ?? { data: null, error: { message: `rpc inattendu : ${nom}` } },
    from: (table: string) => resultat(table === "artisans" ? { count: 0, error: null } : { data: [], error: null }),
  }),
}));
vi.mock("../src/app/admin/artisans/decision-artisan", () => ({ DecisionArtisan: () => null }));
vi.mock("../src/app/admin/artisans/retour-decisions", () => ({ RetourDecisionsArtisan: ({ children }: { children: unknown }) => children }));

import PageInvitationArtisan from "../src/app/artisan/invitation/[invitationId]/page";
import PageArtisansAValider from "../src/app/admin/artisans/page";

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
  banc.invitationsAValider = [];
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

/** Le nom piégé du test des actions (invitation-artisan-actions.test.ts) : hameçonnage sous la marque Gerimmo. */
const PIEGE = `ALERTE Gerimmo : votre compte artisan sera suspendu sous 24 h. Régularisez sur https://gerimmo-verification.example/connexion ou appelez le 08 99 00 00 00\r\nBcc: x@y.z ${".".repeat(2000)}`;
const INTERDITS = ["ALERTE", "gerimmo-verification", "08 99", "Bcc", "suspendu"];

describe("le nom de l'invitant n'est jamais affiché brut (page rendue)", () => {
  const invitation = (etat: string, organisation = PIEGE) => ({
    id: ID, organisation, etat, expire_le: "2026-11-14T23:00:00Z", a_une_fiche: true,
  });

  it.each(["en_attente", "acceptee"])("page de l'artisan, invitation %s : formule neutre, rien du nom piégé", async (etat) => {
    banc.user = { id: "u1", email: "invite@entreprise.test" };
    banc.fiche = { artisan_id: "a1", raison_sociale: "Plomberie Martin", statut_plateforme: "en_attente" };
    banc.invitations = [invitation(etat)];
    const texte = await rendre();
    for (const interdit of INTERDITS) expect(texte, interdit).not.toContain(interdit);
    expect(texte).toContain("Proposée par un propriétaire qui utilise Gerimmo");
    expect(texte).toContain(etat === "en_attente" ? "vous entrez dans le carnet d’artisans de ce propriétaire" : "Vous êtes dans son carnet d’artisans");
  });

  it("page de l'artisan : un nom ordinaire est affiché (le test voit bien le nom quand il est sûr)", async () => {
    banc.user = { id: "u1", email: "invite@entreprise.test" };
    banc.fiche = { artisan_id: "a1", raison_sociale: "Plomberie Martin", statut_plateforme: "en_attente" };
    banc.invitations = [invitation("en_attente", "Parc de Claire Moreau")];
    const texte = await rendre();
    expect(texte).toContain("Proposée par Parc de Claire Moreau");
    expect(texte).toContain("vous entrez dans le carnet d’artisans de Parc de Claire Moreau");
  });

  async function rendreConsole() {
    const element = await PageArtisansAValider({ searchParams: Promise.resolve({}) });
    return texteDe(renderToStaticMarkup(element));
  }

  it.each([false, true])("console de validation (/admin/artisans), invitation acceptée : %s — formule neutre, rien du nom piégé", async (acceptee) => {
    banc.invitationsAValider = [{ artisan_id: "a-valider", organisation: PIEGE, acceptee }];
    const texte = await rendreConsole();
    expect(texte).toContain("Plomberie à valider");
    for (const interdit of INTERDITS) expect(texte, interdit).not.toContain(interdit);
    expect(texte).toContain("Invité par un propriétaire (nom masqué : il contient un lien, un numéro ou le nom de Gerimmo)");
  });

  it("console de validation : un nom ordinaire est affiché", async () => {
    banc.invitationsAValider = [{ artisan_id: "a-valider", organisation: "Parc de Claire Moreau", acceptee: false }];
    const texte = await rendreConsole();
    expect(texte).toContain("Invité par Parc de Claire Moreau (invitation pas encore acceptée)");
  });
});
