export type MensualiteCharge = {rang:number;date:string;du_cents:number;recu_cents:number;declare_le:string|null;recu_le:string|null};
export type EcheancierCharges = {id:string;organization_id:string;bail_id:string;regularisation_id:string;total_cents:number;echeances:MensualiteCharge[];document_id:string|null;publie_le:string|null;accepte_le:string|null};
export function premiereEcheanceCharges(aujourdhui:string){const d=new Date(`${aujourdhui}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+32);return d.toISOString().slice(0,10)}
export function resteEcheancierCharges(plan:Pick<EcheancierCharges,'echeances'>){return plan.echeances.reduce((n,e)=>n+Math.max(0,Number(e.du_cents)-Number(e.recu_cents)),0)}
