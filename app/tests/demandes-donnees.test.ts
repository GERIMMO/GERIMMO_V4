import { beforeEach, describe, expect, it, vi } from "vitest";
import { echeanceDemandeDonnees, estDemandeDonnees, PREFIXE_DEMANDE_DONNEES, typeDemandeDonnees } from "@/lib/demandes-donnees";
import { demanderGestionDonnees } from "@/app/actions/demandes-donnees";
const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
beforeEach(() => { vi.clearAllMocks(); m.getUser.mockResolvedValue({ data: { user: { id: "titulaire" } }, error: null }); m.rpc.mockResolvedValue({ data: "demande", error: null }); });
function formulaire() { const f=new FormData(); f.set("type","fermeture"); f.set("description","Je souhaite fermer mon compte personnel."); f.set("cle_envoi","11111111-1111-4111-8111-111111111111"); return f; }
describe("Demandes de données privées", () => {
  it("ne permet aucune écriture sans identité vérifiée", async () => { m.getUser.mockResolvedValue({data:{user:null}}); expect(await demanderGestionDonnees({},formulaire())).toHaveProperty("erreur"); expect(m.rpc).not.toHaveBeenCalled(); });
  it("ignore une identité, organisation ou nature forgée par le formulaire", async () => { const f=formulaire(); f.set("organization_id","tiers"); f.set("auteur_id","tiers"); f.set("nature","idee"); expect(await demanderGestionDonnees({},f)).toHaveProperty("id","demande"); expect(m.rpc).toHaveBeenCalledWith("soumettre_retour",expect.objectContaining({p_nature:"question",p_org:null,p_titre:PREFIXE_DEMANDE_DONNEES+"Fermer mon compte",p_cle:f.get("cle_envoi")})); expect(m.rpc).toHaveBeenCalledTimes(1); });
  it("réutilise la même clé pour une reprise sans doublon", async () => { const f=formulaire(); await demanderGestionDonnees({},f); await demanderGestionDonnees({},f); expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]); });
  it.each(["autre","__proto__","constructor"])("refuse le type %s", async type => {const f=formulaire();f.set("type",type);expect(await demanderGestionDonnees({},f)).toHaveProperty("erreur");expect(m.rpc).not.toHaveBeenCalled();});
  it("ne promet pas un succès en l’absence de confirmation", async () => {m.rpc.mockResolvedValue({data:null,error:null});expect(await demanderGestionDonnees({},formulaire())).toHaveProperty("erreur");expect(m.revalidate).not.toHaveBeenCalled();});
  it("borne les informations libres",async()=>{const f=formulaire();f.set("description","x".repeat(6001));expect(await demanderGestionDonnees({},f)).toHaveProperty("erreur");expect(m.rpc).not.toHaveBeenCalled();});
  it("n’assimile pas une question partagée à une demande privée",()=>{expect(estDemandeDonnees({nature:"question",organization_id:"org",titre:PREFIXE_DEMANDE_DONNEES+"Test"})).toBe(false);expect(typeDemandeDonnees("acces")).toBe("acces");});
});
describe("Délai en mois civil, jour de Paris",()=>{
  it.each([["2026-01-31T12:00:00Z","2026-02-28"],["2028-01-31T12:00:00Z","2028-02-29"],["2026-10-31T12:00:00Z","2026-11-30"],["2026-12-31T23:30:00Z","2027-02-01"],["2026-03-28T23:30:00Z","2026-04-29"]])("%s → %s",(date,resultat)=>expect(echeanceDemandeDonnees(date)).toBe(resultat));
  it("ne fabrique pas de date sur une donnée illisible",()=>expect(echeanceDemandeDonnees("inconnue")).toBeNull());
});
