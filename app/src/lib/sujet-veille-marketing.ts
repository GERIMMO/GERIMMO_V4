import type {SujetMarketing} from './contenu-marketing';
import {nomDeSource,sourceVeille} from './veille-reglementaire';

// LE JOURNAL NE RELAIE QUE LE LOGEMENT (29/09). La collecte de veille sert
// aussi les artisans (factures, TVA, cotisations) : ses mots-clés sont larges.
// Le journal public, lui, parle de gestion locative ; il a relayé une
// actualité sur la décarbonation des entreprises. Seules les actualités dont
// le TITRE parle de logement ou de location y passent désormais.
const SUJET_LOGEMENT=new RegExp('(?<![\\p{L}])('+[
 'logements?','location','locati(?:f|fs|ve|ves|on|ons)','colocation','loyers?','baux','bail','locataires?','propriétaires?','bailleurs?',
 'copropriétés?','copropriétaires?','charges locatives','charges récupérables','régularisation des charges','dpe','diagnostics? de performance énergétique',
 'décence','décents?','indécents?','apl','aides? au logement','habitation','hlm','logement social','expulsions?','trêve hivernale',
 'dépôt de garantie','états? des lieux','meublés?','visale','immobili(?:er|ère|ers|ères)','passoires? thermiques?','maprimerénov','rénovation énergétique',
 'taxe foncière','taxe d’habitation',"taxe d'habitation",'encadrement des loyers','irl',
].join('|')+')(?![\\p{L}])','iu');
export function estSujetLogement(titre:string){return SUJET_LOGEMENT.test(titre);}

const PREFIXE='À lire dans la veille : ';
/** Retire un préfixe « À lire dans la veille : » déjà présent (une ou plusieurs fois). */
export function sansPrefixeVeille(titre:string){return titre.replace(/^(?:\s*[àa] lire dans la veille\s*:\s*)+/iu,'').trim();}
/** Le titre d'un article tel qu'on l'affiche : un préfixe de veille répété n'y figure qu'une fois (articles déjà parus). */
export function titreSansDoublon(titre:string){return /^(?:\s*[àa] lire dans la veille\s*:\s*){2,}/iu.test(titre)?PREFIXE+sansPrefixeVeille(titre):titre;}

export function sujetDeVeille(info:{id:string;titre:string;source_url:string;source_nom:string;publie_source_le:string|null}):SujetMarketing{
 const url=sourceVeille(info.source_url);if(!url)throw new Error('Source officielle requise.');
 // Le relais automatique rapporte le sujet officiel, pas les conclusions IA non relues.
 const titre=sansPrefixeVeille(info.titre.replace(/[\[\]<>]/g,'')).slice(0,250);
 const source=nomDeSource(url,info.source_nom);
 const date=info.publie_source_le?new Date(info.publie_source_le).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):null;
 return {cle:'veille-'+info.id,audience:'professionnels',titre:`${PREFIXE}${titre}`,chapo:`${source} propose une information sur ce sujet. Consultez le texte officiel pour connaître les situations concernées et les conditions applicables.`,corps:`## L’information à consulter\n\n${titre}\n\nSource : [${source}](${url})${date?' — publiée le '+date:''}.\n\n## Avant d’agir\n\nLisez les conditions, les dates et les éventuelles exceptions dans la source officielle. Une actualité peut annoncer une évolution future ou ne concerner que certaines situations : ce relais ne signifie pas qu’une nouvelle obligation s’applique à tous.\n\n## Garder le lien avec votre dossier\n\nDans Gerimmo, conservez les documents utiles avec le logement, le bail ou l’intervention concernés. Une information bien rattachée facilite les vérifications et évite les recherches répétées.\n\nCe partage est un repère documentaire. L’étude d’une situation particulière peut demander un professionnel compétent.`,facebook:`Veille Gerimmo · ${titre}\n\n${source}${date?' · '+date:''}\nSource officielle : ${url}\n\nConsultez les conditions et les dates dans la source pour savoir si votre situation est concernée.`};
}
