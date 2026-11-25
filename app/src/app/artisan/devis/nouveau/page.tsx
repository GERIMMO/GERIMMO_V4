import {verifierAccesArtisan} from "../../acces";
import {activationModuleArtisan,chargerActivitePrivee} from "@/lib/artisan-prive";
import {exclusionLue} from "@/lib/artisan-prive-exclusion";
import {Carte,EnteteSousPage,Retour,TitreSection,Vide,CLASSE_BOUTON_SECONDAIRE_EN_LIGNE,CLASSE_CHAMP,CLASSE_LIBELLE} from "../../ui";
import {FormulairePrive} from "../../clients/formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule,LectureImpossiblePrivee} from "../../clients/elements";
export const metadata={title:"Nouveau chantier et devis"};
const RETOUR={href:"/artisan/clients",libelle:"Mes clients externes"};
export default async function Page({searchParams}:{searchParams:Promise<{client?:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <LectureImpossiblePrivee titre="Nouveau chantier et devis" retour={RETOUR}>{erreur}</LectureImpossiblePrivee>;const {client}=await searchParams;const clients=data.clients.filter(c=>!c.archive_le);const c=clients.find(x=>x.id===client)??clients[0];const exclusion=exclusionLue(data.activation.exclusion);const active=activationModuleArtisan("clients")&&data.activation.clients&&!exclusion;
 return <div className="space-y-6">
  <Retour href={RETOUR.href}>{RETOUR.libelle}</Retour>
  <EnteteSousPage rubrique="personnes" titre="Nouveau chantier et devis" mention="Pour l’un de vos clients externes, sans demande reçue par Gerimmo."/>
  <NavigationPrivee enCours="/artisan/devis/nouveau"/>
  <LectureSeule active={active} exclusion={exclusion}/>
  {c?<>
   <Carte>
    <form data-saisie-libre className="flex flex-wrap items-end gap-3"><label className="block min-w-0 flex-1 basis-56 space-y-1.5"><span className={CLASSE_LIBELLE}>Choisir un client</span><select name="client" className={CLASSE_CHAMP} defaultValue={c.id}>{clients.map(x=><option key={x.id} value={x.id}>{x.nom}</option>)}</select></label><button className={CLASSE_BOUTON_SECONDAIRE_EN_LIGNE}>Choisir</button></form>
   </Carte>
   <Carte>
    <TitreSection>Chantier de {c.nom}</TitreSection>
    <FormulairePrive key={c.id} action="chantier" id={c.id} libelle="Créer le chantier et préparer le devis" desactive={!active}><Champ label="Titre du chantier" name="titre" required maxLength={200}/><Texte label="Adresse d’intervention" name="adresse" value={c.adresse}/><Texte label="Demande du client" name="description"/></FormulairePrive>
   </Carte>
  </>:<Vide action={{href:"/artisan/clients",libelle:"Créer un client"}}>Ajoutez d’abord un client actif.</Vide>}
 </div>;
}
