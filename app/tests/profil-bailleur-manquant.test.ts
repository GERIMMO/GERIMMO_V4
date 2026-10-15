/**
 * Décision D29 B (fiche DES-A-11 du 13/10/2026) : l'adresse du propriétaire reste FACULTATIVE à l'inscription, mais sur
 * « Mes lots » vide, quand il manque de quoi le désigner comme bailleur, le bouton annonce le détour au lieu de
 * promettre « Créer mon premier bien ». Le bouton reprend la même règle que la porte de « Créer un lot ».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boutonPremierBien, doitLireLeProfilBailleur, elementsManquantsDuBailleur } from "../src/lib/profil-bailleur";

// Les écrans sont RENDUS (pas lus comme du texte) avec un faux accès : la décision du bouton de « Mes lots » vide et la
// porte de « Créer un lot » se vérifient sur ce que la personne voit. Le formulaire de création, lui, est remplacé par
// une pastille : seul compte ici le choix entre la porte et le formulaire.
const banc = vi.hoisted(() => ({ acces: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: banc.acces }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/agence/org-1/parc",
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/app/agence/[orgId]/parc/nouveau/formulaire-avec-brouillon", () => ({
  FormulaireAvecBrouillon: () => createElement("form", { "data-test": "formulaire-de-creation" }),
}));
import PageParc from "@/app/agence/[orgId]/parc/page";
import PageNouveauBien from "@/app/agence/[orgId]/parc/nouveau/page";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe("ce qui manque pour désigner le propriétaire comme bailleur", () => {
  const complet = { address_line1: "12 rue des Lilas", postal_code: "75011", city: "Paris", email_contact: "a@exemple.fr" };

  it("ne manque rien quand adresse, code postal, ville et e-mail sont là", () => {
    expect(elementsManquantsDuBailleur(complet)).toEqual([]);
  });

  it("nomme l'adresse dès qu'un de ses trois champs manque ou n'est que des espaces", () => {
    expect(elementsManquantsDuBailleur({ ...complet, address_line1: null })).toEqual(["votre adresse"]);
    expect(elementsManquantsDuBailleur({ ...complet, postal_code: "" })).toEqual(["votre adresse"]);
    expect(elementsManquantsDuBailleur({ ...complet, city: "   " })).toEqual(["votre adresse"]);
  });

  it("nomme l'e-mail de contact quand il manque", () => {
    expect(elementsManquantsDuBailleur({ ...complet, email_contact: null })).toEqual(["votre e-mail de contact"]);
  });

  it("nomme les deux, dans cet ordre, pour un profil absent ou vide", () => {
    expect(elementsManquantsDuBailleur(null)).toEqual(["votre adresse", "votre e-mail de contact"]);
    expect(elementsManquantsDuBailleur(undefined)).toEqual(["votre adresse", "votre e-mail de contact"]);
    expect(elementsManquantsDuBailleur({})).toEqual(["votre adresse", "votre e-mail de contact"]);
  });
});

describe("quand lire le profil pour choisir le bouton de « Mes lots » vide", () => {
  const vide = { role: "proprietaire_direct", erreurBiens: false, portefeuille: false, nbBiensVisibles: 0, nbBiensRetires: 0 };

  it("le lit pour un propriétaire direct devant un parc vide et lisible", () => {
    expect(doitLireLeProfilBailleur(vide)).toBe(true);
  });

  it("ne le lit dans aucun autre cas", () => {
    expect(doitLireLeProfilBailleur({ ...vide, role: "admin_agence" })).toBe(false);
    expect(doitLireLeProfilBailleur({ ...vide, role: "agent" })).toBe(false);
    expect(doitLireLeProfilBailleur({ ...vide, erreurBiens: true })).toBe(false);
    expect(doitLireLeProfilBailleur({ ...vide, portefeuille: true })).toBe(false);
    expect(doitLireLeProfilBailleur({ ...vide, nbBiensVisibles: 1 })).toBe(false);
    expect(doitLireLeProfilBailleur({ ...vide, nbBiensRetires: 1 })).toBe(false);
  });
});

describe("le bouton de « Mes lots » vide : toute la table de vérité", () => {
  const BASE = "/agence/org-1";
  const manque = ["votre adresse"];

  it("annonce le détour quand la lecture a réussi et qu'il manque quelque chose", () => {
    expect(boutonPremierBien({ base: BASE, manquants: manque, erreurLecture: false })).toEqual({
      libelle: "Compléter mon profil pour créer un bien",
      href: "/agence/org-1/profil?retour=nouveau-lot",
      detourParProfil: true,
    });
    expect(boutonPremierBien({ base: BASE, manquants: ["votre adresse", "votre e-mail de contact"], erreurLecture: false }).detourParProfil).toBe(true);
  });

  it("garde « Créer mon premier bien » quand rien ne manque", () => {
    expect(boutonPremierBien({ base: BASE, manquants: [], erreurLecture: false })).toEqual({
      libelle: "Créer mon premier bien",
      href: "/agence/org-1/parc/nouveau",
      detourParProfil: false,
    });
  });

  it("garde « Créer mon premier bien » quand la lecture du profil a échoué, même si tout paraît manquer", () => {
    expect(boutonPremierBien({ base: BASE, manquants: ["votre adresse", "votre e-mail de contact"], erreurLecture: true }).detourParProfil).toBe(false);
    expect(boutonPremierBien({ base: BASE, manquants: manque, erreurLecture: true }).libelle).toBe("Créer mon premier bien");
    expect(boutonPremierBien({ base: BASE, manquants: [], erreurLecture: true }).libelle).toBe("Créer mon premier bien");
  });

  it("compose ses deux liens à partir de l'adresse de l'espace qu'on lui donne (D27 : /espace pour un propriétaire direct)", () => {
    expect(boutonPremierBien({ base: "/espace/org-1", manquants: manque, erreurLecture: false }).href).toBe("/espace/org-1/profil?retour=nouveau-lot");
    expect(boutonPremierBien({ base: "/espace/org-1", manquants: [], erreurLecture: false }).href).toBe("/espace/org-1/parc/nouveau");
  });
});

// ── Les écrans rendus, avec un faux accès aux données ───────────────────────────────────────────────────────────
type Reponse = { data: unknown; error: unknown };

/** Un faux client : chaque lecture rend la réponse prévue pour sa table (vide par défaut), et se laisse relire. */
function fauxClient(reponses: Record<string, Reponse>) {
  const tablesLues: string[] = [];
  const chaine = (table: string): unknown => {
    const p: unknown = new Proxy(() => undefined, {
      get: (_, nom) => (nom === "then" ? (ok: (r: Reponse) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(reponses[table] ?? { data: [], error: null }).then(ok, ko) : () => p),
      apply: () => p,
    });
    return p;
  };
  return {
    tablesLues,
    supabase: {
      from: (table: string) => {
        tablesLues.push(table);
        return chaine(table);
      },
      rpc: async () => ({ data: [], error: null }),
    },
  };
}

const COMPLET = { address_line1: "12 rue des Lilas", postal_code: "75011", city: "Paris", email_contact: "a@exemple.fr" };
const bien = (extra: Record<string, unknown> = {}) => ({
  id: "bien-1", nom: "Rue des Lilas", type: "appartement", address_line1: "12 rue des Lilas", postal_code: "75011", city: "Paris",
  archived_at: null, lots: [{ id: "lot-1", nom: "Lot unique", etat: "brouillon", surface_m2: null, pieces: null, identifiant_fiscal: null, chauffage: null, eau_chaude: null, locaux_privatifs: null, description: null }],
  ...extra,
});
const OK = (data: unknown): Reponse => ({ data, error: null });
const PANNE: Reponse = { data: null, error: { message: "indisponible" } };

function acces(role: string, reponses: Record<string, Reponse>) {
  const faux = fauxClient(reponses);
  banc.acces.mockResolvedValue({ supabase: faux.supabase, user: { id: "compte-1" }, role, estProprietaire: role === "proprietaire_direct" });
  return faux;
}
const rendreParc = async () => renderToStaticMarkup(await PageParc({ params: Promise.resolve({ orgId: "org-1" }), searchParams: Promise.resolve({}) } as never));
const rendreNouveau = async () => renderToStaticMarkup(await PageNouveauBien({ params: Promise.resolve({ orgId: "org-1" }) } as never));
// La racine des adresses (« /agence » ; « /espace » pour un propriétaire direct une fois la décision D27 en place) n'est
// pas l'objet de ces tests, qui disent OÙ mène chaque bouton : elle est ramenée à « /agence ». D27 a ses propres tests.
const liens = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
  href: m[1].replaceAll("&amp;", "&").replace(/^\/espace\//, "/agence/"),
  texte: m[2].replace(/<[^>]*>/g, "").trim(),
}));

