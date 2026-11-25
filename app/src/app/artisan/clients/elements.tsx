import Link from "next/link";
import { PieceFichier } from "./piece-fichier";
import type {InputHTMLAttributes,ReactNode} from "react";
import {CLASSE_CHAMP,CLASSE_LIBELLE,CLASSE_ZONE_TEXTE,EnteteSousPage,Erreur,Retour} from "../ui";
import type {RubriqueEcran} from "@/components/titre-ecran";
import {MESSAGE_ECRITURE_FERMEE,type ExclusionArtisan} from "@/lib/artisan-prive-exclusion";
// Présentation commune des écrans « clients externes » (Design System « Maison », 20/11/2026) : mêmes libellés de champ, mêmes
// liens de liste et mêmes textes d'appoint que le reste de l'espace artisan. Les textes rendus ne changent pas.
/** Un lien de liste (nom d'un client, titre d'un chantier, numéro d'une facture) : cible de 48 px, encre, souligné. */
export const CLASSE_LIEN_LISTE="inline-flex min-h-12 items-center text-base font-semibold text-[var(--encre)] underline underline-offset-4";
/** La ligne d'appoint sous un lien de liste, ou un paragraphe d'explication dans une carte. */
export const CLASSE_DETAIL="text-[0.9375rem] leading-relaxed text-[var(--texte-secondaire)]";
/** Un rang de liste dans une carte : filet léger entre les rangs, aucun sous le dernier. */
export const CLASSE_RANG="border-b border-[var(--filet-leger)] py-2 last:border-b-0";
/** Une action secondaire qui navigue (créer un chantier, ouvrir une pièce) : contour bleu nuit, 48 px. */
export const CLASSE_LIEN_BOUTON="bouton-gerimmo inline-flex min-h-12 items-center justify-center rounded-[var(--rayon-bouton)] border-2 border-[var(--marque)] bg-[var(--ivoire)] px-4 text-base font-semibold text-[var(--encre)] hover:bg-[var(--survol)]";
export function Champ({label,...props}:{label:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>{label}</span><input className={CLASSE_CHAMP} {...props}/></label>;}
export function Texte({label,name,value,required=true}:{label:string;name:string;value?:string;required?:boolean}){return <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>{label}</span><textarea name={name} className={CLASSE_ZONE_TEXTE} defaultValue={value} required={required} maxLength={8000} rows={3}/></label>;}
export function Piece({label="Justificatif (PDF, JPEG ou PNG)",photo=false,required=true}:{label?:string;photo?:boolean;required?:boolean}){return <PieceFichier label={label} photo={photo} required={required}/>;}
export function LienPiece({id,children}:{id:string|null|undefined;children:ReactNode}){return id?<a className="bouton-gerimmo inline-flex min-h-12 w-fit items-center justify-center rounded-[var(--rayon-bouton)] border border-[var(--filet-champ)] bg-[var(--ivoire)] px-4 text-[0.9375rem] font-semibold text-[var(--encre)] hover:border-[var(--marque)] hover:bg-[var(--survol)]" href={`/api/artisan-prive/pieces/${id}`} target="_blank" rel="noreferrer">{children}</a>:null;}
// Phase 3, lot 60 :
//  - E011 : les pastilles « Agenda » et « Facturation » répétaient la navigation à toutes les largeurs (barre du bas sous
//    1000 px, où la même page s'appelle « Factures » ; menu latéral au-delà) : elles sont retirées ;
//  - E012, E123 : la pastille de la page affichée ne se distinguait pas des autres ; l'écran dit laquelle (`enCours`) ;
//  - E128 : « Exporter mon registre » n'annonçait ni le fichier (JSON) ni son contenu, plus large que le carnet de clients.
// « Clients externes » reste masquée à partir de 1000 px, où le menu latéral la porte (DES-B-05) ; « Nouveau chantier et
// devis » et l'export n'ont d'entrée dans aucun menu : ils restent.
// Reprise du lot 60 (R1) : « Exporter toutes mes données » promettait plus que le fichier. L'export rend le registre privé
// et les lignes de plateforme rattachées à la fiche de l'artisan (`export_artisan_plateforme`) ; il ne contient ni les
// messages des discussions, ni aucun fichier (photos, PDF, justificatifs). Le libellé le dit, aux deux endroits où il s'affiche.
export const LIBELLE_EXPORT_ARTISAN="Exporter mon activité (fichier JSON, sans les discussions ni les pièces jointes)";
export const PRECISION_EXPORT_ARTISAN="Clients externes, chantiers, devis, factures et règlements déclarés, avec votre fiche et votre activité sur Gerimmo. Les messages des discussions et les fichiers (photos, PDF, justificatifs) n’y figurent pas.";
export function NavigationPrivee({enCours}:{enCours?:"/artisan/clients"|"/artisan/devis/nouveau"}){
 const liens:[string,string,boolean][]=[['Clients externes','/artisan/clients',true],['Nouveau chantier et devis','/artisan/devis/nouveau',false]];
 const classe="bouton-gerimmo inline-flex min-h-12 items-center justify-center rounded-[var(--rayon-bouton)] border border-[var(--filet-champ)] bg-[var(--ivoire)] px-4 text-sm font-semibold text-[var(--encre)] hover:border-[var(--marque)] hover:bg-[var(--survol)] aria-[current=page]:border-2 aria-[current=page]:border-[var(--marque)] aria-[current=page]:bg-[var(--filet-leger)]";
 return <nav aria-label="Clients externes et règlements" className="flex flex-wrap gap-2">{liens.map(([label,href,redondant])=><Link key={href} className={redondant?`${classe} min-[1000px]:hidden`:classe} href={href} aria-current={href===enCours?"page":undefined}>{label}</Link>)}<a className={`${classe} py-2 text-center`} href="/api/artisan-prive/export" download title={PRECISION_EXPORT_ARTISAN}>{LIBELLE_EXPORT_ARTISAN}</a></nav>;
}
export function libelleEtatPrive(etat:string){const noms:Record<string,string>={brouillon:'Brouillon',valide:'Validé',accepte:'Accepté',refuse:'Refusé',planifie:'Planifié',en_cours:'En cours',termine:'Terminé',annule:'Annulé',remplace:'Remplacé',retenu:'retenu'};return noms[etat]??etat;}
export function libelleActionPrive(action:string){const noms:Record<string,string>={chantier:'Chantier créé',devis:'Version du devis enregistrée',valider_devis:'PDF du devis validé',decision:'Réponse du client consignée',planning:'Rendez-vous confirmé',demarrer:'Chantier démarré',bilan:'Compte rendu enregistré',facture:'Facture déposée',annuler_facture:'Facture annulée par un avoir',annuler:'Chantier annulé'};return noms[action]??action.replaceAll('_',' ');}

// `exclusion` (D25-B, ARC-08) : artisan refusé ou sur liste noire globale. Le message dit pourquoi et ce qui reste ouvert ; il remplace le message général.
const CLASSE_LECTURE_SEULE="rounded-[var(--rayon-champ)] border border-[var(--filet)] bg-[var(--filet-leger)] px-3.5 py-3 text-[0.9375rem] text-[var(--corps)]";
export function LectureSeule({active,exclusion}:{active:boolean;exclusion?:ExclusionArtisan|null}){if(exclusion)return <p role="status" className={CLASSE_LECTURE_SEULE}>{MESSAGE_ECRITURE_FERMEE[exclusion]}</p>;return active?null:<p role="status" className={CLASSE_LECTURE_SEULE}>Saisie désactivée. Vos dossiers, justificatifs et exports restent consultables.</p>;}

// Une lecture en échec ne se rend jamais seule : le titre de l'écran, le message, et un chemin de sortie (lien de retour au-dessus du titre).
export function LectureImpossiblePrivee({titre,rubrique="personnes",retour,children}:{titre:string;rubrique?:RubriqueEcran;retour?:{href:string;libelle:string};children:ReactNode}){
 return <div className="space-y-5">{retour&&<Retour href={retour.href}>{retour.libelle}</Retour>}<EnteteSousPage rubrique={rubrique} titre={titre}/><Erreur>{children}</Erreur></div>;
}
