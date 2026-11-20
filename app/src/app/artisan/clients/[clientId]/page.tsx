import Link from "next/link";
import {notFound} from "next/navigation";
import {verifierAccesArtisan} from "../../acces";
import {activationModuleArtisan,chargerActivitePrivee} from "@/lib/artisan-prive";
import {exclusionLue} from "@/lib/artisan-prive-exclusion";
import {Carte,EnteteSousPage,Retour,CLASSE_CHAMP,CLASSE_LIBELLE,TitreSection} from "../../ui";
import {FormulairePrive} from "../formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule,LectureImpossiblePrivee,libelleEtatPrive,CLASSE_DETAIL,CLASSE_LIEN_BOUTON,CLASSE_LIEN_LISTE,CLASSE_RANG} from "../elements";
export const metadata={title:"Fiche du client"};
const RETOUR={href:"/artisan/clients",libelle:"Mes clients externes"};
export default async function Page({params}:{params:Promise<{clientId:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <LectureImpossiblePrivee titre="Fiche du client" retour={RETOUR}>{erreur}</LectureImpossiblePrivee>;const {clientId}=await params;const c=data.clients.find(x=>x.id===clientId);if(!c)notFound();
 const exclusion=exclusionLue(data.activation.exclusion);const active=activationModuleArtisan("clients")&&data.activation.clients&&!exclusion;
 const chantiers=data.chantiers.filter(h=>h.client_id===c.id);
 return <div className="space-y-6">
  <Retour href={RETOUR.href}>{RETOUR.libelle}</Retour>
  <EnteteSousPage rubrique="personnes" titre={c.nom} mention={`Client externe · ${c.archive_le?"Archivé":"Actif"}`}/>
  <NavigationPrivee/>
  <LectureSeule active={active} exclusion={exclusion}/>
  <Carte>
   <TitreSection>Coordonnées</TitreSection>
   <FormulairePrive action="modifier_client" id={c.id} revision={c.revision} libelle="Enregistrer les coordonnées" desactive={!active||!!c.archive_le}><Champ label="Nom" name="nom" defaultValue={c.nom} required maxLength={200}/><label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Type</span><select className={CLASSE_CHAMP} name="type" defaultValue={c.type}><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></label><Champ label="Email" name="email" type="email" defaultValue={c.email}/><Champ label="Téléphone" name="telephone" defaultValue={c.telephone}/><Texte label="Adresse" name="adresse" value={c.adresse}/></FormulairePrive>
  </Carte>
  <Carte>
   <TitreSection>Chantiers</TitreSection>
   {chantiers.length>0?<ul>{chantiers.map(h=><li key={h.id} className={CLASSE_RANG}><Link className={CLASSE_LIEN_LISTE} href={`/artisan/chantiers/${h.id}`}>{h.titre} · {libelleEtatPrive(h.statut)}</Link></li>)}</ul>:<p className={CLASSE_DETAIL}>Aucun chantier pour ce client pour le moment.</p>}
   <Link className={CLASSE_LIEN_BOUTON} href={`/artisan/devis/nouveau?client=${c.id}`}>Créer un chantier et son devis</Link>
  </Carte>
  {/* Le rangement a sa propre carte, après le travail courant : il ne se confond plus avec l'enregistrement des coordonnées. */}
  <Carte>
   <TitreSection>Archivage</TitreSection>
   <FormulairePrive action="archiver_client" id={c.id} revision={c.revision} libelle={c.archive_le?"Réactiver ce client":"Archiver ce client"} desactive={!active} secondaire><input type="hidden" name="archive" value={c.archive_le?"false":"true"}/><p className={CLASSE_DETAIL}>{!c.archive_le&&"Vous pourrez le réactiver à tout moment. "}L’archivage conserve l’historique et les documents ; les nouveaux dossiers sont désactivés.</p></FormulairePrive>
  </Carte>
 </div>;
}
