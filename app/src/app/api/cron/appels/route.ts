// Tâche planifiée : annoncer au locataire l'échéance qui l'attend.
//
// Le cycle mensuel crée l'appel le 1er du mois ; jusqu'ici il restait muet dans
// l'espace du locataire. Cette route le lui dit, pour les seules agences qui
// ont donné leur accord permanent (`organizations.appels_envoi_auto`, faux par
// défaut).
//
// Elle suit trait pour trait la route des quittances, mêmes verrous et même
// ordre des opérations — on envoie, PUIS on marque, parce qu'un avis marqué
// parti mais jamais reçu ne serait plus jamais repris, alors qu'un double envoi
// n'est que désagréable.
//
// TROIS VERROUS, parce que la route porte la clé de service.
//  1. `CRON_SECRET` : sans elle, la route s'arrête — elle ne passe pas en mode
//     ouvert. Vercel présente le secret en `Authorization: Bearer`. La
//     comparaison est à temps constant.
//  2. La clé de service ne sort pas d'ici (lib/supabase/service.ts), et les
//     deux fonctions appelées sont accordées au seul `service_role`.
//  3. Chacune ne rend ou n'écrit que le strict nécessaire : de quoi composer un
//     e-mail, et une date d'envoi.

import { envoyerEmail } from "@/lib/email";
import { corpsAvisEcheance, sujetAvisEcheance } from "@/lib/appel-email";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { adresseDuSite } from "@/lib/site";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ligne = {
  appel_id: string;
  organization_id: string;
  bail_id: string;
  destinataire: string;
  prenom: string | null;
  emetteur: string;
  periode: string;
  loyer_hc: number;
  charges: number;
  montant_du: number;
  reste_du: number;
  date_echeance: string;
  prorata: boolean;
  arriere: number;
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
    // Sans adresse, le lien serait mort : mieux vaut ne rien envoyer qu'un avis
    // d'échéance que le locataire ne peut pas ouvrir.
    return Response.json(
      { erreur: "NEXT_PUBLIC_SITE_URL absente : impossible de composer le lien." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("appels_a_envoyer", { p_limite: 200 });
  if (error) {
    console.error("[cron appels] lecture impossible:", error.message);
    await consignerTache(supabase, "appels", { erreur: "lecture impossible" });
    return Response.json({ erreur: "Lecture impossible." }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  if (lignes.length === 0) {
    // Une passe sans rien à faire se consigne aussi : c'est le battement de
    // cœur que la ronde du matin attend à cette heure-là.
    await consignerTache(supabase, "appels", { envoyes: 0, echecs: 0 });
    return Response.json({ envoyes: 0, echecs: 0 });
  }

  let envoyes = 0;
  const echecs: string[] = [];
  for (const l of lignes) {
    const envoi = await envoyerEmail({
      to: l.destinataire,
      subject: sujetAvisEcheance({ periode: l.periode }),
      html: corpsAvisEcheance({
        periode: l.periode,
        loyerHc: Number(l.loyer_hc),
        charges: Number(l.charges),
        resteDu: Number(l.reste_du),
        dateEcheance: l.date_echeance,
        prorata: l.prorata,
        arriere: Number(l.arriere),
        emetteur: l.emetteur,
        prenom: l.prenom,
        // Le locataire arrive sur SES loyers, dans son espace : un avis
        // d'échéance porte un montant dû, il n'a rien à faire derrière un lien
        // public que n'importe qui peut ouvrir.
        lien: `${site}/locataire/${l.organization_id}/loyers`,
      }),
    });
    if (envoi.erreur) {
      echecs.push(envoi.erreur);
      continue;
    }
    const { error: erreurMarque } = await supabase.rpc("marquer_appel_envoye", {
      p_appel: l.appel_id,
    });
    if (erreurMarque) {
      // L'e-mail est parti mais la date n'est pas posée : la prochaine passe le
      // renverra. On le dit au journal plutôt que de le taire.
      console.error("[cron appels] envoyé mais non marqué:", l.appel_id, erreurMarque.message);
    }
    envoyes += 1;
  }

  if (echecs.length > 0) {
    console.error("[cron appels] échecs:", [...new Set(echecs)].join(" · "));
  }
  await consignerTache(supabase, "appels", { envoyes, echecs: echecs.length });
  return Response.json({ envoyes, echecs: echecs.length });
}
