import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifierPageArchives } from "@/app/actions/conservation-signatures";
const m=vi.hoisted(()=>({session:vi.fn(),service:vi.fn(),controler:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.session}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:m.service}));
vi.mock("@/lib/conservation-signatures",()=>({controlerCircuitConserve:m.controler}));
const ids=Array.from({length:6},(_,i)=>`0000000${i+1}-0000-4000-8000-000000000001`);
function preparer(options:{autorise?:boolean;erreurDroit?:boolean;erreurLecture?:boolean;erreurJournal?:boolean;vide?:boolean}={}){
  m.session.mockResolvedValue({rpc:vi.fn().mockResolvedValue({data:options.autorise??true,error:options.erreurDroit?{}:null})});
  const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),gt:vi.fn(),abortSignal:vi.fn(),then:Promise.resolve({data:options.vide?[]:ids.map(id=>({id})),error:options.erreurLecture?{}:null}).then.bind(Promise.resolve({data:options.vide?[]:ids.map(id=>({id})),error:options.erreurLecture?{}:null}))};
  for(const f of [q.select,q.eq,q.order,q.limit,q.gt,q.abortSignal])f.mockReturnValue(q);
  const db={from:vi.fn().mockReturnValue(q),rpc:vi.fn().mockResolvedValue({error:options.erreurJournal?{}:null})};
  m.service.mockReturnValue(db);m.controler.mockResolvedValue({ok:true,fichiers:2,motif:"archives_verifiees"});return {db,q};
}
beforeEach(()=>vi.resetAllMocks());
describe("contrôle d'archives réservé au superadmin",()=>{
  it.each([{autorise:false},{erreurDroit:true}])("refuse sans ouvrir le client privilégié",async options=>{preparer(options);expect(await verifierPageArchives()).toHaveProperty("erreur");expect(m.service).not.toHaveBeenCalled();expect(m.controler).not.toHaveBeenCalled();});
  it("refuse un curseur invalide avant toute lecture privilégiée",async()=>{preparer();expect(await verifierPageArchives("invalide")).toHaveProperty("erreur");expect(m.service).not.toHaveBeenCalled();});
  it("distingue une lecture en panne d'une liste vide",async()=>{preparer({erreurLecture:true});expect(await verifierPageArchives()).toHaveProperty("erreur");expect(m.controler).not.toHaveBeenCalled();preparer({vide:true});expect(await verifierPageArchives()).toMatchObject({resultats:[],suite:null});});
  it("limite à cinq et reprend après le dernier dossier contrôlé",async()=>{const {db,q}=preparer();const r=await verifierPageArchives(ids[0]);expect(r.resultats).toHaveLength(5);expect(r.suite).toBe(ids[4]);expect(q.gt).toHaveBeenCalledWith("id",ids[0]);expect(q.limit).toHaveBeenCalledWith(6);expect(m.controler).toHaveBeenCalledTimes(5);expect(db.rpc).toHaveBeenCalledWith("log_tech",{evenement:"controle_archives_signature",details:{controles:5,valides:5,echecs:0,suppressions:0}});expect(JSON.stringify(r)).not.toContain("storage_path");});
  it("signale un journal indisponible sans effacer le résultat du contrôle",async()=>{preparer({erreurJournal:true});expect(await verifierPageArchives()).toMatchObject({journalise:false});});
  it("signale une configuration manquante",async()=>{preparer();m.service.mockReturnValue(null);expect(await verifierPageArchives()).toHaveProperty("erreur");expect(m.controler).not.toHaveBeenCalled();});
  it("refuse un curseur qui n'est pas une chaîne, même s'il se convertit en UUID",async()=>{
    preparer();
    expect(await verifierPageArchives([ids[0]] as unknown as string)).toHaveProperty("erreur");
    expect(m.service).not.toHaveBeenCalled();
  });
  it("poursuit les autres dossiers après une erreur inattendue, sans révéler sa cause privée",async()=>{
    preparer();m.controler.mockRejectedValueOnce(Error("chemin et données privées"));
    const r=await verifierPageArchives();
    expect(r.resultats).toHaveLength(5);
    expect(r.resultats?.[0]).toMatchObject({ok:false,motif:"lecture_indisponible"});
    expect(r.resultats?.slice(1).every(v=>v.ok)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("données privées");
    expect(r.suite).toBe(ids[4]);
  });
  it("conserve les résultats si l'écriture du journal lève une exception",async()=>{
    const {db}=preparer();db.rpc.mockRejectedValueOnce(Error("détail privé"));
    const r=await verifierPageArchives();
    expect(r.resultats).toHaveLength(5);expect(r.journalise).toBe(false);
    expect(JSON.stringify(r)).not.toContain("détail privé");
  });
});
