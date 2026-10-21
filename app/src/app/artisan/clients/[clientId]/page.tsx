import Link from "next/link";
import {notFound} from "next/navigation";
import {verifierAccesArtisan} from "../../acces";
import {activationModuleArtisan,chargerActivitePrivee} from "@/lib/artisan-prive";
import {exclusionLue} from "@/lib/artisan-prive-exclusion";
import {Carte,EnteteSousPage,Erreur,CLASSE_CHAMP,TitreSection} from "../../ui";
import {FormulairePrive} from "../formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule,libelleEtatPrive} from "../elements";
export const metadata={title:"Fiche du client"};
export default async function Page({params}:{params:Promise<{clientId:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <Erreur>{erreur}</Erreur>;const {clientId}=await params;const c=data.clients.find(x=>x.id===clientId);if(!c)notFound();
 const exclusion=exclusionLue(data.activation.exclusion);const active=activationModuleArtisan("clients")&&data.activation.clients&&!exclusion;
 return <div className="space-y-6"><EnteteSousPage titre={c.nom} mention={`Client externe · ${c.archive_le?"Archivé":"Actif"}`}/><NavigationPrivee/><LectureSeule active={active} exclusion={exclusion}/><Carte><TitreSection>Coordonnées</TitreSection><FormulairePrive action="modifier_client" id={c.id} revision={c.revision} libelle="Enregistrer les coordonnées" desactive={!active||!!c.archive_le}><Champ label="Nom" name="nom" defaultValue={c.nom} required maxLength={200}/><label>Type<select className={CLASSE_CHAMP} name="type" defaultValue={c.type}><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></label><Champ label="Email" name="email" type="email" defaultValue={c.email}/><Champ label="Téléphone" name="telephone" defaultValue={c.telephone}/><Texte label="Adresse" name="adresse" value={c.adresse}/></FormulairePrive><FormulairePrive action="archiver_client" id={c.id} revision={c.revision} libelle={c.archive_le?"Réactiver ce client":"Archiver ce client"} desactive={!active} secondaire><input type="hidden" name="archive" value={c.archive_le?"false":"true"}/><p>{!c.archive_le&&"Vous pourrez le réactiver à tout moment. "}L’archivage conserve l’historique et les documents ; les nouveaux dossiers sont désactivés.</p></FormulairePrive></Carte><Carte><TitreSection>Chantiers</TitreSection><ul>{data.chantiers.filter(h=>h.client_id===c.id).map(h=><li key={h.id}><Link className="inline-flex min-h-12 items-center underline" href={`/artisan/chantiers/${h.id}`}>{h.titre} · {libelleEtatPrive(h.statut)}</Link></li>)}</ul><Link className="inline-flex min-h-12 items-center underline" href={`/artisan/devis/nouveau?client=${c.id}`}>Créer un chantier et son devis</Link></Carte></div>;
}
