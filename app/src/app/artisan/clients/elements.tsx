import Link from "next/link";
import { PieceFichier } from "./piece-fichier";
import type {InputHTMLAttributes,ReactNode} from "react";
import {CLASSE_CHAMP,CLASSE_ZONE_TEXTE} from "../ui";
import {MESSAGE_ECRITURE_FERMEE,type ExclusionArtisan} from "@/lib/artisan-prive-exclusion";
export function Champ({label,...props}:{label:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="block space-y-1"><span>{label}</span><input className={CLASSE_CHAMP} {...props}/></label>;}
export function Texte({label,name,value,required=true}:{label:string;name:string;value?:string;required?:boolean}){return <label className="block space-y-1"><span>{label}</span><textarea name={name} className={CLASSE_ZONE_TEXTE} defaultValue={value} required={required} maxLength={8000} rows={3}/></label>;}
export function Piece({label="Justificatif (PDF, JPEG ou PNG)",photo=false,required=true}:{label?:string;photo?:boolean;required?:boolean}){return <PieceFichier label={label} photo={photo} required={required}/>;}
export function LienPiece({id,children}:{id:string|null|undefined;children:ReactNode}){return id?<a className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-4 font-medium text-[var(--encre)] transition-colors hover:bg-[var(--marque-clair)]" href={`/api/artisan-prive/pieces/${id}`} target="_blank" rel="noreferrer">{children}</a>:null;}
export function NavigationPrivee(){
 // À partir de 1000 px le menu latéral (NavArtisan, présentation « bureau ») porte déjà Clients externes, Agenda et Facturation :
 // ces trois pastilles y répétaient le menu (DES-B-05). « Nouveau chantier et devis » et l'export n'y ont pas d'entrée : ils restent.
 const liens:[string,string,boolean][]=[['Clients externes','/artisan/clients',true],['Nouveau chantier et devis','/artisan/devis/nouveau',false],['Agenda','/artisan/agenda',true],['Facturation','/artisan/facturation',true]];
 const classe="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-4 text-sm font-medium text-[var(--encre)] transition-colors hover:border-[var(--or)] hover:bg-[var(--marque-clair)]";
 return <nav aria-label="Clients externes et règlements" className="flex flex-wrap gap-2">{liens.map(([label,href,redondant])=><Link key={href} className={redondant?`${classe} min-[1000px]:hidden`:classe} href={href}>{label}</Link>)}<a className={classe} href="/api/artisan-prive/export" download>Exporter mon registre</a></nav>;
}
export function libelleEtatPrive(etat:string){const noms:Record<string,string>={brouillon:'Brouillon',valide:'Validé',accepte:'Accepté',refuse:'Refusé',planifie:'Planifié',en_cours:'En cours',termine:'Terminé',annule:'Annulé',remplace:'Remplacé',retenu:'retenu'};return noms[etat]??etat;}
export function libelleActionPrive(action:string){const noms:Record<string,string>={chantier:'Chantier créé',devis:'Version du devis enregistrée',valider_devis:'PDF du devis validé',decision:'Réponse du client consignée',planning:'Rendez-vous confirmé',demarrer:'Chantier démarré',bilan:'Compte rendu enregistré',facture:'Facture déposée',annuler_facture:'Facture annulée par un avoir',annuler:'Chantier annulé'};return noms[action]??action.replaceAll('_',' ');}

// `exclusion` (D25-B, ARC-08) : artisan refusé ou sur liste noire globale. Le message dit pourquoi et ce qui reste ouvert ; il remplace le message général.
export function LectureSeule({active,exclusion}:{active:boolean;exclusion?:ExclusionArtisan|null}){if(exclusion)return <p role="status">{MESSAGE_ECRITURE_FERMEE[exclusion]}</p>;return active?null:<p role="status">Saisie désactivée. Vos dossiers, justificatifs et exports restent consultables.</p>;}
