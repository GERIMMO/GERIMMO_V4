/**
 * Phase 3 de la mission palier 1, lot 41 — formulaire « Préparer un document » (catalogue), côté navigateur.
 *
 *  - S18 : le congé du bailleur préparé depuis le catalogue demandait une « date d'effet » que l'assembleur ignore, ne demandait
 *    jamais le prix (un congé pour vendre un logement nu était donc toujours refusé) et exigeait tous les champs quel que soit le
 *    motif (bénéficiaire de la reprise pour une vente…). Il demande désormais, selon le motif, ce que demande l'écran du bail.
 *  - S25 : tout champ « montant » était lié à la valeur des intérêts d'emprunt, qui part de « 0 » : le plafond du cautionnement
 *    s'ouvrait à 0 (refusé comme manquant). Chaque montant a sa propre valeur.
 * Le composant tourne dans le banc `fixtures/harnais-hooks` (hooks simulés, aucun navigateur) ; chaque cas échouait avant le correctif.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { monter, type Monte } from "./fixtures/harnais-hooks";

vi.mock("react", async (original) => (await import("./fixtures/harnais-hooks")).reactAvecHooksSimules(await original<typeof import("react")>()));
vi.mock("@/app/actions/catalogue-documents", () => ({ genererDepuisCatalogue: vi.fn(), proposerInteretsEmprunt: vi.fn(async () => ({ montant: "0", qualifie: false })) }));
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: () => ({ etat: {}, enCours: false, soumettre: () => {}, version: 0 }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { FormulaireCatalogue } from "@/app/agence/[orgId]/documents/catalogue/formulaire-catalogue";
import { OPTIONS_CATALOGUE, optionsDuFormulaire } from "@/lib/documents/catalogue-options";

const BAIL = { id: "b1", libelle: "T2 · Fictif Martin · Actif" };
const conge = () => monter(FormulaireCatalogue, { orgId: "org", modeleId: "conge_bailleur", choix: [BAIL] });
const present = (m: Monte, nom: string) => m.champ(nom) !== undefined;
const exige = (m: Monte, nom: string) => m.champ(nom)?.props.required === true;
const REPRISE = ["beneficiaire_nom", "beneficiaire_lien", "beneficiaire_adresse", "raisons_reprise"];
const VENTE = ["prix_vente", "conditions_vente"];

describe("S18 — congé du bailleur depuis le catalogue : les informations du motif choisi", () => {
  it("plus de « date d'effet » demandée puis ignorée ; la date de présentation prévue, facultative, comme sur l'écran du bail", async () => {
    const m = conge();
    await m.stabiliser();
    expect(present(m, "date_effet")).toBe(false);
    expect(present(m, "date_presentation")).toBe(true);
    expect(exige(m, "date_presentation")).toBe(false);
    expect(OPTIONS_CATALOGUE.conge_bailleur.map((c) => c.cle)).not.toContain("date_effet");
  });

  it("vente (motif proposé d'abord, comme sur l'écran du bail) : prix et conditions, et rien de la reprise", async () => {
    const m = conge();
    await m.stabiliser();
    expect(m.champ("motif")?.props.value).toBe("vente");
    for (const nom of VENTE) expect(present(m, nom), nom).toBe(true);
    // Le prix n'est pas exigé à la saisie : il est facultatif en meublé ; en location nue, l'assembleur refuse sans lui et le dit.
    expect(exige(m, "prix_vente")).toBe(false);
    expect(m.champ("prix_vente")?.props.inputMode).toBe("decimal");
    expect(m.texte()).toContain("Obligatoire pour un logement loué nu");
    for (const nom of [...REPRISE, "motif_detail"]) expect(present(m, nom), nom).toBe(false);
  });

  it("reprise : le bénéficiaire, son lien, son adresse et les raisons, exigés ; ni prix ni motif invoqué", async () => {
    const m = conge();
    await m.saisir("motif", "reprise");
    for (const nom of REPRISE) {
      expect(present(m, nom), nom).toBe(true);
      expect(exige(m, nom), nom).toBe(true);
    }
    for (const nom of [...VENTE, "motif_detail"]) expect(present(m, nom), nom).toBe(false);
  });

  it("motif légitime et sérieux : le motif invoqué, exigé, seul", async () => {
    const m = conge();
    await m.saisir("motif", "motif_legitime");
    expect(exige(m, "motif_detail")).toBe(true);
    expect(m.texte()).toContain("Motif invoqué");
    for (const nom of [...VENTE, ...REPRISE]) expect(present(m, nom), nom).toBe(false);
  });

  it("l'avertissement « à faire relire » de l'écran du bail accompagne le choix du motif", async () => {
    const m = conge();
    await m.stabiliser();
    expect(m.texte()).toContain("Vente ou reprise : à faire relire avant de notifier");
    expect(m.texte()).toContain("Gerimmo n’a pas pu comparer ce modèle au texte officiel".replace("’", "'"));
  });

  it("seules les informations du motif choisi partent à la génération", () => {
    const saisies: Record<string, string> = { motif: "vente", date_presentation: "", prix_vente: " 245 000 ", conditions_vente: "", beneficiaire_nom: "Reste d'une autre saisie" };
    expect(optionsDuFormulaire("conge_bailleur", (cle) => saisies[cle] ?? "")).toEqual({ motif: "vente", date_presentation: "", prix_vente: "245 000", conditions_vente: "" });
    saisies.motif = "motif_legitime";
    saisies.motif_detail = "impayés répétés";
    expect(optionsDuFormulaire("conge_bailleur", (cle) => saisies[cle] ?? "")).toEqual({ motif: "motif_legitime", date_presentation: "", motif_detail: "impayés répétés" });
  });

  it("chaque information que l'écran du bail envoie au congé est demandée par le catalogue", () => {
    const ecran = readFileSync(join(process.cwd(), "src/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur.tsx"), "utf8");
    const envoyees = ["motif", ...[...ecran.matchAll(/\?\s*\{\s*(\w+):/g)].map((m) => m[1])];
    expect(envoyees).toEqual(expect.arrayContaining(["prix_vente", "conditions_vente", "beneficiaire_nom", "raisons_reprise", "motif_detail", "date_presentation"]));
    expect(OPTIONS_CATALOGUE.conge_bailleur.map((c) => c.cle).sort()).toEqual([...new Set(envoyees)].sort());
  });
});

describe("S25 — chaque montant a sa propre valeur", () => {
  it("le plafond du cautionnement part vide (plus « 0 »), se saisit seul, et reste exigé", async () => {
    const m = monter(FormulaireCatalogue, { orgId: "org", modeleId: "cautionnement", choix: [BAIL], garants: [{ id: "g1", libelle: "Fictif Gérard", bailId: "b1" }] });
    await m.stabiliser();
    expect(m.champ("montant_max")?.props.value).toBe("");
    expect(exige(m, "montant_max")).toBe(true);
    await m.saisir("montant_max", "15 000");
    expect(m.champ("montant_max")?.props.value).toBe("15 000");
    // Aucune lecture du livre n'est annoncée sous le plafond (elle ne concerne que les intérêts d'emprunt).
    expect(m.texte()).not.toContain("Lecture du montant du livre");
  });

  it("les intérêts d'emprunt gardent leur valeur à eux (« 0 » au départ)", async () => {
    const m = monter(FormulaireCatalogue, { orgId: "org", modeleId: "recap_fiscal_nu", choix: [{ id: "lot", libelle: "Appartement Jardin" }] });
    expect(m.champ("interets_emprunt")?.props.value).toBe("0");
  });
});
