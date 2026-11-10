import {maintenanceLivraison,MESSAGE_TRANSITION} from "./transition-livraison";
import { circuitAdmisPilote, piloteLimite, suspendreCourrielPilote, MESSAGE_PILOTE } from "./perimetre-pilote";
import { exigerContexteCourriel, RefusContexteCourriel, type ContexteCourriel } from './finalisation-courriels';
import { conserverCourriel } from "./reprise-courriels";
import { clientDeService } from "./supabase/service";
import { envoyerCourrielDurable, empreinteCourriel, type ResultatCourriel } from "./courriels-durables";
import { ArretSupervision } from "./controle-effets";
import { adresseDuSite } from "./site";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerMarque } from "./marque-organisation-serveur";
import { emailValide, enteteMarqueHtml, liensMarque, nomMarque } from "./marque-organisation";

// Envoi d'emails transactionnels via l'API Resend (quittances, décomptes…).
// Les liens de mot de passe (invitations, mot de passe oublié) passent aussi
// par ici depuis le 30/09 (lib/lien-mot-de-passe.ts). Seule la confirmation
// d'inscription part encore par le SMTP configuré dans Supabase.
// Nécessite RESEND_API_KEY dans l'environnement (.env.local) et un domaine vérifié.

/**
 * L'adresse d'expédition.
 *
 * Elle était en dur sur `no-reply@gerimmo.app` — une adresse dont le domaine
 * doit être VÉRIFIÉ chez Resend pour qu'un seul message parte. Tant qu'il ne
 * l'est pas (ou tant que le domaine n'est pas à nous), tout est refusé, clé
 * valide comprise : le produit était bloqué par une constante.
 *
 * Elle se règle donc par l'environnement. Sans réglage, on garde l'adresse de
 * la marque — c'est la cible, pas un repli.
 */
const EXPEDITEUR = process.env.RESEND_EXPEDITEUR?.trim() || "Gerimmo <no-reply@gerimmo.app>";

/** Adresse de réponse de la plateforme, distincte de l'expéditeur technique.
 * Pas de repli vers une boîte non configurée. L'adresse de l'organisation
 * garde la priorité pour les courriers envoyés au nom d'un gestionnaire. */
export function adresseReponsePlateforme(env: Record<string, string | undefined> = process.env): string | null {
  const adresse = env.RESEND_REPONDRE_A?.trim();
  return adresse && emailValide(adresse) && !/[\r\n]/.test(adresse) ? adresse : null;
}

/**
 * Le délai maximal d'un appel au service d'e-mail (décision D47, fiche IA-05).
 *
 * Sans lui, un service qui ne répond pas retenait la tâche jusqu'à la coupure
 * de la fonction, qui la laissait « interrompue » avec des effets partiels.
 *
 * LE DÉLAI NE VA JAMAIS SEUL. Il peut couper l'attente d'un envoi que le
 * service a pourtant accepté : l'objet reste alors « non marqué » et la passe
 * suivante le reprend. Sans clé d'idempotence, ce serait un second e-mail au
 * destinataire. Il s'applique à tout appelant, mais la clé n'est posée que là
 * où un envoi non marqué peut être repris ; voir `lib/cles-idempotence-courriels.ts`.
 *  - AVEC une `cleIdempotence` : les quatre tâches planifiées (quittances, avis
 *    d'échéance, relances de loyer, rappels de rendez-vous), les rappels de
 *    gestes, les relances de paiement d'abonnement (`lib/relances-paiement.ts`),
 *    l'envoi manuel d'une quittance (`actions/loyers.ts`, même clé que la tâche),
 *    ainsi que les avis d'abonnement, les rapports mensuels et l'alerte de veto.
 *  - SANS clé : les envois déclenchés par une personne et jamais repris par une
 *    tâche (liens de mot de passe, invitation d'un agent, bail signé, notifications
 *    de coulisses). Un délai dépassé y rend l'erreur « envoi non confirmé, vérifiez
 *    avant de le renvoyer » ; c'est la personne qui décide de recommencer.
 * Le service, revoyant la même clé, rend la réponse du premier envoi sans en
 * émettre un second — tant qu'il la retient.
 *
 * La réservation durable est maintenant effectuée avant émission. Une reprise
 * ne réémet jamais un résultat inconnu, même après expiration de la clé fournisseur.
 */
