// LES ENVOIS DES COURRIERS DU CONTRAT (plan de conformité du 23/10/2026, lots 1B et 1C).
//
// Client de service seulement (webhook Stripe, tâche de nuit, actions serveur APRÈS la vérification des droits du
// responsable). Chaque courrier part UNE fois :
//  · une clé d'idempotence stable chez le prestataire d'e-mail (deux chemins presque simultanés n'envoient qu'un
//    message) ;
//  · une marque en base, posée APRÈS l'envoi réussi, que les deux chemins relisent avant d'envoyer ;
//  · une preuve au journal d'audit, écrite par la fonction qui pose la marque (identifiant du message, jamais l'adresse).
// Un échec ne fait jamais échouer le webhook : la confirmation est rattrapée par la tâche de nuit, l'accusé de
// résiliation par le second chemin, et l'échec est rendu à l'appelant.
//
// Gabarits : lib/courriers-contrat.ts (purs, testés).

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ArretSupervision } from "@/lib/controle-effets";
import { lireVersionArchivee } from "@/lib/conditions-versions";
import {
  courrierAccuseResiliation,
  courrierAccuseRetractation,
  courrierConfirmationSouscription,
  type AccuseRetractation,
} from "@/lib/courriers-contrat";
import { envoyerEmail } from "@/lib/email";
import { CONDITIONS_VERSION, REGIME_TVA } from "@/lib/editeur";
import { identiteDepuisValeurs } from "@/lib/identite-editeur";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { courrierResiliationImpaye, type FacturesAnnulees } from "@/lib/relance-paiement-email";
import { adresseDuSite } from "@/lib/site";
import { formuleParCode, type Periodicite } from "@/lib/tarifs";
import { dateParis } from "@/lib/heure-paris-calcul";

type Service = SupabaseClient;

/** Ce que `abonnement_courrier_contexte` rend. */
export type ContexteCourrier = {
  organization_id: string;
  organisation: string;
  public_tarif: "agence" | "proprietaire_direct";
  grille: string | null;
  destinataire: string | null;
  nom_titulaire: string | null;
  stripe_subscription_id: string | null;
  stripe_statut: string | null;
  souscrit_le: string | null;
  periode_fin: string | null;
  essai_fin: string | null;
  formule: string | null;
  unites_souscrites: number | null;
  periodicite: Periodicite;
  montant_periode_cents: number | string | null;
  confirmation_envoyee_le: string | null;
  resiliation_accusee_pour: string | null;
  cgu_version: string | null;
  cgu_acceptee_le: string | null;
};

export async function lireContexteCourrier(service: Service, orgId: string): Promise<ContexteCourrier | null> {
  const { data, error } = await service.rpc("abonnement_courrier_contexte", { p_org: orgId });
  if (error) throw new Error("Le contexte du courrier n'a pas pu être lu.");
  return ((data ?? []) as ContexteCourrier[])[0] ?? null;
}

/** L'identité de l'éditeur telle que les pages légales l'affichent (code recouvert par la saisie). */
export async function lireEditeurService(service: Service): Promise<Record<string, string | null>> {
  const { data, error } = await service.from("supervision_identite").select("valeurs").eq("singleton", true).maybeSingle();
  return identiteDepuisValeurs(error ? null : (data as { valeurs?: unknown } | null)?.valeurs);
}

function lienAbonnement(base: string): string | null {
  const site = adresseDuSite();
  return site ? `${site}${base}/abonnement` : null;
}

async function tracer(service: Service, evenement: string, details: Record<string, unknown>): Promise<void> {
  const { error } = await service.from("tech_log").insert({ evenement, details });
  if (error) console.error(`[${evenement}] trace non écrite :`, error.message.slice(0, 200));
}

// ── R03 : la confirmation de la souscription ──────────────────────────────────────────────────────────────────

/** Le PDF d'une version archivée des conditions, ou null (version non archivée, rendu impossible, délai dépassé). */
export type RenduPdf = (html: string, titre: string) => Promise<Uint8Array>;

