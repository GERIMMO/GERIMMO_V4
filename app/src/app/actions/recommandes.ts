"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { clientDeService } from "@/lib/supabase/service";
import { MODELES } from "@/lib/documents/modeles";
import { configurationAr24, empreinteCourrierAr24, envoyerRecommandeAr24, lireRecommandeAr24, retrouverRecommandeAr24, type SuiviAr24 } from "@/lib/ar24";
import { contenuLettreAr24, type RecommandePrepare } from "@/lib/recommandes";
import { lireMontantSigne } from "@/lib/saisie-montant";

export type EtatRecommande = { erreur?: string; succes?: string; courrier?: RecommandePrepare };
const colonnes = "id,organization_id,bail_id,personne_id,environnement,expediteur_id,tarif_ttc_centimes,destinataire,contenu,empreinte,dette,delai,statut,ar24_id,preuves,cree_le,actualise_le,echec_definitif_confirme_le,remplace_id";
function rafraichir(org: string,bail: string) { revalidatePath(`/espace/${org}`);revalidatePath(`/espace/${org}/baux/${bail}`);revalidatePath(`/agence/${org}/baux/${bail}`); }
function baseCourrier(r: RecommandePrepare) {
 return {reference:r.id,expediteurId:Number(r.expediteur_id),destinataire:r.destinataire,contenu:r.contenu,piecesJointes:[],tarifTtcCentimes:r.tarif_ttc_centimes};
}

export async function preparerRecommande(orgId: string,bailId: string,delai: number,remplaceId?: string): Promise<EtatRecommande> {
 const {supabase,user} = await verifierGerant(orgId,{geste:"ajout_relance",cible:bailId});
 if(!user) return {erreur:"Accès refusé."};
 if(!Number.isInteger(delai)||delai<1||delai>90) return {erreur:"Indiquez un délai de 1 à 90 jours."};
 const existants=await supabase.from("recommandes_ar24").select("id,statut,dette,echec_definitif_confirme_le,remplace_id").eq("organization_id",orgId).eq("bail_id",bailId).order("cree_le",{ascending:false}).limit(100);
 if(existants.error || (existants.data?.length??0)>=100) return {erreur:"Le suivi n’a pas pu être vérifié. Aucun nouvel envoi n’est préparé."};
 const attente=existants.data?.find(r=>["en_cours","a_verifier","a_authentifier","en_attente"].includes(r.statut)||(r.statut==="echec"&&!existants.data?.some(enfant=>enfant.remplace_id===r.id)&&(r.id!==remplaceId||!r.echec_definitif_confirme_le)));
 if(attente) return chargerRecommande(orgId,attente.id);
 if(remplaceId) {
  const precedent=existants.data?.find(r=>r.id===remplaceId);
  if(!precedent||precedent.statut!=="echec"||!precedent.echec_definitif_confirme_le) return {erreur:"L’échec définitif du précédent courrier doit être vérifié avant une nouvelle préparation."};
  const reprise=existants.data?.find(r=>r.remplace_id===remplaceId);
  if(reprise&&reprise.statut!=="prepare") return chargerRecommande(orgId,reprise.id);
 }
 const config=configurationAr24();
 if(!config || !clientDeService()) return {erreur:"L’envoi AR24 n’est pas encore activé sur Gerimmo. Vous pouvez préparer le PDF et enregistrer le suivi d’un envoi postal dans le bail."};
 const environnement=config.baseUrl.includes("sandbox")?"sandbox":"production";
 const [connexion,bail,dette]=await Promise.all([
  supabase.from("connexions_ar24").select("expediteur_id,tarif_ttc_centimes,actif,environnement").eq("organization_id",orgId).maybeSingle(),
  supabase.from("baux").select("locataire_principal").eq("organization_id",orgId).eq("id",bailId).maybeSingle(),
  supabase.rpc("dette_recommande_ar24",{p_bail:bailId}),
 ]);
 if(connexion.error||bail.error||dette.error) return {erreur:"Le dossier du recommandé n’a pas pu être vérifié."};
 if(!connexion.data?.actif||connexion.data.environnement!==environnement) return {erreur:"L’expéditeur et le tarif AR24 doivent être configurés pour cet espace avant l’envoi."};
 if(!bail.data?.locataire_principal) return {erreur:"Renseignez d’abord le locataire principal du bail."};
 if(!dette.data || Number(dette.data.total_centimes)<=0) return {erreur:"Aucun loyer échu ne reste à recevoir."};
 const deja=existants.data?.find(r=>r.statut!=="prepare"&&r.id!==remplaceId&&!(r.statut==="echec"&&r.echec_definitif_confirme_le)&&JSON.stringify(r.dette)===JSON.stringify(dette.data));
 if(deja) return chargerRecommande(orgId,deja.id);
 const [personne,consentement]=await Promise.all([
  supabase.from("persons").select("prenom,nom,email").eq("id",bail.data.locataire_principal).eq("organization_id",orgId).maybeSingle(),
  supabase.from("consentements_documents_locataire").select("recommandes_electroniques,adresse_email").eq("organization_id",orgId).eq("person_id",bail.data.locataire_principal).maybeSingle(),
 ]);
 if(personne.error||consentement.error) return {erreur:"L’identité ou l’accord du locataire n’a pas pu être vérifié."};
 const destinataire={prenom:personne.data?.prenom?.trim()??"",nom:personne.data?.nom?.trim()??"",email:personne.data?.email?.trim().toLowerCase()??""};
 if(!destinataire.prenom||!destinataire.nom||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire.email)) return {erreur:"Complétez le prénom, le nom et l’adresse e-mail dans la fiche du locataire."};
 if(!consentement.data?.recommandes_electroniques||consentement.data.adresse_email!==destinataire.email) return {erreur:"Le locataire doit accepter les recommandés électroniques depuis ses documents. Vous pouvez aussi utiliser un envoi postal."};
 const assemblage=await MODELES.mise_en_demeure.assembler(supabase,orgId,bailId,{delai:String(delai)});
 if("erreur" in assemblage) return assemblage;
 if(assemblage.document.manquants.length) return {erreur:`Complétez avant l’envoi : ${assemblage.document.manquants.join(", ")}.`};
 const id=existants.data?.find(r=>r.statut==="prepare")?.id??randomUUID();
 const contenu=contenuLettreAr24(assemblage.document.html);
 const empreinte=empreinteCourrierAr24({reference:id,expediteurId:Number(connexion.data.expediteur_id),destinataire,contenu,piecesJointes:[],tarifTtcCentimes:connexion.data.tarif_ttc_centimes});
 const resultat=await supabase.rpc("preparer_recommande_ar24",{p_id:id,p_org:orgId,p_bail:bailId,p_contenu:contenu,p_empreinte:empreinte,p_dette:dette.data,p_delai:delai,p_environnement:environnement,p_remplace:remplaceId??null});
 if(resultat.error||!resultat.data) return {erreur:resultat.error?.message??"La préparation n’a pas pu être enregistrée."};
 return {courrier:resultat.data as RecommandePrepare};
}

