"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { origineDeRetour } from "@/lib/site";
import { sansJargon } from "@/lib/erreurs";
import { VERSION_TARIFICATION, type PublicTarif, type Periodicite } from "@/lib/tarification";
import { assurerClientStripe } from "@/lib/stripe";
import { configurationStripeV2, creerClientStripeV2, lignesTarifV2, apercuTarifV2, empreinteSouscription, finEssaiV2,
  ouvrirSouscriptionV2, augmenterAbonnementV2, programmerBaisseV2, snapshotSouscriptionV2, resilierAbonnementV2, annulerChangementProgrammeV2, type PropositionStripeV2 } from "@/lib/stripe-tarification";

export type EtatAbonnementV2Action = { erreur?: string; succes?: string; proposition?: { id: string; formule: string; periodicite: Periodicite;
  volume: number; capacite: number; montantCents: number; totalCents: number; taxesCents: number; prorataCents: number;
  premierPrelevementCents?: number; dateEffet: string; expiration: string; type: PropositionStripeV2["type"]; detailFiscal: string } };
type Contexte = { version: string; public_tarif: PublicTarif; volume_actuel: number; volume_facture?: number; volume_reserve?: number; capacite: number; formule: string | null;
  periodicite: Periodicite | null; montant_centimes: number; statut: string; essai_fin: string | null; periode_fin: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null; revision_abonnement: string; changement_programme: unknown };
type Proposition = { id: string; organization_id: string; acteur_id: string; snapshot: PropositionStripeV2; expire_le: string; consentie_le: string | null; etat?: string };
async function contexte(orgId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Reconnectez-vous pour gérer votre abonnement.");
  const { data, error } = await supabase.rpc("lire_abonnement_v2", { p_org: orgId });
  if (error || !data || data.version !== VERSION_TARIFICATION) throw new Error("Cet abonnement ne relève pas de la nouvelle grille. Vos conditions actuelles sont conservées.");
  return { supabase, utilisateur: auth.user, etat: data as Contexte };
}
function erreurLisible(error: unknown) {
  if (!(error instanceof Error)) return "La demande n’a pas pu aboutir. Aucun changement n’est confirmé.";
  // Ne jamais exposer une réponse technique du prestataire, ni promettre l’absence de débit après un timeout.
  if ("type" in error) return "Le service de paiement n’a pas confirmé cette opération. Vérifiez l’état de votre abonnement avant de réessayer.";
  return /SQLSTATE|PGRST\d+|constraint|foreign key|schema cache|fetch failed/i.test(error.message) ? sansJargon(error.message) : error.message;
}
function afficher(p: Proposition): NonNullable<EtatAbonnementV2Action["proposition"]> {
  const s = p.snapshot;
  return { id: p.id, formule: s.formule, periodicite: s.periodicite, volume: s.volume_cible, capacite: s.capacite,
    montantCents: s.montant_centimes, totalCents: s.total_centimes, taxesCents: s.taxe_centimes, prorataCents: s.prorata_centimes,
    premierPrelevementCents: s.premier_prelevement_centimes, dateEffet: s.date_effet, expiration: p.expire_le, type: s.type, detailFiscal: s.fiscalite.mention };
}

