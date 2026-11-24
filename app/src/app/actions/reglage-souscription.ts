"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defautsVendeur, mediateurDesigne } from "@/lib/editeur";
import { lireEditeur } from "@/lib/editeur-serveur";

type Etat = { erreur?: string; succes?: string };

export async function reglerBlocageSouscription(_: Etat, form: FormData): Promise<Etat> {
  return enregistrer(form, "identite");
}

export async function reglerOuvertureVentes(_: Etat, form: FormData): Promise<Etat> {
  return enregistrer(form, "ventes");
}

/**
 * Seconde reprise du 24/11/2026 (relecture T4R-02) : vendre aux particuliers alors qu'aucun médiateur de la
 * consommation n'est saisi est une décision À PART du bouton « Lever le blocage ». Elle demande la case « j'ai lu les
 * deux articles », elle est datée par la base (colonne `vente_particuliers_sans_mediateur_le`, migration
 * 20261125106000) et inscrite à l'historique ; elle se retire à tout moment. Une levée du blocage enregistrée avant ce
 * lot ne l'emporte donc pas.
 */
export async function reglerVenteSansMediateur(_: Etat, form: FormData): Promise<Etat> {
  const db = await createClient();
  const auth = await db.rpc("is_permanent_super_admin");
  if (auth.error || auth.data !== true) return { erreur: "Compte de supervision permanent requis." };
  const choix = form.get("vente_sans_mediateur");
  const revisionBrute = form.get("revision");
  const revision = Number(revisionBrute);
  if ((choix !== "decider" && choix !== "retirer") || typeof revisionBrute !== "string"
    || !/^\d+$/.test(revisionBrute) || !Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) {
    return { erreur: "Rechargez les paramètres avant de modifier ce réglage." };
  }
  if (choix === "decider") {
    if (form.get("lecture") !== "oui") return { erreur: "Cochez la case : vous confirmez avoir lu les deux articles du code de la consommation affichés sur cette carte." };
    // La décision porte sur une vente SANS médiateur : elle n'a pas d'objet si un médiateur est saisi, et ne se prend
    // pas à l'aveugle si l'identité n'a pas pu être lue.
    const { editeur, indisponible } = await lireEditeur();
    if (indisponible) return { erreur: "L’identité de l’éditeur n’a pas pu être lue : la décision n’est pas enregistrée. Rechargez la page." };
    if (mediateurDesigne(editeur)) return { erreur: "Un médiateur de la consommation est saisi : cette décision est sans objet, la première souscription d’un particulier n’est pas fermée par cette règle." };
  }
  // La date est posée par la base (déclencheur de la migration 20261125106000) ; celle-ci n'est qu'un repère non nul.
  const saved = await db.from("supervision_identite")
    .update({ vente_particuliers_sans_mediateur_le: choix === "decider" ? new Date().toISOString() : null, revision: revision + 1 })
    .eq("singleton", true).eq("revision", revision)
    .select("revision").maybeSingle();
  if (saved.error || !saved.data) {
    return { erreur: "Le réglage n’a pas été modifié. Rechargez la page : les paramètres ont changé, sont indisponibles, ou la base de cet environnement n’a pas encore reçu sa mise à jour." };
  }
  revalidatePath("/admin/parametres");
  revalidatePath("/admin/sante");
  revalidatePath("/admin/journaux");
  revalidatePath("/agence/[orgId]/abonnement", "page");
  revalidatePath("/espace/[orgId]/abonnement", "page");
  return { succes: choix === "decider"
    ? "Décision enregistrée : la première souscription d’un particulier n’attend plus la saisie d’un médiateur de la consommation. Elle reste fermée tant que l’identité du vendeur est incomplète. Les pages légales, l’écran d’abonnement et les courriels continuent de dire qu’aucun médiateur n’est désigné. Cette décision est datée et inscrite à l’historique des changements ; elle se retire à tout moment."
    : "Décision retirée : la première souscription d’un particulier attend de nouveau la saisie du médiateur de la consommation. Ce retrait est inscrit à l’historique des changements." };
}

