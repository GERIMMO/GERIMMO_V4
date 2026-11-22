/**
 * CORRIGER L'URGENCE D'UN INCIDENT : L'ACTION ET LE FORMULAIRE — audit palier 1 du 22/11/2026, P1-04.
 *
 * Sans base (les règles de la base ont leur test : incident-urgence-corrigee-base.test.ts). Tient :
 *  1. l'action refuse sans compte gestionnaire, sans niveau valable, sans motif borné — et n'appelle alors pas la base ;
 *  2. elle transmet le niveau et le motif épuré, rend l'erreur de la base en clair, et rafraîchit les écrans du dossier ;
 *  3. le formulaire propose le sens inverse du niveau actuel, replié, avec un motif obligatoire, et ne promet rien de
 *     faux au sujet du locataire ;
 *  4. le fil du dossier écrit « ancien → nouveau — motif ».
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), acces: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: banc.acces, verifierLocataire: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifierDevisDemande: vi.fn(), notifierDevisRefuse: vi.fn(), notifierIncidentUrgentDeclare: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
  notifierRevisionDemandee: vi.fn(),
}));

import { readFileSync } from "node:fs";
import { corrigerUrgenceIncident } from "@/app/actions/incidents";
import { FormulaireUrgence } from "@/app/agence/[orgId]/incidents/[incidentId]/actions-incident";

const ORG = "3c1d2f4a-0000-4000-8000-000000000001";
const INCIDENT = "3c1d2f4a-0000-4000-8000-000000000002";
const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const corriger = (champs: Record<string, string>) => corrigerUrgenceIncident(ORG, INCIDENT, {}, formulaire(champs));

beforeEach(() => {
  vi.clearAllMocks();
  banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: banc.rpc } });
  banc.rpc.mockResolvedValue({ data: null, error: null });
});

describe("action corrigerUrgenceIncident", () => {
  it("sans compte gestionnaire : accès refusé, la base n'est pas appelée", async () => {
    banc.acces.mockResolvedValue({ user: null, supabase: { rpc: banc.rpc } });
    expect(await corriger({ urgence: "normale", motif: "Fuite arrêtée." })).toEqual({ erreur: "Accès refusé." });
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["un niveau inconnu", { urgence: "critique", motif: "Fuite arrêtée." }, /Rechargez la page/],
    ["aucun niveau", { motif: "Fuite arrêtée." }, /Rechargez la page/],
    ["aucun motif", { urgence: "normale" }, /motif de la correction/],
    ["un motif trop court", { urgence: "normale", motif: "  ok  " }, /motif de la correction/],
    ["un motif trop long", { urgence: "normale", motif: "x".repeat(501) }, /motif de la correction/],
  ])("%s : refus à l'écran, la saisie est rendue, la base n'est pas appelée", async (_libelle, champs, attendu) => {
    const r = await corriger(champs as Record<string, string>);
    expect(r.erreur).toMatch(attendu);
    expect(r.valeurs).toBeDefined();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["normale", "Dossier repassé en urgence normale"],
    ["urgente", "Dossier marqué urgent"],
  ])("vers « %s » : niveau et motif épuré transmis, écrans du dossier rafraîchis", async (urgence, succes) => {
    const r = await corriger({ urgence, motif: "  La fuite est arrêtée.  " });
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain(succes);
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("corriger_urgence_incident", { p_org: ORG, p_incident: INCIDENT, p_urgence: urgence, p_motif: "La fuite est arrêtée." });
    const rafraichis = banc.revalidatePath.mock.calls.map(([chemin]) => chemin);
    expect(rafraichis).toEqual(expect.arrayContaining([`/agence/${ORG}/incidents`, `/espace/${ORG}/incidents`, `/agence/${ORG}`, `/espace/${ORG}`]));
  });

  it("un refus de la base est rendu en clair, sans rafraîchir", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Cet incident est clos : son urgence ne se corrige plus" } });
    const r = await corriger({ urgence: "normale", motif: "Fuite arrêtée." });
    expect(r.erreur).toContain("clos");
    expect(r.valeurs?.motif).toBe("Fuite arrêtée.");
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("formulaire de correction", () => {
  const rendre = (urgente: boolean) => renderToStaticMarkup(createElement(FormulaireUrgence, { orgId: ORG, incidentId: INCIDENT, urgente }));

  it("dossier urgent : propose de repasser en urgence normale ; replié ; motif obligatoire et borné", () => {
    const html = rendre(true);
    expect(html).toContain('data-correction-urgence="urgente"');
    expect(html).toContain("Corriger l’urgence");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('name="urgence" value="normale"');
    expect(html).toContain("Repasser en urgence normale");
    expect(html).toMatch(/<textarea[^>]*name="motif"[^>]*required/);
    expect(html).toMatch(/minLength="5"/i);
    expect(html).toMatch(/maxLength="500"/i);
  });

  it("dossier normal : propose de le marquer urgent", () => {
    const html = rendre(false);
    expect(html).toContain('data-correction-urgence="normale"');
    expect(html).toContain('name="urgence" value="urgente"');
    expect(html).toContain("Marquer urgent");
  });

  it("ne promet rien de faux : le locataire n'est pas prévenu, et l'écran le dit", () => {
    const html = rendre(true);
    expect(html).toContain("Le locataire n’est pas prévenu de cette correction.");
    expect(html).not.toContain("que le locataire peut lire");
  });
});

describe("fil du dossier", () => {
  it("la fiche rend la correction pour qui peut agir sur le suivi, et le fil écrit « ancien → nouveau — motif »", () => {
    const fiche = readFileSync("src/app/agence/[orgId]/incidents/pane-incident.tsx", "utf8");
    expect(fiche).toContain("const correctionUrgence = peutModifierSuivi && <FormulaireUrgence");
    expect(fiche.match(/\{correctionUrgence\}/g)).toHaveLength(2);
    expect(fiche).toContain('case "urgence_corrigee":');
    expect(fiche).toContain("URGENCES_INCIDENT[String(d.urgence_precedente)]");
  });
});
