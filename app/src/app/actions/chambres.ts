"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { erreurDuChamp, lireDecimal, lireMontant } from "@/lib/saisie-montant";

export type EtatChambre = { erreur?: string; succes?: string };

export async function enregistrerChambre(orgId: string, lotId: string, bienId: string, _etat: EtatChambre, form: FormData): Promise<EtatChambre> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const texte = (nom: string) => String(form.get(nom) ?? "").trim();
  if (!texte("nom") || !texte("description") || !texte("espaces_partages")) return { erreur: "Décrivez la chambre et les espaces partagés." };
  // Surface et volume lus sur le texte tel que tapé (« 12,5 » vaut 12,5) : les champs sont en `type="text"`, jamais
  // `type="number"` qui donne 125 à un navigateur non francophone (VER-TS-02). Un champ vide ne passe pas le minimum.
  const mesure = (champ: string, libelle: string): { valeur: number } | { erreur: string } => {
    if (texte(champ) === "") return { valeur: 0 };
    const lu = lireDecimal(texte(champ));
    return "erreur" in lu ? { erreur: erreurDuChamp(libelle, lu.erreur) } : lu;
  };
  const surfaceLue = mesure("surface_m2", "Surface privative");
  if ("erreur" in surfaceLue) return { erreur: surfaceLue.erreur };
  const volumeLu = mesure("volume_m3", "Volume privatif");
  if ("erreur" in volumeLu) return { erreur: volumeLu.erreur };
  const surface = surfaceLue.valeur;
  const volume = volumeLu.valeur;
  if (surface < 9 || volume < 20) return { erreur: "La partie privative doit mesurer au moins 9 m² ET 20 m³, sans compter les espaces partagés." };
  const champs = { nom: texte("nom"), surface_m2: surface, volume_m3: volume, description: texte("description"), espaces_partages: texte("espaces_partages"), equipements: texte("equipements") || null };
  const id = texte("id");
  const requete = id ? supabase.from("lot_chambres").update(champs).eq("id", id).eq("lot_id", lotId).eq("organization_id", orgId)
    : supabase.from("lot_chambres").insert({ ...champs, organization_id: orgId, lot_id: lotId });
  const { data, error } = await requete.select("id").maybeSingle();
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Chambre inaccessible." };
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Chambre enregistrée. Vous pouvez la choisir dans un contrat individuel." };
}

export async function enregistrerPlafondColocation(orgId: string, lotId: string, bienId: string, _etat: EtatChambre, form: FormData): Promise<EtatChambre> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  if (!String(form.get("plafond") ?? "").trim()) return { erreur: "Indiquez le loyer hors charges applicable au logement entier." };
  // Montant lu sur le texte tel que tapé (« 840,00 » vaut 840) : champ en `type="text"` (VFL-07).
  const plafondLu = lireMontant(form.get("plafond"));
  if ("erreur" in plafondLu) return { erreur: plafondLu.erreur };
  const plafond = plafondLu.montant;
  const { data, error } = await supabase.from("lots").update({ colocation_loyer_reference: plafond }).eq("id", lotId).eq("organization_id", orgId).select("id").maybeSingle();
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Logement inaccessible." };
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return { succes: "Plafond enregistré. Le total des contrats en cours sera contrôlé à chaque activation et révision." };
}
