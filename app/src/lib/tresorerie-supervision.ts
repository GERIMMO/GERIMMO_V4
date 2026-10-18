import { instantParis } from './dates-supervision';
export type MouvementStripe = { id: string; created: number; type: string; currency: string; amount: number; fee: number; net: number; status: string };
export function periodeFinanciere(mois: string | undefined, today: string) {
 const value = mois && /^20\d{2}-(0[1-9]|1[0-2])$/.test(mois) ? mois : today.slice(0,7);
 const [y,m] = value.split('-').map(Number);
 const next = `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`;
 return { mois:value, debut:`${value}-01`, fin:next, gte:Date.parse(instantParis(`${value}-01T00:00`)!) /1000, lt:Date.parse(instantParis(`${next}T00:00`)!) /1000 };
}
export function bilanMouvements(rows: MouvementStripe[]) {
 return rows.reduce((s,r) => {
  if(r.currency!=='eur') { s.autresDevises++; return s; }
  if(['charge','payment'].includes(r.type)) s.encaissements+=r.amount;
  else if(['refund','payment_refund','refund_failure','payment_failure_refund'].includes(r.type)) s.remboursements-=r.amount;
  else if(['payout','payout_cancel','payout_failure'].includes(r.type)) s.virements-=r.amount;
  else if(['stripe_fee','stripe_fx_fee'].includes(r.type)) s.frais-=r.amount;
  else s.autres+=r.amount;
  s.frais+=r.fee;
  s.variation+=r.net;
  return s;
 },{encaissements:0,remboursements:0,frais:0,virements:0,autres:0,variation:0,autresDevises:0});
}
export function montantEnCentimes(value: string): number | null {
 if(!/^-?\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) return null;
 const n=Math.round(Number(value.replace(',','.'))*100);
 return Number.isSafeInteger(n)&&n!==0&&Math.abs(n)<=1_000_000_000?n:null;
}