beforeEach(() => banc.acces.mockReset());

describe("« Mes lots » vide (D29 B) : le bouton que voit le propriétaire", () => {
  it("annonce le détour par le profil quand l'adresse manque, et le lien y mène", async () => {
    acces("proprietaire_direct", { biens: OK([]), organizations: OK({ ...COMPLET, address_line1: null }) });
    const html = await rendreParc();
    expect(html).toContain("Votre parc est vide");
    expect(liens(html)).toContainEqual({ href: "/agence/org-1/profil?retour=nouveau-lot", texte: "Compléter mon profil pour créer un bien" });
    expect(html).not.toContain("Créer mon premier bien");
  });

  it("annonce le détour aussi quand seul l'e-mail de contact manque", async () => {
    acces("proprietaire_direct", { biens: OK([]), organizations: OK({ ...COMPLET, email_contact: "" }) });
    expect(liens(await rendreParc())).toContainEqual({ href: "/agence/org-1/profil?retour=nouveau-lot", texte: "Compléter mon profil pour créer un bien" });
  });

  it("garde « Créer mon premier bien » quand le profil est complet", async () => {
    acces("proprietaire_direct", { biens: OK([]), organizations: OK(COMPLET) });
    const html = await rendreParc();
    expect(liens(html)).toContainEqual({ href: "/agence/org-1/parc/nouveau", texte: "Créer mon premier bien" });
    expect(html).not.toContain("Compléter mon profil");
  });

  it("garde « Créer mon premier bien » quand le profil est illisible : la porte de « Créer un lot » décidera", async () => {
    acces("proprietaire_direct", { biens: OK([]), organizations: PANNE });
    const html = await rendreParc();
    expect(liens(html)).toContainEqual({ href: "/agence/org-1/parc/nouveau", texte: "Créer mon premier bien" });
    expect(html).not.toContain("Compléter mon profil");
  });

  it("ne lit le profil que pour un propriétaire direct : l'agence et son agent gardent leur écran", async () => {
    for (const role of ["admin_agence", "agent"]) {
      const faux = acces(role, { biens: OK([]), organizations: OK({}) });
      const html = await rendreParc();
      expect(faux.tablesLues, role).not.toContain("organizations");
      expect(html, role).not.toContain("Compléter mon profil");
    }
    // L'admin d'agence voit bien « Créer mon premier bien » ; l'agent, devant un portefeuille vide, « Ajouter un bien ».
    acces("admin_agence", { biens: OK([]) });
    expect(liens(await rendreParc())).toContainEqual({ href: "/agence/org-1/parc/nouveau", texte: "Créer mon premier bien" });
  });

  it("ne lit pas le profil, et ne l'annonce pas, quand le parc a un bien visible", async () => {
    const faux = acces("proprietaire_direct", { biens: OK([bien()]), organizations: OK({}) });
    const html = await rendreParc();
    expect(faux.tablesLues).not.toContain("organizations");
    expect(html).not.toContain("Compléter mon profil");
    expect(html).not.toContain("Votre parc est vide");
  });

  it("n'annonce rien quand le parc ne contient que des biens retirés : ce n'est pas l'état vide du premier bien", async () => {
    const faux = acces("proprietaire_direct", { biens: OK([bien({ archived_at: "2026-10-01T08:00:00Z", lots: [] })]), organizations: OK({}) });
    const html = await rendreParc();
    expect(faux.tablesLues).not.toContain("organizations");
    expect(html).not.toContain("Compléter mon profil");
    expect(html).not.toContain("Votre parc est vide");
  });

  it("n'annonce rien quand le parc est illisible : ni état vide, ni bouton de création", async () => {
    const faux = acces("proprietaire_direct", { biens: PANNE, organizations: OK({}) });
    const html = await rendreParc();
    expect(faux.tablesLues).not.toContain("organizations");
    expect(html).not.toContain("Compléter mon profil");
    expect(html).not.toContain("Créer mon premier bien");
  });
});

