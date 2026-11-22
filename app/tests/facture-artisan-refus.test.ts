/**
 * REFUSER UNE FACTURE D'ARTISAN : L'ACTION, L'ÉCRAN DU GESTIONNAIRE ET LA LECTURE DE L'ARTISAN — audit palier 1 du
 * 22/11/2026, P1-03.
 *
 * Sans base (les règles de la base ont leur test : facture-artisan-refus-base.test.ts). Tient :
 *  1. l'action refuse sans compte gestionnaire ou sans motif borné — et n'appelle alors pas la base ; elle transmet le
 *     motif épuré, rend le refus de la base en clair, et rafraîchit les écrans du dossier ;
 *  2. le formulaire de refus est replié sous la validation, exige un motif borné, et dit ce qui se passe ensuite ;
 *  3. la fiche de l'incident : une facture déposée offre « valider » ET « refuser » ; une facture refusée se lit avec
 *     sa date et son motif, sans aucun geste, rangée sous la facture en vigueur qui la remplace ;
 *  4. l'artisan : l'avis lui dit quoi corriger ; ses lectures marquent « refusée » la facture que la fonction de base
 *     rendrait « déposée », et une lecture en panne ne passe pas pour « aucun refus » ;
 *  5. le fil du dossier écrit le numéro et le motif.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type Ligne } from "./faux-postgrest";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(), acces: vi.fn(), revalidatePath: vi.fn(),
  supabase: null as unknown, etat: {} as Record<string, unknown>,
}));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", async () => ({
  ...await vi.importActual<typeof import("next/navigation")>("next/navigation"),
  redirect: vi.fn(), usePathname: () => "/agence/org-a/incidents", useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: banc.acces, verifierLocataire: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifierDevisDemande: vi.fn(), notifierDevisRefuse: vi.fn(), notifierIncidentUrgentDeclare: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
  notifierRevisionDemandee: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banc.supabase }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [banc.etat, () => {}] }));
vi.mock("@/app/actions/reglement-facture", () => ({ declarerReglementFacture: () => ({}), retirerReglementFacture: () => ({}) }));

import { refuserFactureArtisan } from "@/app/actions/incidents";
import { RefusFacture } from "@/app/agence/[orgId]/incidents/validation-facture";
import { FacturesIncident } from "@/app/agence/[orgId]/incidents/factures-incident";
import { AvisFactureRefusee } from "@/app/artisan/missions/facture-refusee";
import { chargerFacturesRefusees, chargerReglementsFactures } from "@/app/artisan/acces";

const ORG = "org-a";
const FACTURE = "3c1d2f4a-0000-4000-8000-0000000000f1";
const MOTIF = "Le montant dépasse le devis accepté : merci de reprendre la ligne de main-d'œuvre.";
const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const refuser = (champs: Record<string, string>) => refuserFactureArtisan(ORG, FACTURE, {}, formulaire(champs));

beforeEach(() => {
  vi.clearAllMocks();
  banc.etat = {};
  banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: banc.rpc } });
  banc.rpc.mockResolvedValue({ data: null, error: null });
});

describe("action refuserFactureArtisan", () => {
  it("sans compte gestionnaire : accès refusé, la base n'est pas appelée", async () => {
    banc.acces.mockResolvedValue({ user: null, supabase: { rpc: banc.rpc } });
    expect(await refuser({ motif_refus: MOTIF })).toEqual({ erreur: "Accès refusé." });
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["aucun motif", {}],
    ["un motif vide", { motif_refus: "     " }],
    ["un motif trop court", { motif_refus: "  non " }],
    ["un motif trop long", { motif_refus: "x".repeat(2001) }],
  ])("%s : refus à l'écran, la base n'est pas appelée", async (_libelle, champs) => {
    const r = await refuser(champs as Record<string, string>);
    expect(r.erreur).toBe("Indiquez à l’artisan ce qui est à corriger (5 à 2 000 caractères).");
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("motif valable : transmis épuré, écrans du dossier rafraîchis, et le message dit ce que l'artisan peut faire", async () => {
    const r = await refuser({ motif_refus: `  ${MOTIF}  ` });
    expect(r).toEqual({ succes: "Facture refusée. L’artisan lit votre motif dans son espace et peut déposer une facture corrigée." });
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("refuser_facture_artisan", { p_org: ORG, p_facture: FACTURE, p_motif: MOTIF });
    expect(banc.revalidatePath.mock.calls.map(([chemin]) => chemin)).toEqual(expect.arrayContaining([`/agence/${ORG}/incidents`, `/agence/${ORG}/alertes`, `/agence/${ORG}`]));
  });

  it("bornes exactes : 5 et 2 000 caractères passent", async () => {
    expect((await refuser({ motif_refus: "abcde" })).erreur).toBeUndefined();
    expect((await refuser({ motif_refus: "x".repeat(2000) })).erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledTimes(2);
  });

  it("un refus de la base est rendu en clair, sans rafraîchir", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Cette facture est déjà validée : elle ne se refuse plus" } });
    const r = await refuser({ motif_refus: MOTIF });
    expect(r.erreur).toContain("déjà validée");
    expect(r.succes).toBeUndefined();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("formulaire de refus", () => {
  const rendre = () => renderToStaticMarkup(createElement(RefusFacture, { orgId: ORG, factureId: FACTURE }));

  it("replié sous la validation ; motif obligatoire, borné comme en base ; dit ce qui se passe ensuite", () => {
    const html = rendre();
    expect(html).toContain("data-refus-facture");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(texte(html)).toContain("Refuser cette facture");
    expect(html).toMatch(/<textarea[^>]*name="motif_refus"[^>]*required/);
    expect(html).toMatch(/minLength="5"/i);
    expect(html).toMatch(/maxLength="2000"/i);
    expect(texte(html)).toContain("Refuser et demander une correction");
    expect(texte(html)).toContain("L’artisan lit ce motif dans son espace et peut déposer une autre facture. La facture refusée reste au dossier, sans être modifiée. Une facture déjà validée ne se refuse plus.");
  });

  it("l'erreur et le succès de l'action s'affichent, annoncés", () => {
    banc.etat = { erreur: "Cette facture est déjà validée : elle ne se refuse plus" };
    expect(rendre()).toMatch(/<p role="alert">Cette facture est déjà validée/);
    banc.etat = { succes: "Facture refusée." };
    expect(rendre()).toMatch(/<p role="status">Facture refusée\.<\/p>/);
  });
});

describe("la fiche de l'incident", () => {
  const INCIDENT = "inc-1";
  const facture = (id: string, numero: string, surcharge: Partial<Ligne> = {}): Ligne => ({
    id, organization_id: ORG, intervention_id: "m1", numero, montant_ttc_cents: 120000, montant_reference_cents: 100000,
    ecart_justification: "Pièce supplémentaire", document_id: `d-${id}`, validee_le: null, decision_motif: null,
    imputation_validee: null, reglee_le: null, refusee_le: null, refus_motif: null, deposee_le: "2026-11-20T09:00:00Z", ...surcharge,
  });
  async function afficher(factures: Ligne[]) {
    banc.supabase = fauxClient({
      incident_interventions: table("incident_interventions", [{ id: "m1", organization_id: ORG, incident_id: INCIDENT, debut_prevu: null, terminee_le: null }]),
      intervention_factures: table("intervention_factures", factures),
      intervention_facture_reglements: table("intervention_facture_reglements", []),
    });
    return renderToStaticMarkup((await FacturesIncident({ orgId: ORG, incidentId: INCIDENT, imputation: null })) as never);
  }
  const sections = (html: string) => html.split("<section").slice(1);

  it("facture déposée : « valider » et, repliée dessous, « refuser »", async () => {
    const html = await afficher([facture("f1", "F-2026-12")]);
    const t = texte(html);
    expect(t).toContain("Facture F-2026-12");
    expect(t).toContain("Valider cette facture");
    expect(html).toContain("data-refus-facture");
    expect(html).toContain('name="motif_refus"');
    expect(html).not.toContain("data-facture-refusee");
    // Le refus vient APRÈS la validation : le geste courant reste « valider ».
    expect(html.indexOf('name="motif"')).toBeLessThan(html.indexOf('name="motif_refus"'));
  });

  it("facture refusée : date, motif, et plus aucun geste (ni valider, ni refuser, ni régler)", async () => {
    const html = await afficher([facture("f1", "F-2026-12", { refusee_le: "2026-11-22T10:00:00Z", refus_motif: MOTIF })]);
    const t = texte(html);
    expect(t).toContain("Refusée, à corriger");
    expect(t).toMatch(/Refusée le 22\/11\/2026 \d{2}:\d{2} : « Le montant dépasse le devis accepté/);
    expect(t).toContain("Consulter la facture refusée");
    expect(t).not.toContain("avant de décider");
    expect(t).toContain("Elle reste au dossier, sans être modifiée ; l’artisan peut déposer une autre facture.");
    expect(html).toContain("data-facture-refusee");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
    expect(t).not.toContain("Valider cette facture");
    expect(t).not.toContain("Refuser cette facture");
    // La pièce refusée reste consultable.
    expect(html).toContain("/documents/d-f1/fichier");
  });

  it("facture refusée puis remplacée : la facture en vigueur d'abord, la refusée dessous, chacune son état", async () => {
    // La base rend la plus récente d'abord ; ici la refusée est volontairement la plus récente déposée : l'ordre de
    // l'écran ne dépend pas de la date, il met la facture en vigueur en tête.
    const html = await afficher([
      facture("f1", "F-2026-12", { refusee_le: "2026-11-22T10:00:00Z", refus_motif: MOTIF, deposee_le: "2026-11-23T09:00:00Z" }),
      facture("f2", "F-2026-13", { montant_ttc_cents: 100000, ecart_justification: null, deposee_le: "2026-11-22T12:00:00Z" }),
    ]);
    const [premiere, seconde] = sections(html);
    expect(texte(premiere)).toContain("Facture F-2026-13");
    expect(texte(premiere)).toContain("Valider cette facture");
    expect(premiere).toContain("data-refus-facture");
    expect(texte(seconde)).toContain("Facture F-2026-12");
    expect(seconde).toContain("data-facture-refusee");
    expect(seconde).not.toContain("<form");
    expect(sections(html)).toHaveLength(2);
  });

  it("facture validée : elle ne propose pas de refus", async () => {
    const html = await afficher([facture("f1", "F-VALIDEE", { validee_le: "2026-11-21T10:00:00Z", decision_motif: "Pièce et prix vérifiés." })]);
    expect(html).not.toContain("data-refus-facture");
    expect(html).not.toContain('name="motif_refus"');
    expect(texte(html)).toContain("Validée le 21/11/2026");
  });
});

describe("l'artisan", () => {
  const REFUSEE = { id: "f1", intervention_id: "m1", numero: "F-2026-12", montant_ttc_cents: 120000, refusee_le: "2026-11-22T10:00:00Z", refus_motif: MOTIF };

  it("l'avis dit ce qui a été refusé, quand, quoi corriger, et que la facture refusée garde son numéro", () => {
    const html = renderToStaticMarkup(createElement(AvisFactureRefusee, { facture: REFUSEE }));
    const t = texte(html);
    expect(html).toMatch(/role="note"[^>]*data-facture-refusee/);
    expect(t).toMatch(/Votre facture n° F-2026-12 \(1[\s  ]200,00[\s  ]€ TTC\) a été refusée par votre client le 22\/11\/2026\./);
    expect(t).toContain(`Ce qu’il vous demande de corriger : « ${MOTIF} »`);
    expect(t).toContain("Déposez une facture corrigée. La facture refusée reste au dossier avec son numéro : si vous établissez la nouvelle depuis Gerimmo, donnez-lui un autre numéro.");
    expect(html).not.toMatch(/<(button|form|input|a)\b/);
  });

  /** Le client de l'artisan : `mon_artisan`, la fonction de règlement, et la lecture de ses factures refusées. */
  function clientArtisan({ fiche = true, reglements = [] as unknown[], refusees = [] as unknown[], panneRefus = false, panneReglements = false } = {}) {
    const appels: unknown[][] = [];
    const requete = {
      select: (colonnes: string) => { appels.push(["select", colonnes]); return requete; },
      eq: (colonne: string, valeur: unknown) => { appels.push(["eq", colonne, valeur]); return requete; },
      not: (colonne: string, operateur: string, valeur: unknown) => { appels.push(["not", colonne, operateur, valeur]); return requete; },
      order: (colonne: string, options: unknown) => {
        appels.push(["order", colonne, options]);
        return Promise.resolve(panneRefus ? { data: null, error: { message: "panne" } } : { data: refusees, error: null });
      },
    };
    banc.supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "compte-artisan" } } }) },
      rpc: async (nom: string) => {
        appels.push(["rpc", nom]);
        if (nom === "mon_artisan") return { data: fiche ? [{ artisan_id: "a1" }] : [], error: null };
        if (nom === "mes_reglements_factures_artisan") return panneReglements ? { data: null, error: { message: "panne" } } : { data: reglements, error: null };
        return { data: null, error: { message: `fonction « ${nom} » non prévue` } };
      },
      from: (nom: string) => { appels.push(["from", nom]); return requete; },
    };
    return appels;
  }
  const ligne = (facture: string, intervention: string, etat: string) => ({
    facture_id: facture, intervention_id: intervention, organization_id: ORG, numero: `N-${facture}`, montant_ttc_cents: 120000,
    validee_le: etat === "deposee" ? null : "2026-11-21T10:00:00Z", etat, reglee_le: null, reglements: [],
  });

  it("ses factures refusées : lues pour lui seul, six colonnes, la plus récente d'abord", async () => {
    const appels = clientArtisan({ refusees: [REFUSEE] });
    expect(await chargerFacturesRefusees()).toEqual({ lignes: [REFUSEE], erreur: false });
    expect(appels).toContainEqual(["from", "intervention_factures"]);
    expect(appels).toContainEqual(["select", "id, intervention_id, numero, montant_ttc_cents, refusee_le, refus_motif"]);
    expect(appels).toContainEqual(["eq", "artisan_id", "a1"]);
    expect(appels).toContainEqual(["not", "refusee_le", "is", null]);
    expect(appels).toContainEqual(["order", "refusee_le", { ascending: false }]);
  });

  it("la fonction de base rend « déposée » : la lecture marque « refusée » la facture refusée, et elle seule", async () => {
    clientArtisan({ reglements: [ligne("f1", "m1", "deposee"), ligne("f2", "m2", "validee"), ligne("f3", "m3", "deposee")], refusees: [REFUSEE] });
    const r = await chargerReglementsFactures();
    expect(r.erreur).toBe(false);
    expect(r.lignes.map((l) => [l.facture_id, l.etat])).toEqual([["f1", "refusee"], ["f2", "validee"], ["f3", "deposee"]]);
  });

  it("une lecture des refus en panne se dit : la facture n'est pas présentée comme simplement « déposée »", async () => {
    clientArtisan({ reglements: [ligne("f1", "m1", "deposee")], panneRefus: true });
    expect((await chargerFacturesRefusees())).toEqual({ lignes: [], erreur: true });
    expect((await chargerReglementsFactures()).erreur).toBe(true);
    clientArtisan({ refusees: [REFUSEE], panneReglements: true });
    expect(await chargerReglementsFactures()).toEqual({ lignes: [], erreur: true });
  });

  it("sans fiche d'artisan : rien n'est lu", async () => {
    const appels = clientArtisan({ fiche: false, refusees: [REFUSEE] });
    expect(await chargerFacturesRefusees()).toEqual({ lignes: [], erreur: false });
    expect(await chargerReglementsFactures()).toEqual({ lignes: [], erreur: false });
    expect(appels.filter(([nature]) => nature === "from")).toEqual([]);
  });

  it("la mission et le dépôt relisent le refus ; le libellé du bouton change", () => {
    const mission = readFileSync("src/app/artisan/missions/[interventionId]/page.tsx", "utf8");
    expect(mission).toContain("const factureRefusee = mission.facture_deposee ? undefined : refusees.lignes.find((r) => r.intervention_id === interventionId);");
    expect(mission).toContain('{factureRefusee ? "Déposer une facture corrigée" : "Déposer ma facture"}');
    expect(mission).toContain("Les refus éventuels de votre client n’ont pas pu être lus : rechargez la page.");
    const depot = readFileSync("src/app/artisan/missions/[interventionId]/facture/page.tsx", "utf8");
    expect(depot).toContain("{factureRefusee && <AvisFactureRefusee facture={factureRefusee} />}");
    expect(depot).toContain('titre={factureRefusee ? "Déposer une facture corrigée" : "Déposer ma facture"}');
  });
});

describe("fil du dossier", () => {
  it("la fiche écrit le numéro de la facture refusée et ce qui est à corriger", () => {
    const fiche = readFileSync("src/app/agence/[orgId]/incidents/pane-incident.tsx", "utf8");
    expect(fiche).toContain('case "facture_refusee":');
    expect(fiche).toContain("d.motif ? `« ${d.motif} »` : null");
  });
});