async function renduParDefaut(html: string, titre: string): Promise<Uint8Array> {
  const { rendrePdf } = await import("@/lib/documents/rendu");
  return rendrePdf({ html, piedHtml: "<span></span>", titreDocument: titre, reference: titre, empreinte: "", manquants: [] });
}

export async function pdfDesConditions(
  service: Service,
  version: string,
  options: { rendu?: RenduPdf; delaiMs?: number } = {}
): Promise<{ nom: string; contenuBase64: string } | null> {
  const archivee = await lireVersionArchivee(service, "conditions_clients", version);
  if (!archivee) return null;
  const titre = `Conditions générales d'utilisation et de vente — version du ${version}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>${titre}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:10.5pt;line-height:1.5;color:#111;padding:36pt 48pt}
h1,h2,h3{font-family:Arial,sans-serif;color:#12263f}a{color:#12263f}</style></head>
<body><p style="font-size:8pt;color:#555">Version archivée le ${archivee.publiee_le.slice(0, 10)} — empreinte SHA-256 ${archivee.empreinte_sha256}</p>
${archivee.texte_html}</body></html>`;
  const delai = options.delaiMs ?? 10_000;
  try {
    const octets = await Promise.race([
      (options.rendu ?? renduParDefaut)(html, titre),
      new Promise<never>((_, refuser) => setTimeout(() => refuser(new Error("délai dépassé")), delai)),
    ]);
    return { nom: `conditions-generales-${version}.pdf`, contenuBase64: Buffer.from(octets).toString("base64") };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return null;
  }
}

export type ResultatEnvoi = { envoye: boolean; motif?: string };

/**
 * R03 : la confirmation de la souscription, avec le PDF de la version acceptée (ou, à défaut, son adresse et une trace
 * au journal technique). Décision du dirigeant du 23/10 : elle part même sans médiateur saisi.
 * `premierPrelevementLe` : la fin de l'essai Stripe si elle existe, sinon la souscription elle-même.
 */
export async function envoyerConfirmationSouscription(
  service: Service,
  p: { orgId: string; subscription: string; premierPrelevementLe: Date | null },
  options: { avantEffet?: () => Promise<void>; rendu?: RenduPdf; delaiPdfMs?: number } = {}
): Promise<ResultatEnvoi> {
  const c = await lireContexteCourrier(service, p.orgId);
  if (!c || c.stripe_subscription_id !== p.subscription) return { envoye: false, motif: "souscription non suivie" };
  if (c.confirmation_envoyee_le) return { envoye: false, motif: "déjà envoyée" };
  if (!c.souscrit_le) return { envoye: false, motif: "souscription non datée" };
  if (!c.destinataire) return { envoye: false, motif: "sans adresse" };
  if (c.montant_periode_cents === null) return { envoye: false, motif: "montant inconnu" };
  const editeur = await lireEditeurService(service);
  const version = c.cgu_version ?? null;
  const pdf = version ? await pdfDesConditions(service, version, { rendu: options.rendu, delaiMs: options.delaiPdfMs }) : null;
  const site = adresseDuSite();
  const lien = !site
    ? null
    : version && version !== CONDITIONS_VERSION
      ? `${site}/conditions/versions/conditions_clients/${encodeURIComponent(version)}`
      : `${site}/conditions`;
  if (!pdf) await tracer(service, "confirmation_sans_pdf", { organisation: c.organization_id, souscription: p.subscription, version });
  const souscritLe = new Date(c.souscrit_le);
  const biens = c.unites_souscrites ?? formuleParCode(c.formule)?.biens ?? null;
  const courrier = courrierConfirmationSouscription({
    nom: c.nom_titulaire,
    organisation: c.organisation,
    estAgence: c.public_tarif === "agence",
    souscritLe,
    formule: c.formule,
    biens,
    periodicite: c.periodicite,
    montantCents: Number(c.montant_periode_cents),
    regime: REGIME_TVA,
    premierPrelevementLe: p.premierPrelevementLe ?? souscritLe,
    editeur,
    conditions: version && c.cgu_acceptee_le ? { version, accepteeLe: new Date(c.cgu_acceptee_le) } : null,
    pdfJoint: Boolean(pdf),
    lienConditions: lien,
  });
  await options.avantEffet?.();
  const { erreur, id } = await envoyerEmail({
    avantEnvoi: options.avantEffet,
    to: c.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `souscription-${p.subscription}`,
    ...(pdf ? { piecesJointes: [pdf] } : {}),
  });
  if (erreur) return { envoye: false, motif: erreur };
  await service.rpc("abonnement_confirmation_envoyee", {
    p_org: c.organization_id,
    p_subscription: p.subscription,
    p_message: id ?? null,
    p_piece_jointe: Boolean(pdf),
  });
  return { envoye: true };
}

