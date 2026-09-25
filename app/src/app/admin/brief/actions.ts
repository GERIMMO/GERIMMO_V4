"use server";

import { createClient } from "@/lib/supabase/server";
import { extraireAnalyseBrief, FORMAT_BRIEF_IA, type AnalyseBrief } from "@/lib/brief-ia";
import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { genererPointsDuMatin } from "@/lib/point-du-matin";
import { deciderAmelioration } from "@/app/actions/autonomie";
import { publierPublication, refuserPublication } from "@/app/actions/publications";
import { traiterInscriptionArtisan } from "@/app/actions/supervision-artisans";

export type EtatBriefIA = { erreur?: string; analyse?: AnalyseBrief; genereLe?: string };

export async function analyserBriefIA(): Promise<EtatBriefIA> {
  const supabase = await createClient();
  const { data: estSuperAdmin, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || !estSuperAdmin) return { erreur: "Accès réservé à la supervision." };

  const cle = process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim();
  if (!cle) return { erreur: "Le service d’intelligence artificielle doit être connecté pour activer cette analyse." };

  const [bugsN1, bugs, idees, devis, propositions, organisations, alertesCritiques, alertes] = await Promise.all([
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "idee").in("etat", ["nouveau", "en_examen"]),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id", { count: "exact", head: true }).in("statut", ["proposition", "brouillon"]),
    supabase.from("organizations").select("id", { count: "exact", head: true }).in("status", ["active", "essai"]),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte").eq("criticite", "critique"),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte"),
  ]);
  const lectures = [bugsN1, bugs, idees, devis, propositions, organisations, alertesCritiques, alertes];
  if (lectures.some((resultat) => resultat.error || resultat.count === null)) {
    return { erreur: "Certaines données de pilotage sont indisponibles. L'analyse IA est reportée pour éviter une recommandation trompeuse." };
  }

  // Aucun titre, description, adresse, courriel, contenu de document ou
  // donnée de personne n'est envoyé à l'API. Le modèle ne reçoit que huit
  // compteurs et la date, sans outil de lecture ou d'écriture dans Gerimmo.
  const donnees = {
    date: new Date().toISOString().slice(0, 10),
    bugs_critiques_ouverts: bugsN1.count,
    bugs_ouverts: bugs.count,
    idees_a_examiner: idees.count,
    demandes_de_devis_en_attente: devis.count,
    propositions_editoriales: propositions.count,
    organisations_actives_ou_en_essai: organisations.count,
    alertes_critiques_ouvertes: alertesCritiques.count,
    alertes_ouvertes: alertes.count,
  };
  try {
    const reponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_BRIEF_MODEL?.trim() || "gpt-5.6-luna",
        store: false,
        max_output_tokens: 650,
        instructions: "Tu aides le fondateur de Gerimmo à choisir UNE prochaine action. Les données sont des compteurs agrégés ; ne prétends connaître ni la cause d'un bug, ni le revenu, ni les concurrents, ni l'état de production. Donne priorité aux alertes critiques et aux bugs critiques avant la croissance. Une alerte critique n'est pas un bug logiciel : distingue ces deux files. Énonce clairement les données manquantes et propose une vérification humaine. Tu ne peux déclencher aucune action, modifier aucun dossier ou décider d'une dépense. Réponds en français, de manière concise.",
        input: JSON.stringify(donnees),
        text: { format: FORMAT_BRIEF_IA },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!reponse.ok) return { erreur: reponse.status === 401 ? "La connexion au service d’intelligence artificielle doit être rétablie." : "L'analyse IA est momentanément indisponible. Réessayez plus tard." };
    const analyse = extraireAnalyseBrief(await reponse.json());
    if (!analyse) return { erreur: "La réponse de l'IA n'a pas le format attendu. Aucun résultat n'a été retenu." };
    return { analyse, genereLe: new Date().toISOString() };
  } catch {
    return { erreur: "L'analyse IA n'a pas abouti. Les données du brief restent accessibles sans elle." };
  }
}

// ── Le point du matin (25/09) ───────────────────────────────────────────────

export type EtatDecision = { erreur?: string; succes?: string };

async function superviseurPermanent() {
  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("is_permanent_super_admin");
  return { supabase, ok: !error && ok === true };
}

/** « Préparer le point maintenant » : la même génération que la fin d'un passage, sous les droits du superviseur. */
export async function preparerPointDuMatin(): Promise<EtatDecision> {
  const { supabase, ok } = await superviseurPermanent();
  if (!ok) return { erreur: "Cette action demande votre compte de supervision et sa double vérification." };
  const resultat = await genererPointsDuMatin(supabase);
  revalidatePath("/admin/brief");
  if (resultat.erreur) return { erreur: resultat.erreur };
  return { succes: "Le point de ce matin est prêt." };
}

export async function marquerPointLu(id: string): Promise<void> {
  const { supabase, ok } = await superviseurPermanent();
  if (ok) await supabase.rpc("marquer_point_lu", { p_id: id });
}

type Decision = { id: string; source: string; source_id: string | null; statut: string; cle: string };