export async function preparerAbonnementV2(orgId: string, _etat: EtatAbonnementV2Action, form: FormData): Promise<EtatAbonnementV2Action> {
  try {
    const { supabase, utilisateur, etat } = await contexte(orgId);
    const config = configurationStripeV2();
    const stripe = creerClientStripeV2(config);
    const service = clientDeService();
    if (!service) throw new Error("La préparation du paiement n’est pas disponible pour le moment.");
    const annulerChangement = form.get("type") === "annulation_changement";
    const annuler = form.get("type") === "resiliation";
    const periodicite = String(((annuler || annulerChangement) ? etat.periodicite : form.get("periodicite")) || etat.periodicite || "mensuel") as Periodicite;
    if (!["mensuel", "annuel"].includes(periodicite)) throw new Error("Choisissez une périodicité valide.");
    const volume = annuler || annulerChangement ? Number(etat.volume_facture ?? etat.capacite) : form.get("volume") === null || form.get("volume") === "" ? Number(etat.volume_actuel) : Number(form.get("volume"));
    if (!Number.isSafeInteger(volume) || volume < 0 || (!annuler && !annulerChangement && volume < Math.max(Number(etat.volume_actuel), Number(etat.volume_reserve ?? 0)))) throw new Error("La formule doit couvrir tous les biens ou lots actuellement gérés.");
    const { data: org } = await supabase.from("organizations").select("name,email_contact").eq("id", orgId).single();
    if (!org) throw new Error("Votre organisation n’a pas pu être lue.");
    const client = await assurerClientStripe(stripe, { orgId, nom: org.name, email: org.email_contact ?? utilisateur.email ?? null, existant: etat.stripe_customer_id });
    if (!client.ok) throw new Error("Le dossier de facturation n’a pas pu être préparé.");
    const pose = await service.rpc("abonnement_v2_poser_client", { p_org: orgId, p_customer: client.customer });
    if (pose.error) throw new Error("Le dossier de facturation n’a pas pu être enregistré.");
    // La création du dossier peut modifier sa révision ; celle proposée doit être la dernière.
    const { data: actuel, error: erreurActuel } = await supabase.rpc("lire_abonnement_v2", { p_org: orgId });
    if (erreurActuel || !actuel) throw new Error("Rechargez la page avant de préparer votre abonnement.");
    const s = etat.stripe_subscription_id ? await stripe.subscriptions.retrieve(etat.stripe_subscription_id) : null;
    const active = s && !["canceled", "incomplete_expired"].includes(s.status) ? s : null;
    if (active && active.metadata.tarification_version !== VERSION_TARIFICATION) throw new Error("Votre contrat existant nécessite une migration distincte. Aucun changement n’a été fait.");
    if (!annuler && !annulerChangement && active && !["active", "trialing"].includes(active.status)) throw new Error("Régularisez d’abord le paiement de votre abonnement depuis votre espace de facturation.");
    if (!annuler && !annulerChangement && (active?.pending_update || active?.schedule || active?.cancel_at_period_end || etat.changement_programme)) throw new Error("Un changement ou une résiliation est déjà en cours. Il doit être traité avant une nouvelle modification.");
    if (annulerChangement && (!active?.schedule || active.pending_update)) throw new Error("Aucun changement programmé annulable n’a été trouvé.");
    const volumeTarif = annulerChangement ? Number(etat.volume_facture ?? etat.capacite) : volume;
    const { tarif, lignes, fiscalite } = await lignesTarifV2(stripe, config, etat.public_tarif, volumeTarif, periodicite);
    if (annuler && !active) throw new Error("Aucun abonnement actif n’est à résilier.");
    const changementPeriode = active && periodicite !== etat.periodicite;
    const type: PropositionStripeV2["type"] = annulerChangement ? "annulation_changement" : annuler ? "resiliation" : !active ? "souscription"
      : changementPeriode || tarif.montantCentimes < Number(etat.montant_centimes) ? "baisse" : "augmentation";
    if (active && !annuler && !annulerChangement && !changementPeriode && tarif.capacite === Number(etat.capacite)) throw new Error("Votre formule actuelle couvre déjà cette capacité.");
    const dateProrata = Math.floor(Date.now() / 1000);
    const apercu = annuler || annulerChangement ? { total: Number(actuel.total_centimes), taxe: Number(actuel.taxe_centimes), prorata: 0, premierPaiement: 0 }
      : await apercuTarifV2(stripe, { customer: client.customer, lignes, fiscalite, abonnement: type === "augmentation" ? active : null, prorationDate: dateProrata });
    const essai = finEssaiV2(etat.essai_fin);
    const dateEffet = type === "baisse" || type === "resiliation" ? new Date(active!.items.data[0].current_period_end * 1000).toISOString()
      : type === "souscription" && essai ? new Date(essai * 1000).toISOString() : new Date(dateProrata * 1000).toISOString();
    const snapshot: PropositionStripeV2 = { version: VERSION_TARIFICATION, public_tarif: etat.public_tarif, volume_source: Number(actuel.volume_actuel), volume_cible: volumeTarif,
      capacite: annuler ? Number(etat.capacite) : tarif.capacite, formule: annuler ? (etat.formule ?? tarif.formule) : tarif.formule, periodicite, montant_centimes: annuler ? Number(etat.montant_centimes) : tarif.montantCentimes, total_centimes: apercu.total, taxe_centimes: apercu.taxe,
      prorata_centimes: apercu.prorata, premier_prelevement_centimes: apercu.premierPaiement, date_effet: dateEffet, type, revision_abonnement: actuel.revision_abonnement,
      stripe_customer_id: client.customer, stripe_subscription_id: active?.id ?? null, stripe_lignes: lignes, stripe_proration_date: dateProrata,
      fiscalite, essai_fin: etat.essai_fin, empreinte_stripe: active ? empreinteSouscription(active) : null, acteur_id: utilisateur.id };
    const expire = new Date(Date.now() + 15 * 60_000).toISOString();
    const { data: id, error } = await service.rpc("enregistrer_proposition_abonnement_v2", { p_org: orgId, p_acteur: utilisateur.id, p_snapshot: snapshot, p_expire_le: expire });
    if (error || !id) throw new Error("Le récapitulatif n’a pas pu être enregistré. Aucun changement n’a été fait.");
    return { proposition: afficher({ id, organization_id: orgId, acteur_id: utilisateur.id, snapshot, expire_le: expire, consentie_le: null }) };
  } catch (e) { return { erreur: erreurLisible(e) }; }
}