export const DELAI_MAX_FOURNISSEUR_MS = 15_000;

/** Le délai écoulé n'est pas un refus : l'envoi est inconnu, il a pu avoir lieu. */
const ERREUR_DELAI =
  "Le service d’e-mail n’a pas répondu à temps. L’envoi n’est pas confirmé et a peut-être eu lieu : vérifiez avant de le renvoyer.";

/**
 * Refus 429 du service (audit du 23/10, CPL1-2). Il ne vient jamais de l'adresse du destinataire, que le message
 * générique accusait : le service limite le débit (quelques envois par seconde) ou son quota d'envois est atteint.
 * Dans les deux cas c'est un refus, pas un envoi incertain : rien de neuf ici sur la reprise, qui reste celle de
 * l'appelant (la personne recommence, ou la passe suivante d'une tâche reprend l'objet non marqué). Le quota se
 * reconnaît à son corps de réponse (« quota ») : motif lu dans le texte du refus, non rejoué contre le service réel ;
 * sans ce mot, c'est la limite de débit.
 */
export const ERREUR_LIMITE_DEBIT = "Envoi limité temporairement par le prestataire d’e-mail : réessayez dans une minute.";
export const ERREUR_QUOTA_ATTEINT =
  "Le quota d’envois du prestataire d’e-mail est atteint : l’e-mail n’est pas parti. Réessayez plus tard ; si le refus persiste, prévenez le responsable Gerimmo.";

function delaiDepasse(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export async function envoyerEmailTransport(params: {
  referenceInterne?: string;
  circuit?: string;
  contexteMetier?: ContexteCourriel;
  /** Désactivée pour les messages qui doivent recalculer leur contexte métier. */
  repriseAutonome?: boolean;
  to: string;
  subject: string;
  html: string;
  piecesJointes?: { nom: string; contenuBase64: string }[];
  /** Une clé stable par objet : le service n'envoie pas deux fois le même message pour la même clé. */
  cleIdempotence?: string;
  /** Délai maximal de l'appel, en millisecondes (15 s par défaut) ; réglable surtout pour les tests. */
  delaiMaxMs?: number;
  avantEnvoi?: () => Promise<void>;
  organisation?: { db: SupabaseClient; id: string };
}): Promise<ResultatCourriel> {
  if(piloteLimite()&&!circuitAdmisPilote({...params,organisationId:params.organisation?.id}))return {erreur:MESSAGE_PILOTE,interventionRequise:true};
  if(maintenanceLivraison())return {erreur:MESSAGE_TRANSITION};
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return { erreur: "Envoi des e-mails non configuré. Contactez l’administrateur." };
  let appelCommence = false;
  try {
    const marque = params.organisation && !["acces","invitation_artisan"].includes(params.contexteMetier?.type??"") ? await chargerMarque(params.organisation.db, params.organisation.id) : null;
    // Verification fields are server-controlled in the database, never accepted from a form.
    const adresseVerifiee = marque?.email_expediteur_verifie_le && marque.email_expediteur && emailValide(marque.email_expediteur) ? marque.email_expediteur : null;
    const nom = marque ? nomMarque(marque).replace(/[<>"\r\n]/g, "").trim() : null;
    const expediteur = adresseVerifiee ? `${nom} <${adresseVerifiee}>` : nom ? EXPEDITEUR.replace(/^[^<]+(?=\s*<)/, nom + " ") : EXPEDITEUR;
    const repondreA = marque?.email_contact && emailValide(marque.email_contact) ? marque.email_contact : adresseReponsePlateforme();
    const html = marque ? `${enteteMarqueHtml(marque)}${liensMarque(params.html, marque, adresseDuSite())}` : params.html;
    await params.avantEnvoi?.();
    appelCommence = true;
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // Posé ici, après le contrôle d'arrêt : le délai ne couvre que l'appel au service.
      signal: AbortSignal.timeout(params.delaiMaxMs ?? DELAI_MAX_FOURNISSEUR_MS),
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
        ...(params.cleIdempotence ? { "Idempotency-Key": params.cleIdempotence } : {}),
      },
      body: JSON.stringify({
        from: expediteur,
        ...(params.referenceInterne ? {tags:[{name:"gerimmo_message",value:params.referenceInterne}]} : {}),
        ...(repondreA ? { reply_to: repondreA } : {}),
        to: [params.to],
        subject: params.subject,
        html,
        ...(params.piecesJointes?.length ? { attachments: params.piecesJointes.map(p => ({ filename: p.nom, content: p.contenuBase64 })) } : {}),
      }),
    });
    if (!reponse.ok) {
      // Un statut d'erreur reçu est un refus : si le corps ne vient pas à temps,
      // ce n'est pas pour autant un « envoi inconnu ».
      const txt = await reponse.text().catch(() => "");
      // Le refus le plus fréquent, et le plus opaque : le domaine de
      // l'expéditeur n'est pas vérifié chez Resend. Le message brut parle de
      // « domain », jamais de ce qu'il faut faire. On le traduit.
      if (/domain/i.test(txt) && reponse.status === 403) {
        return {
          erreur: "L’adresse d’envoi doit encore être vérifiée auprès du service d’e-mail. Contactez le responsable Gerimmo pour terminer sa connexion.",
        };
      }
      if (reponse.status >= 500 || reponse.status === 409) return {erreur:"Résultat fournisseur incertain.",incertain:true};
      if (reponse.status === 429) return { recuperable:true, erreur: /quota/i.test(txt) ? ERREUR_QUOTA_ATTEINT : ERREUR_LIMITE_DEBIT };
      return { erreur: "Le service d’e-mail a refusé l’envoi. Vérifiez l’adresse du destinataire puis réessayez." };
    }
    const resultat = await reponse.json().catch(() => null);
    return { ...(typeof resultat?.id === "string" ? { id: resultat.id } : {}) };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    if (e instanceof RefusContexteCourriel) return {erreur:e.message,recuperable:e.recuperable};
    if (delaiDepasse(e)) return { erreur: ERREUR_DELAI, incertain: true };
    if (appelCommence) return { erreur: "La connexion au service d’e-mail a été interrompue. L’envoi n’est pas confirmé et a peut-être eu lieu : vérifiez avant de le renvoyer.", incertain: true };
    return { recuperable:true, erreur: "L’e-mail n’a pas pu partir car le service est momentanément indisponible. Réessayez dans un instant." };
  }
}

