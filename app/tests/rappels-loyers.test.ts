import { describe, expect, it, vi } from "vitest";
import { idRelanceReception, lireDerniereRelanceReception, NOTE_RELANCE_TABLEAU, organiserRappelsLoyers, type RappelLoyer } from "@/lib/rappels-loyers";
import type { SupabaseClient } from "@supabase/supabase-js";

const ligne = (patch: Partial<RappelLoyer> = {}): RappelLoyer => ({
  appel_id: "octobre", bail_id: "bail", lot_nom: "Appartement", locataire: "Claire",
  periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 0,
  non_recu_signale_le: null, ...patch,
});
describe("rappels contractuels de réception des loyers", () => {
  it("n'interroge pas le propriétaire avant le jour prévu au contrat", () => {
    expect(organiserRappelsLoyers([ligne()], "2026-10-04").dus).toEqual([]);
    expect(organiserRappelsLoyers([ligne()], "2026-10-05").dus).toHaveLength(1);
  });
  it("un mois payé disparaît ; le prochain reste à venir", () => {
    const r = organiserRappelsLoyers([ligne({ montant_couvert: 800 }), ligne({ appel_id: "novembre", periode: "2026-11-01", date_echeance: "2026-11-05" })], "2026-10-26");
    expect(r.dus).toHaveLength(0); expect(r.prochaine?.appel_id).toBe("novembre");
  });
  it("présente le plus ancien terme de chaque bail avant les suivants", () => {
    const r = organiserRappelsLoyers([ligne(), ligne({ appel_id: "septembre", periode: "2026-09-01", date_echeance: "2026-09-05" }), ligne({ bail_id: "autre", appel_id: "autre" })], "2026-10-26");
    expect(r.dus.map(l => l.appel_id)).toEqual(["septembre", "autre"]); expect(r.totalEcheancesDues).toBe(3);
  });
  it("la ligne présentée garde la dette entière de son bail (audit du 27/10, LAT-03)", () => {
    const septembre = ligne({ appel_id: "septembre", periode: "2026-09-01", date_echeance: "2026-09-05", montant_du: 520, montant_couvert: 20.1 });
    const octobre = ligne({ montant_du: 520 });
    const novembre = ligne({ appel_id: "novembre", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 520 });
    const r = organiserRappelsLoyers([novembre, octobre, septembre, ligne({ bail_id: "autre", appel_id: "autre" })], "2026-10-26");
    expect(r.dus.map(l => [l.appel_id, l.dette_bail])).toEqual([
      ["septembre", { echeances: 2, reste: 1019.9, termesEchus: 2, resteEchu: 1019.9 }],
      ["autre", { echeances: 1, reste: 800, termesEchus: 1, resteEchu: 800 }],
    ]);
    // Le jour de l'échéance, le terme est à recevoir sans être encore échu (même périmètre que l'alerte d'impayé).
    expect(organiserRappelsLoyers([septembre, octobre], "2026-10-05").dus[0].dette_bail).toEqual({ echeances: 2, reste: 1019.9, termesEchus: 1, resteEchu: 499.9 });
  });
  it("conserve un règlement partiel ou signalé non reçu, sans créer de rappel doublonné", () => {
    const r = organiserRappelsLoyers([ligne({ montant_couvert: 200, non_recu_signale_le: "2026-10-25T10:00:00Z" })], "2026-10-26");
    expect(r.dus).toHaveLength(1); expect(r.dus[0].montant_couvert).toBe(200);
  });
  it("respecte les échéances à la fin d'un mois et au changement d'année", () => {
    const r = organiserRappelsLoyers([ligne({ date_echeance: "2027-01-01", periode: "2027-01-01" })], "2026-12-31");
    expect(r.dus).toHaveLength(0); expect(r.prochaine?.date_echeance).toBe("2027-01-01");
  });
  it("à date égale, retient la mise en demeure puis la seconde relance", async () => {
    let niveaux=["relance_1","relance_2","mise_en_demeure"];
    const supabase={from:()=>{
      let niveau="";
      const q={select:vi.fn(),eq:vi.fn(),gte:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:async()=>({data:niveaux.includes(niveau)?{niveau,date_envoi:"2026-10-12"}:null,error:null})};
      q.select.mockReturnValue(q);q.eq.mockImplementation((col:string,val:string)=>{if(col==="niveau")niveau=val;return q;});q.gte.mockReturnValue(q);q.or.mockReturnValue(q);q.order.mockReturnValue(q);q.limit.mockReturnValue(q);return q;
    }} as unknown as SupabaseClient;
    expect((await lireDerniereRelanceReception(supabase,"org",ligne())).data?.niveau).toBe("mise_en_demeure");
    niveaux=["relance_1","relance_2"];expect((await lireDerniereRelanceReception(supabase,"org",ligne())).data?.niveau).toBe("relance_2");
  });
  it("une relance du tableau de bord ne compte que pour l'échéance qu'elle vise (audit du 27/10, LAT-02)", async () => {
    const filtres: { niveau: string; or: string[] }[] = [];
    const supabase = { from: () => {
      const courant = { niveau: "", or: [] as string[] }; filtres.push(courant);
      const q = { select: () => q, gte: () => q, order: () => q, limit: () => q,
        eq: (col: string, val: string) => { if (col === "niveau") courant.niveau = val; return q; },
        or: (expr: string) => { courant.or.push(expr); return q; },
        maybeSingle: async () => ({ data: null, error: null }) };
      return q;
    } } as unknown as SupabaseClient;
    expect((await lireDerniereRelanceReception(supabase, "org", ligne())).data).toBeNull();
    const propre = idRelanceReception("org", "octobre");
    expect(filtres.find(f => f.niveau === "relance_1")?.or).toEqual([`id.eq.${propre},note.is.null,note.not.like.${NOTE_RELANCE_TABLEAU}*`]);
    expect(filtres.filter(f => f.niveau !== "relance_1").every(f => f.or.length === 0)).toBe(true);
    // Identifiant stable : la relance déjà tracée pour cette échéance reste reconnue après la mise à jour.
    expect(propre).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idRelanceReception("org", "septembre")).not.toBe(propre);
  });
});
