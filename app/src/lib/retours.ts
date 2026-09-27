export const NATURES_RETOUR: Record<string,string> = {
  bug: "Signaler un problème", question: "Demander une explication", idee: "Proposer une idée", contestation: "Contester mon évaluation",
};
export const ETATS_RETOUR: Record<string,string> = {
  nouveau: "Reçu", en_examen: "En examen", en_cours: "En cours de traitement", resolu: "Résolu",
  retenue: "Idée retenue", non_retenue: "Non retenue pour le moment", deja_couverte: "Déjà couverte",
};
/** Gravité qualifiée par la supervision : le code N1-N3 reste en base, l’écran dit le mot (24/09). */
export const GRAVITES_RETOUR: Record<string,string> = { N1: "Bloquant", N2: "Majeur", N3: "Mineur" };
export const ACTIONS_RETOUR: Record<string,string> = {
  navigation: "Navigation", bouton: "Clic sur un bouton", lien: "Ouverture d’un lien", formulaire: "Envoi d’un formulaire", saisie: "Saisie dans un champ",
};
const SEGMENTS = new Set([
  'agence','admin','artisan','locataire','espaces','parc','baux','documents','personnes','incidents','demandes','logement','loyers','comptabilite','fiscal',
  'agenda','alertes','messages','contact','profil','administration','abonnement','missions','devis','attestations','entreprise','note','edl','compte-rendu',
  'bilan','creneaux','nouveau','nouvelle','import','organisations','publications','journaux','retours','assistance','idees','securite','parametres','compte','clients',
  'brief','territoire','sante','artisans','facturation','statistiques','catalogue','faq','inscription','panne','reprise','modele','fichier',
]);
/** Ne lit ni le DOM des dossiers, ni les champs, ni les paramètres de l’URL. */
export function ecranSansDonnees(chemin: string):string {
  return '/' + chemin.slice(0,2000).split(/[?#]/,1)[0].split('/').filter(Boolean).slice(0,11)
    .map(segment=>SEGMENTS.has(segment)?segment:'[dossier]').join('/');
}
const ESPACES_ECRAN: Record<string,string> = { agence: "Espace agence", admin: "Console", artisan: "Portail artisan", locataire: "Espace locataire", espaces: "Mes espaces" };
const PAGES_ECRAN: Record<string,string> = {
  parc: "Parc", baux: "Baux", documents: "Documents", personnes: "Personnes", incidents: "Incidents", demandes: "Demandes", logement: "Logement",
  loyers: "Loyers", comptabilite: "Comptabilité", fiscal: "Fiscalité", agenda: "Agenda", alertes: "Alertes", messages: "Messages", profil: "Profil",
  administration: "Administration", abonnement: "Abonnement", missions: "Missions", devis: "Devis", attestations: "Attestations", entreprise: "Entreprise",
  edl: "État des lieux", creneaux: "Créneaux", publications: "Articles", journaux: "Journaux", retours: "Retours", assistance: "Aide et retours",
  parametres: "Paramètres", clients: "Clients", brief: "Aujourd’hui", territoire: "Territoire", sante: "Santé", artisans: "Artisans",
  facturation: "Facturation", statistiques: "Statistiques", faq: "Questions fréquentes", securite: "Sécurité du compte", import: "Import",
};
/** « /agence/[dossier]/loyers » → « Espace agence — Loyers » (audit console 27/09 : plus de chemin brut). */
export function nomEcran(chemin: string): string {
  const segments = chemin.split('/').filter((x) => x && x !== '[dossier]');
  const espace = ESPACES_ECRAN[segments[0] ?? ''] ?? 'Site public';
  const page = [...segments].reverse().find((x) => Object.hasOwn(PAGES_ECRAN, x));
  return page ? `${espace} — ${PAGES_ECRAN[page]}` : espace;
}
export function actionSansDonnees(action: string):string {
  return Object.hasOwn(ACTIONS_RETOUR,action)?action:'navigation';
}
export type RetourUtilisateur = {
 id:string; nature:string; titre:string; description:string; attendu:string|null; ecran:string; action_origine:string;
 etat:string;gravite:string;reponse:string|null;reexaminer_le:string|null;version:number;cree_le:string;
 organization_id:string|null;groupe_id:string|null;publication_id:string|null;
};

export function pageRetour(valeur: string | undefined):number {
 const n=Number(valeur);return Number.isSafeInteger(n)&&n>0?Math.min(n,100000):1;
}
export function moisRevue(date=new Date()):string {
 const parts=new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(date);
 return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-01`;
}
