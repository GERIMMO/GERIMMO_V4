/**
 * Relevés PROP-09 et PRO2-22 (audit du 13/10/2026) : un propriétaire direct lisait du vocabulaire d'agence
 * (« Réactiver (réservé au responsable) », « privé à votre agence »), et l'artisan qui travaille pour lui lisait
 * « l'agence le tranchera ». Seules ces phrases changent : l'espace des gérants d'agence garde les siennes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(),
  role: "proprietaire_direct" as string | null,
  fiche: { artisan_id: "art" } as { artisan_id: string } | null,
  mission: null as Record<string, unknown> | null,
  personnes: [] as Record<string, unknown>[],
}));

// Un client minimal : `persons` rend les fiches du banc, que l'on lise une liste ou une seule ligne.
function requete(table: string) {
  const lignes = table === "persons" ? banc.personnes : [];
  const q: Record<string, unknown> = {};
  for (const methode of ["select", "eq", "neq", "ilike", "is", "limit", "order"]) q[methode] = () => q;
  q.maybeSingle = async () => ({ data: lignes[0] ?? null, error: null });
  q.then = (suite: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: lignes, error: null }).then(suite);
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifierDevisDemande: vi.fn(),
  notifierIncidentUrgentDeclare: vi.fn(),
  notifierMissionAnnulee: vi.fn(),
  notifierMissionConfiee: vi.fn(),
  notifierRendezVousFixe: vi.fn(),
  notifierCreneauxAChoisir: vi.fn(),
  notifierEnCoulisses: vi.fn(),
  notifierMissionRefusee: vi.fn(),
}));
vi.mock("@/lib/photos-incident-reprise", () => ({ joindrePhotosAvecReprise: async () => undefined }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, supabase: { rpc: banc.rpc, from: requete }, role: banc.role }),
  verifierLocataire: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierArtisanAction: async () => ({
    supabase: {
      rpc: async (nom: string) => ({ data: nom === "mon_agenda_artisan" && banc.mission ? [banc.mission] : [], error: null }),
    },
    fiche: banc.fiche,
  }),
}));
vi.mock("@/app/artisan/devis/actions-preparation", () => ({ envoyerDevisValide: vi.fn() }));
vi.mock("@/app/actions/parc", () => ({ changerEtatLot: vi.fn() }));

import { BoutonsEtatLot } from "../src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/boutons-etat-lot";
import { FormulaireEvaluation } from "../src/app/agence/[orgId]/incidents/formulaires-artisan";
import { evaluerArtisan } from "../src/app/actions/incidents";
import { creerPersonne, modifierPersonne } from "../src/app/actions/personnes";
import { deLEspaceDeGestion } from "../src/lib/libelles";
import { deposerMaFacture, deposerMonCompteRendu, refuserMaMission } from "../src/app/actions/artisan";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => {
  banc.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  banc.personnes = [];
  banc.role = "proprietaire_direct";
  banc.fiche = { artisan_id: "art" };
  banc.mission = null;
});

describe("PROP-09 : le bouton de réactivation d'un lot archivé", () => {
  const rendre = (estBailleurDirect: boolean) =>
    texteDe(renderToStaticMarkup(createElement(BoutonsEtatLot, { orgId: "o", bienId: "b", lotId: "l", etat: "archive", estBailleurDirect })));

  it("dit « Réactiver » au propriétaire direct, qui est lui-même le responsable", () => {
    const texte = rendre(true);
    expect(texte).toContain("Réactiver");
    expect(texte).not.toMatch(/réservé au responsable/);
  });

  it("garde la mention de permission pour l'espace agence, où un agent n'a pas ce droit", () => {
    expect(rendre(false)).toContain("Réactiver (réservé au responsable)");
  });
});

describe("PROP-09 : l'assistant de création d'une fiche personne", () => {
  it("ne parle plus de « lot de l'agence » au propriétaire direct", () => {
    const source = lire("src/app/agence/[orgId]/personnes/formulaire-personne.tsx");
    expect(source).toMatch(/estBailleurDirect \? "Rattacher à un lot" : "Rattacher à un lot de l’agence"/);
  });
});

describe("PRO2-22 : la notation de l'artisan", () => {
  const rendre = (estProprietaire: boolean) =>
    texteDe(renderToStaticMarkup(createElement(FormulaireEvaluation, { orgId: "o", interventionId: "i", estProprietaire })));

  it("le champ commentaire est « privé à votre espace » chez le propriétaire direct", () => {
    const texte = rendre(true);
    expect(texte).toContain("Commentaire — privé à votre espace");
    expect(texte).not.toMatch(/agence/);
  });

  it("il reste « privé à votre agence » dans l'espace agence", () => {
    expect(rendre(false)).toContain("Commentaire — privé à votre agence");
  });

  const formulaireNote = () => {
    const f = new FormData();
    f.set("qualite", "4");
    f.set("delai", "4");
    f.set("prix", "4");
    return f;
  };

  it("le message de succès du propriétaire direct ne cite pas d'agence", async () => {
    banc.role = "proprietaire_direct";
    const retour = await evaluerArtisan("o", "i", {}, formulaireNote());
    expect(retour.succes).toBeTruthy();
    expect(retour.succes).not.toMatch(/agence/);
  });

  it("le message de succès de l'agence garde son vocabulaire", async () => {
    banc.role = "admin_agence";
    const retour = await evaluerArtisan("o", "i", {}, formulaireNote());
    expect(retour.succes).toContain("reste dans votre agence");
  });
});

describe("PROP-09 : « une autre fiche de l'agence » quand l'adresse email existe déjà", () => {
  it("le mot dépend du type d'espace", () => {
    expect(deLEspaceDeGestion("proprietaire_direct")).toBe("de votre espace");
    expect(deLEspaceDeGestion("admin_agence")).toBe("de l'agence");
    expect(deLEspaceDeGestion("agent")).toBe("de l'agence");
    expect(deLEspaceDeGestion(null)).toBe("de l'agence");
  });

  const fiche = () => {
    const f = new FormData();
    for (const [cle, valeur] of Object.entries({
      nom: "Martin", prenom: "Jeanne", email: "jeanne@exemple.fr", date_naissance: "1985-03-02", commune_naissance: "Lyon",
      address_line1: "1 rue des Lilas", postal_code: "69003", city: "Lyon",
    })) f.set(cle, valeur);
    return f;
  };

  it("à la création d'une fiche, le propriétaire direct lit « de votre espace »", async () => {
    banc.personnes = [{ id: "existante", prenom: "Jeanne" }];
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.erreur).toContain("déjà portée par une autre fiche de votre espace");
    expect(retour.erreur).not.toMatch(/agence/);
  });

  it("à la création d'une fiche, l'agence garde « de l'agence »", async () => {
    banc.role = "admin_agence";
    banc.personnes = [{ id: "existante", prenom: "Jeanne" }];
    const retour = await creerPersonne("org", {}, fiche());
    expect(retour.erreur).toContain("déjà portée par une autre fiche de l'agence");
  });

  it("à la modification d'une fiche, le propriétaire direct lit « de votre espace »", async () => {
    banc.personnes = [{ id: "existante", prenom: "Jeanne" }];
    const retour = await modifierPersonne("org", "autre", {}, fiche());
    expect(retour.erreur).toContain("déjà portée par une autre fiche de votre espace");
    expect(retour.erreur).not.toMatch(/agence/);
  });

  it("la création rapide d'un locataire (bail) et d'un propriétaire (détention) passent aussi par le même mot", () => {
    expect(lire("src/app/actions/baux.ts")).toContain("appartient déjà à une fiche ${deLEspaceDeGestion(role)}");
    expect(lire("src/app/actions/parc.ts")).toContain("déjà portée par une fiche ${deLEspaceDeGestion(role)}");
  });
});

describe("PROP-09 / PRO2-22 : le drapeau du propriétaire direct arrive jusqu'aux phrases du dossier d'incident", () => {
  // VoletArtisan est un composant serveur asynchrone (lectures de la base) : on tient son câblage par lecture du code.
  const volet = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
  it("la fiche incident le passe au volet artisan, qui le passe au formulaire de notation", () => {
    expect(lire("src/app/agence/[orgId]/incidents/pane-incident.tsx")).toMatch(/<VoletArtisan[\s\S]*?estProprietaire=\{estProprietaire\}[\s\S]*?\/>/);
    expect(volet).toContain("<FormulaireEvaluation orgId={orgId} interventionId={mission.id} estProprietaire={estProprietaire} />");
  });
  it("une mission annulée n'est plus « annulée par l'agence » chez le propriétaire direct", () => {
    expect(volet).toContain(`Mission annulée{estProprietaire ? "" : " par l'agence"}`);
  });
  it("un créneau fixé par le propriétaire lui-même est « proposé par vous »", () => {
    expect(volet).toContain('estProprietaire && c.propose_par === "agence" ? "vous" : PAR_AUTEUR_CRENEAU[c.propose_par]');
  });
});

describe("PRO2-22 : ce que l'artisan lit quand il travaille pour un propriétaire direct", () => {
  it("l'écart de facture sera tranché par « votre interlocuteur », comme le dit déjà le formulaire", async () => {
    banc.mission = { intervention_id: "mi", organization_id: "o", statut: "terminee", facture_deposee: false, montant_plafond_cents: 10000 };
    const f = new FormData();
    f.set("numero", "F-1");
    f.set("montant", "120,00");
    f.set("fichier", new File(["x"], "facture.pdf", { type: "application/pdf" }));
    const retour = await deposerMaFacture("mi", {}, f);
    expect(retour.erreur).toContain("expliquez l'écart, votre interlocuteur le tranchera.");
    expect(retour.erreur).not.toMatch(/agence/);
  });

  it("le refus d'une mission demande un motif à « votre interlocuteur »", async () => {
    const retour = await refuserMaMission("mi", {}, new FormData());
    expect(retour.erreur).toContain("votre interlocuteur doit réaffecter");
    expect(retour.erreur).not.toMatch(/agence/);
  });

  it("le compte rendu demande le constat à « votre interlocuteur »", async () => {
    const f = new FormData();
    f.set("travaux", "Remplacement du joint");
    f.set("imputation_suggeree", "locataire");
    const retour = await deposerMonCompteRendu("mi", {}, f);
    expect(retour.erreur).toContain("permet à votre interlocuteur de trancher");
    expect(retour.erreur).not.toMatch(/agence/);
  });
});