export async function confirmerAbonnementV2(orgId: string, _etat: EtatAbonnementV2Action, form: FormData): Promise<EtatAbonnementV2Action> {
  let destination: string | null = null;
  let succes: string | undefined;
  let liberer: (() => Promise<void>) | null = null;
  try {
    if (form.get("confirmation") !== "oui") throw new Error("Confirmez le montant et la date d’effet avant de continuer.");
    const { supabase, etat } = await contexte(orgId);
    const config = configurationStripeV2(); const stripe = creerClientStripeV2(config);
    const service = clientDeService(); if (!service) throw new Error("Le service de facturation est indisponible.");
    const id = String(form.get("proposition_id") || "");
    const { data: brut, error } = await supabase.rpc("lire_proposition_abonnement_v2", { p_proposition: id });
    if (error || !brut || brut.organization_id !== orgId) throw new Error("Ce récapitulatif n’est plus disponible. Préparez-en un nouveau.");
    const proposition = brut as Proposition;
    if (proposition.etat === "executee") return { succes: "Cette demande a déjà été exécutée. Votre abonnement est à jour." };
    if (["annulee", "expiree"].includes(proposition.etat ?? "")) throw new Error("Cette demande est clôturée. Préparez un nouveau récapitulatif.");
    const token = randomUUID();
    const reserve = await service.rpc("reserver_traitement_abonnement_v2", { p_org: orgId, p_token: token });
    if (reserve.error || reserve.data !== true) throw new Error("Une vérification de votre abonnement est en cours. Réessayez dans un instant.");
    liberer = async () => { await service.rpc("liberer_traitement_abonnement_v2", { p_org: orgId, p_token: token }); };
    // Le verrou est commun aux notifications Stripe et aux confirmations manuelles.
    const rerelecture = await supabase.rpc("lire_proposition_abonnement_v2", { p_proposition: id });
    if (rerelecture.error || !rerelecture.data || rerelecture.data.organization_id !== orgId) throw new Error("Ce récapitulatif n’est plus disponible.");
    const courante = rerelecture.data as Proposition;
    if (courante.etat === "executee") return { succes: "Cette demande a déjà été exécutée. Votre abonnement est à jour." };
    if (["annulee", "expiree"].includes(courante.etat ?? "")) throw new Error("Cette demande est clôturée. Préparez un nouveau récapitulatif.");
    const p = courante.snapshot;
    let operationTerminee = false;
    const s = p.stripe_subscription_id ? await stripe.subscriptions.retrieve(p.stripe_subscription_id) : null;
    if (s && empreinteSouscription(s) !== p.empreinte_stripe) throw new Error("Votre abonnement a changé depuis ce récapitulatif. Vérifiez un nouveau montant avant de confirmer.");
    if (!s && etat.stripe_subscription_id && !["canceled", "incomplete_expired"].includes((await stripe.subscriptions.retrieve(etat.stripe_subscription_id)).status)) throw new Error("Un abonnement existe déjà. Rechargez la page.");
    // Vérifie à nouveau catalogue/taxes et prorata : un réglage externe peut avoir changé.
    const verifie = await lignesTarifV2(stripe, config, p.public_tarif, p.volume_cible, p.periodicite);
    if (JSON.stringify(verifie.lignes) !== JSON.stringify(p.stripe_lignes) || JSON.stringify(verifie.fiscalite) !== JSON.stringify(p.fiscalite)) throw new Error("Les conditions de paiement ont changé. Préparez un nouveau récapitulatif.");
    if (p.type !== "resiliation" && p.type !== "annulation_changement") {
      const apercu = await apercuTarifV2(stripe, { customer: p.stripe_customer_id, lignes: p.stripe_lignes, fiscalite: p.fiscalite, abonnement: p.type === "augmentation" ? s : null, prorationDate: p.stripe_proration_date });
      if (apercu.total !== p.total_centimes || apercu.taxe !== p.taxe_centimes || apercu.prorata !== p.prorata_centimes || apercu.premierPaiement !== p.premier_prelevement_centimes) throw new Error("Le montant à régler a changé. Un nouveau récapitulatif est nécessaire.");
    }
    const h = await headers(); const origine = origineDeRetour(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
    if (!origine) throw new Error("L’adresse de retour du paiement est indisponible.");
    const retour = `${origine}/agence/${orgId}/abonnement`;
    if (p.type === "souscription" && Date.parse(p.date_effet) > p.stripe_proration_date * 1000 && !finEssaiV2(p.essai_fin)) throw new Error("Votre essai vient de se terminer. Préparez un nouveau récapitulatif avant de confirmer le premier prélèvement.");
    const consentement = await supabase.rpc("consentir_proposition_abonnement_v2", { p_proposition: id });
    if (consentement.error || !consentement.data) throw new Error(consentement.error?.message || "La confirmation n’a pas été enregistrée.");
    if (p.type === "souscription") {
      try { destination = await ouvrirSouscriptionV2(stripe, p, orgId, id, retour); }
      catch (e) {
        // Un refus de validation initial prouve que cette requête n’a créé aucun Checkout.
        // Un délai dépassé ou la reprise d’une demande consentie reste réservé et idempotent.
        if (!courante.consentie_le && e instanceof Error && "type" in e && ["StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"].includes(String(e.type))) {
          await service.rpc("finir_proposition_abonnement_v2", { p_proposition: id, p_etat: "annulee" });
        }
        throw e;
      }
    }
    else if (p.type === "augmentation") {
      const nouveau = await augmenterAbonnementV2(stripe, s!, p, orgId, id);
      const snapshot = await snapshotSouscriptionV2(stripe, config, nouveau);
      const applique = await service.rpc("appliquer_abonnement_v2", { p_org: orgId, p_snapshot: { ...snapshot, traitement_token: token }, p_event_id: `operation-v2-${id}` });
      if (applique.error) throw new Error("Le prestataire a reçu votre demande. Son résultat est en cours de vérification dans Gerimmo.");
      const facture = nouveau.latest_invoice;
      if (nouveau.pending_update) {
        destination = facture && typeof facture !== "string" ? (facture.hosted_invoice_url ?? null) : null;
        succes = "La capacité reste inchangée jusqu’à confirmation du règlement. Consultez votre facture pour terminer le paiement.";
      } else { succes = "Votre nouvelle capacité est confirmée."; operationTerminee = true; }
    } else if (p.type === "baisse") {
      const programme = await programmerBaisseV2(stripe, s!, p, orgId, id);
      const actuel = await snapshotSouscriptionV2(stripe, config, s!);
      const applique = await service.rpc("appliquer_abonnement_v2", { p_org: orgId, p_snapshot: { ...actuel, traitement_token: token, changement_programme: { ...p, stripe_schedule_id: programme.id } }, p_event_id: `operation-v2-${id}` });
      if (applique.error) throw new Error("Le changement est programmé chez le prestataire. Son affichage dans Gerimmo est en cours de vérification.");
      operationTerminee = true;
      succes = "Le changement est programmé à votre prochaine échéance. Votre accès déjà payé est conservé jusque-là.";
    } else if (p.type === "annulation_changement") {
      const conserve = await annulerChangementProgrammeV2(stripe, s!, id);
      const applique = await service.rpc("appliquer_abonnement_v2", { p_org: orgId,
        p_snapshot: { ...(await snapshotSouscriptionV2(stripe, config, conserve)), traitement_token: token, changement_programme: null }, p_event_id: `operation-v2-${id}` });
      if (applique.error) throw new Error("Le changement programmé a été annulé chez le prestataire. Son affichage reste à vérifier.");
      operationTerminee = true;
      succes = "Le changement programmé est annulé. Votre formule et votre capacité actuelles sont conservées aux prochaines échéances.";
    } else {
      const annule = await resilierAbonnementV2(stripe, s!, id);
      const applique = await service.rpc("appliquer_abonnement_v2", { p_org: orgId, p_snapshot: { ...(await snapshotSouscriptionV2(stripe, config, annule)), traitement_token: token, changement_programme: null }, p_event_id: `operation-v2-${id}` });
      if (applique.error) throw new Error("La résiliation est enregistrée chez le prestataire. Son affichage dans Gerimmo est en cours de vérification.");
      operationTerminee = true;
      if (s?.pending_update && s.metadata.proposition_id && s.metadata.proposition_id !== id) {
        const finPrecedent = await service.rpc("finir_proposition_abonnement_v2", { p_proposition: s.metadata.proposition_id, p_etat: "annulee" });
        if (finPrecedent.error) throw new Error("Votre résiliation est enregistrée ; la clôture du changement précédent doit encore être vérifiée.");
      }
      succes = "La résiliation est programmée. Votre accès payé reste disponible jusqu’à la fin de la période, puis vos données restent consultables et exportables.";
    }
    if (operationTerminee) {
      const fin = await service.rpc("finir_proposition_abonnement_v2", { p_proposition: id, p_etat: "executee" });
      if (fin.error) throw new Error("L’opération est enregistrée chez le prestataire. Sa confirmation finale dans Gerimmo doit être vérifiée.");
    }
    revalidatePath(`/agence/${orgId}/abonnement`);
  } catch (e) { return { erreur: erreurLisible(e) }; }
  finally { if (liberer) await liberer(); }
  if (destination) redirect(destination);
  return { succes };
}

export async function ouvrirPortailAbonnementV2(orgId: string, _etat: EtatAbonnementV2Action, _form: FormData): Promise<EtatAbonnementV2Action> {
  let url: string;
  try {
    const { etat } = await contexte(orgId);
    const config = configurationStripeV2(); const stripe = creerClientStripeV2(config);
    if (!etat.stripe_customer_id) throw new Error("Aucune facture n’est disponible pour le moment.");
    const configuration = process.env.STRIPE_PORTAIL_V2_CONFIGURATION;
    if (!configuration) throw new Error("L’espace de facturation sécurisé doit être configuré par Gerimmo.");
    const portail = await stripe.billingPortal.configurations.retrieve(configuration);
    if (!portail.active || portail.features.subscription_update.enabled || (portail.features.subscription_cancel.enabled && portail.features.subscription_cancel.mode !== "at_period_end")) {
      throw new Error("Les options de l’espace de facturation doivent être ajustées pour préserver votre période payée.");
    }
    const h = await headers(); const origine = origineDeRetour(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
    if (!origine) throw new Error("L’adresse de retour n’a pas pu être lue.");
    url = (await stripe.billingPortal.sessions.create({ configuration, customer: etat.stripe_customer_id, return_url: `${origine}/agence/${orgId}/abonnement` })).url;
  } catch (e) { return { erreur: erreurLisible(e) }; }
  redirect(url);
}
