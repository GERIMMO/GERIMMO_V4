import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerFaitsDirection, lireSnapshotDirection, preparerFaitsDirection, SOURCES_DIRECTION } from "../src/lib/faits-direction";

function snapshot() {
  return { id:"test",jour:"2026-10-12",genere_le:"2026-10-12T10:00:00Z",version_regles:1,indisponibles:[] as string[],sources:Object.fromEntries(Object.keys(SOURCES_DIRECTION).map(s=>[s,{statut:"disponible",observe_le:"2026-10-12T10:00:00Z",donnees:{mesures:{nombre:0},faits:[]}}])) };
}
const db = (data: unknown, error: unknown = null) => ({rpc:vi.fn().mockResolvedValue({data,error})}) as unknown as Pick<SupabaseClient,"rpc">;
describe("faits de direction : aucune panne convertie en zéro",()=>{
  it("accepte un zéro effectivement lu",()=>expect(lireSnapshotDirection(snapshot())?.sources.incidents.donnees?.mesures.nombre).toBe(0));
  it("refuse une source absente",()=>{const s=snapshot();delete s.sources.incidents;expect(lireSnapshotDirection(s)).toBeNull();});
  it("refuse une mesure non finie",()=>{const s=snapshot();s.sources.loyers.donnees.mesures.nombre=NaN;expect(lireSnapshotDirection(s)).toBeNull();});
  it("distingue absence de point et panne de lecture",async()=>{expect(await chargerFaitsDirection(db(null),'2026-10-12')).toEqual({snapshot:null,erreur:false});expect(await chargerFaitsDirection(db(null,{message:'hors ligne'}),'2026-10-12')).toEqual({snapshot:null,erreur:true});});
  it("préparer refuse un résultat absent sans inventer un état",async()=>expect((await preparerFaitsDirection(db(null))).erreur).toContain('conservés'));
  it("conserve l’ancien relevé daté d’une source indisponible",async()=>{const s=snapshot();s.sources.incidents.statut='indisponible';s.indisponibles=['incidents'];const r=await preparerFaitsDirection(db(s));expect(r.erreur).toContain('derniers faits datés');expect(r.snapshot?.sources.incidents.observe_le).toBe(s.sources.incidents.observe_le);});
});
