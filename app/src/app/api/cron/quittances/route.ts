// Tâche planifiée : envoyer les quittances que personne n'a envoyées.
//
// Le cycle mensuel crée les appels, l'encaissement émet la quittance — et
// jusqu'ici elle attendait qu'un gérant ouvre la comptabilité et clique. Cette
// route ferme la boucle, pour les seules agences qui ont donné leur accord
// permanent (`organizations.quittances_envoi_auto`, faux par défaut : le
// référentiel veut la quittance « validée par l'agence »).
//
// TROIS VERROUS, parce que la route porte la clé de service.
//  1. `CRON_SECRET` : sans elle, la route refuse de tourner — elle ne « passe
//     pas en mode ouvert », elle s'arrête. Vercel présente le secret en
//     `Authorization: Bearer`. La comparaison est à temps constant.
//  2. La clé de service ne sort pas d'ici (lib/supabase/service.ts), et les
//     deux fonctions appelées sont accordées au seul `service_role`.
//  3. Chacune ne rend ou n'écrit que le strict nécessaire : de quoi composer un
//     e-mail, et une date d'envoi.
//
// L'ORDRE DES OPÉRATIONS COMPTE. On envoie, PUIS on marque. L'inverse
// perdrait une quittance au premier échec réseau : marquée partie, jamais
// reçue, et plus aucune tâche ne la reprendrait. Dans ce sens-ci, le pire cas
// est un double envoi — désagréable, pas préjudiciable.

import { envoyerEmail } from "@/lib/email";
import { corpsQuittance, sujetQuittance } from "@/lib/quittance-email";
import { clientDeService } from "@/lib/supabase/service";
import { adresseDuSite } from "@/lib/site";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ligne = {
  quittance_id: string;
  organization_id: string;
  bail_id: string;
  destinataire: string;
  prenom: string | null;
  emetteur: string;
  periode: string;
  loyer_hc: number;
  charges: number;
  montant: number;
  est_quittance: boolean;
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
    // Pas de secret configuré = pas d'envoi. Le silence vaut mieux qu'une
    // route qui expédie du courrier à qui l'appelle.
    return Response.json(
      { erreur: "CRON_SECRET absente : la tâche d'envoi est désactivée." },
      { status: 503 }
    );
  }
  const entete = request.headers.get("authorization") ?? "";
  if (!memeSecret(entete, `Bearer ${attendu}`)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }

  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la tâche d'envoi ne peut pas lire." },
      { status: 503 }
    );
  }
  const site = adresseDuSite();
  if (!site) {
    // Sans adresse, le lien « Consulter le document » serait mort : on
    // préfère ne rien envoyer plutôt qu'envoyer une quittance inconsultable.
    return Response.json(
      { erreur: "NEXT_PUBLIC_SITE_URL absente : impossible de composer le lien." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("quittances_a_envoyer", { p_limite: 200 });
  if (error) {
    console.error("[cron quittances] lecture impossible:", error.message);
    return Response.json({ erreur: "Lecture impossible." }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  if (lignes.length === 0) return Response.json({ envoyees: 0, echecs: 0 });

  let envoyees = 0;
  const echecs: string[] = [];
  for (const l of lignes) {
    const envoi = await envoyerEmail({
      to: l.destinataire,
      subject: sujetQuittance({ estQuittance: l.est_quittance, periode: l.periode }),
      html: corpsQuittance({
        estQuittance: l.est_quittance,
        periode: l.periode,
        loyerHc: Number(l.loyer_hc),
        charges: Number(l.charges),
        montant: Number(l.montant),
        emetteur: l.emetteur,
        prenom: l.prenom,
        lien: `${site}/quittance/${l.quittance_id}`,
      }),
    });
    if (envoi.erreur) {
      echecs.push(envoi.erreur);
      continue;
    }
    const { error: erreurMarque } = await supabase.rpc("marquer_quittance_envoyee", {
      p_quittance: l.quittance_id,
    });
    if (erreurMarque) {
      // L'e-mail est parti mais la date n'est pas posée : la prochaine passe
      // le renverra. On le dit au journal plutôt que de le taire.
      console.error("[cron quittances] envoyée mais non marquée:", l.quittance_id, erreurMarque.message);
    }
    envoyees += 1;
  }

  if (echecs.length > 0) {
    console.error("[cron quittances] échecs:", [...new Set(echecs)].join(" · "));
  }
  return Response.json({ envoyees, echecs: echecs.length });
}