/** Le rattrapage de nuit des confirmations : souscriptions du dernier mois, jamais confirmées. */
export async function envoyerConfirmationsDues(
  service: Service,
  stripe: Stripe,
  avantEffet?: () => Promise<void>
): Promise<{ envoyees: number; echecs: string[] }> {
  const bilan = { envoyees: 0, echecs: [] as string[] };
  const { data, error } = await service.rpc("abonnements_confirmation_dues", { p_limite: 50 });
  if (error) {
    bilan.echecs.push("lecture des confirmations impossible");
    return bilan;
  }
  for (const l of (data ?? []) as { organization_id: string; stripe_subscription_id: string }[]) {
    try {
      const s = await stripe.subscriptions.retrieve(l.stripe_subscription_id);
      const r = await envoyerConfirmationSouscription(
        service,
        { orgId: l.organization_id, subscription: l.stripe_subscription_id, premierPrelevementLe: premierPrelevement(s) },
        { avantEffet }
      );
      if (r.envoye) bilan.envoyees += 1;
      else if (r.motif !== "déjà envoyée") bilan.echecs.push(`${l.organization_id} : ${r.motif}`);
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      bilan.echecs.push(`${l.organization_id} : ${e instanceof Error ? e.message.slice(0, 120) : "confirmation impossible"}`);
    }
  }
  return bilan;
}

/** La date du premier prélèvement : la fin de l'essai Stripe si elle est à venir à la souscription, sinon la souscription. */
export function premierPrelevement(s: Pick<Stripe.Subscription, "trial_end" | "start_date">): Date | null {
  if (typeof s.trial_end === "number" && s.trial_end > (s.start_date ?? 0)) return new Date(s.trial_end * 1000);
  return typeof s.start_date === "number" ? new Date(s.start_date * 1000) : null;
}

// ── R04 : l'accusé de la résiliation ──────────────────────────────────────────────────────────────────────────

/**
 * R04 : l'accusé de la résiliation, UN par fin de période, que l'appel vienne de la page (action) ou du webhook. La
 * clé du prestataire (`resiliation-{souscription}-{fin, jour de Paris}`) couvre deux envois presque simultanés ; la
 * marque en base (`resiliation_accusee_pour`) couvre le reste.
 */
