import Link from "next/link";
import {verifierAccesArtisan} from "../acces";
import {activationModuleArtisan,chargerActivitePrivee} from "@/lib/artisan-prive";
import {exclusionLue} from "@/lib/artisan-prive-exclusion";
import {Carte,EnteteSousPage,CLASSE_BOUTON_SECONDAIRE_EN_LIGNE,CLASSE_CHAMP,CLASSE_LIBELLE,TitreSection,Vide} from "../ui";
import {FormulairePrive} from "./formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule,LectureImpossiblePrivee,CLASSE_DETAIL,CLASSE_LIEN_LISTE,CLASSE_RANG} from "./elements";
export const metadata={title:"Clients externes"};
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <LectureImpossiblePrivee titre="Mes clients externes">{erreur}</LectureImpossiblePrivee>;
 const {q=""}=await searchParams;const exclusion=exclusionLue(data.activation.exclusion);const active=activationModuleArtisan("clients")&&data.activation.clients&&!exclusion;
 const trouves=data.clients.filter(c=>`${c.nom} ${c.email} ${c.adresse}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
 return <div className="space-y-6">
  <EnteteSousPage rubrique="personnes" titre="Mes clients externes" mention="Vos clients propres, sans compte Gerimmo. Ce carnet et ses documents restent privés."/>
  <NavigationPrivee enCours="/artisan/clients"/>
  <LectureSeule active={active} exclusion={exclusion}/>
  <Carte>
   <TitreSection>Retrouver un client</TitreSection>
   <form data-saisie-libre className="flex gap-3"><input className={CLASSE_CHAMP} name="q" defaultValue={q} aria-label="Rechercher un client"/><button className={CLASSE_BOUTON_SECONDAIRE_EN_LIGNE}>Rechercher</button></form>
   {trouves.length>0&&<ul>{trouves.map(c=><li key={c.id} className={CLASSE_RANG}><Link className={CLASSE_LIEN_LISTE} href={`/artisan/clients/${c.id}`}>{c.nom}</Link><p className={CLASSE_DETAIL}>{c.adresse} · {c.archive_le?"Archivé":"Actif"}</p></li>)}</ul>}
   {!data.clients.length&&<Vide>Aucun client externe pour le moment. Ajoutez votre premier client ci-dessous : il rejoint ce carnet privé.</Vide>}
   {data.clients.length>0&&!trouves.length&&<p role="status" className={CLASSE_DETAIL}>Aucun client ne correspond à cette recherche. <Link className="font-semibold text-[var(--encre)] underline underline-offset-4" href="/artisan/clients">Voir tous mes clients</Link></p>}
  </Carte>
  <Carte>
   <TitreSection>Ajouter un client</TitreSection>
   <FormulairePrive action="client" libelle="Créer le client" desactive={!active}><Champ label="Nom ou raison sociale" name="nom" required maxLength={200}/><label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Type de client</span><select className={CLASSE_CHAMP} name="type"><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></label><Champ label="Email (facultatif, aucun envoi automatique)" name="email" type="email" maxLength={254}/><Champ label="Téléphone (facultatif)" name="telephone" type="tel" maxLength={40}/><Texte label="Adresse" name="adresse"/></FormulairePrive>
  </Carte>
 </div>;
}