/** Applique l'effet métier par les actions et fonctions existantes (leurs gardes restent), puis trace la décision dans le point. */
export async function deciderDecisionDuMatin(id: string, validee: boolean, motif: string, attestation = false): Promise<EtatDecision> {
  const { supabase, ok } = await superviseurPermanent();
  if (!ok) return { erreur: "Cette décision demande votre compte de supervision et sa double vérification." };
  motif = motif.trim().slice(0, 1000);
  if (!validee && motif.length < 3) return { erreur: "Dites pourquoi : le motif est conservé avec le refus." };
  const { data: decision, error } = await supabase.from("decisions_du_matin").select("id,source,source_id,statut,cle").eq("id", id).maybeSingle<Decision>();
  if (error || !decision) return { erreur: "Cette décision est introuvable." };
  if (decision.statut !== "en_attente") return { erreur: "Cette décision est déjà tranchée." };
  if (!decision.source_id) return { erreur: "Cette décision se prend sur son écran." };

  let effet: EtatDecision;
  switch (decision.source) {
    case "developpement": {
      const { data: p } = await supabase.from("development_proposals").select("revision").eq("id", decision.source_id).maybeSingle();
      if (!p?.revision) return { erreur: "Aucune version précise n’est attachée : ouvrez le suivi des évolutions." };
      effet = await deciderAmelioration(decision.source_id, p.revision, validee);
      break;
    }
    case "publication": {
      if (validee) {
        const { data: pub } = await supabase.from("publications").select("corps").eq("id", decision.source_id).maybeSingle();
        if (!pub?.corps || pub.corps.trim().length < 200 || pub.corps.includes("[[")) return { erreur: "Le texte n’est pas complet : relisez-le dans l’éditeur avant de le faire paraître." };
        effet = await publierPublication(decision.source_id);
      } else {
        const fd = new FormData(); fd.set("motif", motif);
        effet = await refuserPublication(decision.source_id, {}, fd);
      }
      break;
    }
    case "artisan": {
      const fd = new FormData();
      fd.set("operation", validee ? "validation" : "refus");
      if (validee) { if (!attestation) return { erreur: "Confirmez avoir relu les justificatifs avant de valider l’inscription." }; fd.set("pieces_relues", "oui"); }
      else fd.set("motif", motif);
      effet = await traiterInscriptionArtisan(decision.source_id, {}, fd);
      break;
    }
    case "retour": {
      const { data: r } = await supabase.from("retours_utilisateurs").select("nature,gravite,version,etat").eq("id", decision.source_id).maybeSingle();
      if (!r) return { erreur: "Ce retour est introuvable." };
      const idee = r.nature === "idee";
      if (!validee && !idee) return { erreur: "Un bug ne se refuse pas depuis le point : traitez-le sur l’écran des retours." };
      const reponse = motif.length >= 5 ? motif : validee ? (idee ? "Votre idée est retenue par l’équipe Gerimmo. Nous vous tiendrons informé de sa mise en place." : "Votre signalement est pris en charge par l’équipe Gerimmo.") : motif;
      const reexamen = new Date(); reexamen.setMonth(reexamen.getMonth() + 6);
      const { error: e } = await supabase.rpc("traiter_retour", { p_retour: decision.source_id, p_version: r.version, p_etat: validee ? (idee ? "retenue" : "en_cours") : "non_retenue", p_gravite: r.gravite, p_reponse: reponse, p_reexamen: validee ? null : reexamen.toISOString().slice(0, 10) });
      effet = e ? { erreur: sansJargon(e.message) } : { succes: validee ? "Le retour est pris en charge et l’auteur en est informé." : "L’idée n’est pas retenue ; elle sera réexaminée dans six mois." };
      revalidatePath("/admin/retours");
      break;
    }
    case "veille": {
      const { data: v } = await supabase.from("regulatory_watch").select("etude,resume,action_conseillee,publics,application_le").eq("id", decision.source_id).maybeSingle();
      if (!v) return { erreur: "Cette information est introuvable." };
      const etude = (v.etude ?? {}) as { resume?: string; action?: string; publics?: string[]; application?: string | null };
      const { error: e } = await supabase.rpc("decider_veille", { p_id: decision.source_id, p_publier: validee, p_resume: v.resume ?? etude.resume ?? "", p_action: v.action_conseillee ?? etude.action ?? "", p_publics: v.publics?.length ? v.publics : etude.publics ?? [], p_application: v.application_le ?? etude.application ?? null });
      effet = e ? { erreur: "L’étude n’est pas complète : relisez-la sur l’écran de la veille." } : { succes: validee ? "L’information est diffusée aux utilisateurs concernés." : "L’information est écartée." };
      revalidatePath("/admin/veille"); revalidatePath("/veille");
      break;
    }
    default:
      return { erreur: "Cette décision se prend sur son écran." };
  }
  if (effet.erreur) return effet;
  const { error: trace } = await supabase.rpc("decider_point_du_matin", { p_id: id, p_validee: validee, p_motif: motif || null });
  revalidatePath("/admin/brief");
  if (trace) return { succes: `${effet.succes ?? "Décision appliquée."} Sa trace dans le point doit être vérifiée.` };
  return { succes: effet.succes ?? (validee ? "Décision validée." : "Décision refusée.") };
}
