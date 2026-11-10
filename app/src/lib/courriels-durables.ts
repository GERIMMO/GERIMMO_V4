import { ArretSupervision } from "./controle-effets";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
export type ResultatCourriel = { interventionRequise?: boolean; finalisationEnAttente?: boolean; erreur?: string; id?: string; incertain?: true; recuperable?: boolean };
export const empreinteCourriel = (s:string) => createHash("sha256").update(s).digest("hex");
/** Ni adresse, ni corps, ni pièce jointe dans le journal durable. */
export async function envoyerCourrielDurable(db:SupabaseClient, p:{cle:string;destinataire:string;organisation:string|null;contenu:string}, envoyer:(reference:string)=>Promise<ResultatCourriel>):Promise<ResultatCourriel> {
 const id=empreinteCourriel(JSON.stringify([p.organisation,p.cle,p.destinataire.trim().toLowerCase()]));
 const jeton=randomUUID();
 const prise=await db.rpc("prendre_courriel",{p_id:id,p_org:p.organisation,p_empreinte:empreinteCourriel(p.contenu),p_jeton:jeton});
 if(prise.error) return {erreur:"Le suivi de l’envoi est indisponible ou son contenu a changé. Aucun nouvel envoi effectué."};
 const m=prise.data;
 if(m?.etat==="accepte"||m?.etat==="livre") {
  const f=await db.rpc('finaliser_courriel_metier',{p_id:id});
  return {id:m.id,finalisationEnAttente:!!f.error||f.data!==true};
 }
 if(m?.etat!=="pris")return {erreur:m?.etat==="inconnu"?"Envoi non confirmé : vérification en cours, aucun nouvel envoi automatique.":"Message déjà en traitement ou en attente de reprise.",...(m?.etat==="inconnu"?{incertain:true as const}:{})};
 let r:ResultatCourriel;let arret:ArretSupervision|undefined;
 try {r=await envoyer(id);} catch(e) {if(e instanceof ArretSupervision){arret=e;r={erreur:"Suspendu avant émission",recuperable:true};}else r={erreur:"Envoi interrompu : vérification nécessaire.",incertain:true};}
 const etat=r.incertain?"inconnu":r.erreur?(r.recuperable?"en_attente":"echec"):r.id?"accepte":"inconnu";
 const fin=await db.rpc("finir_courriel",{p_id:id,p_jeton:jeton,p_etat:etat,p_fournisseur:r.id??null});
 if(fin.error||fin.data!==true) return {erreur:"Résultat de l’envoi non enregistré. Ne pas renouveler l’envoi.",incertain:true};
 if(etat==='accepte'){const f=await db.rpc('finaliser_courriel_metier',{p_id:id});r.finalisationEnAttente=!!f.error||f.data!==true;}
 if(arret)throw arret;
 if(etat==="inconnu"&&!r.erreur)return {erreur:"Référence fournisseur absente ; envoi à vérifier.",incertain:true};
 return r;
}
