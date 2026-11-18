import { VueTraitementsDurables } from "./vue-traitements-durables";
import { piloteLimite } from "@/lib/perimetre-pilote";
import { createClient } from '@/lib/supabase/server';
export default async function TraitementsDurables(){
 const session=await createClient();const autorisation=await session.rpc('is_super_admin');
 if(autorisation.error||autorisation.data!==true)return null;
 const db=session;
 const [factures,courriels,intentions]=await Promise.all([
  db.from('factures_automatiques').select('id,organization_id,etat,dernier_resultat,tentatives,disponible_le').eq('actif',true).neq('etat','terminee').order('disponible_le').limit(50),
  db.from('courriels_durables').select('id,organization_id,etat,tentatives,updated_at,motif,reprise_autonome,expire_le,finalisation_etat,circuit').or('etat.in.(inconnu,echec,en_cours,en_attente),finalisation_etat.neq.terminee').order('updated_at').limit(50),
  db.from('notification_intentions').select('id,organization_id,evenement,etat,tentatives,motif').in('etat',['a_preparer','preparation','a_verifier']).order('cree_le').limit(50)
 ]);
 return <VueTraitementsDurables pilote={piloteLimite()} chiffrement={/^[a-f\d]{64}$/i.test(process.env.COURRIELS_CHIFFREMENT_CLE??'')} indisponible={!!(factures.error||courriels.error||intentions.error)} factures={factures.data??[]} courriels={courriels.data??[]} intentions={intentions.data??[]}/>;
}
