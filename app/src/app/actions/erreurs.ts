"use server";

import { createClient } from "@/lib/supabase/server";
import { ecranSansDonnees } from "@/lib/retours";

// Noter qu'un écran n'a pas pu s'afficher — sans rien dire de ce qu'il montrait.
//
// LE DEUXIÈME CAPTEUR (wiki : « Gerimmo en autonomie », 19/09). Jusqu'ici une
// page qui plantait ne laissait aucune trace côté produit ; l'application
// était aveugle à ses propres pannes. Les frontières d'erreur appellent cette
// action, qui écrit dans `tech_log` : le condensé que Next donne à l'erreur, la
// route avec ses identifiants remplacés (même règle que les signalements —
// `ecranSansDonnees`), l'espace. Jamais un champ, un nom, un montant.
//
// Elle ne lève jamais : un capteur qui ajoute une panne à la panne n'aide
// personne. Et sans utilisateur connecté (vitrine, portes d'entrée), elle ne
// fait rien : `log_tech` est réservé aux connectés, et Vercel voit déjà ces
// erreurs-là.

const ESPACES = ["agence", "locataire", "proprietaire", "artisan", "admin"] as const;

export async function signalerErreurEcran(entree: {
  digest?: string;
  chemin: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const premier = entree.chemin.split("/").filter(Boolean)[0] ?? "";
    const espace = (ESPACES as readonly string[]).includes(premier) ? premier : "autre";
    await supabase.rpc("log_tech", {
      evenement: "erreur_ecran",
      details: {
        digest: entree.digest ?? null,
        ecran: ecranSansDonnees(entree.chemin).slice(0, 200),
        espace,
      },
    });
  } catch {
    // Volontairement silencieux : voir l'en-tête.
  }
}
