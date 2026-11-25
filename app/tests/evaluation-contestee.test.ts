/**
 * RETIRER UNE ÉVALUATION CONTESTÉE : L'ACTION, LE FORMULAIRE ET L'ÉCRAN — audit palier 1 du 22/11/2026, P1-07.
 *
 * Sans base (les règles de la base ont leur test : evaluation-contestee-base.test.ts). Tient :
 *  1. l'action refuse sans compte de supervision, sans références valables, sans motif borné, sans confirmation —
 *     et n'appelle alors pas la fonction de retrait ;
 *  2. elle transmet la contestation, l'évaluation et le motif épuré, rend le refus de la base en clair, et
 *     rafraîchit l'écran de la console, le suivi de l'artisan et sa page de note ;
 *  3. le formulaire dit vrai sur qui lit le motif, et demande une confirmation explicite (geste définitif) ;
 *  4. l'écran lit le détail par la fonction tracée — jamais par la table —, après le contrôle d'accès, et la file
 *     des demandes ne propose l'examen que pour une contestation.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(), useRouter: () => ({ refresh: banc.refresh }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: banc.rpc }) }));
vi.mock("@/lib/journal-supervision", () => ({ journaliserSupervision: vi.fn() }));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: vi.fn() }));

import { retirerEvaluationContestee } from "@/app/actions/retours";
import { RetraitEvaluation } from "@/app/admin/retours/[retourId]/evaluations/retrait-evaluation";

const RETOUR = "3c1d2f4a-0000-4000-8000-000000000001";
const EVALUATION = "3c1d2f4a-0000-4000-8000-000000000002";
const MOTIF = "Note déposée sur le mauvais dossier.";
const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const retirer = (champs: Record<string, string>, retour = RETOUR, evaluation = EVALUATION) =>
  retirerEvaluationContestee(retour, evaluation, {}, formulaire(champs));
const appelsRetrait = () => banc.rpc.mock.calls.filter(([fonction]) => fonction === "retirer_evaluation_contestee");

beforeEach(() => {
  vi.clearAllMocks();
  banc.rpc.mockImplementation(async (fonction: string) => fonction === "is_super_admin" ? { data: true, error: null } : { data: null, error: null });
});

describe("action retirerEvaluationContestee", () => {
  it.each([
    ["un compte qui n'est pas de la supervision", { data: false, error: null }],
    ["un contrôle d'accès illisible", { data: null, error: { message: "panne" } }],
  ])("%s : accès refusé, aucun retrait demandé", async (_libelle, reponse) => {
    banc.rpc.mockImplementation(async (fonction: string) => fonction === "is_super_admin" ? reponse : { data: null, error: null });
    expect(await retirer({ motif: MOTIF, confirmation: "on" })).toEqual({ erreur: "Accès réservé à la supervision Gerimmo." });
    expect(appelsRetrait()).toHaveLength(0);
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["aucun motif", { confirmation: "on" }, /motif du retrait \(10 à 1.000 caractères\)/],
    ["un motif trop court", { motif: "  neuf car.  ", confirmation: "on" }, /motif du retrait/],
    ["un motif trop long", { motif: "x".repeat(1001), confirmation: "on" }, /motif du retrait/],
    ["aucune confirmation", { motif: MOTIF }, /Confirmez le retrait/],
  ])("%s : refus à l'écran, aucun retrait demandé", async (_libelle, champs, attendu) => {
    const r = await retirer(champs as Record<string, string>);
    expect(r.erreur).toMatch(attendu);
    expect(appelsRetrait()).toHaveLength(0);
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("des références qui ne sont pas des identifiants : refus, aucun retrait demandé", async () => {
    expect((await retirer({ motif: MOTIF, confirmation: "on" }, "x")).erreur).toMatch(/Rechargez la page/);
    expect((await retirer({ motif: MOTIF, confirmation: "on" }, RETOUR, "1 or 1=1")).erreur).toMatch(/Rechargez la page/);
    expect(appelsRetrait()).toHaveLength(0);
  });

  it("transmet la contestation, l'évaluation et le motif épuré, puis rafraîchit console, suivi et note", async () => {
    const r = await retirer({ motif: `  ${MOTIF}  `, confirmation: "on" });
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toMatch(/Évaluation retirée/);
    expect(appelsRetrait()).toEqual([["retirer_evaluation_contestee", { p_retour: RETOUR, p_evaluation: EVALUATION, p_motif: MOTIF }]]);
    const rafraichis = banc.revalidatePath.mock.calls.map(([chemin]) => chemin);
    expect(rafraichis).toEqual(expect.arrayContaining([`/admin/retours/${RETOUR}/evaluations`, "/admin/retours", "/assistance", "/artisan/note"]));
  });

  it("un refus de la base est rendu en clair, sans rafraîchir", async () => {
    banc.rpc.mockImplementation(async (fonction: string) => fonction === "is_super_admin"
      ? { data: true, error: null } : { data: null, error: { message: "Évaluation déjà retirée" } });
    expect(await retirer({ motif: MOTIF, confirmation: "on" })).toEqual({ erreur: "Évaluation déjà retirée" });
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("formulaire de retrait", () => {
  const html = renderToStaticMarkup(createElement(RetraitEvaluation, { retourId: RETOUR, evaluationId: EVALUATION }));

  it("demande un motif borné comme la base, et une confirmation explicite", () => {
    expect(html).toMatch(/<textarea[^>]*name="motif"[^>]*>/);
    const zone = html.match(/<textarea[^>]*>/)![0];
    expect(zone).toContain("required");
    expect(zone).toContain('minLength="10"');
    expect(zone).toContain('maxLength="1000"');
    const case_ = html.match(/<input[^>]*type="checkbox"[^>]*>/)![0];
    expect(case_).toContain('name="confirmation"');
    expect(case_).toContain("required");
    expect(html).toContain("C’est définitif");
    expect(html).toContain("Retirer l’évaluation");
  });

  it("dit vrai sur qui lit le motif : l'auteur de la note (organisation ou locataire), l'artisan non", () => {
    // Décision du 24/11/2026 (Q20), précisée à la reprise du lot D1 (M5) : seul l'AUTEUR de la note lit le motif —
    // l'organisation pour sa propre note, le locataire pour la sienne. L'ancienne phrase ne citait que l'organisation.
    expect(html).toContain("Le motif est conservé avec l’évaluation. L’auteur de la note retirée le lit : l’organisation pour sa propre note, le locataire pour la sienne. L’artisan ne le voit pas.");
    expect(html).not.toMatch(/reste (privé|confidentiel)/i);
  });
});

describe("écran de la console", () => {
  const page = readFileSync("src/app/admin/retours/[retourId]/evaluations/page.tsx", "utf8");
  const file = readFileSync("src/app/admin/retours/page.tsx", "utf8");

  it("lit le détail par la fonction tracée, jamais par la table, et après le contrôle d'accès", () => {
    expect(page).toContain('c.rpc("evaluations_contestation", { p_retour: retourId })');
    expect(page).not.toMatch(/from\(["']artisan_evaluations["']\)/);
    expect(page.indexOf('c.rpc("is_super_admin")')).toBeGreaterThan(-1);
    expect(page.indexOf('c.rpc("is_super_admin")')).toBeLessThan(page.indexOf('c.rpc("evaluations_contestation"'));
    expect(page.indexOf('redirect("/espaces")')).toBeLessThan(page.indexOf('c.rpc("evaluations_contestation"'));
    // Une demande qui n'est pas une contestation n'ouvre pas la page.
    expect(page).toContain('retour.nature !== "contestation"');
  });

  it("annonce que la consultation est enregistrée, et que maintenir une note ne modifie rien", () => {
    expect(page).toContain("Cette consultation est enregistrée au journal");
    expect(page).toContain("aucune évaluation n’est modifiée");
    expect(page).toContain("<RetraitEvaluation retourId={retourId} evaluationId={e.evaluation_id} />");
  });

  it("la file des demandes ne propose l'examen que pour une contestation, et le dit enregistré", () => {
    expect(file).toContain('{r.nature === "contestation" && <Link href={`/admin/retours/${r.id}/evaluations`}');
    expect(file).toContain("Examiner les évaluations de cet artisan (consultation enregistrée)");
    const decisions = readFileSync("src/app/admin/retours/decisions-retour.tsx", "utf8");
    expect(decisions).toContain("Elle ne retire aucune évaluation : le retrait se fait depuis « Examiner les évaluations de cet artisan »");
  });
});
