"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Etat = { erreur?: string; succes?: string };

export async function reglerBlocageSouscription(_: Etat, form: FormData): Promise<Etat> {
  const db = await createClient();
  const auth = await db.rpc("is_permanent_super_admin");
  if (auth.error || auth.data !== true) return { erreur: "Compte de supervision permanent requis." };

  const choix = form.get("blocage");
  const revisionBrute = form.get("revision");
  const revision = Number(revisionBrute);
  if ((choix !== "activer" && choix !== "lever") || typeof revisionBrute !== "string"
    || !/^\d+$/.test(revisionBrute) || !Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) {
    return { erreur: "Rechargez les paramètres avant de modifier le blocage." };
  }
  const actif = choix === "activer";
  const saved = await db.from("supervision_identite")
    .update({ blocage_souscription_identite: actif, revision: revision + 1 })
    .eq("singleton", true).eq("revision", revision)
    .select("revision").maybeSingle();
  if (saved.error || !saved.data) {
    return { erreur: "Le réglage n’a pas été modifié. Rechargez la page : les paramètres ont changé ou sont indisponibles." };
  }
  revalidatePath("/admin/parametres");
  revalidatePath("/admin/journaux");
  revalidatePath("/agence/[orgId]/abonnement", "page");
  revalidatePath("/espace/[orgId]/abonnement", "page");
  return { succes: actif
    ? "Blocage réactivé : les informations manquantes empêchent à nouveau les nouvelles souscriptions et les augmentations payantes."
    : "Blocage levé : les informations manquantes n’empêchent plus les nouvelles souscriptions ni les augmentations payantes. Les autres contrôles restent actifs." };
}
