"use server";

import { createClient } from "@/lib/supabase/server";
import { extraireAnalyseBrief, FORMAT_BRIEF_IA, type AnalyseBrief } from "@/lib/brief-ia";

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