describe("« Créer un lot » (D29 B) : la porte devant le formulaire", () => {
  it("profil incomplet : l'écran d'attente nomme ce qui manque, mène au profil, et le formulaire n'est pas affiché", async () => {
    acces("proprietaire_direct", { organizations: OK({ ...COMPLET, address_line1: null, email_contact: null }) });
    const html = await rendreNouveau();
    expect(html).toContain("Complétez d&#x27;abord votre profil");
    expect(html).toContain("Il manque votre adresse et votre e-mail de contact.");
    expect(liens(html)).toContainEqual({ href: "/agence/org-1/profil?retour=nouveau-lot", texte: "Compléter mon profil" });
    expect(html).not.toContain("formulaire-de-creation");
  });

  it("n'annonce que le premier manque quand un seul manque", async () => {
    acces("proprietaire_direct", { organizations: OK({ ...COMPLET, postal_code: " " }) });
    expect(await rendreNouveau()).toContain("Il manque votre adresse.");
    acces("proprietaire_direct", { organizations: OK({ ...COMPLET, email_contact: null }) });
    const html = await rendreNouveau();
    expect(html).toContain("Il manque votre e-mail de contact.");
    expect(html).not.toContain("votre adresse");
  });

  it("profil complet : le formulaire s'affiche, sans écran d'attente", async () => {
    acces("proprietaire_direct", { organizations: OK(COMPLET) });
    const html = await rendreNouveau();
    expect(html).toContain("formulaire-de-creation");
    expect(html).not.toContain("Complétez d&#x27;abord votre profil");
    expect(html).not.toContain("Compléter mon profil");
  });

  it("la porte ne concerne que le propriétaire direct : l'agence crée un lot sans lire ce profil", async () => {
    const faux = acces("admin_agence", { organizations: OK({}) });
    const html = await rendreNouveau();
    expect(faux.tablesLues).not.toContain("organizations");
    expect(html).toContain("formulaire-de-creation");
    expect(html).not.toContain("Complétez d&#x27;abord votre profil");
  });

  it("« Mes lots » vide et « Créer un lot » ne se contredisent pas : même profil, même verdict", async () => {
    for (const profil of [COMPLET, { ...COMPLET, city: null }, { ...COMPLET, email_contact: null }, {}]) {
      acces("proprietaire_direct", { biens: OK([]), organizations: OK(profil) });
      const annonceLeDetour = liens(await rendreParc()).some((l) => l.texte === "Compléter mon profil pour créer un bien");
      const portePosee = !(await rendreNouveau()).includes("formulaire-de-creation");
      expect(annonceLeDetour, JSON.stringify(profil)).toBe(portePosee);
    }
  });
});

describe("l'inscription du propriétaire (D29 B)", () => {
  const inscription = lire("src/app/inscription/formulaire-inscription.tsx");

  it("garde l'adresse facultative (inscription courte)", () => {
    for (const champ of ["Adresse postale (facultatif)", "Code postal (facultatif)", "Ville (facultatif)"]) {
      expect(inscription).toContain(champ);
    }
  });
});
