import { createClient } from "@/lib/supabase/server";
import { formaterDateHeure } from "@/lib/ged";
import { FormulaireEchangeIntervention } from "./formulaire-echange-intervention";
const ROLES:Record<string,string>={gerant:"Propriétaire / gestionnaire",locataire:"Locataire",artisan:"Artisan"};
export async function EchangesIntervention({intervention}:{intervention:string}){
 const db=await createClient();const role=await db.rpc("contexte_echange_intervention",{p_intervention:intervention});
 if(role.error)return <p role="alert" className="text-sm text-destructive">La discussion de cette intervention est momentanément indisponible.</p>;
 const contexte=role.data?.[0] as {role_participant:string;statut_intervention:string} | undefined;
 if(!contexte)return null;
 const [messages,etat]=await Promise.all([
  db.from("intervention_messages").select("id,auteur_role,texte,cree_le",{count:"exact"}).eq("intervention_id",intervention).order("cree_le",{ascending:false}).order("id").limit(50),
  db.from("intervention_echanges_etat").select("fermee_le").eq("intervention_id",intervention).maybeSingle(),
 ]);
 if(messages.error||etat.error)return <p role="alert" className="text-sm text-destructive">Les échanges n’ont pas pu être chargés. Réessayez.</p>;
 const terminee=!["acceptee","planifiee","en_cours"].includes(contexte.statut_intervention);
 const fermee=terminee||!!etat.data?.fermee_le;
 return <section id={`discussion-${intervention}`} className="rounded-lg border border-border bg-card p-4 space-y-3" aria-label="Discussion de l’intervention">
  <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-base">Discussion de l’intervention</h3><span className="text-xs text-muted-foreground">{fermee?"Fermée":"Propriétaire · locataire · artisan"}</span></header>
  <p className="text-xs text-muted-foreground">Les échanges sont partagés avec les participants autorisés à cette intervention.</p>
  {(messages.count??0)>50&&<p className="text-xs text-muted-foreground">Les 50 messages les plus récents.</p>}
  {messages.data?.length?<ol className="max-h-80 overflow-y-auto divide-y divide-border">{[...messages.data].reverse().map(m=><li key={m.id} className="py-3 space-y-1"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><strong>{ROLES[m.auteur_role]??"Participant"}</strong><time dateTime={m.cree_le}>{formaterDateHeure(m.cree_le)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{m.texte}</p></li>)}</ol>:null}
  <FormulaireEchangeIntervention intervention={intervention} fermee={fermee} gestionnaire={contexte.role_participant==="gerant"&&!terminee}/>
 </section>;
}
