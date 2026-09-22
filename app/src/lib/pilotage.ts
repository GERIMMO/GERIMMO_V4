export type StatAutomatisation = {organization_id:string|null;actions_automatiques:number;interventions_humaines:number;messages_envoyes:number;clics_evites:number;dossiers_sans_appel:number};
export function resumerMesures(stats:StatAutomatisation[]|null) {
  if (stats === null) return null;
  const total=stats.reduce((a,s)=>({automatiques:a.automatiques+Number(s.actions_automatiques),humaines:a.humaines+Number(s.interventions_humaines),messages:a.messages+Number(s.messages_envoyes)}),{automatiques:0,humaines:0,messages:0});
  return {...total,taux:total.automatiques+total.humaines===0?null:Math.round(100*total.automatiques/(total.automatiques+total.humaines))};
}
export const ETATS_DEVELOPPEMENT:Record<string,string>={detectee:"Besoin repéré",a_etudier:"À étudier",en_developpement:"Amélioration en préparation",en_test:"Contrôles en cours",preproduction:"Version de démonstration à vérifier",autorisation:"Votre accord est attendu",publiee:"Disponible en ligne",annulee:"Non retenue",retour_arriere:"Version précédente rétablie"};
export const ETATS_DOSSIER:Record<string,string>={a_faire:"Action attendue",en_cours:"En cours",en_attente:"Étape suivante en attente",termine:"Terminé",bloque:"À débloquer"};
export const TYPES_DOSSIER:Record<string,string>={bail:"Location",loyer:"Loyer",incident:"Incident",document:"Signature et document",intervention:"Intervention",rapport:"Compte rendu mensuel"};
export function lienDossier(c:{organization_id:string;dossier_type:string;dossier_id:string;lien_action?:string|null}) {
  const base=`/agence/${encodeURIComponent(c.organization_id)}`;
  if(c.lien_action?.startsWith(`${base}/`) && !/[\r\n\\]/.test(c.lien_action)) return c.lien_action;
  if(c.dossier_type==='bail') return `${base}/baux/${encodeURIComponent(c.dossier_id)}`;
  if(c.dossier_type==='incident') return `${base}/incidents?sel=${encodeURIComponent(c.dossier_id)}`;
  if(c.dossier_type==='document') return `${base}/documents`;
  return `${base}/comptabilite`;
}
