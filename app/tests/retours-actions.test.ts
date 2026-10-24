import { beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerRetour, deciderRetour } from "@/app/actions/retours";
import { ecranSansDonnees, actionSansDonnees, moisRevue, pageRetour } from "@/lib/retours";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn(), nature: "question", editeur: {} as Record<string, string | null> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { nature: mocks.nature }, error: null }) }; return q; } }) }));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => ({ editeur: mocks.editeur, indisponible: false }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "auteur" } } }); mocks.rpc.mockResolvedValue({ data: "retour", error: null }); });
function fd(nature="bug") { const f=new FormData();Object.entries({nature,titre:"Titre précis",description:"Le détail utile du problème",attendu:"Le résultat attendu",cle_envoi:"cle",ecran:"/agence/UUID/baux/Nom-Prenom?email=nom@example.org#IBAN",action_origine:"nom@example.org"}).forEach(([k,v])=>f.set(k,v));return f; }
describe("Retours : données minimales et confirmations honnêtes", () => {
 it("retire noms, emails, identifiants, paramètres et fragments du contexte", () => {
  expect(ecranSansDonnees("/agence/UUID/personnes/Nom-Prenom?email=a@b.fr#IBAN")).toBe("/agence/[dossier]/personnes/[dossier]");
  expect(ecranSansDonnees("/admin/sante")).toBe("/admin/sante");
  expect(ecranSansDonnees("/artisan/facturation")).toBe("/artisan/facturation");
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

describe("plan du 23/10 (R05) : la réclamation et le médiateur de la consommation", () => {
 function decision(etat:string,reponse="Nous avons corrigé votre facture."){const f=new FormData();f.set("etat",etat);f.set("gravite","N3");f.set("reponse",reponse);return f;}
 const reponseEnvoyee=()=>mocks.rpc.mock.calls.find(c=>c[0]==="traiter_retour")?.[1].p_reponse;
 beforeEach(()=>{mocks.rpc.mockImplementation(async(nom:string)=>({data:nom==="is_super_admin"?true:null,error:null}));mocks.editeur={};mocks.nature="reclamation";});
 it("« Faire une réclamation » est une nature admise", async () => {
  mocks.rpc.mockResolvedValue({data:"retour",error:null});
  expect(await envoyerRetour({},fd("reclamation"))).toHaveProperty("id","retour");
  expect(mocks.rpc).toHaveBeenCalledWith("soumettre_retour",expect.objectContaining({p_nature:"reclamation"}));
 });
 it("une réclamation résolue renvoie au médiateur saisi", async () => {
  mocks.editeur={mediateurNom:"Médiateur de test",mediateurAdresse:"1 rue Exemple, Paris",mediateurSite:"https://example.test/mediateur"};
  expect(await deciderRetour("id",1,{},decision("resolu"))).toHaveProperty("succes");
  expect(reponseEnvoyee()).toBe("Nous avons corrigé votre facture.\n\nSi cette réponse ne vous satisfait pas, vous pouvez saisir gratuitement le médiateur de la consommation : Médiateur de test, 1 rue Exemple, Paris, https://example.test/mediateur.");
 });
 it("sans médiateur saisi (décision du 23/10, non bloquant) : la phrase de l'adhésion en cours", async () => {
  await deciderRetour("id",1,{},decision("resolu"));
  expect(reponseEnvoyee()).toBe("Nous avons corrigé votre facture.\n\nMédiateur de la consommation : adhésion en cours ; ses coordonnées figureront dans les mentions légales dès qu'elle sera effective.");
 });
 it("seulement à la clôture d'une réclamation : ni en cours, ni pour une autre nature", async () => {
  await deciderRetour("id",1,{},decision("en_cours"));
  expect(reponseEnvoyee()).toBe("Nous avons corrigé votre facture.");
  vi.clearAllMocks();mocks.rpc.mockImplementation(async(nom:string)=>({data:nom==="is_super_admin"?true:null,error:null}));
  mocks.nature="question";
  await deciderRetour("id",1,{},decision("resolu"));
  expect(reponseEnvoyee()).toBe("Nous avons corrigé votre facture.");
 });
 it("une réponse trop longue pour y ajouter la phrase est refusée avant l'écriture", async () => {
  const r=await deciderRetour("id",1,{},decision("resolu","x".repeat(5990)));
  expect(r.erreur).toMatch(/Raccourcissez la réponse/);
  expect(mocks.rpc.mock.calls.map(c=>c[0])).not.toContain("traiter_retour");
 });
});
