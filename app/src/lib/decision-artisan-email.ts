// LES MOTIFS D'UN REFUS OU D'UNE SUSPENSION, ENVOYÉS À L'ARTISAN (audit palier 1 du 22/11/2026, P1-16).
//
// Les conditions de l'espace artisan (article A10) disent que Gerimmo « communique les motifs par courriel, au plus
// tard quand la mesure prend effet ». Le motif était visible dans l'espace de l'artisan, mais aucun e-mail ne partait.
//
// Ici : le texte de l'e-mail, écrit une seule fois, et son envoi. L'e-mail ne dit QUE ce que le superviseur a écrit :
// la décision, sa date, son motif mot pour mot. Aucune règle n'est citée, aucune promesse n'est ajoutée.
// La base refait la preuve juste avant l'envoi (migration 20261122210000) : décision la plus récente de cet artisan,
// pas encore notifiée, adresse de sa fiche. Un échec d'envoi n'annule jamais la décision : il est dit à l'écran.

import type { SupabaseClient } from "@supabase/supabase-js";
import { empreinteCourriel } from "@/lib/courriels-durables";
import { envoyerEmail } from "@/lib/email";
import { clientDeService } from "@/lib/supabase/service";
import { particuleDe } from "@/lib/elision";
import { echapperHtml } from "@/lib/quittance-email";
import { adresseDuSite } from "@/lib/site";

export type DecisionNotifiee = "refus" | "suspension";
export const DECISIONS_NOTIFIEES: readonly DecisionNotifiee[] = ["refus", "suspension"];

export type MotifsDecisionArtisan = {
  decision: DecisionNotifiee;
  raisonSociale: string;
  motif: string;
  /** Date et heure de la décision (ISO). */
  decideLe: string;
  /** Adresse du site, pour le lien vers l'espace artisan ; absente : pas de lien. */
  site: string | null;
};

export function sujetDecisionArtisan(decision: DecisionNotifiee): string {
  return decision === "refus" ? "Votre inscription sur Gerimmo n’a pas été retenue" : "Votre inscription sur Gerimmo est suspendue";
}

const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

