import { beforeEach, expect, it, vi } from "vitest";
const banc=vi.hoisted(()=>({etat:{} as {succes?:string;erreur?:string},ref:{current:{} as unknown},notifier:vi.fn(),init:false}));
vi.mock("react",()=>({createContext:()=>({}),useContext:()=>banc.notifier,useActionState:()=>[banc.etat,vi.fn(),false],useRef:(v:unknown)=>{if(!banc.init){banc.ref.current=v;banc.init=true;}return banc.ref;},useEffect:(fn:()=>void)=>fn()}));
import {useActionStateSuivi} from "@/lib/suivi-enregistrement";
const useRenduTest=()=>useActionStateSuivi(async()=>({}),{});
beforeEach(()=>{banc.etat={};banc.init=false;vi.clearAllMocks();useRenduTest();});
it("ne vérifie pas au montage",()=>expect(banc.notifier).not.toHaveBeenCalled());
it("notifie distinctement une erreur et un succès",()=>{banc.etat={erreur:"Refus"};useRenduTest();expect(banc.notifier).toHaveBeenLastCalledWith(false);banc.etat={succes:"Enregistré"};useRenduTest();expect(banc.notifier).toHaveBeenLastCalledWith(true);expect(banc.notifier).toHaveBeenCalledTimes(2);});
it("ne relance pas à chaque rendu mais accepte deux enregistrements successifs",()=>{banc.etat={succes:"Enregistré"};useRenduTest();useRenduTest();expect(banc.notifier).toHaveBeenCalledTimes(1);banc.etat={succes:"Enregistré"};useRenduTest();expect(banc.notifier).toHaveBeenCalledTimes(2);});
