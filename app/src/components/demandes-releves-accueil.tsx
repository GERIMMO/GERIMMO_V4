import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {lireToutesLesPages} from '@/lib/lecture-complete';
import type {MonReleveConsommation} from '@/lib/consommations';
export async function DemandesRelevesAccueil({org}:{org:string}){
 const db=await createClient();const lecture=await lireToutesLesPages<MonReleveConsommation>((debut,fin)=>db.rpc('mes_releves_consommation',{p_org:org},{count:'exact'}).order('demande_id').range(debut,fin),r=>r.demande_id);
 const n=lecture.lignes?.filter(r=>r.peut_repondre).length??0;
 if(!lecture.echec&&!n)return null;
 return <section className="loc-carte p-4" aria-label="Relevés de compteurs"><h2 className="font-semibold">{lecture.echec?'Vos relevés sont à vérifier':`${n} relevé${n>1?'s':''} à transmettre`}</h2><p className="mt-1 text-sm text-muted-foreground">{lecture.echec?'Les demandes ne peuvent pas être chargées.':'Recopiez l’index du compteur. Le logement et le dernier relevé sont déjà renseignés.'}</p><Link className="lien-discret mt-2 inline-flex min-h-11 items-center" href={`/locataire/${org}/releves`}>Mes relevés →</Link></section>;
}
