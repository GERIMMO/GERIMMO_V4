"use server";

import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatDevis = {
  erreur?: string;
  succes?: string;
};

// Demande de devis d'une agence depuis le site vitrine — le seul geste ouvert
// au visiteur non connecté (insert seul, lecture réservée au super admin).
// Le champ « site » est un pot de miel : rempli = robot, on répond succès
// sans rien écrire.
export async function demanderDevis(
  _etat: EtatDevis,
  formData: FormData
): Promise<EtatDevis> {
  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const agence = String(formData.get("agence") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const nbLots = String(formData.get("nb_lots") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const potDeMiel = String(formData.get("site") ?? "").trim();

  const succes = {
    succes:
      "Merci ! Votre demande est bien transmise — nous revenons vers vous sous 48 h ouvrées.",
  };
  if (potDeMiel) return succes;

  if (!nom) return { erreur: "Indiquez votre nom." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erreur: "Indiquez une adresse email valide — c'est là que nous répondrons." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("demandes_devis").insert({
    nom: nom.slice(0, 200),
    email: email.slice(0, 320),
    agence: agence.slice(0, 200) || null,
    telephone: telephone.slice(0, 40) || null,
    nb_lots: nbLots.slice(0, 40) || null,
    message: message.slice(0, 4000) || null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  return succes;
}
