import {createClient} from '@/lib/supabase/server';
import {dateParis} from '@/lib/tarifs';
import {formaterDateParis,formaterDateHeureParis} from '@/lib/heure-paris';
import {bilanMouvements,periodeFinanciere} from '@/lib/tresorerie-supervision';
import {lireTresorerieStripe} from '@/lib/tresorerie-stripe';
import {lirePage,numeroPage} from '@/lib/pagination-supervision';
import {Pagination} from './pagination';
import {CoutFormulaire} from './cout-formulaire';
const euros=(n:number|null)=>n===null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100);
export async function Tresorerie({p}:{p:Record<string,string|undefined>}){
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');
 if(auth.error||auth.data!==true)return <section className="loc-carte">La trésorerie est réservée au superviseur permanent.</section>;
 const period=periodeFinanciere(p.mois,dateParis(new Date()));
 const [stripe,total,couts]=await Promise.all([
  p.releve==='1'?lireTresorerieStripe({gte:period.gte,lt:period.lt}):Promise.resolve({lignes:null,complet:false,test:false,erreur:'Chargez le relevé pour consulter les encaissements de cette période.'}),
  db.rpc('supervision_total_couts',{p_debut:period.debut,p_fin:period.fin}),
  lirePage((a,b)=>db.from('supervision_couts').select('id,fournisseur,categorie,jour,montant_cents,reference,preuve,cree_le',{count:'exact'}).gte('jour',period.debut).lt('jour',period.fin).order('jour',{ascending:false}).order('id').range(a,b),numeroPage(p.pageCouts))
 ]);
 const bilan=stripe.complet&&stripe.lignes?bilanMouvements(stripe.lignes):null;
 const knownCost=total.error?null:Number(total.data?.total??0);
 const montant=(key:'encaissements'|'remboursements'|'frais'|'virements'|'autres'|'variation')=>bilan?.[key]??null;
 const url=(key:string,n:number)=>`/admin?${new URLSearchParams({mois:period.mois,releve:p.releve??'0',[key]:String(n)})}#tresorerie`;
 const page=Math.min(numeroPage(p.pageMouvements),Math.max(1,Math.ceil((stripe.lignes?.length??0)/25))), rows=(stripe.lignes??[]).slice((page-1)*25,page*25);
 return <section id="tresorerie" className="loc-carte space-y-5 my-6">
 <div className="entete-carte"><div><h2 className="text-xl font-semibold">Encaissements et coûts réels</h2><p className="text-sm text-muted-foreground">Relevé Stripe en lecture seule · EUR · mois civil à Paris</p></div>{stripe.test&&<span className="puce puce-prep">Données Stripe de test</span>}</div>
 <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="releve" value="1"/><label>Mois<input type="month" name="mois" required defaultValue={period.mois} className="champ block"/></label><button className="btn-or">Charger le relevé</button></form>
 {stripe.erreur&&<p role="status" className="rounded-xl bg-[var(--warning-soft)] p-3 text-sm">{stripe.erreur}</p>}
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Encaissements bruts',montant('encaissements')],['Remboursements nets',montant('remboursements')],['Frais Stripe',montant('frais')],['Coûts de services déclarés',knownCost]].map(([titre,n])=><article key={String(titre)} className="rounded-xl border bg-[var(--ivoire)] p-4"><p className="text-sm">{titre}</p><strong className="text-2xl">{euros(n as number|null)}</strong></article>)}</div>
 <div className="rounded-xl bg-[var(--marque-clair)] p-4"><h3 className="font-semibold">Solde des flux suivis : {euros(bilan&&knownCost!==null?bilan.encaissements-bilan.remboursements-bilan.frais+bilan.autres-knownCost:null)}</h3><p className="text-sm">Encaissements − remboursements − frais + autres mouvements − coûts déclarés. Résultat provisoire du périmètre suivi : les coûts non saisis, impôts et ajustements comptables ne sont pas connus. Ce n’est ni le bénéfice comptable, ni le solde bancaire.</p></div>
 <p className="text-sm">Virements Stripe vers la banque (nets d’annulations) : <b>{euros(montant('virements'))}</b> · Autres mouvements : <b>{euros(montant('autres'))}</b> · Variation du solde Stripe : <b>{euros(montant('variation'))}</b>. Les virements ne sont pas comptés une seconde fois comme revenu.</p>
 {bilan&&bilan.autresDevises>0&&<p role="alert" className="err">{bilan.autresDevises} mouvement(s) dans une autre devise : exclus des totaux EUR, visibles ci-dessous.</p>}
 {stripe.lignes&&<details><summary className="cursor-pointer font-semibold">Mouvements et preuves Stripe ({stripe.lignes.length})</summary><div className="overflow-x-auto"><table className="tableau w-full text-sm"><thead><tr><th>Date</th><th>Nature</th><th>Brut</th><th>Frais</th><th>Net</th><th>Preuve</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{formaterDateHeureParis(new Date(r.created*1000))}</td><td>{r.type}<small className="block">{r.status==='available'?'Disponible':'En attente'}</small></td><td>{r.currency==='eur'?euros(r.amount):`${r.amount/100} ${r.currency.toUpperCase()}`}</td><td>{r.currency==='eur'?euros(r.fee):'—'}</td><td>{r.currency==='eur'?euros(r.net):'—'}</td><td className="break-all">{r.id}</td></tr>)}</tbody></table></div><Pagination page={page} total={stripe.lignes.length} adresse={n=>url('pageMouvements',n)} libelle="Mouvements Stripe"/></details>}
 <div><h3 className="font-semibold">Coûts des services</h3>{couts.error||total.error?<p role="alert" className="err">Registre des coûts indisponible.</p>:<><p className="text-sm">{total.data?.nombre??0} écriture(s) déclarée(s) sur cette période. Aucune facture manquante n’est déduite automatiquement.</p><ul className="divide-y">{couts.data?.map(c=><li key={c.id} className="py-3 text-sm"><b>{c.fournisseur} · {euros(c.montant_cents)}</b> · {formaterDateParis(c.jour)}<p>Facture {c.reference} · {c.categorie}</p><p className="break-words">Preuve : {c.preuve}</p><small>Enregistré le {formaterDateHeureParis(c.cree_le)}</small></li>)}</ul><Pagination page={couts.page} total={couts.count??0} adresse={n=>url('pageCouts',n)} libelle="Coûts des services"/></>}</div>
 <details><summary className="cursor-pointer font-semibold">Ajouter un coût ou un avoir</summary><div className="mt-4"><CoutFormulaire/></div></details>
 </section>;
}
