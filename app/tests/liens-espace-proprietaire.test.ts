/**
 * Décision D27 (fiche DES-A-08) : tous les liens internes du propriétaire direct pointent vers /espace.
 *
 * Trois protections :
 *  1. les fabriques d'adresses (alertes, plan du jour, blocages, documents à compléter, parcours du lot) émettent
 *     la racine qu'on leur donne, et gardent /agence par défaut ;
 *  2. le contexte React donne la racine aux composants client sans que chaque parent la transmette ;
 *  3. un balayage du code : aucun lien « /agence/${…} » n'est composé à la main hors des écrans réservés aux agences,
 *     des chemins de revalidation (qui désignent la ROUTE, restée /agence) et des quelques exceptions listées ici
 *     avec leur raison. Un nouveau lien partagé écrit à l'ancienne manière fait échouer ce test.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cheminFicheAlerte, gesteAlerte } from "../src/lib/chemin-alerte";
import { regrouperActionsDuJour } from "../src/lib/actions-du-jour";
import { cibleBlocage } from "../src/lib/parc";
import { lienPourManquant } from "../src/lib/documents/ou-renseigner";
import { cibleChampBail } from "../src/lib/documents/champs-bail-parcours";
import { lienLotDepuisBail, retourBailDuLot } from "../src/lib/parcours-lot";
import { FournisseurRacineEspace, useBaseEspace, useRacineEspace } from "../src/components/racine-espace-contexte";
import { baseDeLOrganisation } from "../src/lib/racine-espace-serveur";

const ORG = "org-1";

describe("les fabriques d'adresses émettent la racine demandée et gardent /agence par défaut", () => {
  it("alertes : fiche de la personne, bail, diagnostic, incident, document", () => {
    const cas = [
      { a: { type: "message_locataire", details: { person_id: "p1" } }, suite: "personnes/p1#messages" },
      { a: { type: "assurance_expiration", details: { document_id: "d1" } }, suite: "documents?sel=d1" },
      { a: { type: "loyer_impaye", details: { bail_id: "b1" } }, suite: "baux/b1#loyers" },
      { a: { type: "diagnostic_expiration", details: { diagnostic_id: "g1" } }, suite: "diagnostics/g1" },
      { a: { type: "incident_a_qualifier", details: { incident_id: "i1" } }, suite: "incidents?sel=i1" },
      { a: { type: "signature_retournee", details: { document_id: "d2" } }, suite: "documents?sel=d2" },
      // Alertes ajoutées par main après la base du lot (#187 D18, #188 D22-B) : elles suivent la même racine.
      { a: { type: "devis_revision_expiree", details: { incident_id: "i2" } }, suite: "incidents?sel=i2" },
      { a: { type: "rdv_annule_locataire", details: { incident_id: "i3" } }, suite: "incidents?sel=i3" },
      { a: { type: "rdv_annule_tardif", details: { incident_id: "i4" } }, suite: "incidents?sel=i4" },
      { a: { type: "rdv_demande_sans_reponse", details: { incident_id: "i5" } }, suite: "incidents?sel=i5" },
    ];
    for (const { a, suite } of cas) {
      expect(cheminFicheAlerte(a, ORG), a.type).toBe(`/agence/${ORG}/${suite}`);
      expect(cheminFicheAlerte(a, ORG, "/agence"), a.type).toBe(`/agence/${ORG}/${suite}`);
      expect(cheminFicheAlerte(a, ORG, "/espace"), a.type).toBe(`/espace/${ORG}/${suite}`);
    }
    expect(gesteAlerte({ type: "loyer_impaye", details: { bail_id: "b1" } }, ORG, "/espace")?.href).toBe(`/espace/${ORG}/baux/b1#loyers`);
  });

  it("plan du jour : l'incident d'une alerte et le lien des rapports", () => {
    const entree = {
      orgId: ORG, userId: "u", portefeuille: null, attendues: [], rapports: [],
      alertes: [{ id: "a1", type: "incident_a_qualifier", criticite: "normale", titre: "Fuite", echeance: null, details: { incident_id: "i1" }, created_at: "2026-10-01T08:00:00Z", assignee_account_id: null, assigned_all: true, escalades: [] }],
    } as unknown as Parameters<typeof regrouperActionsDuJour>[0];
    const href = (racine?: string) => {
      const plan = regrouperActionsDuJour({ ...entree, ...(racine ? { racine } : {}) });
      return [...plan.surLesBaux, ...plan.enRetard, ...plan.aVenir].map((a) => a.href);
    };
    expect(href()).toContain(`/agence/${ORG}/incidents?sel=i1`);
    expect(href("/espace")).toContain(`/espace/${ORG}/incidents?sel=i1`);
    expect(href("/espace").join()).not.toContain("/agence/");
  });

  it("blocages de mise en location : fiche du lot, du bien, clé de répartition", () => {
    const ctx = { orgId: ORG, bienId: "b", lotId: "l" };
    expect(cibleBlocage("Surface manquante", ctx).href).toBe(`/agence/${ORG}/parc/b/lots/l#caracteristiques`);
    expect(cibleBlocage("Surface manquante", { ...ctx, racine: "/espace" }).href).toBe(`/espace/${ORG}/parc/b/lots/l#caracteristiques`);
    expect(cibleBlocage("Clé de répartition à (re)valider", { ...ctx, racine: "/espace" }).href).toBe(`/espace/${ORG}/parc/b#cle`);
    // « sur place » : la page courante est comparée à la même racine
    expect(cibleBlocage("ERP absent ou expiré", { ...ctx, racine: "/espace" }, `/espace/${ORG}/parc/b`).href).toBe(`/espace/${ORG}/parc/b#diagnostics`);
  });

  it("documents à compléter : profil, personne, lot, bail, quittance", () => {
    const liens = [{ entite: "bail" as const, entiteId: "b1" }, { entite: "personne" as const, entiteId: "p1" }, { entite: "lot" as const, entiteId: "l1" }];
    expect(lienPourManquant("Siège social", ORG, liens, "bail_nu")?.href).toBe(`/agence/${ORG}/profil`);
    expect(lienPourManquant("Siège social", ORG, liens, "bail_nu", "/espace")?.href).toBe(`/espace/${ORG}/profil`);
    expect(lienPourManquant("Date de naissance", ORG, liens, "autre", "/espace")?.href).toMatch(/^\/espace\//);
    expect(lienPourManquant("jj/mm/aaaa", ORG, [{ entite: "bail", entiteId: "b1" }], "quittance", "/espace")?.href).toBe(`/espace/${ORG}/baux/b1`);
    expect(cibleChampBail("Carte et CCI", ORG).href).toBe(`/agence/${ORG}/profil`);
    expect(cibleChampBail("Carte et CCI", ORG, "/espace").href).toBe(`/espace/${ORG}/profil`);
  });

  it("parcours du lot depuis le bail, et retour au bail", () => {
    expect(lienLotDepuisBail(ORG, "b", "l", "ba", "diagnostics", 5)).toBe(`/agence/${ORG}/parc/b/lots/l?parcours=1&etape=diagnostics&retourBail=ba&retourEtape=5`);
    expect(lienLotDepuisBail(ORG, "b", "l", "ba", "diagnostics", 5, "/espace")).toBe(`/espace/${ORG}/parc/b/lots/l?parcours=1&etape=diagnostics&retourBail=ba&retourEtape=5`);
    expect(retourBailDuLot(ORG, "ba", "4", [{ id: "ba" }])).toBe(`/agence/${ORG}/baux/ba#etape-bail-4`);
    expect(retourBailDuLot(ORG, "ba", "4", [{ id: "ba" }], "/espace")).toBe(`/espace/${ORG}/baux/ba#etape-bail-4`);
    expect(retourBailDuLot(ORG, "autre", "4", [{ id: "ba" }], "/espace")).toBeNull();
  });
});

describe("le contexte donne la racine aux composants client", () => {
  function Lien({ orgId }: { orgId: string }) {
    return createElement("a", { href: `${useBaseEspace(orgId)}/parc`, "data-racine": useRacineEspace() });
  }
  it("sans fournisseur : /agence (un lien oublié reste redirigé, jamais cassé)", () => {
    expect(renderToStaticMarkup(createElement(Lien, { orgId: ORG }))).toContain(`href="/agence/${ORG}/parc"`);
  });
  it("avec le fournisseur du propriétaire direct : /espace, jusque dans les composants imbriqués", () => {
    const html = renderToStaticMarkup(createElement(FournisseurRacineEspace, { racine: "/espace" }, createElement("div", null, createElement(Lien, { orgId: ORG }))));
    expect(html).toContain(`href="/espace/${ORG}/parc"`);
    expect(html).toContain('data-racine="/espace"');
  });
  it("avec le fournisseur d'une agence : /agence", () => {
    const html = renderToStaticMarkup(createElement(FournisseurRacineEspace, { racine: "/agence" }, createElement(Lien, { orgId: ORG })));
    expect(html).toContain(`href="/agence/${ORG}/parc"`);
  });
});

describe("baseDeLOrganisation (gestes serveur sans rôle sous la main)", () => {
  const client = (reponse: unknown, leve = false) => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { if (leve) throw new Error("panne"); return reponse; } }) }),
    }),
  }) as never;
  it("propriétaire direct → /espace/<id>", async () => {
    expect(await baseDeLOrganisation(client({ data: { type: "proprietaire_direct" } }), ORG)).toBe(`/espace/${ORG}`);
  });
  it("agence, organisation illisible ou lecture en panne → /agence/<id> (le proxy redirige au besoin)", async () => {
    expect(await baseDeLOrganisation(client({ data: { type: "agence" } }), ORG)).toBe(`/agence/${ORG}`);
    expect(await baseDeLOrganisation(client({ data: null }), ORG)).toBe(`/agence/${ORG}`);
    expect(await baseDeLOrganisation(client({ data: null }, true), ORG)).toBe(`/agence/${ORG}`);
    expect(await baseDeLOrganisation({} as never, ORG)).toBe(`/agence/${ORG}`);
  });
});

// ── Le balayage du code ─────────────────────────────────────────────────────────────────────────────────────────
const SRC = path.resolve(__dirname, "../src");
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}
// Les fichiers où « /agence/${…} » reste écrit à la main, et pourquoi.
const EXCEPTIONS: Record<string, string> = {
  "app/agence/[orgId]/page.tsx": "tableau de bord d'AGENCE : le propriétaire direct est servi plus haut par AccueilProprietaire",
  "app/agence/[orgId]/fil-activite.tsx": "fil d'activité d'AGENCE, rendu par ce seul tableau de bord (même raison)",
  "lib/pilotage.ts": "liens de la supervision, issus de la base (migrations du 22/09) et validés sous la route des dossiers ; la console les convertit (admin/autonomie, cheminPourProfil)",
  "lib/avis-abonnement.ts": "adresse de repli d'un courrier quand la base de l'organisation n'a pas pu être lue : le proxy redirige",
  "app/assistance/contenu-assistance.tsx": "COMPARAISON de la page d'où l'aide est ouverte, ramenée à la route des dossiers (versRouteAgence), jamais un lien émis",
  "app/actions/appels-charges.ts": "chemin de REVALIDATION (la route des dossiers), jamais un lien",
  "app/actions/supprimer-bail-brouillon.ts": "chemins de REVALIDATION (la route des dossiers), jamais des liens",
};

describe("les exceptions sont bien ce qu'elles disent", () => {
  it("le tableau de bord d'agence n'est jamais rendu pour un propriétaire direct (il est servi avant par AccueilProprietaire)", () => {
    const source = readFileSync(path.join(SRC, "app/agence/[orgId]/page.tsx"), "utf8");
    const retour = source.indexOf("if (estProprietaire) {");
    expect(retour).toBeGreaterThan(0);
    expect(source.slice(retour, retour + 200)).toMatch(/return\s*\(\s*<AccueilProprietaire/);
    // Le premier lien /agence/${…} vient APRÈS le retour du propriétaire direct.
    expect(source.indexOf("/agence/${")).toBeGreaterThan(retour);
  });

  it("les chemins d'appels de charges et de suppression d'un brouillon ne servent qu'à revalider", () => {
    const appels = readFileSync(path.join(SRC, "app/actions/appels-charges.ts"), "utf8");
    for (const usage of appels.matchAll(/chemin\(orgId, bienId, lotId\)/g)) {
      const ligne = appels.slice(appels.lastIndexOf("\n", usage.index) + 1, appels.indexOf("\n", usage.index));
      expect(ligne).toMatch(/revalidatePath/);
    }
    const brouillon = readFileSync(path.join(SRC, "app/actions/supprimer-bail-brouillon.ts"), "utf8");
    expect(brouillon).not.toMatch(/redirect\(/);
    expect(brouillon).toMatch(/revalidatePath\(chemin/);
    // Le retour proposé après la suppression, lui, est un lien : il suit la racine du profil.
    expect(brouillon).toMatch(/const retour = `\$\{baseEspace\(orgId, role === "proprietaire_direct"\)\}/);
  });
});

describe("balayage : aucun lien « /agence/${…} » composé à la main hors des exceptions", () => {
  const motif = /\/agence\/\$\{/;
  const sansCommentaires = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("les lignes qui restent sont des revalidations de route ou des exceptions listées", () => {
    const fautes: string[] = [];
    for (const f of fichiers(SRC)) {
      const relatif = path.relative(SRC, f).split(path.sep).join("/");
      if (relatif in EXCEPTIONS) continue;
      sansCommentaires(readFileSync(f, "utf8")).split("\n").forEach((ligne, i) => {
        if (motif.test(ligne) && !/revalidatePath|versRouteAgence/.test(ligne)) fautes.push(`${relatif}:${i + 1} ${ligne.trim().slice(0, 140)}`);
      });
    }
    expect(fautes).toEqual([]);
  });

  it("chaque exception existe encore et en a besoin", () => {
    for (const relatif of Object.keys(EXCEPTIONS)) {
      const source = sansCommentaires(readFileSync(path.join(SRC, relatif), "utf8"));
      expect(source, relatif).toMatch(/\/agence\//);
    }
  });

  it("aucun dossier espace n'existe dans src/app : l'alias n'existe que par le proxy", () => {
    expect(readdirSync(path.join(SRC, "app"))).not.toContain("espace");
  });
});

