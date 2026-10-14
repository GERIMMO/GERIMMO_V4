/**
 * Décision D35 — l'écran de restitution du dépôt de garantie :
 *   (1) la remise des clés ne se date pas du futur, et se corrige tant que la
 *       restitution est « en cours » (la base accepte déjà ce nouvel envoi) ;
 *   (2) la règle des écarts d'état des lieux est dite telle qu'elle est (option C).
 * La base reste seule juge : voir bail-sortie-lot.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatRestit } from "@/app/actions/restitution";

const banc = vi.hoisted(() => ({
  etat: {} as EtatRestit,
  rpc: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [banc.etat, () => {}, false] };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }),
}));
vi.mock("@/lib/ged-depot", () => ({ preparerFichierGed: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
// Après hydratation, le champ pose la date soumise (ou celle du jour). Le mock rend
// ce que l'agent voit, et garde la trace de l'option « pas dans le futur ».
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return {
    InputDateJour: ({
      valeurSoumise,
      pasDansLeFutur,
      surChangement: _surChangement,
      ...props
    }: {
      valeurSoumise?: string;
      pasDansLeFutur?: boolean;
      surChangement?: (v: string) => void;
      name: string;
    }) =>
      createElement("input", {
        ...props,
        type: "date",
        defaultValue: valeurSoumise ?? "2026-10-14",
        "data-pas-dans-le-futur": pasDansLeFutur ? "oui" : "non",
      }),
  };
});

import { demarrerRestitution } from "@/app/actions/restitution";
import {
  FormulaireRestitution,
  type Restitution,
} from "@/app/agence/[orgId]/baux/[bailId]/formulaire-restitution";
import { REGLE_ECART_EDL } from "@/lib/regle-ecart-edl";

beforeEach(() => {
  vi.clearAllMocks();
  banc.etat = {};
  banc.rpc.mockResolvedValue({ error: null });
});

const restitution = (surcharge: Partial<Restitution> = {}): Restitution => ({
  id: "rst-1",
  date_remise_cles: "2026-10-05",
  delai_mois: 2,
  depot: 650,
  impayes: 0,
  trop_percu: 0,
  montants_arretes_le: "2026-10-06T08:30:00+00:00",
  sans_edl_entree: false,
  statut: "en_cours",
  solde: null,
  date_emission: null,
  envoye_le: null,
  ...surcharge,
});

function ecran(r: Restitution | null, ecarts: { piece: string | null; libelle: string }[] = []) {
  return renderToStaticMarkup(
    createElement(FormulaireRestitution, {
      orgId: "org-test",
      bailId: "bail-test",
      restitution: r,
      retenues: [],
      montantsReels: null,
      ecarts,
      comparatifDisponible: true,
    })
  );
}

function champ(html: string, nom: string) {
  return html.match(/<input\b[^>]*>/g)?.find((i) => i.includes(`name="${nom}"`)) ?? "";
}

describe("D35 (1) — démarrer la restitution", () => {
  it("la remise des clés est obligatoire et ne se choisit pas après aujourd'hui", () => {
    const html = ecran(null);
    const date = champ(html, "date_remise_cles");
    expect(date).toContain('required=""');
    expect(date).toContain('data-pas-dans-le-futur="oui"');
    expect(html).toContain("Démarrer la restitution");
    // Premier envoi : pas de bloc de correction
    expect(html).not.toContain("Corriger la remise des clés");
    expect(html).not.toContain('name="correction"');
  });
});

describe("D35 (1) — corriger tant que la restitution est en cours", () => {
  it("le formulaire de correction est rouvert, prérempli, et dit qu'aucun montant ne change", () => {
    const html = ecran(restitution());
    expect(html).toContain("Corriger la remise des clés ou le délai");
    expect(champ(html, "date_remise_cles")).toContain('value="2026-10-05"');
    expect(champ(html, "date_remise_cles")).toContain('data-pas-dans-le-futur="oui"');
    expect(champ(html, "correction")).toContain('value="1"');
    expect(html).toContain("ne changent aucun montant");
    expect(html).toContain("arrêtés le");
    // Délai de 2 mois : la case « sortie conforme » n'est pas cochée
    expect(champ(html, "conforme")).not.toContain("checked");
  });

  it("un délai d'un mois recoche la case « sortie conforme »", () => {
    expect(champ(ecran(restitution({ delai_mois: 1 })), "conforme")).toContain('checked=""');
  });

  it("une correction refusée garde la saisie de l'agent", () => {
    banc.etat = {
      erreur: "La remise des clés ne peut pas être datée après aujourd'hui (14/10/2026)",
      valeurs: { date_remise_cles: "2027-03-01", conforme: "on", correction: "1" },
    };
    const html = ecran(restitution());
    expect(champ(html, "date_remise_cles")).toContain('value="2027-03-01"');
    expect(champ(html, "conforme")).toContain('checked=""');
    expect(html).toContain("ne peut pas être datée après aujourd&#x27;hui");
  });

  it("une restitution finalisée ne se corrige plus", () => {
    const html = ecran(restitution({ statut: "finalise", solde: 100, date_emission: "2026-10-10" }));
    expect(html).not.toContain("Corriger la remise des clés");
    expect(html).not.toContain('name="date_remise_cles"');
  });
});

describe("D35 (1) — l'action", () => {
  it("une correction le dit, un démarrage aussi", async () => {
    const f = new FormData();
    f.set("date_remise_cles", "2026-10-05");
    f.set("correction", "1");
    const corrige = await demarrerRestitution("org-test", "bail-test", {}, f);
    expect(corrige.succes).toBe("Remise des clés corrigée — les montants arrêtés ne changent pas.");
    expect(banc.rpc).toHaveBeenCalledWith("demarrer_restitution", {
      p_bail: "bail-test",
      p_date_remise: "2026-10-05",
      p_conforme: false,
    });
    const g = new FormData();
    g.set("date_remise_cles", "2026-10-05");
    const demarre = await demarrerRestitution("org-test", "bail-test", {}, g);
    expect(demarre.succes).toBe("Restitution démarrée.");
  });

  it("le refus de la base (date future) remonte tel quel, avec la saisie", async () => {
    banc.rpc.mockResolvedValue({
      error: { code: "P0001", message: "La remise des clés ne peut pas être datée après aujourd'hui (14/10/2026) : le délai légal de restitution court à partir de la remise réelle des clés" },
    });
    const f = new FormData();
    f.set("date_remise_cles", "2027-03-01");
    const r = await demarrerRestitution("org-test", "bail-test", {}, f);
    expect(r.erreur).toContain("ne peut pas être datée après aujourd'hui");
    expect(r.valeurs).toMatchObject({ date_remise_cles: "2027-03-01" });
  });
});

describe("D35 (2) — la règle des écarts est dite (option C, aucun changement de règle)", () => {
  it("le texte dit que tout changement d'état est un écart, usure comprise, et ce que cela change au délai", () => {
    expect(REGLE_ECART_EDL).toContain("Tout changement d’état entre l’entrée et la sortie est compté comme un écart");
    expect(REGLE_ECART_EDL).toContain("usure");
    expect(REGLE_ECART_EDL).toContain("deux mois");
    expect(REGLE_ECART_EDL).toContain("d’un mois");
  });

  it("le formulaire de restitution le rappelle quand le comparatif relève des écarts", () => {
    const avecEcarts = ecran(null, [{ piece: "Salle de bain", libelle: "Sols" }]);
    expect(avecEcarts).toContain("Tout changement d’état entre l’entrée et la sortie est compté comme un écart");
    const sansEcart = ecran(null, []);
    expect(sansEcart).not.toContain("Tout changement d’état");
  });

  it("la carte « Comparatif entrée / sortie » de la fiche du bail porte le même texte", () => {
    const source = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");
    expect(source).toContain('import { REGLE_ECART_EDL } from "@/lib/regle-ecart-edl"');
    expect(source).toMatch(/Comparatif entrée \/ sortie[\s\S]{0,400}\{REGLE_ECART_EDL\}/);
  });
});

describe("D36 — l'envoi du décompte ne promet aucune mise à disposition (option C reportée)", () => {
  it("le formulaire « Décompte envoyé » n'annonce rien dans « Mes documents » du locataire", () => {
    const html = ecran(restitution({ statut: "finalise", solde: -561.43, date_emission: "2026-10-10" }));
    expect(html).toContain("Envoyé au locataire le");
    expect(html).toContain("Décompte envoyé");
    expect(html).not.toContain("Mes documents");
    expect(html).not.toContain("mis à disposition");
  });
});
