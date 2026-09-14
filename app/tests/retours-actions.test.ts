import { beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerRetour, deciderRetour } from "@/app/actions/retours";
import { ecranSansDonnees, actionSansDonnees, moisRevue, pageRetour } from "@/lib/retours";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "auteur" } } }); mocks.rpc.mockResolvedValue({ data: "retour", error: null }); });
function fd(nature="bug") { const f=new FormData();Object.entries({nature,titre:"Titre précis",description:"Le détail utile du problème",attendu:"Le résultat attendu",cle_envoi:"cle",ecran:"/agence/UUID/baux/Nom-Prenom?email=nom@example.org#IBAN",action_origine:"nom@example.org"}).forEach(([k,v])=>f.set(k,v));return f; }
describe("Retours : données minimales et confirmations honnêtes", () => {
 it("retire noms, emails, identifiants, paramètres et fragments du contexte", () => {
  expect(ecranSansDonnees("/agence/UUID/personnes/Nom-Prenom?email=a@b.fr#IBAN")).toBe("/agence/[dossier]/personnes/[dossier]");
  expect(actionSansDonnees("nom@example.org")).toBe("navigation");
 });
 it("refuse une session absente avant toute écriture", async () => {
  mocks.getUser.mockResolvedValue({data:{user:null}});expect(await envoyerRetour({},fd())).toHaveProperty("erreur");expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("assainit aussi côté serveur le contexte envoyé", async () => {
  expect(await envoyerRetour({},fd())).toHaveProperty("id","retour");expect(mocks.rpc).toHaveBeenCalledWith("soumettre_retour",expect.objectContaining({p_ecran:"/agence/[dossier]/baux/[dossier]",p_action:"navigation"}));
 });
 it("exige la confirmation de visibilité d’une idée", async () => {
  expect(await envoyerRetour({},fd("idee"))).toHaveProperty("erreur");expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("ne confirme pas un enregistrement sans identifiant retourné", async () => {
  mocks.rpc.mockResolvedValue({data:null,error:null});expect(await envoyerRetour({},fd())).toHaveProperty("erreur");expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("ne permet pas une décision avec un accès SA faux ou défaillant", async () => {
  mocks.rpc.mockResolvedValue({data:false,error:null});expect(await deciderRetour("id",1,{},fd())).toHaveProperty("erreur");expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it("déclenche la nouvelle revue au début du mois français et borne la pagination", () => {
  expect(moisRevue(new Date("2026-09-30T22:01:00Z"))).toBe("2026-10-01");
  expect(pageRetour("-1")).toBe(1);expect(pageRetour("NaN")).toBe(1);expect(pageRetour("2")).toBe(2);
 });
});
