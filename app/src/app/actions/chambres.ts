"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";

export type EtatChambre = { erreur?: string; succes?: string };

export async function enregistrerChambre(orgId: string, lotId: string, bienId: string, _etat: EtatChambre, form: FormData): Promise<EtatChambre> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const texte = (nom: string) => String(form.get(nom) ?? "").trim();
  const surface = Number(texte("surface_m2"));
  const volume = Number(texte("volume_m3"));
  if (!texte("nom") || !texte("description") || !texte("espaces_partages")) return { erreur: "Décrivez la chambre et les espaces partagés." };
  if (!Number.isFinite(surface) || surface < 9 || !Number.isFinite(volume) || volume < 20) return { erreur: "La partie privative doit mesurer au moins 9 m² ET 20 m³, sans compter les espaces partagés." };
  const champs = { nom: texte("nom"), surface_m2: surface, volume_m3: volume, description: texte("description"), espaces_partages: texte("espaces_partages"), equipements: texte("equipements") || null };
  const id = texte("id");
  const requete = id ? supabase.from("lot_chambres").update(champs).eq("id", id).eq("lot_id", lotId).eq("organization_id", orgId)
    : supabase.from("lot_chambres").insert({ ...champs, organization_id: orgId, lot_id: lotId });
  const { data, error } = await requete.select("id").maybeSingle();
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Chambre inaccessible." };
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Chambre enregistrée. Vous pouvez la choisir dans un contrat individuel." };
}

export async function enregistrerPlafondColocation(orgId: string, lotId: string, bienId: string, _etat: EtatChambre, form: FormData): Promise<EtatChambre> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const plafond = Number(form.get("plafond"));
  if (!Number.isFinite(plafond) || plafond <= 0) return { erreur: "Indiquez le loyer hors charges applicable au logement entier." };
  const { data, error } = await supabase.from("lots").update({ colocation_loyer_reference: plafond }).eq("id", lotId).eq("organization_id", orgId).select("id").maybeSingle();
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Logement inaccessible." };
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  return { succes: "Plafond enregistré. Le total des contrats en cours sera contrôlé à chaque activation et révision." };
}
