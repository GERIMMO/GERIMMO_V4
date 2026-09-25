// 25/09 : une seule table des équipes, consommée par le point du matin, la page
// des équipes et les décisions. « Équipe » désigne ici et partout un groupe de
// missions planifiées (plus les décisions qu'il soumet) — pas un type de dossier.
export const EQUIPES={
 exploitation:{nom:'Exploitation locative',page:'/admin/autonomie?equipe=bail'},
 finance:{nom:'Finance et fiscalité',page:'/admin/autonomie?equipe=loyer'},
 incidents:{nom:'Incidents et artisans',page:'/admin/artisans'},
 conformite:{nom:'Conformité et documents',page:'/admin/veille'},
 marketing:{nom:'Marketing',page:'/admin/marketing'},
 territoire:{nom:'Développement territorial',page:'/admin/territoire'},
 qualite:{nom:'Qualité et corrections',page:'/admin/autonomie#ameliorations'},
} as const;
export type Equipe=keyof typeof EQUIPES;
export function estEquipe(cle:string):cle is Equipe{return Object.hasOwn(EQUIPES,cle);}
// Heures de Paris calculées depuis vercel.json (UTC) : l'écran ne dit jamais « UTC ».
export const MISSIONS={
 veille:{nom:'Veille réglementaire',equipe:'conformite',heure:'11 h (heure de Paris, 10 h en hiver)',lien:'/admin/veille'},
 appels:{nom:'Avis d’échéance',equipe:'exploitation',heure:'9 h 30 (heure de Paris, 8 h 30 en hiver)',lien:'/admin/autonomie?equipe=bail'},
 quittances:{nom:'Quittances',equipe:'finance',heure:'9 h (heure de Paris, 8 h en hiver)',lien:'/admin/autonomie?equipe=rapport'},
 relances:{nom:'Relances de loyers',equipe:'finance',heure:'9 h 45 (heure de Paris, 8 h 45 en hiver)',lien:'/admin/autonomie?equipe=loyer'},
 rappels:{nom:'Rendez-vous et suivi des dossiers',equipe:'incidents',heure:'8 h (heure de Paris, 7 h en hiver)',lien:'/admin/autonomie?equipe=incident'},
 abonnements:{nom:'Abonnements',equipe:'finance',heure:'6 h (heure de Paris, 5 h en hiver)',lien:'/admin/clients'},
 signatures:{nom:'Signatures et classement',equipe:'conformite',heure:'5 h (heure de Paris, 4 h en hiver)',lien:'/admin/autonomie?equipe=document'},
 marketing:{nom:'Publications et publicité',equipe:'marketing',heure:'10 h (heure de Paris, 9 h en hiver)',lien:'/admin/marketing'},
 territoire:{nom:'Étude des départements',equipe:'territoire',heure:'7 h (heure de Paris, 6 h en hiver)',lien:'/admin/territoire'},
} as const satisfies Record<string,{nom:string;equipe:Equipe;heure:string;lien:string}>;
export type Mission=keyof typeof MISSIONS;
export function estMission(cle:string):cle is Mission{return Object.hasOwn(MISSIONS,cle);}
// 25/09 (audit C8/C35) : UNE table de libellés pour toute tâche consignée dans
// le journal (`tache_<cle>`), lue par Santé, Équipes, Journaux et l'accueil.
// L'orchestrateur n'est pas une mission commandable (route cron à part), mais
// il porte le même nom partout.
export const TACHES_SUIVIES={
 ...Object.fromEntries((Object.keys(MISSIONS) as Mission[]).map(m=>[m,{nom:MISSIONS[m].nom,equipe:MISSIONS[m].equipe}])),
 orchestrateur:{nom:'Suivi des dossiers',equipe:'exploitation'},
 // La sauvegarde hebdomadaire (chantier GitHub, 25/09) consigne son passage comme les autres.
 sauvegarde:{nom:'Sauvegarde hebdomadaire',equipe:'conformite'},
} as Record<Mission|'orchestrateur'|'sauvegarde',{nom:string;equipe:Equipe}>;
export type TacheSuivie=keyof typeof TACHES_SUIVIES;
export function estTacheSuivie(cle:string):cle is TacheSuivie{return Object.hasOwn(TACHES_SUIVIES,cle);}
/** Le nom d'une tâche du journal, ou un repli honnête. */
export function libelleTache(cle:string):string{return estTacheSuivie(cle)?TACHES_SUIVIES[cle].nom:'Travail automatique de Gerimmo';}
/** « Équipe Finance et fiscalité » pour une tâche connue, sinon null. */
export function equipeDeLaTache(cle:string):Equipe|null{return estTacheSuivie(cle)?TACHES_SUIVIES[cle].equipe:null;}
export function missionsDeLEquipe(equipe:Equipe):Mission[]{return (Object.keys(MISSIONS) as Mission[]).filter(m=>MISSIONS[m].equipe===equipe);}
// Ce que le passage garde de sa réponse : des comptes et des drapeaux, jamais un
// texte (un message d'erreur peut porter une adresse ou un secret).
const COMPTES=['envoyees','envoyes','rappeles','traites','preparees','publiees','rapports_prepares','etudiees','dossiers','ignores','echecs','echecs_envoi','avoirs_en_echec'] as const;
const DRAPEAUX=['erreur','erreurFacebook','orchestration_erreur','preparation_erreur'] as const;
/** Le journal n’accepte aucun contenu d’e-mail, secret ou détail de dossier. */
export function bilanMission(b:unknown,status:number){
 const x=b&&typeof b==='object'?b as Record<string,unknown>:{};
 const bilan:Record<string,number|boolean>={};
 for(const k of COMPTES){const v=x[k];if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)bilan[k]=v;else if(Array.isArray(v))bilan[k]=v.length;}
 for(const k of DRAPEAUX){if(x[k])bilan[k]=true;}
 const mauvais=DRAPEAUX.some(k=>bilan[k]===true)||['echecs','echecs_envoi','avoirs_en_echec'].some(k=>typeof bilan[k]==='number'&&bilan[k]>0);
 const compte=['envoyees','envoyes','rappeles','traites','preparees','publiees','rapports_prepares'].reduce((n,k)=>n+(typeof bilan[k]==='number'&&bilan[k]>0?bilan[k]:0),0);
 return {ok:status>=200&&status<300&&!mauvais,compte:Math.min(compte,2147483647),bilan};
}
