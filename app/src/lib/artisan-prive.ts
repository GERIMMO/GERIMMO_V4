import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LigneDevisCalculee } from "@/lib/devis-structure";

export function environnementArtisanLocal() {
  try { return ["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname); }
  catch { return false; }
}
export function activationArtisanLocale(module: "clients" | "reglements") {
  return environnementArtisanLocal() && process.env[module === "clients" ? "GERIMMO_ARTISAN_CLIENTS_LOCAUX" : "GERIMMO_ARTISAN_REGLEMENTS_LOCAUX"] === "1";
}
export type ClientExterne = {id:string;nom:string;type:string;email:string;telephone:string;adresse:string;revision:number;archive_le:string|null};
export type ChantierExterne = {id:string;client_id:string;titre:string;adresse:string;description:string;statut:string;revision:number;bilan:string|null;photo_id:string|null};
export type DevisExterne = {id:string;chantier_id:string;version:number;statut:string;description:string;lignes:LigneDevisCalculee[];montant_ht_cents:number;montant_tva_cents:number;montant_ttc_cents:number;entreprise:{nom:string;siret:string;telephone:string|null;email:string|null;adresse:string|null;mentions:string|null};client:ClientExterne;valide_jusqu_au:string;pdf_id:string|null;preuve_acceptation_id:string|null;created_at:string};
export type RendezVousExterne = {id:string;chantier_id:string;debut:string;fin:string;statut:string;motif:string;conflit_motif:string|null};
export type FactureArtisanPrivee = {id:string;origine:"externe"|"gerimmo";chantier_id?:string;intervention_id?:string;numero:string;montant_ttc_cents:number;piece_id?:string;document_id?:string;client:string;created_at:string};
export type ReglementArtisan = {id:string;facture_externe_id:string|null;facture_gerimmo_id:string|null;montant_cents:number;date_reglement:string;moyen:string;reference:string;preuve_id:string;auteur:string;created_at:string;annule_le:string|null;annulation_motif:string|null;annulation_preuve_id:string|null};
export type PiecePrivee = {id:string;nom:string;storage_path:string;mime:string;sha256:string;taille:number};
export type ActiviteArtisanPrivee = {clients:ClientExterne[];chantiers:ChantierExterne[];devis:DevisExterne[];rendez_vous:RendezVousExterne[];factures:FactureArtisanPrivee[];pieces:PiecePrivee[];reglements:ReglementArtisan[];evenements:{id:string;objet_id:string;action:string;created_at:string;auteur:string;details:Record<string,unknown>}[];activation:{clients:boolean;reglements:boolean}};
export async function chargerActivitePrivee() {
  const supabase=await createClient();
  if (!environnementArtisanLocal()) return {supabase,data:null,erreur:"Cet espace privé est désactivé dans cet environnement."};
  const {data,error}=await supabase.rpc("mon_activite_artisan_privee");
  return {supabase,data:error?null:data as ActiviteArtisanPrivee|null,erreur:error?"Votre activité privée n’a pas pu être lue. Rechargez avant de conclure qu’elle est vide.":undefined};
}
export function bilanReglements(f:FactureArtisanPrivee,reglements:ReglementArtisan[]) {
  const lignes=reglements.filter(r=>r.facture_externe_id===f.id||r.facture_gerimmo_id===f.id);
  const declare=lignes.filter(r=>!r.annule_le).reduce((s,r)=>s+Number(r.montant_cents),0);
  return {lignes,declare,solde:Number(f.montant_ttc_cents)-declare,etat:declare===0?"Aucun règlement déclaré":declare===Number(f.montant_ttc_cents)?"Déclaré réglé":"Règlement partiel déclaré"};
}
