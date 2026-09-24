export const MISSIONS = {
 veille:{nom:'Veille réglementaire',equipe:'Conformité et documents',heure:'09 h UTC',lien:'/admin/veille'},
 appels:{nom:'Avis d’échéance',equipe:'Exploitation locative',heure:'07 h 30 UTC',lien:'/admin/autonomie?equipe=bail'},
 quittances:{nom:'Quittances',equipe:'Finance et fiscalité',heure:'07 h UTC',lien:'/admin/autonomie?equipe=rapport'},
 relances:{nom:'Relances de loyers',equipe:'Finance et fiscalité',heure:'07 h 45 UTC',lien:'/admin/autonomie?equipe=loyer'},
 rappels:{nom:'Rendez-vous et suivi des dossiers',equipe:'Incidents et artisans',heure:'06 h UTC',lien:'/admin/autonomie?equipe=incident'},
 abonnements:{nom:'Abonnements',equipe:'Finance et fiscalité',heure:'04 h UTC',lien:'/admin/clients'},
 signatures:{nom:'Signatures et classement',equipe:'Conformité et documents',heure:'03 h UTC',lien:'/admin/autonomie?equipe=document'},
 marketing:{nom:'Publications et publicité',equipe:'Marketing',heure:'08 h UTC',lien:'/admin/marketing'},
 territoire:{nom:'Étude des départements',equipe:'Développement territorial',heure:'05 h UTC',lien:'/admin/territoire'},
} as const;
export type Mission=keyof typeof MISSIONS;
export function estMission(cle:string):cle is Mission{return Object.hasOwn(MISSIONS,cle);}
/** Le journal n’accepte aucun contenu d’e-mail, secret ou détail de dossier. */
export function bilanMission(b:unknown,status:number){
 const x=b&&typeof b==='object'?b as Record<string,unknown>:{};
 const mauvais=Boolean(x.erreur)||Boolean(x.erreurFacebook)||Boolean(x.orchestration_erreur)||Boolean(x.preparation_erreur)||['echecs','echecs_envoi','avoirs_en_echec'].some(k=>typeof x[k]==='number'?x[k]>0:Array.isArray(x[k])&&x[k].length>0);
 const compte=['envoyees','envoyes','rappeles','traites','preparees','publiees','rapports_prepares'].reduce((n,k)=>n+(typeof x[k]==='number'&&Number.isSafeInteger(x[k])&&x[k]>0?x[k]:0),0);
 return {ok:status>=200&&status<300&&!mauvais,compte:Math.min(compte,2147483647)};
}
