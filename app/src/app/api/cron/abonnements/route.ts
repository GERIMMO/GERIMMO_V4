// Tâche planifiée : aligner ce que Stripe facture sur ce que l'agence gère.
//
// POURQUOI PAS AU MOMENT DE L'AJOUT. Pousser la quantité chez Stripe quand un
// bien est créé lierait la saisie du parc à la disponibilité d'un tiers :
// Stripe indisponible, et l'agence ne peut plus ajouter un bien. Or le retard
// ne coûte rien — Stripe facture à la fin de la période, pas à la seconde. Un
// déclencheur en base lève un drapeau ; cette route le baisse.
//
// LES MÊMES TROIS VERROUS QUE LA ROUTE DES QUITTANCES, et pour la même raison :
// elle porte la clé de service.
//  1. `CRON_SECRET` : sans elle, la route refuse de tourner — elle ne « passe
//     pas en mode ouvert », elle s'arrête. Comparaison à temps constant.
//  2. La clé de service ne sort pas de lib/supabase/service.ts, et les deux
//     fonctions appelées sont accordées au seul `service_role`.
//  3. Chacune ne rend ou n'écrit que le strict nécessaire.
//
// CE QU'ELLE NE FAIT PAS. Elle ne crée aucune souscription et n'en supprime
// aucune : elle ajuste celles qui existent. Souscrire est un geste du client,
// pas une décision de la plateforme — et une tâche de nuit qui ouvrirait un
// abonnement prélèverait quelqu'un qui n'a rien demandé.

import { clientStripe, configurationStripe, synchroniserQuantite } from "@/lib/stripe";
import { clientDeService } from "@/lib/supabase/service";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ligne = {
  organization_id: string;
  organisation: string;
  stripe_subscription_id: string;
  quantite_posee: number;
  quantite_cible: number;
};

/** Comparaison à temps constant, sans fuir la longueur du secret. */
function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) {
    return Response.json(
      { erreur: "CRON_SECRET absente : la synchronisation est désactivée." },
      { status: 503 }
    );
  }
  const fourni = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!memeSecret(fourni, attendu)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }

  const reglages = configurationStripe();
  if (!reglages.pret) {
    // 503 et non 200 : la tâche est branchée mais ne peut rien faire. Un 200
    // la ferait passer pour saine dans le tableau de bord de Vercel, et
    // personne ne verrait que la facturation dérive.
    return Response.json({ erreur: reglages.motif }, { status: 503 });
  }
  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la synchronisation est désactivée." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("abonnements_a_synchroniser", { p_limite: 200 });
  if (error) {
    return Response.json({ erreur: error.message }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  const stripe = clientStripe(reglages.config);

  let alignes = 0;
  let resiliees = 0;
  const echecs: { organisation: string; motif: string }[] = [];

  for (const l of lignes) {
    const r = await synchroniserQuantite(stripe, {
      subscription: l.stripe_subscription_id,
      quantite: l.quantite_cible,
    });
    if (!r.ok) {
      // L'échec est ENREGISTRÉ, pas avalé : le drapeau reste levé et la ligne
      // repassera demain. Une erreur silencieuse ici, c'est une facture fausse
      // tous les mois suivants sans que personne le sache.
      echecs.push({ organisation: l.organisation, motif: r.erreur });
      await supabase.rpc("abonnement_synchro_faite", {
        p_org: l.organization_id,
        p_quantite: l.quantite_posee,
        p_erreur: r.erreur.slice(0, 500),
      });
      continue;
    }
    if (r.resiliee) resiliees += 1;
    else alignes += 1;
    await supabase.rpc("abonnement_synchro_faite", {
      p_org: l.organization_id,
      p_quantite: r.quantite,
      p_erreur: null,
    });
  }

  return Response.json({
    examinees: lignes.length,
    alignees: alignes,
    resiliees,
    echecs,
  });
}