export function corpsDecisionArtisan(m: MotifsDecisionArtisan): string {
  const nom = m.raisonSociale.trim();
  const entreprise = echapperHtml(nom || "votre entreprise");
  // « de l'inscription de Durand Plomberie », « d'Atelier Martin » : l'élision suit le nom tel qu'il est écrit.
  const de = particuleDe(nom || "votre entreprise");
  const annonce = m.decision === "refus"
    ? `Votre demande d’inscription au réseau d’artisans de Gerimmo pour <strong>${entreprise}</strong> a été examinée le ${jour(m.decideLe)}. Elle n’a pas été retenue.`
    : `La validation de l’inscription ${de}<strong>${entreprise}</strong> au réseau d’artisans de Gerimmo est suspendue depuis le ${jour(m.decideLe)}. Tant que cette suspension dure, vous n’êtes plus proposé pour de nouvelles demandes.`;
  // Le motif est celui du superviseur, mot pour mot ; ses retours à la ligne sont gardés.
  const motif = echapperHtml(m.motif.trim()).replace(/\r?\n/g, "<br>");
  const espace = m.site
    ? `<p>Ce motif figure aussi dans votre espace artisan, rubrique « Mon entreprise » : <a href="${echapperHtml(m.site)}/artisan/entreprise">${echapperHtml(m.site)}/artisan/entreprise</a>.</p>`
    : "<p>Ce motif figure aussi dans votre espace artisan, rubrique « Mon entreprise ».</p>";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1c2333">
<p>Bonjour,</p>
<p>${annonce}</p>
<p style="margin-bottom:4px"><strong>Motif communiqué par Gerimmo :</strong></p>
<blockquote style="margin:0 0 16px 0;padding:8px 12px;border-left:3px solid #c8ccd6;color:#1c2333">${motif}</blockquote>
<p>Vous pouvez répondre à cette décision et demander un réexamen : depuis votre espace artisan, rubrique « Mon entreprise », lien « Contactez Gerimmo ».</p>
${espace}
<p style="color:#5b6478">L’équipe Gerimmo</p>
</div>`;
}

/** Au-delà, on ne réessaie plus seul : cinq refus définitifs du service d'envoi demandent un regard humain. */
export const ESSAIS_MAX_MOTIFS = 5;
/** La clé d'un essai. Le premier porte l'identité de la décision ; un essai suivant a sa propre clé. */
export const cleEssaiMotifs = (decision: string, essai: number) => essai <= 1 ? `decision-artisan/${decision}` : `decision-artisan/${decision}/essai-${essai}`;

/**
 * La clé sous laquelle (ré)essayer l'envoi. Le suivi durable des e-mails ne réémet jamais sous une clé dont l'essai
 * s'est soldé par un REFUS DÉFINITIF du service d'envoi (« échec » : rien n'est parti) : sans nouvelle clé, « Renvoyer »
 * ne pourrait jamais aboutir. On ne passe à l'essai suivant QUE dans ce cas. Un essai en cours, en attente de reprise
 * ou d'issue incertaine garde sa clé : le suivi durable refuse alors tout nouvel envoi, et il n'y a jamais de doublon.
 * Dans le doute (suivi illisible), la même clé. `null` : cinq refus définitifs.
 */
async function cleDuProchainEssai(decision: string, adresse: string): Promise<string | null> {
  const service = clientDeService();
  for (let essai = 1; essai <= ESSAIS_MAX_MOTIFS; essai++) {
    const cle = cleEssaiMotifs(decision, essai);
    if (!service) return cle;
    // Même identité que le suivi durable : espace (aucun), clé, adresse en minuscules.
    const id = empreinteCourriel(JSON.stringify([null, cle, adresse.trim().toLowerCase()]));
    const { data, error } = await service.from("courriels_durables").select("etat").eq("id", id).maybeSingle();
    if (error || !data || (data as { etat?: string }).etat !== "echec") return cle;
  }
  return null;
}

export type RetourEnvoiMotifs =
  | { envoye: true }
  | { envoye: false; raison: "sans_decision" | "sans_adresse" | "deja_notifiee" | "echec"; detail?: string };

/**
 * Envoie à l'artisan les motifs de SA DERNIÈRE décision, si c'est un refus ou une suspension pas encore notifié.
 * `db` : le client du superviseur connecté (il lit les décisions et la fiche de l'artisan par ses propres droits).
 * Ne lève jamais : la décision est déjà enregistrée, l'appelant dit seulement ce qu'il en est de l'e-mail.
 */
export async function envoyerMotifsDecisionArtisan(db: Pick<SupabaseClient, "from">, artisanId: string): Promise<RetourEnvoiMotifs> {
  try {
    const [{ data: decision, error: erreurDecision }, { data: artisan, error: erreurArtisan }] = await Promise.all([
      db.from("artisan_validations").select("id, decision, motif, created_at, notifie_le").eq("artisan_id", artisanId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
      db.from("artisans").select("raison_sociale, email").eq("id", artisanId).maybeSingle(),
    ]);
    if (erreurDecision || erreurArtisan) return { envoye: false, raison: "echec", detail: "La décision n’a pas pu être relue." };
    if (!decision || !artisan || !(DECISIONS_NOTIFIEES as readonly string[]).includes(String(decision.decision)) || !String(decision.motif ?? "").trim()) {
      return { envoye: false, raison: "sans_decision" };
    }
    if (decision.notifie_le) return { envoye: false, raison: "deja_notifiee" };
    const adresse = String(artisan.email ?? "").trim();
    if (!adresse) return { envoye: false, raison: "sans_adresse" };
    const cle = await cleDuProchainEssai(String(decision.id), adresse);
    if (!cle) return { envoye: false, raison: "echec", detail: "Le service d’envoi a refusé cet e-mail plusieurs fois." };
    const envoi = await envoyerEmail({
      circuit: "lib/decision-artisan-email",
      to: adresse,
      subject: sujetDecisionArtisan(decision.decision as DecisionNotifiee),
      html: corpsDecisionArtisan({
        decision: decision.decision as DecisionNotifiee, raisonSociale: String(artisan.raison_sociale ?? ""), motif: String(decision.motif),
        decideLe: String(decision.created_at), site: adresseDuSite(),
      }),
      // Une clé par essai (voir plus haut). Deux essais ne peuvent pas partir tous les deux : la base ne prouve plus
      // une décision déjà notifiée.
      cleIdempotence: cle,
      contexteMetier: { type: "decision_artisan", id: String(decision.id) },
    });
    if (envoi.erreur) return { envoye: false, raison: "echec", detail: envoi.erreur };
    return { envoye: true };
  } catch {
    return { envoye: false, raison: "echec" };
  }
}

/** Ce que l'écran du superviseur dit de l'e-mail, après une décision ou un nouvel essai. */
export function phraseEnvoiMotifs(r: RetourEnvoiMotifs): string {
  if (r.envoye) return "Les motifs ont été envoyés à l’artisan par e-mail.";
  if (r.raison === "deja_notifiee") return "Les motifs de cette décision ont déjà été envoyés à l’artisan par e-mail.";
  if (r.raison === "sans_adresse") return "Aucun e-mail n’est parti : la fiche de l’artisan n’a pas d’adresse e-mail. Il lit le motif dans son espace.";
  if (r.raison === "sans_decision") return "Aucun e-mail à envoyer : la dernière décision n’est ni un refus ni une suspension.";
  return "L’e-mail des motifs n’est pas parti. L’artisan lit le motif dans son espace ; vous pouvez renvoyer l’e-mail depuis sa fiche.";
}
