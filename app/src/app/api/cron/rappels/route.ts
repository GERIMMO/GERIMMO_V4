// Tâche planifiée : rappeler le rendez-vous à ceux qui doivent s'y trouver
// (RM-10.5 — veille systématique, J-7 si posé assez tôt).
//
// Elle tourne TÔT : un rappel « demain » reçu à 20 h ne sert plus à grand-chose
// pour un rendez-vous de 8 h le lendemain. D'où 6 h UTC, avant les deux autres
// tâches du matin.
//
// PAS DE RÉGLAGE D'AGENCE ICI, contrairement aux quittances et aux avis
// d'échéance. La raison n'est pas l'oubli : ces deux-là écrivent AU NOM de
// l'agence sur des sujets d'argent, et engagent sa parole. Un rappel de
// rendez-vous ne fait que répéter ce que les deux parties ont déjà convenu
// ensemble, sur cette plateforme. Le refuser à une agence reviendrait à laisser
// ses locataires et ses artisans se manquer.
//
// TROIS VERROUS, parce que la route porte la clé de service : secret de tâche
// comparé à temps constant, clé de service qui ne sort pas d'ici, et deux
// fonctions accordées au seul `service_role`.
//
// On envoie, PUIS on trace — un rappel tracé mais jamais reçu ne serait plus
// jamais repris, alors qu'un double rappel n'est que redondant.

import { envoyerEmail } from "@/lib/email";
import { corpsRappel, sujetRappel } from "@/lib/rappel-email";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { timingSafeEqual } from "node:crypto";
import { orchestrerDossiers } from "@/lib/orchestrateur";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ligne = {
  intervention_id: string;
  organization_id: string;
  echeance: "veille" | "j7";
  destinataire: "locataire" | "artisan";
  adresse: string;
  prenom: string | null;
  emetteur: string;
  artisan: string;
  lot: string;
  adresse_bien: string;
  debut_prevu: string;
  fin_prevue: string | null;
  incident_numero: string;
  categorie: string;
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
      { erreur: "CRON_SECRET absente : la tâche de rappel est désactivée." },
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
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la tâche de rappel ne peut pas lire." },
      { status: 503 }
    );
  }
  // La même ronde matinale remet aussi chaque dossier sur sa prochaine étape.
  // Son éventuel échec ne bloque jamais les rappels déjà dus.
  const orchestration = await orchestrerDossiers(supabase);
  if (orchestration.erreur) console.error("[orchestrateur]", orchestration.erreur);
  // Pas de contrôle d'adresse de site ici : le rappel se suffit à lui-même, il
  // ne porte pas de lien. Le locataire n'a rien à ouvrir — il a un rendez-vous.

  const { data, error } = await supabase.rpc("rendez_vous_a_rappeler", { p_limite: 200 });
  if (error) {
    console.error("[cron rappels] lecture impossible:", error.message);
    await consignerTache(supabase, "rappels", { erreur: "lecture impossible" });
    return Response.json({ erreur: "Lecture impossible." }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  if (lignes.length === 0) {
    // Une passe sans rien à faire se consigne aussi : c'est le battement de
    // cœur que la ronde du matin attend à cette heure-là.
    await consignerTache(supabase, "rappels", { rappeles: 0, echecs: 0, orchestration_erreur: Boolean(orchestration.erreur), rapports_prepares: orchestration.rapports_prepares ?? 0 });
    return Response.json({ rappeles: 0, echecs: 0, orchestration_erreur: Boolean(orchestration.erreur), rapports_prepares: orchestration.rapports_prepares ?? 0 });
  }

  let rappeles = 0;
  const echecs: string[] = [];
  for (const l of lignes) {
    const rappel = {
      echeance: l.echeance,
      destinataire: l.destinataire,
      prenom: l.prenom,
      emetteur: l.emetteur,
      artisan: l.artisan,
      lot: l.lot,
      adresseBien: l.adresse_bien,
      debutPrevu: l.debut_prevu,
      finPrevue: l.fin_prevue,
      incidentNumero: l.incident_numero,
      categorie: l.categorie,
    };
    const envoi = await envoyerEmail({
      organisation: { db: supabase, id: l.organization_id },
      to: l.adresse,
      subject: sujetRappel(rappel),
      html: corpsRappel(rappel),
    });
    if (envoi.erreur) {
      echecs.push(envoi.erreur);
      continue;
    }
    const { error: erreurTrace } = await supabase.rpc("marquer_rappel_envoye", {
      p_intervention: l.intervention_id,
      p_echeance: l.echeance,
      p_destinataire: l.destinataire,
      p_adresse: l.adresse,
    });
    if (erreurTrace) {
      echecs.push("La confirmation du rappel doit être vérifiée.");
      // Parti mais non tracé : la prochaine passe le renverra, le même jour au
      // pire. On le dit au journal plutôt que de le taire.
      console.error(
        "[cron rappels] envoyé mais non tracé:",
        l.intervention_id,
        l.destinataire,
        erreurTrace.message
      );
    }
    rappeles += 1;
  }

  if (echecs.length > 0) {
    console.error("[cron rappels] échecs:", [...new Set(echecs)].join(" · "));
  }
  await consignerTache(supabase, "rappels", { rappeles, echecs: echecs.length, orchestration_erreur: Boolean(orchestration.erreur), rapports_prepares: orchestration.rapports_prepares ?? 0 });
  return Response.json({ rappeles, echecs: echecs.length, orchestration_erreur: Boolean(orchestration.erreur), rapports_prepares: orchestration.rapports_prepares ?? 0 });
}
