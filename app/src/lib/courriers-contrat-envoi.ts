import { empreinteCourriel } from "./courriels-durables";
import { paiementsInterdits } from "./verrou-pilote";
import { MESSAGE_PILOTE } from "./perimetre-pilote";
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
import { balisageAdmis, jourDeParis, lireVersionArchivee } from "@/lib/conditions-versions";
import {
  courrierAccuseResiliation,
  courrierAccuseRetractation,
  courrierConfirmationSouscription,
  courrierReceptionRetractation,
  type AccuseRetractation,
} from "@/lib/courriers-contrat";
import { envoyerEmail } from "@/lib/email";
import { estDocumentPdfComplet } from "@/lib/file-type";
import { REGIME_TVA } from "@/lib/editeur";
import { identiteDepuisValeurs } from "@/lib/identite-editeur";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { courrierResiliationImpaye, type FacturesAnnulees } from "@/lib/relance-paiement-email";
import { adresseDuSite } from "@/lib/site";
import { adressesRelaisDuServeur } from "@/lib/relais-alerte-reglage";
import { echapperMarque } from "@/lib/marque-organisation";
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
  /** Les accusés de résiliation déjà envoyés pour cette souscription (relecture adverse du 24/10, I3). */
  resiliations_accusees?: number | null;
};

