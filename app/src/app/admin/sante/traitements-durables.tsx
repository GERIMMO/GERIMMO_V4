import { piloteLimite } from "@/lib/perimetre-pilote";
import { clientDeService } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
export default async function TraitementsDurables(){
 const session=await createClient();const autorisation=await session.rpc('is_super_admin');
 if(autorisation.error||autorisation.data!==true)return null;
 const db=clientDeService();if(!db)return null;
 const [factures,courriels,intentions]=await Promise.all([
  db.from('factures_automatiques').select('id,organization_id,etat,dernier_resultat,tentatives,disponible_le').eq('actif',true).neq('etat','terminee').order('disponible_le').limit(50),
  db.from('courriels_durables').select('id,organization_id,etat,tentatives,updated_at,motif,reprise_autonome,expire_le,finalisation_etat,circuit').or('etat.in.(inconnu,echec,en_cours,en_attente),finalisation_etat.neq.terminee').order('updated_at').limit(50),
  db.from('notification_intentions').select('id,organization_id,evenement,etat,tentatives,motif').in('etat',['a_preparer','preparation','a_verifier']).order('cree_le').limit(50)
 ]);
 return <section className="mt-6 rounded-lg border p-4 break-words" id="traitements-durables"><h2>Factures et courriels à surveiller</h2>{piloteLimite()&&<p role="status">Pilote limité : accès, invitations, notifications essentielles, quittances et baux signés contrôlés. Relances collectives et automatisation des abonnements suspendues ; intervention humaine requise.</p>}<p>Conservation chiffrée des envois : {/^[a-f\d]{64}$/i.test(process.env.COURRIELS_CHIFFREMENT_CLE??'')?'configurée':'à configurer — les nouveaux envois ponctuels sont bloqués'}</p><p>Aucune adresse ni contenu de message n’est affiché. Un résultat inconnu ne doit pas être renvoyé sans preuve.</p>
 {factures.error||courriels.error||intentions.error?<p>Lecture indisponible : vérifier les migrations et les accès.</p>:<>
 <h3>Notifications — intentions à suivre</h3><ul>{intentions.data?.map(n=><li className="break-all py-1 text-sm" key={n.id}>{n.organization_id} · {n.evenement} · {n.etat} · {n.tentatives} tentative(s) · {n.motif??"Préparation automatique en attente"}</li>)}</ul>
 <h3>Factures — 50 premières en attente</h3><ul>{factures.data?.map(f=><li className="break-all py-1 text-sm" key={f.id}>{f.organization_id} · {f.id} · {f.etat} · {f.tentatives} tentative(s) · {f.dernier_resultat??'en attente'}</li>)}</ul>
 <h3>Courriels — 50 premiers à suivre</h3><ul>{courriels.data?.map(m=><li className="break-all py-1 text-sm" key={m.id}>{m.organization_id??'Plateforme'} · {m.id.slice(0,12)} · {m.circuit??"Circuit documentaire"} · {m.etat} · finalisation : {m.finalisation_etat} · {m.tentatives} tentative(s) · {m.motif??(m.etat==='inconnu'?'Preuve fournisseur nécessaire':m.reprise_autonome?'Reprise automatique programmée':'Reprise métier à suivre')} </li>)}</ul>
 </>}</section>;
}
