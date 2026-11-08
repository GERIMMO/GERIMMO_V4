import { expect, it } from "vitest";
import { libellesPoints, pointReception } from "@/lib/paliers-reception-loyer";
import type { RappelLoyer } from "@/lib/rappels-loyers";
const ligne: RappelLoyer = { appel_id: "terme", bail_id: "bail", lot_nom: "Studio", locataire: null, periode: "2026-10-01",
  date_echeance: "2026-10-24", montant_du: 800, montant_couvert: 0, non_recu_signale_le: null,
  relances_automatiques: { active: false, premierDelai: 5, secondDelai: 15 }, historique_relances_disponible: true };
const point=(jour:string, options:Partial<RappelLoyer>={})=>pointReception({...ligne,...options},jour);
it("reprend le loyer à chaque date, sans passer au stade suivant avant un envoi",()=>{
  expect(point("2026-10-23")).toBeNull();
  expect(point("2026-10-24")).toMatchObject({etape:"echeance",aConfirmer:true});
  const reponse={non_recu_signale_le:"2026-10-24T12:00:00+02:00"};
  expect(point("2026-10-28",reponse)).toMatchObject({aConfirmer:false,date:"2026-10-29"});
  expect(point("2026-10-29",reponse)).toMatchObject({etape:"relance_1",aConfirmer:true});
  expect(point("2026-12-12",{non_recu_signale_le:"2026-10-28T23:30:00Z"})).toMatchObject({etape:"relance_1",aConfirmer:false});
});
it("respecte les délais personnalisés et espace les relances tardives, puis le recommandé",()=>{
  const o={relances_automatiques:{active:false,premierDelai:2,secondDelai:6}};
  expect(point("2026-10-26",o)).toMatchObject({etape:"relance_1",aConfirmer:true});
  const premiere={...o,derniere_relance:{niveau:"relance_1",date_envoi:"2026-11-02"}};
  expect(point("2026-11-05",premiere)).toMatchObject({date:"2026-11-06",etape:"relance_2",aConfirmer:false});
  expect(point("2026-11-06",premiere)?.aConfirmer).toBe(true);
  const seconde={...o,derniere_relance:{niveau:"relance_2",date_envoi:"2026-11-07"}};
  expect(point("2026-11-10",seconde)?.aConfirmer).toBe(false);
  expect(point("2026-11-11",seconde)).toMatchObject({etape:"recommande",aConfirmer:true});
  expect(point("2026-11-14",{...seconde, non_recu_signale_le:"2026-11-11T07:00:00Z"})?.aConfirmer).toBe(false);
});
it("ne confond pas solde, historique indisponible et recommandé déjà traité",()=>{
  expect(point("2026-11-01",{montant_couvert:800})).toBeNull();
  expect(point("2026-11-01",{montant_couvert:500})?.aConfirmer).toBe(true);
  expect(point("2026-11-01",{derniere_relance:{niveau:"mise_en_demeure",date_envoi:"2026-11-01"}})).toBeNull();
  expect(point("2026-11-01",{historique_relances_disponible:false})?.etape).toBe("inconnu");
});
it("affiche chaque palier visible une fois, même avec plusieurs logements",()=>{
  const premier=point("2026-11-01");
  expect(libellesPoints([premier,premier,null,point("2026-12-01",{derniere_relance:{niveau:"relance_2",date_envoi:"2026-11-15"}})]))
    .toBe("Recommandé · Première relance");
});
it("ne redemande une autorisation automatique expirée que si l’envoi manque toujours",()=>{
  const ancien={...ligne,relances_automatiques:{...ligne.relances_automatiques!,active:true},non_recu_signale_le:"2026-10-29T08:00:00Z"};
  expect(pointReception(ancien,"2026-10-30",Date.parse("2026-10-30T20:00:00Z"))?.aConfirmer).toBe(false);
  expect(pointReception(ancien,"2026-10-30",Date.parse("2026-10-30T20:01:00Z"))?.confirmationExpiree).toBe(true);
});

it("n’annonce pas un nouvel envoi si ce terme figure dans un recommandé transmis",()=>{
  expect(point("2026-11-30",{recommande_transmis:true,derniere_relance:{niveau:"relance_2",date_envoi:"2026-11-10"}})).toBeNull();
});

it("réveille le bail à la nouvelle échéance même si le terme précédent a déjà fait l’objet d’un recommandé",()=>{
  const precedent={recommande_transmis:true, derniere_echeance_due:"2026-11-24",non_recu_signale_le:"2026-11-20T19:00:00Z"};
  expect(point("2026-11-23",precedent)).toBeNull();
  expect(point("2026-11-24",precedent)).toEqual({etape:"echeance",date:"2026-11-24",aConfirmer:true});
  expect(point("2026-11-25",{...precedent, non_recu_signale_le:"2026-11-24T11:30:00Z"})).toBeNull();
});