async function enregistrer(form: FormData, regle: "identite" | "ventes"): Promise<Etat> {
  const db = await createClient();
  const auth = await db.rpc("is_permanent_super_admin");
  if (auth.error || auth.data !== true) return { erreur: "Compte de supervision permanent requis." };

  const ventes = regle === "ventes";
  const choix = form.get(ventes ? "ventes" : "blocage");
  const revisionBrute = form.get("revision");
  const revision = Number(revisionBrute);
  if ((ventes ? choix !== "ouvrir" && choix !== "fermer" : choix !== "activer" && choix !== "lever") || typeof revisionBrute !== "string"
    || !/^\d+$/.test(revisionBrute) || !Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) {
    return { erreur: "Rechargez les paramètres avant de modifier le blocage." };
  }
  const actif = choix === "activer";
  if (ventes && choix === "ouvrir" && form.get("confirmation") !== "oui") return { erreur: "Confirmez l’ouverture des souscriptions." };
  // Décision du dirigeant du 24/11/2026 (Q7) : pas de vente sans vendeur. L'ouverture est refusée tant qu'un fait
  // requis de l'identité manque, que le nom d'un entrepreneur individuel ne porte pas « EI » (relecture D7R-05 : le
  // contrôle de la saisie est rejoué ici), que le type de vendeur n'est pas choisi (seconde reprise, T4R-03), ou que la
  // lecture échoue. Le médiateur ne ferme pas ce réglage : sans lui, c'est la garde de paiement qui laisse fermée la
  // première souscription d'un particulier (lib/garde-souscription.ts).
  let sansMediateur = false;
  if (ventes && choix === "ouvrir") {
    const { editeur, indisponible } = await lireEditeur();
    const manquants = indisponible ? ["l’identité du vendeur (lecture impossible)"] : defautsVendeur(editeur);
    if (manquants.length) return { erreur: `Les souscriptions ne peuvent pas s’ouvrir : l’identité du vendeur est incomplète. À compléter : ${manquants.join(", ")}.` };
    sansMediateur = !mediateurDesigne(editeur);
  }
  const changement = ventes ? { souscriptions_payantes_ouvertes: choix === "ouvrir" } : { blocage_souscription_identite: actif };
  const saved = await db.from("supervision_identite")
    .update({ ...changement, revision: revision + 1 })
    .eq("singleton", true).eq("revision", revision)
    .select("revision").maybeSingle();
  if (saved.error || !saved.data) {
    return { erreur: "Le réglage n’a pas été modifié. Rechargez la page : les paramètres ont changé ou sont indisponibles." };
  }
  revalidatePath("/admin/parametres");
  revalidatePath("/admin/journaux");
  revalidatePath("/agence/[orgId]/abonnement", "page");
  revalidatePath("/espace/[orgId]/abonnement", "page");
  if (ventes) {
    if (choix !== "ouvrir") return { succes: "Les nouvelles souscriptions sont fermées." };
    return { succes: sansMediateur
      ? "Ouverture enregistrée. Les contrôles avant paiement s’appliquent. Aucun médiateur de la consommation n’est saisi : la première souscription d’un particulier reste fermée tant qu’il manque, sauf décision de votre part (carte « Blocage des abonnements », « Vente aux particuliers sans médiateur »)."
      : "Ouverture enregistrée. Les contrôles avant paiement s’appliquent." };
  }
  return { succes: actif
    ? "Blocage réactivé : une identité du vendeur incomplète empêche à nouveau les augmentations payantes."
    // Seconde reprise du 24/11/2026 (relecture T4R-02) : lever le blocage n'ouvre plus rien aux particuliers sans médiateur.
    : "Blocage levé : une identité du vendeur incomplète n’empêche plus les augmentations payantes. Toute première souscription reste fermée tant que l’identité du vendeur est incomplète. Cette levée n’ouvre pas la vente aux particuliers sans médiateur de la consommation : c’est une décision à part, sur la même carte. Les autres contrôles restent actifs. Cette décision est inscrite à l’historique des changements." };
}
