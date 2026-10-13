import Link from "next/link";
import {verifierAccesArtisan} from "../../acces";
import {activationArtisanLocale,chargerActivitePrivee} from "@/lib/artisan-prive";
import {Carte,EnteteSousPage,Erreur,TitreSection,CLASSE_CHAMP} from "../../ui";
import {FormulairePrive} from "../../clients/formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule} from "../../clients/elements";
export default async function Page({searchParams}:{searchParams:Promise<{client?:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <Erreur>{erreur}</Erreur>;const {client}=await searchParams;const clients=data.clients.filter(c=>!c.archive_le);const c=clients.find(x=>x.id===client)??clients[0];const active=activationArtisanLocale("clients")&&data.activation.clients;
 return <div className="space-y-6"><EnteteSousPage titre="Nouveau chantier et devis" mention="Client externe · aucune sollicitation Gerimmo nécessaire"/><NavigationPrivee/><LectureSeule active={active}/>{c?<><Carte><form><label>Choisir un client<select name="client" className={CLASSE_CHAMP} defaultValue={c.id}>{clients.map(x=><option key={x.id} value={x.id}>{x.nom}</option>)}</select></label><button className="min-h-12 underline">Choisir</button></form></Carte><Carte><TitreSection>Chantier de {c.nom}</TitreSection><FormulairePrive key={c.id} action="chantier" id={c.id} libelle="Créer le chantier et préparer le devis" desactive={!active}><Champ label="Titre du chantier" name="titre" required maxLength={200}/><Texte label="Adresse d’intervention" name="adresse" value={c.adresse}/><Texte label="Demande du client" name="description"/></FormulairePrive></Carte></>:<Carte><p>Ajoutez d’abord un client actif.</p><Link href="/artisan/clients" className="underline">Créer un client</Link></Carte>}</div>;
}