export async function confirmerEnvoiRecommande(orgId:string,id:string,donnees:FormData):Promise<EtatRecommande> {
 const {supabase,user}=await verifierGerant(orgId,{geste:"ajout_relance",cible:id});
 if(!user) return {erreur:"Accès refusé."};
 const config=configurationAr24(),service=clientDeService();
 if(!config||!service) return {erreur:"L’envoi AR24 n’est pas activé. Aucun courrier n’a été envoyé."};
 const otp=String(donnees.get("otp")??"").trim();
 if(donnees.get("confirme")!=="oui"||!otp||otp.length>128) return {erreur:"Confirmez le courrier, le solde non reçu et son coût, puis saisissez votre code AR24."};
 const lecture=await supabase.from("recommandes_ar24").select(colonnes).eq("organization_id",orgId).eq("id",id).maybeSingle();
 if(lecture.error||!lecture.data) return {erreur:"Courrier inaccessible."};
 const avant=lecture.data as RecommandePrepare;
 if(avant.environnement!==(config.baseUrl.includes("sandbox")?"sandbox":"production")) return {erreur:"La connexion AR24 a changé. Actualisez la préparation."};
 // Vérifier avant réservation tout ce qui ne dépend pas d’une réponse fournisseur.
 const empreinte=String(donnees.get("empreinte")??""),email=String(donnees.get("email")??"");
 // Le coût confirmé est transmis en centimes entiers : aucun exposant, fraction ni valeur absente.
 const tarifLu=lireMontantSigne(donnees.get("tarif"));
 if("erreur" in tarifLu || tarifLu.montant<0 || !Number.isSafeInteger(tarifLu.montant)) return {erreur:"Le coût du courrier est invalide. Relisez la préparation."};
 const tarif=tarifLu.montant;
 if(contenuLettreAr24(avant.contenu)!==avant.contenu || empreinte!==avant.empreinte || empreinte!==empreinteCourrierAr24(baseCourrier(avant)) || email!==avant.destinataire.email || tarif!==avant.tarif_ttc_centimes) return {erreur:"Le courrier ou son coût a changé. Relisez la préparation."};
 const reservation=await supabase.rpc("reserver_recommande_ar24",{p_org:orgId,p_id:id,p_empreinte:empreinte,p_email:email,p_tarif:tarif});
 if(reservation.error||!reservation.data) return {erreur:reservation.error?.message??"La confirmation n’a pas pu être enregistrée."};
 const courrier=reservation.data.courrier as RecommandePrepare;
 if(reservation.data.reserve!==true) return {courrier,succes:"Ce courrier est déjà suivi. Aucun nouvel envoi n’a été déclenché."};
 let suivi:SuiviAr24;
 try {
  suivi=await envoyerRecommandeAr24(config,{...baseCourrier(courrier),consentement:{accepte:true,email:courrier.destinataire.email},tarifConfirmeCentimes:tarif,destinataireConfirme:email,empreinteConfirmee:empreinte,otp});
 } catch {
  // Même une erreur explicite est conservée : jamais de seconde tentative automatique et jamais de faux succès.
  const garde=await service.rpc("enregistrer_suivi_ar24",{p_org:orgId,p_id:id,p_ar24:null,p_statut:"a_verifier",p_preuves:[]});
  rafraichir(orgId,courrier.bail_id);
  return {courrier:(garde.data??courrier) as RecommandePrepare,erreur:"AR24 n’a pas confirmé le résultat. Vérifiez le courrier avec sa référence avant tout nouvel envoi. Aucune réexpédition automatique n’aura lieu."};
 }
 const sauvegarde=await service.rpc("enregistrer_suivi_ar24",{p_org:orgId,p_id:id,p_ar24:suivi.id,p_statut:suivi.etat,p_preuves:suivi.preuves});
 rafraichir(orgId,courrier.bail_id);
 if(sauvegarde.error||!sauvegarde.data) return {courrier,erreur:"AR24 a répondu, mais le suivi n’a pas été enregistré. Ne renvoyez pas ce courrier ; faites vérifier sa référence."};
 return {courrier:sauvegarde.data as RecommandePrepare,succes:suivi.etat==="a_authentifier"?"AR24 a créé un brouillon à authentifier. Le recommandé n’est pas encore envoyé.":"La réponse d’AR24 est enregistrée. Consultez le suivi ci-dessous."};
}

