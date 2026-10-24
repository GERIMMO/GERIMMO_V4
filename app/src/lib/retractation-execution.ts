import "server-only";
// LA RÉTRACTATION, DE LA DÉCLARATION ENREGISTRÉE À L'ACCUSÉ (plan de conformité du 23/10/2026, R01 et R37 ; relectures
// adverses du 24/10).
//
// Une déclaration est enregistrée AVANT toute écriture chez Stripe (action « Confirmer la rétractation »). Ce module la
// termine : exécution chez Stripe sous le verrou des gestes de facturation, consignée une fois, puis accusé, une fois.
// Il sert à deux appelants, sans rien doubler :
//  · l'action serveur, juste après l'enregistrement (le client est là, il voit l'issue) ;
//  · la tâche de nuit (relecture du 24/10, I4), qui reprend les déclarations restées en chemin — Stripe indisponible,
//    accusé non parti, client qui a fermé la page — et alerte le relais de celles qu'elle ne termine pas.
//
// Ce qui fait foi est ce qui est ENREGISTRÉ : le texte de la déclaration, sa date, son adresse d'accusé, et une fois
// l'exécution consignée, le montant remboursé et le sort du passage à l'annuel (relecture du 24/10, points 1 et 5).

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ArretSupervision } from "@/lib/controle-effets";
import { alerterRelaisContrat, envoyerAccuseRetractation, lireContexteCourrier, type ContexteCourrier } from "@/lib/courriers-contrat-envoi";
import type { NatureRetractation } from "@/lib/courriers-contrat";
import { REGIME_TVA } from "@/lib/editeur";
import { dateParis } from "@/lib/heure-paris-calcul";
import { retracterPassageAnnuel, retracterSouscription, type Remboursement } from "@/lib/retractation-stripe";
import { messageStripePourClient } from "@/lib/stripe";
import { choixExplicite } from "@/lib/stripe-offres";
import { formuleParCode, offreFormule, offreParticulier, type Offre } from "@/lib/tarifs";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";

type Service = SupabaseClient;

/** Une déclaration telle que `retractation_enregistrer` ou `retractations_a_terminer` la rend. */
export type DeclarationRetractation = {
  id: string;
  organization_id: string;
  subscription_id: string;
  nature: NatureRetractation;
  cle: string;
  passage_demande_le: string | null;
  texte_declaration: string;
  declaree_le: string;
  adresse_accuse: string;
  executee_le: string | null;
  montant_rembourse_cents: number | string;
  passage_effectue: boolean | null;
  accuse_envoye_le: string | null;
  nouvelle?: boolean;
};

export type IssueRetractation =
  | { etat: "terminee"; montantCents: number; passageEffectue: boolean; accuseDejaEnvoye: boolean; mensualiteCents: number | null }
  | { etat: "verrou"; erreur: string }
  | { etat: "execution_impossible"; erreur: string }
  | { etat: "accuse_impossible"; motif: string };

const COLONNES =
  "id, organization_id, subscription_id, nature, cle, passage_demande_le, texte_declaration, declaree_le, adresse_accuse, executee_le, montant_rembourse_cents, passage_effectue, accuse_envoye_le";

/** Une erreur dont le message est dit tel quel au client (pas une erreur du prestataire de paiement). */
class ErreurRetractation extends Error {}

/** L'offre mensuelle qui reprend après la rétractation d'un passage à l'annuel : même formule, même capacité. */
export function offreMensuelleDe(c: Pick<ContexteCourrier, "formule" | "unites_souscrites">): Offre {
  const formule = formuleParCode(c.formule);
  const capacite = c.unites_souscrites ?? formule?.biens ?? 1;
  return formule ? (offreFormule(formule, capacite, "mensuel") ?? offreParticulier(capacite, "mensuel")) : offreParticulier(capacite, "mensuel");
}

type Consignee = { executee_le: string; montant_rembourse_cents: number | string; passage_effectue: boolean | null; nouvelle: boolean };

