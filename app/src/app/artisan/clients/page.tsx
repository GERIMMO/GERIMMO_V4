import Link from "next/link";
import {verifierAccesArtisan} from "../acces";
import {activationArtisanLocale,chargerActivitePrivee} from "@/lib/artisan-prive";
import {Carte,EnteteSousPage,Erreur,CLASSE_CHAMP,TitreSection} from "../ui";
import {FormulairePrive} from "./formulaire";
import {Champ,Texte,NavigationPrivee,LectureSeule} from "./elements";
export const metadata={title:"Clients externes — Artisan"};
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){
 await verifierAccesArtisan();const {data,erreur}=await chargerActivitePrivee();if(!data)return <Erreur>{erreur}</Erreur>;
 const {q=""}=await searchParams;const active=activationArtisanLocale("clients")&&data.activation.clients;
 return <div className="space-y-6"><EnteteSousPage titre="Mes clients externes" mention="Vos clients propres, sans compte Gerimmo. Ce carnet et ses documents restent privés."/><NavigationPrivee/><LectureSeule active={active}/><Carte><TitreSection>Retrouver un client</TitreSection><form data-saisie-libre className="flex gap-3"><input className={CLASSE_CHAMP} name="q" defaultValue={q} aria-label="Rechercher un client"/><button className="min-h-12 underline">Rechercher</button></form><ul>{data.clients.filter(c=>`${c.nom} ${c.email} ${c.adresse}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())).map(c=><li key={c.id} className="border-b border-[var(--filet)] py-3"><Link className="min-h-12 underline" href={`/artisan/clients/${c.id}`}>{c.nom}</Link><p>{c.adresse} · {c.archive_le?"Archivé":"Actif"}</p></li>)}</ul>{!data.clients.length&&<p>Aucun client externe pour le moment.</p>}</Carte><Carte><TitreSection>Ajouter un client</TitreSection><FormulairePrive action="client" libelle="Créer le client" desactive={!active}><Champ label="Nom ou raison sociale" name="nom" required maxLength={200}/><label className="block">Type de client<select className={CLASSE_CHAMP} name="type"><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></label><Champ label="Email (facultatif, aucun envoi automatique)" name="email" type="email" maxLength={254}/><Champ label="Téléphone (facultatif)" name="telephone" type="tel" maxLength={40}/><Texte label="Adresse" name="adresse"/></FormulairePrive></Carte></div>;
}
