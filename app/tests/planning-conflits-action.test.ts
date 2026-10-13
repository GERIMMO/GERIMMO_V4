import {beforeEach,describe,expect,it,vi} from "vitest";
const banc=vi.hoisted(()=>({rpc:vi.fn(),notifier:vi.fn(),autorise:true}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));vi.mock("next/navigation",()=>({redirect:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:async()=>({user:banc.autorise?{id:"admin-test"}:null,supabase:{rpc:banc.rpc}}),verifierLocataire:vi.fn()}));
vi.mock("@/lib/notifications",()=>({notifierRendezVousFixe:banc.notifier,notifierDevisDemande:vi.fn(),notifierIncidentUrgentDeclare:vi.fn(),notifierMissionAnnulee:vi.fn(),notifierMissionConfiee:vi.fn()}));
import {fixerRendezVous} from "@/app/actions/incidents";
function formulaire(maintien=false,motif="Deux équipes distinctes vérifiées avec l’artisan"){const f=new FormData();f.set("debut","2099-06-20T10:00");f.set("fin","2099-06-20T12:00");f.set("motif","Accord téléphonique TEST");f.set("conflit_motif",motif);if(maintien)f.set("maintenir_conflit","on");return f;}
beforeEach(()=>{vi.clearAllMocks();banc.autorise=true;banc.rpc.mockResolvedValue({error:null});banc.notifier.mockResolvedValue({artisan:{envoyee:true},locataire:{envoyee:true}});});
describe("ART004 — maintien explicitement demandé",()=>{
 it("ignore une justification isolée si la case de maintien n'est pas cochée",async()=>{await fixerRendezVous("org","mission",{},formulaire());expect(banc.rpc).toHaveBeenCalledWith("fixer_creneau_arbitrage_motive",expect.objectContaining({p_conflit_motif:null}));});
 it("transmet un maintien coché avec une justification valable",async()=>{const r=await fixerRendezVous("org","mission",{},formulaire(true));expect(r.succes).toContain("Rendez-vous fixé");expect(banc.rpc).toHaveBeenCalledWith("fixer_creneau_arbitrage_motive",expect.objectContaining({p_conflit_motif:"Deux équipes distinctes vérifiées avec l’artisan"}));});
 it.each(["","court","x".repeat(1001)])("rejette un maintien sans justification de10à1000caractères",async(motif)=>{const r=await fixerRendezVous("org","mission",{},formulaire(true,motif));expect(r.erreur).toMatch(/10 à 1000/);expect(banc.rpc).not.toHaveBeenCalled();expect(banc.notifier).not.toHaveBeenCalled();});
 it("affiche le conflit SQL et conserve la saisie sans notifier",async()=>{banc.rpc.mockResolvedValue({error:{message:"Ce créneau chevauche un rendez-vous déjà confirmé"}});const r=await fixerRendezVous("org","mission",{},formulaire());expect(r.erreur).toMatch(/chevauche/);expect(r.valeurs?.debut).toBe("2099-06-20T10:00");expect(banc.notifier).not.toHaveBeenCalled();});
 it("ne donne pas accès à l'arbitrage sans rôle existant",async()=>{banc.autorise=false;expect((await fixerRendezVous("org","mission",{},formulaire(true))).erreur).toMatch(/Accès refusé/);expect(banc.rpc).not.toHaveBeenCalled();});
});