/** Point d’entrée unique : la réservation durable précède tout appel au fournisseur. */
export async function envoyerEmail(params:Parameters<typeof envoyerEmailTransport>[0]):Promise<ResultatCourriel> {
 const db=clientDeService();
 if(!db)return {erreur:"Suivi durable des e-mails indisponible. Aucun envoi effectué."};
 const charge={to:params.to,subject:params.subject,html:params.html,piecesJointes:params.piecesJointes,cleIdempotence:params.cleIdempotence,organisationId:params.organisation?.id,contexteMetier:params.contexteMetier};
 if(piloteLimite()&&!circuitAdmisPilote(charge))return suspendreCourrielPilote(db,charge,params.circuit);
 if(maintenanceLivraison())return {erreur:MESSAGE_TRANSITION};
 if(!process.env.RESEND_API_KEY)return {erreur:"Envoi des e-mails non configuré. Contactez l’administrateur."};
 // Les contrôles métier fournis par l'appelant ne sont jamais sérialisés ou contournés.
 // Leur mission d'origine conserve la responsabilité de la reprise.
 if(params.contexteMetier && params.repriseAutonome!==false) {
  try {await conserverCourriel(db,{to:params.to,subject:params.subject,html:params.html,piecesJointes:params.piecesJointes,cleIdempotence:params.cleIdempotence,organisationId:params.organisation?.id,contexteMetier:params.contexteMetier});}
  catch {return {erreur:"Conservation sécurisée indisponible. Aucun envoi effectué."};}
 }
 const contenu=JSON.stringify([params.subject,params.html,params.piecesJointes??[]]);
 return envoyerCourrielDurable(db,{cle:params.cleIdempotence??empreinteCourriel(contenu),destinataire:params.to,organisation:params.organisation?.id??null,contenu},
 async reference=>{
  return envoyerEmailTransport({...params,cleIdempotence:params.cleIdempotence??reference,referenceInterne:reference,
   avantEnvoi:async()=>{await params.avantEnvoi?.();if(params.contexteMetier)await exigerContexteCourriel(db,reference);}
  });
 });
}
