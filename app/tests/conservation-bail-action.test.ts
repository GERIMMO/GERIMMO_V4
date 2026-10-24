/**
 * Gel de la suppression des pièces d'un bail (plan de conformité du 23/10/2026, lot 1E) — action serveur, sans base :
 * contrôles de saisie avant tout appel, appel de `geler_conservation_bail` (la base plafonne à douze mois, journalise),
 * levée du gel. La partie base est dans tests/conservation-prospection-base.test.ts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [{}, () => {}, false] }));
import { gelerConservationBail } from "@/app/actions/conservation-bail";
import { CarteConservationBail, type Conservation } from "@/app/agence/[orgId]/baux/[bailId]/carte-conservation-bail";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const form = (valeurs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(valeurs)) f.set(k, v); return f; };
const BASE = { orgId: ORG, bailId: BAIL, base: `/espace/${ORG}`, geste: "geler", jusqu_au: "2027-06-30", motif: "Contestation du dépôt de garantie" };

beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: {}, error: null }); });

describe("gel de la conservation d'un bail", () => {
  it("refuse avant tout appel : bail mal formé, date absente, motif trop court", async () => {
    expect((await gelerConservationBail({}, form({ ...BASE, bailId: "x" }))).erreur).toMatch(/introuvable/);
    expect((await gelerConservationBail({}, form({ ...BASE, jusqu_au: "" }))).erreur).toMatch(/date de fin/);
    expect((await gelerConservationBail({}, form({ ...BASE, motif: "abc" }))).erreur).toMatch(/litige/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pose le gel par la base, puis rafraîchit la fiche du bail", async () => {
    const r = await gelerConservationBail({}, form(BASE));
    expect(r.succes).toMatch(/Suppression suspendue/);
    expect(rpc).toHaveBeenCalledWith("geler_conservation_bail", { p_bail: BAIL, p_jusqu_au: "2027-06-30", p_motif: "Contestation du dépôt de garantie" });
    expect(revalidatePath).toHaveBeenCalledWith(`/espace/${ORG}/baux/${BAIL}`);
  });

  it("lève le gel sans date ni motif ; le refus de la base est traduit", async () => {
    rpc.mockResolvedValueOnce({ data: { echeance: "2027-05-03", preavis: false }, error: null });
    expect((await gelerConservationBail({}, form({ ...BASE, geste: "lever", jusqu_au: "", motif: "" }))).succes).toMatch(/Gel levé/);
    expect(rpc).toHaveBeenLastCalledWith("geler_conservation_bail", { p_bail: BAIL, p_jusqu_au: null, p_motif: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Un gel dure douze mois au plus ; il se renouvelle ensuite si le litige continue" } });
    expect((await gelerConservationBail({}, form(BASE))).erreur).toMatch(/douze mois au plus/);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Bail introuvable" } });
    expect((await gelerConservationBail({}, form(BASE))).erreur).toMatch(/pas accessible/);
  });
});

// Relecture du 24/10 : la levée disait seulement « les pièces suivent de nouveau leur durée », alors qu'elle pouvait
// rendre les pièces supprimables la nuit même. La base laisse désormais trente jours de préavis ; l'écran dit la date.
describe("levée du gel : la date qui en résulte est dite", () => {
  const lever = () => gelerConservationBail({}, form({ ...BASE, geste: "lever", jusqu_au: "", motif: "" }));
  it("échéance déjà proche : préavis de trente jours, date annoncée", async () => {
    rpc.mockResolvedValueOnce({ data: { echeance: "2026-11-23", preavis: true }, error: null });
    expect((await lever()).succes).toBe("Gel levé. Les pièces ont atteint leur durée de conservation : elles seront supprimées le 23/11/2026, après un préavis de trente jours. Vous serez prévenu par courriel ; téléchargez d’ici là celles que vous devez conserver.");
  });
  it("échéance lointaine : la date de suppression", async () => {
    rpc.mockResolvedValueOnce({ data: { echeance: "2027-05-03", preavis: false }, error: null });
    expect((await lever()).succes).toBe("Gel levé. Les pièces de ce bail seront supprimées à partir du 03/05/2027 ; vous serez prévenu trente jours avant.");
  });
  it("bail en cours : rien n'est supprimé", async () => {
    rpc.mockResolvedValueOnce({ data: { echeance: null, preavis: false }, error: null });
    expect((await lever()).succes).toBe("Gel levé. Rien n’est supprimé tant que le bail n’est pas terminé.");
  });
});

describe("carte « Conservation des pièces »", () => {
  const carte = (c: Partial<Conservation> | null, erreur?: "acces" | "lecture") => renderToStaticMarkup(
    CarteConservationBail({ conservation: c === null ? null : { etat: "termine", duree_mois: 36, echeance: "2029-01-15", gelee_jusqu_au: null, gel_motif: null, preavis: false, echeance_si_levee: "2029-01-15", ...c }, erreur, orgId: ORG, bailId: BAIL, base: `/espace/${ORG}` }));
  it("un refus d'accès ne demande pas de recharger la page", () => {
    const html = carte(null, "acces");
    expect(html).toContain("pas accessible depuis votre compte");
    expect(html).not.toContain("Rechargez");
    expect(carte(null, "lecture")).toContain("Rechargez la page");
  });
  it("bail en cours : les dates qui comptent, sans durée inventée quand la règle est inactive", () => {
    const html = carte({ etat: "actif", echeance: null });
    expect(html).toContain("la plus tardive de ces dates : fin du bail, sortie réelle du locataire, état des lieux de sortie, restitution du dépôt de garantie ou dernière modification du bail");
    expect(html).toContain("36 mois");
    const inactive = carte({ etat: "actif", echeance: null, duree_mois: null });
    expect(inactive).not.toContain("36 mois");
    expect(inactive).toContain("Aucune durée de conservation n’est active pour les pièces d’un bail");
  });
  it("gel en cours : la date de suppression qui suivrait sa levée est annoncée", () => {
    const html = carte({ gelee_jusqu_au: "2099-01-01", gel_motif: "Contestation du dépôt", echeance: "2099-01-02", echeance_si_levee: "2026-11-23" });
    expect(html).toContain("Suppression suspendue jusqu’au");
    expect(html).toContain("Si vous levez le gel, les pièces seront supprimées à partir du 23/11/2026.");
    expect(html).toContain("Lever le gel");
  });
  it("préavis après une levée : dit comme tel, sans bouton de levée", () => {
    const html = carte({ gelee_jusqu_au: "2099-01-01", gel_motif: "Préavis de trente jours après la levée du gel", preavis: true, echeance: "2099-01-02" });
    expect(html).toContain("Gel levé : préavis de trente jours avant la suppression des pièces.");
    expect(html).not.toContain("Lever le gel");
    expect(html).toContain("Suspendre la suppression");
  });
});
