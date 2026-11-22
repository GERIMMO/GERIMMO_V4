/**
 * Audit palier 1, P2-07 — un repère de prix avant de solliciter un artisan.
 *
 * Ce que ce fichier prouve :
 *  1. le repère vient du seul catalogue sourcé déjà utilisé pour préparer les devis : aucun chiffre nouveau ;
 *  2. il se dit par sa fourchette entière, jamais par un centre ni une moyenne ; un métier sans repère n'affiche rien ;
 *  3. le propriétaire le lit au-dessus des artisans proposables, avec ce que le repère N'EST PAS ;
 *  4. l'écran des agences (palier 2) est inchangé.
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/artisan/devis/actions-preparation", () => ({ envoyerDevisValide: vi.fn() }));
vi.mock("@/app/actions/incidents", () => ({
  annulerMission: vi.fn(), deciderAvenant: vi.fn(), evaluerArtisan: vi.fn(), fixerRendezVous: vi.fn(),
  ouvrirConsultation: vi.fn(), refuserDevis: vi.fn(), demanderRevisionDevis: vi.fn(), retenirDevis: vi.fn(), reviserImputation: vi.fn(), solliciterArtisan: vi.fn(),
}));

import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";
import { prixPropose, REFERENCES_TRAVAUX, REFERENCES_VERIFIEES_LE, reperesDuMetier } from "@/lib/references-prix-travaux";

describe("les repères d'un métier", () => {
  it("disent la fourchette entière, dans l'unité du repère", () => {
    expect(reperesDuMetier("plomberie")).toEqual([
      { code: "plomberie_heure", libelle: "Main-d’œuvre de plomberie", fourchette: "40 à 90 € HT par heure", url: "https://www.travaux.com/plomberie/guide-des-prix/prix-de-linstallation-dun-robinet" },
    ]);
    expect(reperesDuMetier("electricite").map((r) => r.fourchette)).toEqual(["50 à 90 € HT par heure"]);
    expect(reperesDuMetier("peinture").map((r) => r.fourchette)).toEqual(["8 à 18 € HT par m²", "2 à 10 € HT par m²"]);
  });

  it("un métier sans repère sourcé ne rend rien : aucun chiffre n'est inventé", () => {
    for (const metier of ["serrurerie", "chauffage", "menuiserie", "", "PLOMBERIE", "autre"]) expect(reperesDuMetier(metier), metier).toEqual([]);
  });

  it("chaque repère vient du catalogue, avec sa source ; ni centre, ni moyenne", () => {
    const tous = [...new Set(REFERENCES_TRAVAUX.map((r) => r.metier))].flatMap((m) => reperesDuMetier(m));
    expect(tous).toHaveLength(REFERENCES_TRAVAUX.length);
    for (const r of tous) {
      const source = REFERENCES_TRAVAUX.find((x) => x.code === r.code)!;
      expect(source.min).toBeLessThan(source.max);
      expect(r.url).toBe(source.url);
      expect(r.url.startsWith("https://")).toBe(true);
      expect(`${r.libelle} ${r.fourchette}`).not.toMatch(/moyen|conseill|maximum|garanti/i);
    }
    // Le catalogue n'a pas changé : ce lot n'ajoute aucun prix.
    expect(REFERENCES_TRAVAUX.map((r) => [r.code, r.min, r.max])).toEqual([
      ["plomberie_heure", 4000, 9000], ["electricite_depannage_heure", 5000, 9000], ["peinture_pose_m2", 800, 1800], ["peinture_fourniture_m2", 200, 1000],
    ]);
    expect(REFERENCES_VERIFIEES_LE).toBe("2026-10-12");
    expect(prixPropose("plomberie_heure", [])?.verifie_le).toBe("2026-10-12");
  });
});

describe("l'écran du propriétaire, avant de solliciter", () => {
  const consultation = (metier: string) => ({ id: "c1", metier, nature_travaux: "entretien_courant", decennale_requise: false, devis_unique_assume: false, validite_jusqu_au: null, validite_jours: 30, statut: "ouverte", created_at: "2026-11-20T08:00:00.000Z" });
  const artisan = (id: string, nom: string) => ({ artisan_id: id, raison_sociale: nom, telephone: "0611111111", email: null, rattache: true, note_publiee: null, nb_evaluations: 0, publiable: false, decennale_valide: true });
  const rendre = (metier: string, plus: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(ConsultationOuverte, {
    orgId: "o1", consultation: consultation(metier) as never, sollicitations: [], devis: [], affectables: [artisan("a1", "Plomberie Martin")] as never,
    noteDe: new Map(), nom: () => "", aujourdhui: "2026-11-22", commune: "Lyon", estProprietaire: true, ...plus,
  }));
  const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("le repère est au-dessus des artisans proposables, avec sa source et ce qu'il n'est pas", () => {
    const html = rendre("plomberie");
    const bloc = html.slice(html.indexOf("data-repere-prix"), html.indexOf("Artisans proposables"));
    expect(bloc.length).toBeGreaterThan(100);
    expect(html.indexOf("data-repere-prix")).toBeLessThan(html.indexOf("Plomberie Martin"));
    expect(texte(bloc)).toContain("Repère de prix");
    expect(texte(bloc)).toContain("Main-d’œuvre de plomberie : 40 à 90 € HT par heure");
    expect(bloc).toContain('href="https://www.travaux.com/plomberie/guide-des-prix/prix-de-linstallation-dun-robinet"');
    expect(bloc).toMatch(/target="_blank" rel="noopener noreferrer"/);
    expect(texte(bloc)).toContain("Ordre de grandeur relevé le 12/10/2026, hors déplacement, fournitures et majorations.");
    expect(texte(bloc)).toContain("Ce n’est ni un tarif, ni un prix maximum, ni un engagement de Gerimmo ou de l’artisan : seul le devis de l’artisan fixe le prix.");
    expect(html.match(/data-repere-prix/g)).toHaveLength(1);
  });

  it("deux repères pour la peinture ; aucun bloc pour un métier sans repère", () => {
    expect(rendre("peinture").match(/€ HT par m²/g)).toHaveLength(2);
    expect(rendre("serrurerie")).not.toContain("data-repere-prix");
    expect(rendre("serrurerie")).toContain("Artisans proposables");
  });

  it("deux artisans déjà en lice : plus personne à solliciter, donc plus de repère", () => {
    const sollicitation = (id: string) => ({ id: `s-${id}`, artisan_id: id, statut: "envoyee", envoyee_le: "2026-11-20T08:00:00.000Z", repondue_le: null, motif_refus: null, revision_avant: null, revision_motif: null });
    const html = rendre("plomberie", { sollicitations: [sollicitation("a1"), sollicitation("a2")] });
    expect(texte(html)).toContain("Deux artisans sont déjà en lice");
    expect(html).not.toContain("data-repere-prix");
  });

  it("l'écran des agences est inchangé (palier 2)", () => {
    expect(rendre("plomberie", { estProprietaire: false })).not.toContain("data-repere-prix");
    const source = readFileSync("src/app/agence/[orgId]/incidents/volet-artisan.tsx", "utf8");
    expect(source.match(/<ReperePrix /g)).toHaveLength(1);
    expect(source).toContain("{estProprietaire && <div className=\"mb-3\"><ReperePrix metier={consultation.metier} /></div>}");
  });
});
