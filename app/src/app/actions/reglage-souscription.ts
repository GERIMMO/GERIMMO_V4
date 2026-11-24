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
  // contrôle de la saisie est rejoué ici), ou que la lecture échoue. Le médiateur ne ferme pas ce réglage : sans lui,
  // c'est la garde de paiement qui laisse fermée la première souscription d'un particulier (lib/garde-souscription.ts).
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
      ? "Ouverture enregistrée. Les contrôles avant paiement s’appliquent. Aucun médiateur de la consommation n’est saisi : la première souscription d’un particulier reste fermée tant qu’il manque, sauf si vous levez le blocage des abonnements."
      : "Ouverture enregistrée. Les contrôles avant paiement s’appliquent." };
  }
  return { succes: actif
    ? "Blocage réactivé : une identité du vendeur incomplète empêche à nouveau les augmentations payantes, et l’absence de médiateur de la consommation empêche la première souscription d’un particulier."
    : "Blocage levé : la première souscription d’un particulier n’attend plus le médiateur de la consommation, et une identité du vendeur incomplète n’empêche plus les augmentations payantes. Toute première souscription reste fermée tant que l’identité du vendeur est incomplète. Les autres contrôles restent actifs. Cette décision est inscrite à l’historique des changements." };
}