export async function lireContexteCourrier(service: Service, orgId: string, confirmation = false): Promise<ContexteCourrier | null> {
  const { data, error } = await service.rpc("abonnement_courrier_contexte", { p_org: orgId, ...(confirmation ? { p_confirmation: true } : {}) });
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

/**
 * Un incident du contrat qu'un humain doit voir (relectures adverses du 24/10 : rétractation restée en chemin,
 * résiliation pour impayé avant le délai de la mise en demeure). Trace au journal technique, puis alerte e-mail du
 * relais (adresses GERIMMO_RELAIS_EMAILS, le canal d'alerte existant ; aucune adresse dans le code). Sans coordonnée
 * du client dans l'alerte : l'organisation et les références suffisent. Rend le nombre d'alertes parties.
 */
export async function alerterRelaisContrat(
  service: Service,
  a: { evenement: string; sujet: string; lignes: string[]; cle: string; details: Record<string, unknown> },
  options: { avantEffet?: () => Promise<void>; adresses?: string[] } = {}
): Promise<number> {
  await tracer(service, a.evenement, a.details);
  const adresses = options.adresses ?? adressesRelaisDuServeur().valides;
  if (adresses.length === 0) return 0;
  const html = `<p>Un dossier d’abonnement nécessite une vérification. Consultez le journal de supervision dans votre <a href="${echapperMarque(adresseDuSite() || "")}/admin">espace administrateur Gerimmo</a>.</p>`;
  let envoyees = 0;
  for (const to of adresses) {
    await options.avantEffet?.();
    const r = await envoyerEmail({ circuit:"lib/courriers-contrat-envoi", avantEnvoi: options.avantEffet, to, subject: "Gerimmo — vérification d’un dossier d’abonnement", html, contexteMetier:{type:"alerte_direction",categorie:"contrat",id:empreinteCourriel(a.cle)}, cleIdempotence: `${a.cle}-${to}` }).catch(
      (e: unknown) => {
        if (e instanceof ArretSupervision) throw e;
        return { erreur: "envoi interrompu" };
      }
    );
    if (!r.erreur) envoyees += 1;
  }
  return envoyees;
}

// ── R03 : la confirmation de la souscription ──────────────────────────────────────────────────────────────────

/** Le PDF d'une version archivée des conditions, ou null (version non archivée, balisage hors liste blanche, rendu impossible, délai dépassé). */
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
  // Socle, relecture adverse du 24/10 (M1) : le texte rangé n'est rendu que si son balisage est dans la liste blanche,
  // comme sur la page publique de la version ; sinon la confirmation attend une vérification.
  if (!archivee || !balisageAdmis(archivee.texte_html)) return null;
  const jourArchive = jourDeParis(archivee.publiee_le);
  if (!jourArchive) return null;
  const titre = `Conditions générales d'utilisation et de vente — version du ${version}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>${titre}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:10.5pt;line-height:1.5;color:#111;padding:36pt 48pt}
h1,h2,h3{font-family:Arial,sans-serif;color:#12263f}a{color:#12263f}</style></head>
<body><p style="font-size:8pt;color:#555">Version archivée le ${jourArchive} — empreinte SHA-256 ${archivee.empreinte_sha256}</p>
${archivee.texte_html}</body></html>`;
  const delai = options.delaiMs ?? 10_000;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    const octets = await Promise.race([
      (options.rendu ?? renduParDefaut)(html, titre),
      new Promise<never>((_, refuser) => { minuterie = setTimeout(() => refuser(new Error("délai dépassé")), delai); }),
    ]);
    if (!estDocumentPdfComplet(octets)) return null;
    return { nom: `conditions-generales-${version}.pdf`, contenuBase64: Buffer.from(octets).toString("base64") };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

export type ResultatEnvoi = { envoye: boolean; motif?: string; verification?: boolean };

/**
 * Article 3.2 : la confirmation remet le PDF accepté et le formulaire de rétractation.
 * Sans la pièce, la souscription reste à confirmer par la tâche de reprise.
 * `premierPrelevementLe` : la fin de l'essai Stripe si elle existe, sinon la souscription elle-même.
 */
export async function envoyerConfirmationSouscription(
  service: Service,
  p: { orgId: string; subscription: string; premierPrelevementLe: Date | null },
  options: { avantEffet?: () => Promise<void>; rendu?: RenduPdf; delaiPdfMs?: number } = {}
): Promise<ResultatEnvoi> {
  const c = await lireContexteCourrier(service, p.orgId, true);
  if (!c || c.stripe_subscription_id !== p.subscription) return { envoye: false, motif: "souscription non suivie" };
  if (c.confirmation_envoyee_le) return { envoye: false, motif: "déjà envoyée" };
  if (!c.souscrit_le) return { envoye: false, motif: "souscription non datée" };
  if (!c.destinataire) {
    await tracer(service,"confirmation_destinataire_a_verifier",{organisation:p.orgId,souscription:p.subscription});
    return { envoye: false, motif: "Identité du souscripteur et preuve de commande à vérifier." };
  }
  if (c.montant_periode_cents === null) return { envoye: false, motif: "montant inconnu" };
  const version = c.cgu_version;
  if (!version || !c.cgu_acceptee_le) {
    await tracer(service, "confirmation_preuve_commande_manquante", { organisation: p.orgId, souscription: p.subscription });
    return { envoye: false, motif: "Conditions acceptées à la souscription à vérifier." };
  }
  const pdf = await pdfDesConditions(service, version, { rendu: options.rendu, delaiMs: options.delaiPdfMs });
  if (!pdf) {
    await tracer(service, "confirmation_sans_pdf", { organisation: c.organization_id, souscription: p.subscription, version });
    return { envoye: false, verification: true, motif: "Confirmation en attente du PDF des conditions acceptées. Vérifier l’archive et son rendu." };
  }
  const editeur = await lireEditeurService(service);
  const site = adresseDuSite();
  const lien = !site
    ? null
    : `${site}/conditions/versions/conditions_clients/${encodeURIComponent(version)}`;
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
    conditions: { version, accepteeLe: new Date(c.cgu_acceptee_le) },
    pdfJoint: true,
    lienConditions: lien,
  });
  await options.avantEffet?.();
  const { erreur, id, incertain, finalisationEnAttente } = await envoyerEmail({ circuit:"confirmation-abonnement",
    organisation:{db:service,id:c.organization_id},
    contexteMetier:{type:"confirmation_abonnement",id:p.subscription,montant:Number(c.montant_periode_cents),
      version,acceptee:c.cgu_acceptee_le,formule:c.formule,unites:c.unites_souscrites,periodicite:c.periodicite,
      souscrit:c.souscrit_le,organisation:c.organisation,document:true},
    avantEnvoi: options.avantEffet,
    to: c.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `souscription-${p.subscription}`,
    piecesJointes: [pdf],
  });
  if (incertain) return {envoye:false, verification:true, motif:"Envoi en cours de vérification."};
  if (erreur) return { envoye: false, motif: erreur };
  if (!id || finalisationEnAttente) return {envoye:false,verification:true,motif:"Acceptation ou finalisation à vérifier. Ne pas renvoyer."};
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
 * R04 : l'accusé de la résiliation, UN par notification, que l'appel vienne de la page (action) ou du webhook. La
 * clé du prestataire (`resiliation-{souscription}-{fin, jour de Paris}`) couvre deux envois presque simultanés ; la
 * marque en base (`resiliation_accusee_pour`) couvre le reste.
 *
 * Relecture adverse du 24/10 (I3) : lever la résiliation efface la marque (`abonnement_resiliation_levee`) ; une
 * nouvelle notification de la même échéance reçoit alors son propre accusé (D. 215-3). Sa clé porte le rang de
 * l'accusé (« -2 », « -3 »…), lu en base par les deux chemins : le même pour l'action et le webhook d'une même
 * notification, jamais celui d'un accusé déjà parti (le prestataire le rendrait sans rien envoyer).
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
    /** Le nom saisi sur la page (M6). */
    nom?: string | null;
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
    nom: p.nom,
  });
  const rang = Number(c.resiliations_accusees ?? 0);
  await options.avantEffet?.();
  const { erreur, id, incertain, finalisationEnAttente } = await envoyerEmail({ circuit:"accuse-resiliation",
    organisation:{db:service,id:c.organization_id},
    contexteMetier:{type:"accuse_resiliation",id:p.subscription,fin:p.periodeFin.toISOString(),rang,
      chemin:p.chemin,notification:p.notifieeLe.toISOString(),organisation:c.organisation,formule:c.formule},
    avantEnvoi: options.avantEffet,
    to,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `resiliation-${p.subscription}-${dateParis(p.periodeFin)}${rang > 0 ? `-${rang + 1}` : ""}`,
  });
  if (incertain) return {envoye:false, verification:true, motif:"Envoi en cours de vérification."};
  if (erreur) return { envoye: false, motif: erreur };
  if (!id || finalisationEnAttente) return {envoye:false,verification:true,motif:"Acceptation ou finalisation à vérifier. Ne pas renvoyer."};
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
    let curseur: string | undefined;
    do {
      const page: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
        subscription, status: "open", limit: 20, ...(curseur ? { starting_after: curseur } : {}),
      });
      const dernier = page.data.at(-1)?.id;
      if (page.has_more && (!dernier || dernier === curseur)) {
        echecs.push("pagination des factures incomplète");
        break;
      }
      for (const facture of page.data) {
        try {
          await stripe.invoices.voidInvoice(facture.id, {}, { idempotencyKey: `annulation-impaye-${facture.id}` });
          annulees.push(facture.id);
        } catch (e) {
          if (e instanceof ArretSupervision) throw e;
          echecs.push(facture.id);
        }
      }
      curseur = page.has_more ? dernier : undefined;
    } while (curseur);
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    echecs.push("lecture des factures impossible");
    return { sort: "a_annuler", annulees, echecs };
  }
  return { sort: echecs.length > 0 ? "a_annuler" : annulees.length > 0 ? "annulees" : "aucune", annulees, echecs };
}

