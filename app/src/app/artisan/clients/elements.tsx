import Link from "next/link";
import type {InputHTMLAttributes,ReactNode} from "react";
import {CLASSE_CHAMP,CLASSE_ZONE_TEXTE} from "../ui";
export function Champ({label,...props}:{label:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="block space-y-1"><span>{label}</span><input className={CLASSE_CHAMP} {...props}/></label>;}
export function Texte({label,name,value,required=true}:{label:string;name:string;value?:string;required?:boolean}){return <label className="block space-y-1"><span>{label}</span><textarea name={name} className={CLASSE_ZONE_TEXTE} defaultValue={value} required={required} maxLength={8000} rows={3}/></label>;}
export function Piece({label="Justificatif (PDF, JPEG ou PNG)",photo=false,required=true}:{label?:string;photo?:boolean;required?:boolean}){return <Champ label={label} name="fichier" type="file" accept={photo?"image/jpeg,image/png":"application/pdf,image/jpeg,image/png"} required={required}/>;}
export function LienPiece({id,children}:{id:string|null|undefined;children:ReactNode}){return id?<a className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-4 font-medium text-[var(--encre)] transition-colors hover:bg-[var(--marque-clair)]" href={`/api/artisan-prive/pieces/${id}`} target="_blank" rel="noreferrer">{children}</a>:null;}
export function NavigationPrivee(){
 const liens=[['Clients externes','/artisan/clients'],['Nouveau chantier et devis','/artisan/devis/nouveau'],['Agenda','/artisan/agenda'],['Facturation','/artisan/facturation']];
 const classe="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-4 text-sm font-medium text-[var(--encre)] transition-colors hover:border-[var(--or)] hover:bg-[var(--marque-clair)]";
 return <nav aria-label="Clients externes et règlements" className="flex flex-wrap gap-2">{liens.map(([label,href])=><Link key={href} className={classe} href={href}>{label}</Link>)}<a className={classe} href="/api/artisan-prive/export" download>Exporter mon registre</a></nav>;
}
export function libelleEtatPrive(etat:string){const noms:Record<string,string>={brouillon:'Brouillon',valide:'Validé',accepte:'Accepté',refuse:'Refusé',planifie:'Planifié',en_cours:'En cours',termine:'Terminé',annule:'Annulé',remplace:'Remplacé',retenu:'retenu'};return noms[etat]??etat;}
export function libelleActionPrive(action:string){const noms:Record<string,string>={chantier:'Chantier créé',devis:'Version du devis enregistrée',valider_devis:'PDF du devis validé',decision:'Réponse du client consignée',planning:'Rendez-vous confirmé',demarrer:'Chantier démarré',bilan:'Compte rendu enregistré',facture:'Facture déposée',annuler:'Chantier annulé'};return noms[action]??action.replaceAll('_',' ');}

export function LectureSeule({active}:{active:boolean}){return active?null:<p role="status">Saisie désactivée. Vos dossiers, justificatifs et exports restent consultables.</p>;}
