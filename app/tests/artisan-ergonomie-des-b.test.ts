/**
 * Audit du 13/10/2026, designer B : l'espace artisan (DES-B-03 à DES-B-06) et le contrat CSS de la supervision
 * (DES-B-08). Les titres de page (DES-B-07) ont leur propre fichier : titres-de-page.test.ts.
 *
 * Ces défauts se voient dans le navigateur ; la preuve visuelle est dans le rapport du correcteur. Ce fichier garde
 * ce qui se lit dans l'arbre rendu ou dans le texte de la feuille de style.
 */
process.env.TZ = "UTC";

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  activite: null as unknown,
  fiche: { statut_plateforme: "en_attente" } as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ fiche: etat.fiche }),
  chargerAgenda: async () => ({ lignes: [] }),
  chargerPieces: async () => ({ lignes: [] }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationModuleArtisan: () => true,
    chargerActivitePrivee: async () => ({ data: etat.activite }),
  };
});

import PageClient from "@/app/artisan/clients/[clientId]/page";
import PageClients from "@/app/artisan/clients/page";
import PageNouveauChantier from "@/app/artisan/devis/nouveau/page";
import PageAttestations from "@/app/artisan/attestations/page";
import { NavigationPrivee } from "@/app/artisan/clients/elements";

const racine = path.join(__dirname, "..");
const lire = (chemin: string) => readFileSync(path.join(racine, chemin), "utf8");
const html = async (element: unknown) => renderToStaticMarkup((await element) as never);

const entreprise = { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" };

function activite(archive_le: string | null = null) {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le }],
    chantiers: [],
    devis: [],
    rendez_vous: [],
    factures: [],
    pieces: [],
    reglements: [],
    evenements: [],
    entreprise,
    activation: { clients: true, reglements: true },
  };
}