export async function actualiserRecommande(orgId:string,id:string):Promise<EtatRecommande> {
 const {supabase,user}=await verifierGerant(orgId,{geste:"ajout_relance",cible:id});
 if(!user) return {erreur:"Accès refusé."};
 const lecture=await supabase.from("recommandes_ar24").select(colonnes).eq("organization_id",orgId).eq("id",id).maybeSingle();
 if(lecture.error||!lecture.data) return {erreur:"Courrier inaccessible."};
 const courrier=lecture.data as RecommandePrepare;
 if(courrier.statut==="prepare") return {courrier,erreur:"Ce courrier n’a pas encore été confirmé."};
 const config=configurationAr24(),service=clientDeService();
 if(!config||!service||courrier.environnement!==(config.baseUrl.includes("sandbox")?"sandbox":"production")) return {courrier,erreur:"La connexion AR24 de ce courrier n’est pas disponible."};
 try {
  const suivi=courrier.ar24_id?await lireRecommandeAr24(config,Number(courrier.ar24_id),courrier.id):await retrouverRecommandeAr24(config,courrier.id,Number(courrier.expediteur_id),courrier.destinataire.email);
  if(!suivi) return {courrier,erreur:"AR24 ne retrouve pas encore ce courrier. Faites vérifier sa référence avant toute nouvelle expédition."};
  const resultat=await service.rpc("enregistrer_suivi_ar24",{p_org:orgId,p_id:id,p_ar24:suivi.id,p_statut:suivi.etat,p_preuves:suivi.preuves});
  if(resultat.error||!resultat.data) return {courrier,erreur:"Le suivi n’a pas pu être enregistré. Réessayez l’actualisation."};
  rafraichir(orgId,courrier.bail_id);
  return {courrier:resultat.data as RecommandePrepare,succes:"Suivi actualisé."};
 } catch {return {courrier,erreur:"Le suivi AR24 n’est pas disponible pour le moment. Aucun nouvel envoi n’a été déclenché."};}
}

export async function chargerRecommande(orgId:string,id:string):Promise<EtatRecommande> {
 const {supabase,user}=await verifierGerant(orgId);
 if(!user) return {erreur:"Accès refusé."};
 const lecture=await supabase.from("recommandes_ar24").select(colonnes).eq("organization_id",orgId).eq("id",id).maybeSingle();
 return lecture.error||!lecture.data?{erreur:"Courrier inaccessible."}:{courrier:lecture.data as RecommandePrepare};
}