/**
 * Terminer une déclaration enregistrée : exécution (si elle n'est pas consignée), puis accusé (s'il n'est pas parti).
 * `destinataire` : l'adresse saisie par le client présent (action) ; à défaut, celle de la déclaration (tâche de nuit).
 */
export async function terminerRetractation(
  service: Service,
  stripe: Stripe,
  d: DeclarationRetractation,
  options: { destinataire?: string; avantEffet?: () => Promise<void> } = {}
): Promise<IssueRetractation> {
  const contexte = await lireContexteCourrier(service, d.organization_id).catch((e: unknown) => {
    if (e instanceof ArretSupervision) throw e;
    return null;
  });
  if (!contexte) return { etat: "execution_impossible", erreur: "L'abonnement de cet espace n'a pas pu être lu." };
  const offreMensuelle = offreMensuelleDe(contexte);
  let ligne: DeclarationRetractation = d;

  if (!ligne.executee_le) {
    const verrou = await prendreVerrouFacturation(service, d.organization_id, d.nature === "abonnement" ? "resiliation" : "periodicite");
    if (!verrou.ok) return { etat: "verrou", erreur: verrou.erreur };
    try {
      // Relue sous le verrou : un autre passage (double clic, tâche de nuit) a pu la terminer entre-temps.
      const { data: relue } = await service.from("retractations_abonnement").select(COLONNES).eq("id", d.id).maybeSingle();
      if (relue) ligne = { ...ligne, ...(relue as Partial<DeclarationRetractation>) };
      if (!ligne.executee_le) {
        const sous = verrou.proteger(stripe);
        let execution: { montantCents: number; refunds: Remboursement[]; passageEffectue?: boolean };
        if (d.nature === "abonnement") {
          execution = await retracterSouscription(sous, { subscription: d.subscription_id, cle: d.cle });
        } else {
          if (!REGIME_TVA) throw new ErreurRetractation("Le régime de TVA de l'éditeur manque : écrivez-nous, nous terminons la rétractation.");
          if (!d.passage_demande_le) throw new ErreurRetractation("La demande de passage à l'annuel visée est inconnue.");
          const s = await sous.subscriptions.retrieve(d.subscription_id);
          execution = await retracterPassageAnnuel(sous, {
            subscription: d.subscription_id,
            cle: d.cle,
            orgId: d.organization_id,
            offreMensuelle,
            regime: REGIME_TVA,
            demandeLe: new Date(d.passage_demande_le),
            choix: choixExplicite(s) ? "explicite" : "auto",
          });
          // Relecture adverse du 24/10 (point 2) : tant que l'échéancier n'est pas préparé, retirer le passage programmé
          // en base est le SEUL geste effectif de la rétractation. Son échec se dit, il ne passe pas pour un succès.
          if (!execution.passageEffectue) {
            const { error } = await service.rpc("retractation_passage_annuel_annuler", { p_org: d.organization_id });
            if (error) throw new ErreurRetractation("Le passage programmé à l'annuel n'a pas pu être retiré.");
          }
        }
        const { data: consignee, error: erreurConsigne } = await service.rpc("retractation_executee", {
          p_id: d.id,
          p_montant_cents: execution.montantCents,
          p_refunds: execution.refunds,
          p_passage_effectue: d.nature === "passage_annuel" ? Boolean(execution.passageEffectue) : null,
        });
        const c = ((consignee ?? []) as Consignee[])[0];
        if (erreurConsigne || !c) {
          // Exécutée mais non consignée : l'accusé part avec ce que Stripe a rendu ; la reprise de nuit rejouera
          // l'exécution (idempotente chez Stripe) pour la consigner.
          console.error("[rétractation] exécution non consignée :", (erreurConsigne?.message ?? "réponse vide").slice(0, 200));
          ligne = {
            ...ligne,
            montant_rembourse_cents: execution.montantCents,
            passage_effectue: d.nature === "passage_annuel" ? Boolean(execution.passageEffectue) : null,
          };
        } else {
          // Une exécution déjà consignée par un autre passage l'emporte (point 5) : c'est elle que l'accusé annonce.
          ligne = { ...ligne, executee_le: c.executee_le, montant_rembourse_cents: c.montant_rembourse_cents, passage_effectue: c.passage_effectue };
        }
      }
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      await service.from("tech_log").insert({
        evenement: "retractation_a_terminer",
        details: { organisation: d.organization_id, retractation: d.id, nature: d.nature },
      });
      return { etat: "execution_impossible", erreur: e instanceof ErreurRetractation ? e.message : messageStripePourClient(e) };
    } finally {
      await verrou.rendre();
    }
  }

  const montantCents = Number(ligne.montant_rembourse_cents) || 0;
  const passageEffectue = d.nature === "passage_annuel" && Boolean(ligne.passage_effectue);
  const mensualiteCents = passageEffectue ? offreMensuelle.montantCents : null;
  if (ligne.accuse_envoye_le) return { etat: "terminee", montantCents, passageEffectue, accuseDejaEnvoye: true, mensualiteCents };

  const aujourdhui = dateParis(new Date());
  const essaiFin = d.nature === "abonnement" && contexte.essai_fin && contexte.essai_fin >= aujourdhui ? contexte.essai_fin : null;
  const accuse = await envoyerAccuseRetractation(
    service,
    {
      retractationId: d.id,
      cle: d.cle,
      destinataire: options.destinataire ?? d.adresse_accuse,
      nature: d.nature,
      organisation: contexte.organisation,
      declaration: ligne.texte_declaration,
      declareeLe: new Date(ligne.declaree_le),
      montantRembourseCents: montantCents,
      essaiFin,
      passageEffectue,
      mensualiteCents,
    },
    { avantEffet: options.avantEffet }
  ).catch((e: unknown) => {
    if (e instanceof ArretSupervision) throw e;
    return { envoye: false, motif: "envoi impossible" };
  });
  if (!accuse.envoye) return { etat: "accuse_impossible", motif: accuse.motif ?? "envoi impossible" };
  return { etat: "terminee", montantCents, passageEffectue, accuseDejaEnvoye: false, mensualiteCents };
}