/** Les classes d'une balise donnée, dans l'ordre d'écriture. */
const classesDe = (balise: string) => (balise.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
/** Le bouton ou le lien dont le texte est exactement `texte`. */
function baliseDe(page: string, nom: "a" | "button", texte: string) {
  const re = new RegExp(`<${nom}\\b[^>]*>${texte}</${nom}>`);
  return page.match(re)?.[0] ?? "";
}

beforeEach(() => {
  etat.activite = activite();
  etat.fiche = { statut_plateforme: "en_attente" };
});

describe("DES-B-03 — l'espace artisan annonce le chargement entre deux pages", () => {
  it("app/artisan/loading.tsx existe, au niveau du gabarit : il couvre toutes les sous-pages", async () => {
    const chargement = await import("../src/app/artisan/loading");
    const page = renderToStaticMarkup(createElement(chargement.default));
    expect(page).toContain('role="status"');
    expect(page).toContain('aria-busy="true"');
    expect(page).toContain('aria-label="Chargement de la page"');
    expect(page).toContain("squelette");
  });

  it("le squelette ne rend pas de <main> : le gabarit artisan en pose déjà un", async () => {
    const chargement = await import("../src/app/artisan/loading");
    expect(renderToStaticMarkup(createElement(chargement.default))).not.toContain("<main");
  });
});

describe("DES-B-04 — « Archiver ce client » : secondaire, et sa réversibilité est dite avant le clic", () => {
  it("le bouton d'archivage n'a pas le style du bouton principal", async () => {
    const page = await html(PageClient({ params: Promise.resolve({ clientId: "c1" }) }));
    const principal = classesDe(baliseDe(page, "button", "Enregistrer les coordonnées"));
    const archivage = classesDe(baliseDe(page, "button", "Archiver ce client"));
    expect(principal).toContain("bg-[var(--marque)]");
    expect(archivage.length).toBeGreaterThan(0);
    expect(archivage).not.toContain("bg-[var(--marque)]");
    expect(archivage).toContain("bg-[var(--ivoire)]");
  });

  it("la phrase « Vous pourrez le réactiver à tout moment. » précède le bouton", async () => {
    const page = await html(PageClient({ params: Promise.resolve({ clientId: "c1" }) }));
    const phrase = page.indexOf("Vous pourrez le réactiver à tout moment.");
    expect(phrase).toBeGreaterThan(-1);
    expect(phrase).toBeLessThan(page.indexOf("Archiver ce client</button>"));
  });

  it("un client déjà archivé ne reçoit pas cette promesse : son bouton dit « Réactiver »", async () => {
    etat.activite = activite("2026-10-10T08:00:00.000Z");
    const page = await html(PageClient({ params: Promise.resolve({ clientId: "c1" }) }));
    expect(page).toContain("Réactiver ce client</button>");
    expect(page).not.toContain("Vous pourrez le réactiver à tout moment.");
  });
});

describe("DES-B-05 — navigation, boutons et cibles des modules « clients externes »", () => {
  it("les pastilles qui répètent le menu latéral disparaissent là où il s'affiche (1000 px)", () => {
    const nav = renderToStaticMarkup(createElement(NavigationPrivee));
    const liens = [...nav.matchAll(/<a\b[^>]*>[^<]*<\/a>/g)].map((m) => m[0]);
    const masque = (texte: string) => classesDe(liens.find((l) => l.includes(`>${texte}<`)) ?? "").includes("min-[1000px]:hidden");
    expect(masque("Clients externes")).toBe(true);
    expect(masque("Agenda")).toBe(true);
    expect(masque("Facturation")).toBe(true);
    // Ces deux gestes n'ont pas d'entrée dans le menu latéral : ils restent atteignables.
    expect(masque("Nouveau chantier et devis")).toBe(false);
    expect(masque("Exporter mon registre")).toBe(false);
  });

  it("les noms de la liste des clients sont des cibles de 48 px (le lien en ligne ignorait min-h-12)", async () => {
    const page = await html(PageClients({ searchParams: Promise.resolve({}) }));
    const lien = page.match(/<a\b[^>]*href="\/artisan\/clients\/c1"[^>]*>/)?.[0] ?? "";
    const classes = classesDe(lien);
    expect(classes).toContain("min-h-12");
    expect(classes).toContain("inline-flex");
    expect(classes).toContain("items-center");
  });

  it("« Rechercher » est un bouton de la charte, pas un lien souligné", async () => {
    const page = await html(PageClients({ searchParams: Promise.resolve({}) }));
    const classes = classesDe(baliseDe(page, "button", "Rechercher"));
    expect(classes).not.toContain("underline");
    expect(classes).toContain("border-2");
    expect(classes).toContain("bg-[var(--ivoire)]");
    expect(classes).toContain("min-h-14");
  });

  it("« Choisir » aussi", async () => {
    const page = await html(PageNouveauChantier({ searchParams: Promise.resolve({}) }));
    const classes = classesDe(baliseDe(page, "button", "Choisir"));
    expect(classes).not.toContain("underline");
    expect(classes).toContain("border-2");
    expect(classes).toContain("bg-[var(--ivoire)]");
  });

  it("la fiche du client : « Créer un chantier et son devis » est une cible de 48 px", async () => {
    const page = await html(PageClient({ params: Promise.resolve({ clientId: "c1" }) }));
    const classes = classesDe(page.match(/<a\b[^>]*href="\/artisan\/devis\/nouveau\?client=c1"[^>]*>/)?.[0] ?? "");
    expect(classes).toContain("min-h-12");
    expect(classes).toContain("inline-flex");
  });
});

describe("DES-B-06 — un artisan qui vient de s'inscrire ne reçoit qu'un seul message d'état", () => {
  it("la page des attestations garde le message de bienvenue, sans re-dire l'attente de validation", async () => {
    const page = await html(PageAttestations({ searchParams: Promise.resolve({ inscrit: "1" }) } as never));
    expect(page).toContain("Votre entreprise est inscrite.");
    expect(page).not.toContain("Votre inscription est examinée par Gerimmo");
  });

  it("sans le paramètre d'arrivée, la page n'ajoute aucun bandeau d'attente (celui du gabarit suffit)", async () => {
    const page = await html(PageAttestations({ searchParams: Promise.resolve({}) } as never));
    expect(page).not.toContain("Votre inscription est examinée par Gerimmo");
    expect(page).not.toContain('role="alert"');
  });

  it("le bandeau du gabarit, lui, reste : c'est lui qui porte le message valable sur toutes les pages", () => {
    expect(lire("src/app/artisan/layout.tsx")).toContain("Inscription en cours de validation par Gerimmo");
  });
});

describe("DES-B-08 — supervision sur téléphone (contrat de la feuille de style)", () => {
  const css = lire("src/app/globals.css");

  it("les résumés repliables de la supervision font au moins 44 px sous 900 px", () => {
    const bloc = css.match(/@media \(max-width: 900px\) \{[^@]*?\.admin-corps summary \{[^}]*\}/)?.[0] ?? "";
    expect(bloc).toContain("min-height: 44px");
  });

  it("une page à barre collante basse réserve cet espace au défilement du focus (scroll-padding-bottom)", () => {
    const bloc = css.match(/@media \(max-width: 1023px\) \{[^@]*?html:has\(\[data-barre-collante\]\) \{[^}]*\}/)?.[0] ?? "";
    expect(bloc).toMatch(/scroll-padding-bottom:\s*calc\(/);
  });

  it("la barre « Enregistrer » de l'éditeur d'article porte le marqueur", () => {
    const source = lire("src/app/admin/publications/[id]/editeur-publication.tsx");
    const barre = source.match(/<div\b[^>]*sticky bottom-\[calc\(72px[^>]*>/)?.[0] ?? "";
    expect(barre).toContain("data-barre-collante");
  });
});
