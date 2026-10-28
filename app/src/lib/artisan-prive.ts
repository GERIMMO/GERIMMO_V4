import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LigneDevisCalculee } from "@/lib/devis-structure";
import { avoirDeLaFacture, type AvoirArtisan } from "@/lib/artisan-prive-avoir";
import { formaterDate } from "@/lib/ged";
import type { FactureVueParArtisan } from "@/lib/reglement-facture";

export { activationModuleArtisan } from "./artisan-activation";
export type ClientExterne = {id:string;nom:string;type:string;email:string;telephone:string;adresse:string;revision:number;archive_le:string|null};
export type ChantierExterne = {id:string;client_id:string;titre:string;adresse:string;description:string;statut:string;revision:number;bilan:string|null;photo_id:string|null};
export type DevisExterne = {id:string;chantier_id:string;version:number;statut:string;description:string;lignes:LigneDevisCalculee[];montant_ht_cents:number;montant_tva_cents:number;montant_ttc_cents:number;entreprise:{nom:string;siret:string;telephone:string|null;email:string|null;adresse:string|null;mentions:string|null};client:ClientExterne;valide_jusqu_au:string;pdf_id:string|null;preuve_acceptation_id:string|null;created_at:string};
export type RendezVousExterne = {id:string;chantier_id:string;debut:string;fin:string;statut:string;motif:string;conflit_motif:string|null};
// `annulee_le` (D24-C) : une facture externe annulée par un avoir reste listée, avec l'instant de l'annulation (absent d'une base pas encore migrée).
export type FactureArtisanPrivee = {id:string;origine:"externe"|"gerimmo";chantier_id?:string;intervention_id?:string;numero:string;montant_ttc_cents:number;piece_id?:string;document_id?:string;client:string;created_at:string;annulee_le?:string|null};
export type ReglementArtisan = {id:string;facture_externe_id:string|null;facture_gerimmo_id:string|null;montant_cents:number;date_reglement:string;moyen:string;reference:string;preuve_id:string;auteur:string;created_at:string;annule_le:string|null;annulation_motif:string|null;annulation_preuve_id:string|null};
export type PiecePrivee = {id:string;nom:string;storage_path:string;mime:string;sha256:string;taille:number};
export type ActiviteArtisanPrivee = {clients:ClientExterne[];chantiers:ChantierExterne[];devis:DevisExterne[];rendez_vous:RendezVousExterne[];factures:FactureArtisanPrivee[];pieces:PiecePrivee[];reglements:ReglementArtisan[];avoirs?:AvoirArtisan[];evenements:{id:string;objet_id:string;action:string;created_at:string;auteur:string;details:Record<string,unknown>}[];activation:{clients:boolean;reglements:boolean;exclusion?:"refuse"|"liste_noire"|null}};
export async function chargerActivitePrivee() {
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("mon_activite_artisan_privee");
  return {supabase,data:error?null:data as ActiviteArtisanPrivee|null,erreur:error?"Votre activité privée n’a pas pu être lue. Rechargez avant de conclure qu’elle est vide.":undefined};
}
// D24-C : une facture externe annulée par un avoir n'est plus due. L'avoir en déduit tout le montant ; la base refuse de l'émettre
// tant qu'un règlement déclaré est actif, et refuse ensuite tout nouveau règlement : le reste dû d'une facture annulée est nul.
// Audit final (DOC-03) : sur une facture Gerimmo, le client déclare aussi son règlement (`mes_reglements_factures_artisan`).
// Tant que l'artisan n'a rien pointé dans son registre, le résumé le dit au lieu d'afficher « Aucun règlement déclaré »
// à côté de « Réglée le … (déclaré par votre client) », et le solde devient « Reste à pointer ». Les deux registres restent
// distincts : le pointage de l'artisan n'est jamais déduit de la déclaration du client.
export function bilanReglements(f:FactureArtisanPrivee,reglements:ReglementArtisan[],avoirs?:AvoirArtisan[],etatClient?:Pick<FactureVueParArtisan,"etat"|"reglee_le">|null) {
  const lignes=reglements.filter(r=>r.facture_externe_id===f.id||r.facture_gerimmo_id===f.id);
  const declare=lignes.filter(r=>!r.annule_le).reduce((s,r)=>s+Number(r.montant_cents),0);
  const avoir=f.origine==="externe"?avoirDeLaFacture(f.id,avoirs):null;
  const solde=Number(f.montant_ttc_cents)-(avoir?avoir.montant_ttc_cents:0)-declare;
  const regleeSelonClient=f.origine==="gerimmo"&&(etatClient?.etat==="reglee"||etatClient?.etat==="partiellement_reglee");
  const selonClient=etatClient?.etat==="reglee"?`Réglée${etatClient.reglee_le?` le ${formaterDate(etatClient.reglee_le)}`:""} selon votre client`:"Partiellement réglée selon votre client";
  const etat=avoir?`Annulée par l’avoir ${avoir.numero}`:declare===0?(regleeSelonClient?`${selonClient} · réception à pointer`:"Aucun règlement déclaré"):declare===Number(f.montant_ttc_cents)?"Déclaré réglé":"Règlement partiel déclaré";
  const libelleSolde=regleeSelonClient&&solde>0?"Reste à pointer":"Solde";
  return {lignes,declare,solde,etat,avoir,libelleSolde};
}
