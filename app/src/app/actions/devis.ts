"use server";

import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";

export type EtatDevis = {
  erreur?: string;
  succes?: string;
};

// Message du formulaire de contact du site vitrine (13/10 : ce n'est plus la
// demande de devis d'une agence) — le seul geste ouvert au visiteur non connecté (insert seul, lecture réservée au super admin).
// Le champ « site » est un pot de miel : rempli = robot, on répond succès
// sans rien écrire.
//
// X02 (AUD-A-06, décision du 14/10/2026) : cette action est la SEULE porte
// d'écriture. Jusqu'ici la clé publique, présente dans le navigateur, permettait à
// un robot d'insérer directement par l'API, sans passer par le pot de miel ni par
// la validation ci-dessous (et de saturer le plafond horaire). La migration
// 20261014400000 retire à `anon` et `authenticated` tout droit d'insertion dans
// `demandes_devis` : l'insertion se fait ICI, avec le client de service, une fois
// le pot de miel et les champs validés. C'est une exception tenue à la main à la
// règle de lib/supabase/service.ts : un seul geste (insérer une ligne de cette
// table, bornée par la base), aucune lecture, aucune donnée d'un autre compte.
//
// La limite de débit vit toujours EN BASE (audit du 27/09, migrations
// 20260927124000 et 20260929110000) et s'applique à tous les rôles, `service_role`
// compris : doublon exact ignoré, trois demandes par adresse et par heure, trente
// par heure en tout. Son refus arrive ici comme une erreur en français, affichée
// telle quelle.
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
      "Merci ! Votre message est bien transmis — nous revenons vers vous sous 48 h ouvrées.",
  };
  if (potDeMiel) return succes;

  if (!nom) return { erreur: "Indiquez votre nom." };
  if (!message) return { erreur: "Écrivez votre message : sans lui, nous ne saurions pas quoi vous répondre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erreur: "Indiquez une adresse email valide — c'est là que nous répondrons." };
  }

  const service = clientDeService();
  if (!service) {
    console.error("[devis] La clé de service est absente : la demande de contact n’a pas pu être enregistrée.");
    return { erreur: "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes." };
  }
  const { error } = await service.from("demandes_devis").insert({
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
