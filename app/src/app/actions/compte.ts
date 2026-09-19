"use server";

import { createClient as creerClientIsole } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { verdictMotDePasse } from "@/lib/compte";

export type EtatMotDePasse = { message?: string; erreur?: string };

/**
 * CHANGER SON MOT DE PASSE EN ÉTANT CONNECTÉ (19/09).
 *
 * Jusqu'ici le seul chemin passait par « Mot de passe oublié » : un email, un
 * lien, une session de récupération. Utile quand on a vraiment oublié ; absurde
 * quand on est connecté et qu'on veut simplement changer de mot de passe — et
 * impraticable quand l'adresse du compte n'est plus relevée.
 *
 * LE MOT DE PASSE ACTUEL EST EXIGÉ, ET VÉRIFIÉ. Sans cela, un poste laissé
 * déverrouillé une minute suffirait à voler le compte définitivement :
 * `updateUser` ne demande rien d'autre que la session. La vérification se fait
 * en se connectant sur un client JETABLE — jamais celui de la session en cours,
 * qui serait écrasé — et cette session jetable est révoquée aussitôt.
 *
 * Effet de bord assumé : une connexion réussie repousse `last_sign_in_at`,
 * donc la limite absolue de session (RM-A4.5). C'est le comportement attendu
 * d'une ré-authentification — la personne vient de prouver qu'elle est elle.
 */
export async function changerMonMotDePasse(
  _etat: EtatMotDePasse,
  formData: FormData
): Promise<EtatMotDePasse> {
  const actuel = String(formData.get("mot_de_passe_actuel") ?? "");
  const nouveau = String(formData.get("mot_de_passe") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  const refus = verdictMotDePasse(actuel, nouveau, confirmation);
  if (refus) return { erreur: refus };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { erreur: "Session expirée. Reconnectez-vous, puis recommencez." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !cle) {
    return { erreur: "Le service d'authentification est indisponible. Réessayez dans un instant." };
  }
  const jetable = creerClientIsole(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: erreurIdentite } = await jetable.auth.signInWithPassword({
    email: user.email,
    password: actuel,
  });
  if (erreurIdentite) {
    // On ne distingue pas « mot de passe faux » de « trop d'essais » côté
    // message : la première formulation suffit à la personne, et la seconde
    // renseignerait un attaquant sur l'état du compte.
    return { erreur: "Mot de passe actuel incorrect." };
  }
  // La session jetable a servi : elle ne doit pas survivre à la vérification.
  await jetable.auth.signOut();

  const { error } = await supabase.auth.updateUser({ password: nouveau });
  if (error) {
    if (error.code === "same_password") {
      return { erreur: "Le nouveau mot de passe doit être différent de l'ancien." };
    }
    if (error.code === "weak_password") {
      return {
        erreur:
          "Mot de passe refusé : trop faible ou présent dans des fuites de données connues. Choisissez-en un autre.",
      };
    }
    if (error.code === "reauthentication_needed") {
      return {
        erreur:
          "Le service demande une confirmation par email pour ce changement. Passez par « Mot de passe oublié » depuis l'écran de connexion.",
      };
    }
    return { erreur: `Changement impossible : ${sansJargon(error.message)}` };
  }

  // Les AUTRES sessions tombent — un appareil oublié quelque part, ou celui de
  // la personne qu'on veut justement écarter. La session courante est
  // conservée : changer son mot de passe ne doit pas éjecter de l'écran où on
  // est en train de travailler.
  await supabase.auth.signOut({ scope: "others" });

  // Matrice A2 : « changement de mot de passe », conservé six mois.
  await supabase.rpc("log_tech", {
    evenement: "changement_mot_de_passe",
    details: { depuis: "compte" },
  });

  return {
    message:
      "Mot de passe modifié. Vos autres appareils connectés ont été déconnectés ; celui-ci reste ouvert.",
  };
}
