/**
 * Plan de conformité du 23/10/2026, lot 1E — relectures adverses du 24/10 : les écrans de la fermeture des comptes et de
 * l'archive complète (/admin/donnees, /compte/donnees). Sans base : session remplacée par une doublure, aucun appel réel.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  permanent: true as boolean,
  tables: {} as Record<string, unknown[]>,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({}), usePathname: () => "/admin/donnees", redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nom: string) => (nom === "is_permanent_super_admin" ? { data: m.permanent, error: null } : { data: null, error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, eq: () => q, is: () => q, in: () => q, or: () => q, limit: () => q,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: m.tables[table] ?? [], error: null }).then(resolve),
      };
      return q;
    },
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
  }),
}));

import { FermeturesComptes } from "../src/app/admin/donnees/fermetures";
import { ArchiveComplete } from "../src/app/compte/donnees/archive";
import { resumeEspaceEfface } from "../src/lib/comptes-fermeture";

const lisible = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/[  ]/g, " ");

beforeEach(() => {
  m.permanent = true;
  m.tables = {};
});

describe("/admin/donnees : fermetures des comptes", () => {
  it("super-administrateur sans supervision permanente : l'écran le dit, ne prétend pas « aucune fermeture » (relecture du 24/10)", async () => {
    m.permanent = false;
    const html = lisible(renderToStaticMarkup(createElement("div", null, await FermeturesComptes())));
    expect(html).toContain("Réservé à la supervision permanente avec second facteur");
    expect(html).not.toContain("Aucune fermeture programmée ni récente");
  });

  it("une fermeture programmée : la nuit de l'effacement dite « du 15 au 16 », sans ambiguïté", async () => {
    m.tables.fermetures_comptes = [{
      id: "f1", account_id: "abcdef12-0000-4000-8000-000000000000", origine: "super_admin", choix: null, statut: "programmee",
      programmee_le: "2026-12-02T10:00:00Z", effacement_prevu_le: "2026-12-16", gel_motif: null, tentatives: 0, derniere_erreur: null,
      executee_le: null, mode_effacement: null, bilan_execution: null, remboursement_prevu_cents: null, remboursement_cents: null,
      courriel_envoye_le: null, annulation_motif: null,
    }];
    const html = lisible(renderToStaticMarkup(createElement("div", null, await FermeturesComptes())));
    expect(html).toContain("Effacement prévu dans la nuit du 15 au 16 décembre 2026");
  });

  it("bilan d'un espace effacé : pluriels accordés (« baux », « 1 bail »), sans « (s) »", () => {
    expect(resumeEspaceEfface({ nom: "Espace Martin", biens: 1, lots: 2, baux: 3, personnes: 1, documents: 0, fichiers: 2, membres_invites: 0, demandes_zoho: 0 }))
      .toBe("Espace « Espace Martin » effacé : 1 bien, 2 lots, 3 baux, 1 personne, aucun document, 2 fichiers.");
    expect(resumeEspaceEfface({ nom: null, biens: 0, lots: 1, baux: 1, personnes: 2, documents: 1, fichiers: 0, membres_invites: 2, demandes_zoho: 1 }))
      .toBe("Espace « sans nom » effacé : aucun bien, 1 lot, 1 bail, 2 personnes, 1 document, aucun fichier, 2 accès d’invités retirés, 1 demande Zoho à supprimer chez le prestataire.");
  });
});

describe("/compte/donnees : archive complète", () => {
  const espace = { organization_id: "44444444-4444-4444-8444-444444444444", organizations: { name: "Espace Martin", type: "proprietaire_direct" } };

  it("identité à confirmer : deux gestes proposés (se reconnecter, valider le second facteur), message annoncé au chargement", async () => {
    m.tables.memberships = [espace];
    const html = lisible(renderToStaticMarkup(createElement("div", null, await ArchiveComplete({ etat: "identite" }))));
    expect(html).toContain("Se reconnecter avec mon mot de passe");
    expect(html).toContain('href="/compte#second-facteur"');
    expect(html).toMatch(/role="alert"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="alert"/i);
  });

  it("demande déjà en préparation (double clic) : un état, pas une erreur ; préparation reprise : dite comme telle", async () => {
    m.tables.memberships = [espace];
    const enCours = lisible(renderToStaticMarkup(createElement("div", null, await ArchiveComplete({ etat: "en_cours" }))));
    expect(enCours).toContain('role="status"');
    expect(enCours).not.toContain('class="err"');
    const relancee = lisible(renderToStaticMarkup(createElement("div", null, await ArchiveComplete({ etat: "relancee" }))));
    expect(relancee).toContain("La préparation interrompue reprend");
  });

  it("archive en préparation depuis longtemps : l'écran dit comment la relancer, au lieu de « quelques minutes » sans fin", async () => {
    m.tables.memberships = [espace];
    m.tables.exports_complets = [{ id: "x1", organisation_id_export: espace.organization_id, statut: "en_cours", demande_le: "2026-10-20T08:00:00Z", pret_le: null, expire_le: null, erreur: null }];
    const html = lisible(renderToStaticMarkup(createElement("div", null, await ArchiveComplete({}))));
    expect(html).toContain("cliquez de nouveau sur « Préparer l’archive complète »");
  });
});