export async function envoyerAccuseResiliation(
  service: Service,
  p: {
    orgId: string;
    subscription: string;
    periodeFin: Date;
    notifieeLe: Date;
    chemin: "action" | "webhook";
    /** L'adresse choisie sur la page ; à défaut, l'adresse de facturation. */
    destinataire?: string | null;
  },
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi> {
  const c = await lireContexteCourrier(service, p.orgId);
  if (!c || c.stripe_subscription_id !== p.subscription) return { envoye: false, motif: "souscription non suivie" };
  if (c.resiliation_accusee_pour && dateParis(new Date(c.resiliation_accusee_pour)) === dateParis(p.periodeFin)) {
    return { envoye: false, motif: "déjà accusée" };
  }
  const to = p.destinataire?.trim() || c.destinataire;
  if (!to) return { envoye: false, motif: "sans adresse" };
  const courrier = courrierAccuseResiliation({
    organisation: c.organisation,
    formule: c.formule,
    estAgence: c.public_tarif === "agence",
    notifieeLe: p.notifieeLe,
    periodeFin: p.periodeFin,
  });
  await options.avantEffet?.();
  const { erreur, id } = await envoyerEmail({
    avantEnvoi: options.avantEffet,
    to,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `resiliation-${p.subscription}-${dateParis(p.periodeFin)}`,
  });
  if (erreur) return { envoye: false, motif: erreur };
  await service.rpc("abonnement_resiliation_accusee", {
    p_org: c.organization_id,
    p_subscription: p.subscription,
    p_periode_fin: p.periodeFin.toISOString(),
    p_message: id ?? null,
    p_chemin: p.chemin,
  });
  return { envoye: true };
}

// ── R07 : la résiliation pour impayé ──────────────────────────────────────────────────────────────────────────

/** Les factures restées ouvertes de la souscription, annulées (décision 5 du plan : remboursements protecteurs). */
export async function annulerFacturesOuvertes(
  stripe: Stripe,
  subscription: string
): Promise<{ sort: FacturesAnnulees; annulees: string[]; echecs: string[] }> {
  const annulees: string[] = [];
  const echecs: string[] = [];
  try {
    const ouvertes = await stripe.invoices.list({ subscription, status: "open", limit: 20 });
    for (const f of ouvertes.data) {
      if (!f.id) continue;
      try {
        await stripe.invoices.voidInvoice(f.id, {}, { idempotencyKey: `annulation-impaye-${f.id}` });
        annulees.push(f.id);
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        echecs.push(f.id);
      }
    }
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { sort: "a_annuler", annulees, echecs: ["lecture des factures impossible"] };
  }
  return { sort: echecs.length > 0 ? "a_annuler" : annulees.length > 0 ? "annulees" : "aucune", annulees, echecs };
}

/**
 * R07 : sur `customer.subscription.deleted`, seulement quand un défaut de paiement était en cours et que le client
 * n'avait demandé aucune résiliation (lu en base AVANT l'événement) : la facture restée ouverte est annulée, puis le
 * courrier part, une fois.
 */
export async function notifierResiliationImpaye(
  service: Service,
  stripe: Stripe,
  p: { orgId: string; subscription: string; resilieLe: Date; destinataire: string | null; organisation: string },
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi & { factures?: FacturesAnnulees }> {
  const factures = await annulerFacturesOuvertes(stripe, p.subscription);
  if (factures.echecs.length > 0) {
    await tracer(service, "resiliation_impaye_facture_non_annulee", { organisation: p.orgId, souscription: p.subscription, factures: factures.echecs });
  }
  if (!p.destinataire) return { envoye: false, motif: "sans adresse", factures: factures.sort };
  const courrier = courrierResiliationImpaye({
    organisation: p.organisation,
    resilieLe: dateParis(p.resilieLe),
    factures: factures.sort,
    lien: lienAbonnement(await baseDeLOrganisation(service, p.orgId)),
  });
  await options.avantEffet?.();
  const { erreur, id } = await envoyerEmail({
    avantEnvoi: options.avantEffet,
    to: p.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `resiliation-impaye-${p.subscription}`,
  });
  if (erreur) return { envoye: false, motif: erreur, factures: factures.sort };
  await service.rpc("abonnement_resiliation_impaye_notifiee", {
    p_org: p.orgId,
    p_subscription: p.subscription,
    p_message: id ?? null,
    p_factures_annulees: factures.annulees,
  });
  return { envoye: true, factures: factures.sort };
}

// ── R01, R37 : l'accusé de la rétractation ────────────────────────────────────────────────────────────────────

export async function envoyerAccuseRetractation(
  service: Service,
  p: { retractationId: string; cle: string; destinataire: string } & AccuseRetractation,
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi> {
  const courrier = courrierAccuseRetractation(p);
  await options.avantEffet?.();
  const { erreur, id } = await envoyerEmail({
    avantEnvoi: options.avantEffet,
    to: p.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: p.cle,
  });
  if (erreur) return { envoye: false, motif: erreur };
  await service.rpc("retractation_accuse_envoye", { p_id: p.retractationId, p_message: id ?? null });
  return { envoye: true };
}
