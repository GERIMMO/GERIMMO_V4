"use server";

import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { MESSAGE_SUCCES_LISTE_ATTENTE, validerInscriptionAgence } from "@/lib/liste-attente-agences";

export type EtatListeAttenteAgence = {
  erreur?: string;
  succes?: string;
  /** La saisie refusée, reposée dans les champs (React 19 vide un <form action> après chaque action). */
  valeurs?: Record<string, string>;
};

// L'INSCRIPTION D'UNE AGENCE SUR LA LISTE D'ATTENTE (20/10/2026, page /agences).
//
// La V1 publique s'adresse aux propriétaires bailleurs et aux SCI ; l'offre pour les agences de gestion locative est en
// préparation. Une agence laisse ici ses coordonnées pour être prévenue de l'ouverture : rien ne lui est envoyé (aucun
// e-mail de confirmation), le dirigeant la recontacte lui-même depuis la console (/admin/liste-attente). Aucun prix,
// aucune date ne sont annoncés.
//
// POURQUOI LA PORTE D'ÉCRITURE EST CETTE ACTION (décision X02, AUD-A-06 du 14/10/2026, comme pour le formulaire de
// contact dans actions/devis.ts) : la clé publique est dans le navigateur ; si `anon` pouvait insérer, un robot
// écrirait directement par l'API, sans passer par le pot de miel ni par la validation, et saturerait le plafond horaire.
// La migration 20261020120000 ne donne donc AUCUN droit d'insertion à `anon` ni à `authenticated` sur
// `liste_attente_agences` : l'insertion se fait ICI, avec le client de service, une fois le robot écarté et les champs
// validés. Exception tenue à la main à la règle de lib/supabase/service.ts : un seul geste (insérer UNE ligne de cette
// table, bornée par la base), aucune lecture, aucune donnée d'un autre compte.
//
// CE QUE LA BASE GARDE, quel que soit l'appelant (`service_role` compris) : les bornes de chaque colonne (contraintes
// CHECK, les mêmes que BORNES_LISTE_ATTENTE), l'unicité de l'adresse en minuscules (une agence déjà inscrite ne crée
// pas de seconde ligne) et le plafond de trente inscriptions par heure glissante (déclencheur
// `liste_attente_agences_limiter`). Son refus arrive ici comme une erreur en français, affichée telle quelle.
//
// Le champ « site » est un pot de miel : rempli = robot, on répond succès sans rien écrire. Un doublon reçoit LE MÊME
// message de succès : la page ne révèle pas qu'une adresse est déjà connue.
export async function inscrireAgence(
  _etat: EtatListeAttenteAgence,
  formData: FormData,
): Promise<EtatListeAttenteAgence> {
  const succes = { succes: MESSAGE_SUCCES_LISTE_ATTENTE };
  const potDeMiel = String(formData.get("site") ?? "").trim();
  if (potDeMiel) return succes;

  const validation = validerInscriptionAgence(formData);
  if ("erreur" in validation) return { erreur: validation.erreur, valeurs: valeursDuFormulaire(formData) };

  const service = clientDeService();
  if (!service) {
    console.error("[liste-attente-agences] La clé de service est absente : l’inscription n’a pas pu être enregistrée.");
    return { erreur: "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes.", valeurs: valeursDuFormulaire(formData) };
  }
  const { error } = await service.from("liste_attente_agences").insert({ ...validation.valeurs, source: "/agences" });
  if (error) {
    // 23505 : l'adresse est déjà sur la liste (index unique sur lower(email)). Même réponse qu'une inscription.
    if (error.code === "23505") return succes;
    return { erreur: sansJargon(error.message), valeurs: valeursDuFormulaire(formData) };
  }
  return succes;
}
