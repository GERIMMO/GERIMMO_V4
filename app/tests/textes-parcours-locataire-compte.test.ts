/**
 * Relevés LOC-01, LOC-22, PRF-06, PRF-09 et AUD-B-05 (audit du 13/10/2026) : cinq endroits où l'écran disait autre chose
 * que ce qui se passait, ou ne disait rien.
 *  · LOC-01 : le dépôt d'une attestation déjà présente répondait « réessayez dans un instant » — réessayer ne servira jamais ;
 *  · LOC-22 : un locataire connecté qui ouvre /artisan arrivait sur le formulaire d'inscription artisan ;
 *  · PRF-06 : sur la page Compte, « le lien reçu par email » renvoyait l'utilisateur connecté à son accueil, sans explication ;
 *  · PRF-09 : « Retour à mes fiches » était un `<a href="#">` ;
 *  · AUD-B-05 : deux photos identiques envoyées ensemble n'étaient jointes qu'une fois, sans que l'écran le dise.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  user: { id: "compte" } as { id: string } | null,
  fiche: [] as unknown[],
  memberships: [] as { role: string }[],
  erreurMemberships: null as { message: string } | null,
  rpc: vi.fn(),
  joindre: vi.fn(),
}));

class Redirection extends Error {
  constructor(public cible: string) {
    super(`REDIRECT:${cible}`);
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (cible: string) => {
    throw new Redirection(cible);
  },
  notFound: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notifierDevisDemande: vi.fn(),
  notifierIncidentUrgentDeclare: vi.fn(async () => ({ envoyee: false })),
  notifierMissionAnnulee: vi.fn(),
  notifierMissionConfiee: vi.fn(),
  notifierRendezVousFixe: vi.fn(),
}));
vi.mock("@/lib/photos-incident-reprise", () => ({ joindrePhotosAvecReprise: (...args: unknown[]) => banc.joindre(...args) }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: null, supabase: {}, role: null }),
  verifierLocataire: async () => ({ user: banc.user, supabase: { rpc: (...args: unknown[]) => banc.rpc(...args) } }),
}));

// Un client minimal : la session, la RPC `mon_artisan`, les adhésions et le dépôt de fichiers.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: banc.user } }) },
    rpc: (nom: string, args: unknown) => (nom === "mon_artisan" ? Promise.resolve({ data: banc.fiche, error: null }) : banc.rpc(nom, args)),
    from: (table: string) => {
      const donnees = table === "memberships" ? banc.memberships : [];
      const resultat = { data: donnees, error: table === "memberships" ? banc.erreurMemberships : null };
      const q: Record<string, unknown> = {};
      for (const methode of ["select", "eq", "neq", "limit"]) q[methode] = () => q;
      q.maybeSingle = async () => ({ data: donnees[0] ?? null, error: null });
      q.then = (suite: (r: typeof resultat) => unknown) => Promise.resolve(resultat).then(suite);
      return q;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));

import { deposerMonAttestation } from "../src/app/actions/attestation-locataire";
import { verifierAccesArtisan } from "../src/app/artisan/acces";
import { VuePersonnes } from "../src/app/agence/[orgId]/personnes/vue-personnes";
import { declarerMonIncident } from "../src/app/actions/incidents";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  banc.user = { id: "compte" };
  banc.fiche = [];
  banc.memberships = [];
  banc.erreurMemberships = null;
  banc.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  banc.joindre.mockReset().mockResolvedValue(undefined);
});

describe("LOC-01 : déposer une attestation déjà présente", () => {
  const demain = `${new Date().getFullYear() + 1}-06-30`;
  const pdf = () => new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF"], "attestation.pdf", { type: "application/pdf" });
  const formulaire = () => {
    const f = new FormData();
    f.set("fichier", pdf());
    f.set("expire_le", demain);
    f.set("titre", "Assurance habitation");
    return f;
  };
  beforeEach(() => {
    banc.memberships = [{ role: "locataire" }];
  });

  it("dit que le fichier est déjà dans le dossier, sans promettre qu'un nouvel essai marchera", async () => {
    banc.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "documents_empreinte_unique"' },
    });
    const retour = await deposerMonAttestation("org", {}, formulaire());
    expect(retour.succes).toBeUndefined();
    expect(retour.erreur).toContain("Ce document est déjà enregistré dans votre dossier");
    expect(retour.erreur).not.toMatch(/Réessayez|réessayez/);
    expect(retour.valeurs?.titre).toBe("Assurance habitation");
  });

  it("le reconnaît aussi quand la passerelle ne rend que le texte de la contrainte, sans code", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "documents_empreinte_unique"' } });
    const retour = await deposerMonAttestation("org", {}, formulaire());
    expect(retour.erreur).toContain("Ce document est déjà enregistré dans votre dossier");
  });

  it("une autre contrainte d'unicité ne se fait pas passer pour un doublon de fichier", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "documents_remplace_id_unique"' } });
    const retour = await deposerMonAttestation("org", {}, formulaire());
    expect(retour.erreur).not.toContain("déjà enregistré dans votre dossier");
    expect(retour.erreur).toBeTruthy();
  });

  it("un dépôt qui passe annonce toujours son succès", async () => {
    const retour = await deposerMonAttestation("org", {}, formulaire());
    expect(retour.succes).toContain("Attestation déposée");
  });
});

describe("LOC-22 : un locataire connecté qui ouvre /artisan", () => {
  const entrer = () => verifierAccesArtisan();

  it("retourne à ses espaces (son espace locataire), pas au formulaire d'inscription artisan", async () => {
    banc.memberships = [{ role: "locataire" }];
    await expect(entrer()).rejects.toThrow("REDIRECT:/espaces");
  });

  it("un compte neuf, sans aucun espace, va toujours à l'inscription artisan", async () => {
    banc.memberships = [];
    await expect(entrer()).rejects.toThrow("REDIRECT:/artisan/inscription");
  });

  it("une lecture des adhésions qui échoue ne ferme pas l'inscription", async () => {
    banc.erreurMemberships = { message: "indisponible" };
    banc.memberships = [{ role: "locataire" }];
    await expect(entrer()).rejects.toThrow("REDIRECT:/artisan/inscription");
  });

  it("un artisan qui a sa fiche entre dans son portail", async () => {
    banc.fiche = [{ artisan_id: "art", raison_sociale: "Plomberie Test" }];
    banc.memberships = [{ role: "locataire" }];
    await expect(entrer()).resolves.toMatchObject({ fiche: { artisan_id: "art" } });
  });

  it("sans session, la connexion garde son retour vers /artisan", async () => {
    banc.user = null;
    await expect(entrer()).rejects.toThrow("REDIRECT:/connexion?suite=%2Fartisan");
  });
});

describe("PRF-06 : la page Compte ne propose plus un lien qui ne mène nulle part", () => {
  const source = lire("src/app/compte/page.tsx");
  it("« le lien reçu par email » n'est plus un lien vers /mot-de-passe-oublie", () => {
    expect(source).not.toContain('href="/mot-de-passe-oublie"');
  });
  it("la phrase dit où retrouver le lien : sur la page de connexion", () => {
    expect(texteDe(source)).toContain("Mot de passe perdu et session fermée ?");
    expect(texteDe(source)).toContain("Depuis la page de connexion, « Mot de passe oublié » vous envoie un lien par email");
  });
});

describe("PRF-09 : « Retour à mes fiches » est un bouton", () => {
  const html = renderToStaticMarkup(
    createElement(VuePersonnes, { titre: "Personnes", nombre: "3", liste: createElement("div", null, "liste"), creation: createElement("div", null, "création") })
  );
  it("il n'y a plus de lien factice href=\"#\"", () => {
    expect(html).not.toContain('href="#"');
  });
  it("le retour est un vrai bouton, nommé comme avant", () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Retour à mes fiches/);
  });
  it("« Créer une fiche » garde son ancre réelle", () => {
    expect(html).toContain('href="#creer-fiche"');
  });
});

describe("AUD-B-05 : deux photos identiques envoyées ensemble", () => {
  const entete = [255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0];
  const photo = (nom: string, fin: number) => new File([new Uint8Array([...entete, fin])], nom, { type: "image/jpeg" });
  const declaration = (photos: File[]) => {
    const f = new FormData();
    f.set("categorie", "plomberie_joint");
    f.set("description", "Fuite sous l'évier");
    f.set("commande", crypto.randomUUID());
    for (const p of photos) f.append("photos", p);
    return f;
  };
  beforeEach(() => {
    banc.rpc.mockImplementation(async (nom: string) => ({ data: nom === "declarer_mon_incident_reprise" ? { incident_id: "inc-1", rejoue: false } : null, error: null }));
  });

  it("n'envoie à la jointure que des photos distinctes", async () => {
    await declarerMonIncident("org", {}, declaration([photo("a.jpg", 1), photo("a-copie.jpg", 1), photo("b.jpg", 2)]));
    const jointes = banc.joindre.mock.calls[0][3] as File[];
    expect(jointes.map((p) => p.name)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("le dit dans la confirmation : la photo en double n'a été jointe qu'une fois", async () => {
    const retour = await declarerMonIncident("org", {}, declaration([photo("a.jpg", 1), photo("a-copie.jpg", 1), photo("b.jpg", 2)]));
    expect(retour.erreur).toBeUndefined();
    expect(retour.succes).toContain("Signalement envoyé");
    expect(retour.succes).toContain("Une photo identique à une autre n’a été jointe qu’une fois.");
    expect(retour.avertissement).toBeUndefined();
  });

  it("au pluriel quand plusieurs copies sont écartées", async () => {
    const retour = await declarerMonIncident("org", {}, declaration([photo("a.jpg", 1), photo("a2.jpg", 1), photo("a3.jpg", 1)]));
    expect(retour.succes).toContain("2 photos identiques à une autre n’ont été jointes qu’une fois.");
    expect((banc.joindre.mock.calls[0][3] as File[]).length).toBe(1);
  });

  it("ne dit rien quand les photos sont toutes différentes", async () => {
    const retour = await declarerMonIncident("org", {}, declaration([photo("a.jpg", 1), photo("b.jpg", 2)]));
    expect(retour.succes).not.toMatch(/identique/);
    expect((banc.joindre.mock.calls[0][3] as File[]).length).toBe(2);
  });
});