/** Uniquement après clôture Stripe confirmée et mise en demeure délivrée depuis trente jours. */
export async function notifierResiliationImpaye(
  service: Service,
  stripe: Stripe,
  p: {
    orgId: string;
    subscription: string;
    resilieLe: Date;
    destinataire: string | null;
    organisation: string;
    /** Le jour du défaut (AAAA-MM-JJ), qui identifie l'épisode d'impayé. */
    enDefautDepuis: string | null;
  },
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi & { factures?: FacturesAnnulees }> {
  if(paiementsInterdits()){
    await tracer(service,"pilote_contrat_intervention_requise",{organisation:p.orgId,souscription:p.subscription});
    return {envoye:false,motif:MESSAGE_PILOTE};
  }
  async function enVerification(motif: string): Promise<ResultatEnvoi> {
    await alerterRelaisContrat(service, {
      evenement: "resiliation_impaye_a_verifier", sujet: "Résiliation pour impayé à vérifier", lignes: [],
      cle: `resiliation-impaye-controle-${p.subscription}`,
      details: {organisation:p.orgId, souscription:p.subscription, motif},
    }, options);
    return {envoye:false, verification:true, motif};
  }
  if (!p.enDefautDepuis) return enVerification("Épisode d’impayé non identifié.");
  const {data, error} = await service.rpc("preuve_fin_impaye", {
    p_org:p.orgId, p_subscription:p.subscription, p_episode:p.enDefautDepuis, p_fin:p.resilieLe.toISOString(),
  });
  const preuve = data?.[0];
  if (error || !preuve?.facture || !preuve.destinataire) return enVerification("Vérifier le destinataire, la mise en demeure délivrée et le délai de trente jours.");
  await options.avantEffet?.();
  const souscription = await stripe.subscriptions.retrieve(p.subscription);
  if (souscription.id !== p.subscription || souscription.status !== "canceled"
    || souscription.ended_at !== Math.floor(p.resilieLe.getTime() / 1000)
    || !(souscription.cancellation_details?.reason === "payment_failed" || souscription.metadata?.gerimmo_resiliation_motif === "impaye")) {
    return enVerification("Motif ou date de fin non confirmé par Stripe.");
  }
  const f = await stripe.invoices.retrieve(preuve.facture);
  const sub = f.parent?.subscription_details?.subscription;
  const client = (v: string | {id: string} | null) => typeof v === "string" ? v : v?.id;
  if (f.id !== preuve.facture || (typeof sub === "string" ? sub : sub?.id) !== p.subscription
    || !client(f.customer) || client(f.customer) !== client(souscription.customer) || f.currency !== "eur"
    || !["open","void"].includes(f.status ?? "") || (f.status === "open" && f.amount_remaining !== Number(preuve.montant))) {
    return enVerification("Facture courante incompatible avec la mise en demeure.");
  }
  const ouvertes = await stripe.invoices.list({subscription:p.subscription,status:"open",limit:2});
  if (ouvertes.has_more || ouvertes.data.some(i=>i.id!==f.id)) return enVerification("Plusieurs factures à rapprocher de la décision de résiliation.");
  if (f.status === "open") {
    await options.avantEffet?.();
    const annulee = await stripe.invoices.voidInvoice(f.id, {}, {idempotencyKey:`annulation-impaye-${f.id}`});
    if (annulee.id!==f.id || annulee.status!=="void") return enVerification("Annulation de la facture à rapprocher avec Stripe.");
  }
  const courrier = courrierResiliationImpaye({
    organisation:preuve.organisation, resilieLe:dateParis(p.resilieLe), factures:"annulees", apresMiseEnDemeure:true,
    lien:lienAbonnement(await baseDeLOrganisation(service,p.orgId)),
  });
  const r = await envoyerEmail({circuit:"lib/courriers-contrat-envoi", avantEnvoi:options.avantEffet,
    organisation:{db:service,id:p.orgId}, to:preuve.destinataire, subject:courrier.sujet,html:courrier.html,
    contexteMetier:{type:"resiliation_impaye",id:p.subscription,episode:p.enDefautDepuis,fin:p.resilieLe.toISOString(),facture:f.id,annulees:[f.id]},
    cleIdempotence:`resiliation-impaye-${p.subscription}`});
  if (r.erreur || !r.id || r.finalisationEnAttente) return enVerification(r.erreur ?? "Finalisation du courrier à vérifier.");
  return {envoye:true, factures:"annulees"};
}

/** Une coupure après la résiliation Stripe, y compris après une annulation de facture, est rattrapée à partir du contrat existant. */
export async function reprendreFinsImpayees(service: Service, stripe: Stripe, avantEffet: () => Promise<void>) {
  const {data, error} = await service.rpc("resiliations_impaye_a_rapprocher");
  if (error) throw new Error("Lecture des résiliations pour impayé indisponible.");
  let envoyees = 0, aVerifier = 0;
  for (const ligne of data ?? []) {
    try {
      await avantEffet();
      const s = await stripe.subscriptions.retrieve(ligne.subscription);
      if (!s.ended_at) throw new Error("Fin de souscription non confirmée");
      const r = await notifierResiliationImpaye(service, stripe, {
        orgId:ligne.organization_id, subscription:ligne.subscription,enDefautDepuis:ligne.episode,
        resilieLe:new Date(s.ended_at*1000), destinataire:null, organisation:"",
      }, {avantEffet});
      if (r.envoye) envoyees++; else aVerifier++;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      aVerifier++;
      await alerterRelaisContrat(service,{
        evenement:"resiliation_impaye_rapprochement_interrompu",sujet:"Clôture d’abonnement en attente",
        lignes:[],cle:`rapprochement-impaye-${ligne.subscription}`,details:{organisation:ligne.organization_id,souscription:ligne.subscription},
      },{avantEffet});
    }
  }
  const decisions = await service.rpc("dossiers_impayes_a_decider");
  if (decisions.error) throw new Error("Décisions d’impayé indisponibles.");
  for (const d of decisions.data ?? []) {
    await alerterRelaisContrat(service, {
      evenement:"abonnement_impaye_decision_requise",sujet:"Décision sur un défaut de paiement",
      cle:`impaye-decision-${d.subscription}-${d.episode}-${d.motif}`,lignes:[],
      details:{organisation:d.organization_id,souscription:d.subscription,episode:d.episode,motif:d.motif},
    }, {avantEffet});
    aVerifier++;
  }
  return {envoyees,aVerifier};
}

// ── R01, R37 : l'accusé de la rétractation ────────────────────────────────────────────────────────────────────

/**
 * Relecture adverse du 24/10 (I4) : l'accusé de réception de la déclaration, sans délai, quand l'exécution n'a pas pu
 * se faire tout de suite. Une fois (clé propre, `{clé}-reception`) ; trace au journal technique, sans l'adresse.
 */
export async function envoyerReceptionRetractation(
  service: Service,
  p: { organisationId: string; retractationId: string; cle: string; destinataire: string } & Pick<AccuseRetractation, "nature" | "organisation" | "declaration" | "declareeLe">,
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi> {
  const courrier = courrierReceptionRetractation(p);
  await options.avantEffet?.();
  const { erreur, id, finalisationEnAttente } = await envoyerEmail({ circuit:"lib/courriers-contrat-envoi",
    avantEnvoi: options.avantEffet,
    organisation:{db:service,id:p.organisationId},
    contexteMetier:{type:"retractation_abonnement",etape:"reception",id:p.retractationId,nature:p.nature,organisation:p.organisation,declaree:p.declareeLe.toISOString(),declaration:empreinteCourriel(p.declaration)},
    to: p.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: `${p.cle}-reception`,
  });
  if (erreur) return { envoye: false, motif: erreur };
  if (!id || finalisationEnAttente) return { envoye:false, verification:true, motif:"Accusé en attente de confirmation." };
  return { envoye: true };
}

/**
 * L'accusé de la rétractation, une fois (clé de la déclaration), marqué en base. `copie` (relecture adverse du 24/10,
 * M5) : l'accusé déjà parti, renvoyé à la demande du client (« confirmez de nouveau ») — clé propre à la demande, la
 * marque et la preuve du premier envoi restent celles d'origine.
 */
export async function envoyerAccuseRetractation(
  service: Service,
  p: { organisationId: string; retractationId: string; cle: string; destinataire: string; copie?: string } & AccuseRetractation,
  options: { avantEffet?: () => Promise<void> } = {}
): Promise<ResultatEnvoi> {
  const courrier = courrierAccuseRetractation(p);
  await options.avantEffet?.();
  const { erreur, id, finalisationEnAttente } = await envoyerEmail({ circuit:"lib/courriers-contrat-envoi",
    avantEnvoi: options.avantEffet,
    organisation:{db:service,id:p.organisationId},
    contexteMetier:{type:"retractation_abonnement",etape:p.copie?"copie":"execution",id:p.retractationId,copie:p.copie,
      nature:p.nature,organisation:p.organisation,declaree:p.declareeLe.toISOString(),declaration:empreinteCourriel(p.declaration),
      montant:p.montantRembourseCents,passage:p.passageEffectue,essaiFin:p.essaiFin,mensualite:p.mensualiteCents},
    to: p.destinataire,
    subject: courrier.sujet,
    html: courrier.html,
    cleIdempotence: p.copie ? `${p.cle}-copie-${p.copie}` : p.cle,
  });
  if (erreur) return { envoye: false, motif: erreur };
  if (!id || finalisationEnAttente) return {envoye:false,verification:true,motif:"Accusé en attente de confirmation."};
  return { envoye: true };
}
