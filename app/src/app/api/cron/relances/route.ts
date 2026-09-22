// Tâche planifiée : relancer les loyers impayés, pour qui l'a demandé.
//
// Le geste le plus répétitif de la gestion locative — constater l'impayé,
// ouvrir le bail, choisir « Relance 1 », dater, enregistrer, recommencer
// quinze jours plus tard — part d'ici, pour les seules organisations qui ont
// donné leur accord permanent (`organizations.relances_envoi_auto`, faux par
// défaut), aux délais qu'elles ont fixés. La mise en demeure ne part jamais
// d'ici : c'est un recommandé, un geste du gérant.
//
// Elle suit trait pour trait la route des quittances, mêmes verrous et même
// ordre des opérations — on envoie, PUIS on consigne, parce qu'une relance
// consignée mais jamais reçue ne serait plus jamais reprise (le niveau serait
// « fait »), alors qu'un double envoi n'est que désagréable — et la base le
// refuse de toute façon le même jour.
//
// TROIS VERROUS, parce que la route porte la clé de service.
//  1. `CRON_SECRET` : sans elle, la route s'arrête — elle ne passe pas en mode
//     ouvert. Vercel présente le secret en `Authorization: Bearer`. La
//     comparaison est à temps constant.
//  2. La clé de service ne sort pas d'ici (lib/supabase/service.ts), et les
//     deux fonctions appelées sont accordées au seul `service_role`.
//  3. Chacune ne rend ou n'écrit que le strict nécessaire : de quoi composer un
//     e-mail, et une ligne de relance.
import { envoyerEmail } from "@/lib/email";
import { corpsRelanceLoyer, sujetRelanceLoyer, type NiveauRelanceAuto } from "@/lib/relance-loyer-email";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { adresseDuSite } from "@/lib/site";
import { timingSafeEqual } from "node:crypto";

type Ligne = {
  bail_id: string;
  organization_id: string;
  niveau: NiveauRelanceAuto;
  destinataire: string;
  prenom: string | null;
  emetteur: string;
  lot: string;
  periode: string;
  date_echeance: string;
  reste: number | string;
  jours_retard: number;
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
      { erreur: "CRON_SECRET absente : la tâche de relance est désactivée." },
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
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la tâche de relance ne peut pas lire." },
      { status: 503 }
    );
  }
  const site = adresseDuSite();
  if (!site) {
    return Response.json(
      { erreur: "NEXT_PUBLIC_SITE_URL absente : impossible de composer le lien." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("relances_loyer_dues", { p_limite: 200 });
  if (error) {
    console.error("[cron relances] lecture impossible:", error.message);
    await consignerTache(supabase, "relances", { erreur: "lecture impossible" });
    return Response.json({ erreur: "Lecture impossible." }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  if (lignes.length === 0) {
    await consignerTache(supabase, "relances", { envoyees: 0, echecs: 0 });
    return Response.json({ envoyees: 0, echecs: 0 });
  }

  let envoyees = 0;
  const echecs: string[] = [];
  for (const l of lignes) {
    const envoi = await envoyerEmail({
      organisation: { db: supabase, id: l.organization_id },
      to: l.destinataire,
      subject: sujetRelanceLoyer({ niveau: l.niveau, periode: l.periode }),
      html: corpsRelanceLoyer({
        niveau: l.niveau,
        prenom: l.prenom,
        emetteur: l.emetteur,
        lot: l.lot,
        periode: l.periode,
        dateEcheance: l.date_echeance,
        reste: Number(l.reste),
        lien: `${site}/locataire/${l.organization_id}/loyers`,
      }),
    });
    if (envoi.erreur) {
      echecs.push(envoi.erreur);
      continue;
    }
    // Envoyé : on consigne. Un échec ici laisse la relance sans trace — le
    // pire cas est un second envoi demain, que le journal de la tâche signale.
    const { error: erreurTrace } = await supabase.rpc("relance_loyer_consigner", {
      p_bail: l.bail_id,
      p_niveau: l.niveau,
      p_note: `E-mail automatique à ${l.destinataire} — reste ${Number(l.reste).toFixed(2)} € sur le terme du ${l.periode}`,
    });
    if (erreurTrace) {
      echecs.push(`consignation ${l.bail_id}: ${erreurTrace.message}`);
      continue;
    }
    envoyees++;
  }

  const bilan = { envoyees, echecs: echecs.length, ...(echecs.length ? { details: echecs.slice(0, 20) } : {}) };
  await consignerTache(supabase, "relances", bilan);
  return Response.json(bilan);
}