/**
 * La reprise de nuit (relecture adverse du 24/10, I4) : chaque déclaration restée en chemin est terminée ; celles qui
 * ne le sont pas restent dues (elles repasseront) et le relais est alerté, une fois par jour.
 */
export async function reprendreRetractations(
  service: Service,
  stripe: Stripe,
  avantEffet?: () => Promise<void>
): Promise<{ terminees: number; echecs: string[] }> {
  const bilan = { terminees: 0, echecs: [] as string[] };
  const { data, error } = await service.rpc("retractations_a_terminer", { p_limite: 20 });
  if (error) {
    bilan.echecs.push("lecture des rétractations à terminer impossible");
  } else {
    for (const d of (data ?? []) as DeclarationRetractation[]) {
      try {
        const issue = await terminerRetractation(service, stripe, d, { avantEffet });
        if (issue.etat === "terminee") bilan.terminees += 1;
        else bilan.echecs.push(`rétractation ${d.id} (organisation ${d.organization_id}) : ${issue.etat === "accuse_impossible" ? `accusé non parti, ${issue.motif}` : issue.erreur}`);
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        bilan.echecs.push(`rétractation ${d.id} (organisation ${d.organization_id}) : ${e instanceof Error ? e.message.slice(0, 160) : "reprise impossible"}`);
      }
    }
  }
  if (bilan.echecs.length > 0) {
    await alerterRelaisContrat(
      service,
      {
        evenement: "retractations_non_terminees",
        sujet: "Gerimmo — rétractations à terminer à la main",
        lignes: [
          "Des rétractations enregistrées n'ont pas pu être terminées par la reprise de nuit (exécution chez Stripe ou accusé de réception). Le remboursement est dû au plus tard quatorze jours après la déclaration.",
          ...bilan.echecs,
        ],
        cle: `retractations-non-terminees-${dateParis(new Date())}`,
        details: { echecs: bilan.echecs.slice(0, 20) },
      },
      { avantEffet }
    ).catch((e: unknown) => {
      if (e instanceof ArretSupervision) throw e;
      return 0;
    });
  }
  return bilan;
}
